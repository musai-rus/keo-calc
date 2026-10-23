"""Independent offline check of native horizontal Line/Arc loops; no Revit or KEO.

Fixed numerical comparison tolerances, not a claim about source model accuracy.
Arc loops dispatch to the analytic curve checker; no tessellation is used.
"""
import json
import math
import sys

LENGTH_TOL_FT = 1e-7
AREA_ABS_TOL_FT2 = 1e-6
AREA_REL_TOL = 1e-6


def distance(a, b): return math.dist(a, b)


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def on_segment(p, a, b):
    return (abs(cross(a, b, p)) <= LENGTH_TOL_FT * max(distance(a[:2], b[:2]), LENGTH_TOL_FT)
            and min(a[0], b[0]) - LENGTH_TOL_FT <= p[0] <= max(a[0], b[0]) + LENGTH_TOL_FT
            and min(a[1], b[1]) - LENGTH_TOL_FT <= p[1] <= max(a[1], b[1]) + LENGTH_TOL_FT)


def intersects(a, b, c, d):
    values = (cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b))
    if values[0] * values[1] < 0 and values[2] * values[3] < 0: return True
    return any((on_segment(c, a, b), on_segment(d, a, b), on_segment(a, c, d), on_segment(b, c, d)))


def inside(point, polygon):
    result = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        if on_segment(point, a, b): raise ValueError("Touching boundary: containment ambiguous")
        if (a[1] > point[1]) != (b[1] > point[1]):
            x = a[0] + (point[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            if x > point[0]: result = not result
    return result


def signed_area(points):
    origin = points[0]
    return math.fsum(cross(origin, a, b) for a, b in zip(points, points[1:] + points[:1])) / 2


def validate_payload(payload):
    if any(segment.get("curve", {}).get("kind") == "Arc" for loop in payload.get("boundaries", {}).get("loopsInApiOrder", []) for segment in loop):
        from curve_metrics import validate_curves
        return validate_curves(payload)
    report = {"schema": "keo-dynamo-d1-check/v1", "status": "ERROR", "geometryAccepted": False,
              "normativeAccepted": False, "profile": "horizontal-native-Line-loops",
              "tolerances": {"lengthFt": LENGTH_TOL_FT, "areaAbsoluteFt2": AREA_ABS_TOL_FT2, "areaRelative": AREA_REL_TOL},
              "sourceAccuracy": "unknown", "diagnostics": []}
    try:
        units = payload["units"]
        if (units["frame"], units["length"], units["area"], units["metresPerFoot"]) != ("revit-internal-feet", "ft", "ft2", 0.3048):
            raise ValueError("Unrecognized coordinate units")
        boundaries = payload["boundaries"]
        if boundaries["status"] != "ok" or boundaries["location"] != "Finish": raise ValueError("Boundary read unavailable or different location")
        loops = boundaries["loopsInApiOrder"]
        if not loops: raise ValueError("No loops")
        curves = [[segment["curve"] for segment in loop] for loop in loops]
        if any(c.get("status") != "ok" or c.get("kind") != "Line" for loop in curves for c in loop):
            report.update(status="UNSUPPORTED", diagnostics=["Native non-Line or unavailable curve; no chord approximation"])
            return report
        all_points = [p for loop in curves for c in loop for p in (c["start"], c["end"])]
        if any(len(p) != 3 or any(not math.isfinite(v) for v in p) for p in all_points): raise ValueError("Invalid native coordinates")
        if max(p[2] for p in all_points) - min(p[2] for p in all_points) > LENGTH_TOL_FT: raise ValueError("Not one horizontal plane")
        polygons, lengths = [], []
        for loop in curves:
            if len(loop) < 3: raise ValueError("Too few Line segments")
            for i, curve in enumerate(loop):
                length = distance(curve["start"], curve["end"])
                if length <= LENGTH_TOL_FT: raise ValueError("Degenerate segment")
                if abs(length - curve["lengthFt"]) > LENGTH_TOL_FT: raise ValueError("Endpoint length differs from Curve.Length")
                if distance(curve["end"], loop[(i + 1) % len(loop)]["start"]) > LENGTH_TOL_FT: raise ValueError("Open loop; no snap or extension applied")
                lengths.append(length)
            polygon = [c["start"] for c in loop]
            for i, a in enumerate(polygon):
                b = polygon[(i + 1) % len(polygon)]
                for j in range(i + 1, len(polygon)):
                    c, d = polygon[j], polygon[(j + 1) % len(polygon)]
                    adjacent = j == i + 1 or (i == 0 and j == len(polygon) - 1)
                    if adjacent:
                        # Adjacent edges may share one endpoint, but may not fold back.
                        other = d if j == i + 1 else c
                        if on_segment(other, a, b): raise ValueError("Adjacent edges overlap")
                    elif intersects(a, b, c, d): raise ValueError("Self-intersection or self-touch")
            if abs(signed_area(polygon)) <= AREA_ABS_TOL_FT2: raise ValueError("Degenerate loop area")
            polygons.append(polygon)
        for i, first in enumerate(polygons):
            for second in polygons[i + 1:]:
                for a, b in zip(first, first[1:] + first[:1]):
                    for c, d in zip(second, second[1:] + second[:1]):
                        if intersects(a, b, c, d): raise ValueError("Loops intersect or touch")
        depths = [sum(inside(p[0], q) for j, q in enumerate(polygons) if i != j) for i, p in enumerate(polygons)]
        area = math.fsum(abs(signed_area(p)) * (-1 if depth % 2 else 1) for p, depth in zip(polygons, depths))
        perimeter = math.fsum(lengths)
        room = payload["room"]
        if area <= 0 or room["areaFt2"] <= 0: raise ValueError("Nonpositive computed/API Room area")
        area_delta, perimeter_delta = area - room["areaFt2"], perimeter - room["perimeterFt"]
        area_ok = abs(area_delta) <= max(AREA_ABS_TOL_FT2, AREA_REL_TOL * abs(room["areaFt2"]))
        perimeter_ok = abs(perimeter_delta) <= max(LENGTH_TOL_FT, 1e-6 * abs(room["perimeterFt"]))
        report.update(status="METRICS_MATCH" if area_ok and perimeter_ok else "MISMATCH",
                      loopCount=len(polygons), segmentCount=sum(map(len, curves)), nestingDepths=depths,
                      areaFt2=area, perimeterFt=perimeter, areaM2=area * 0.3048 ** 2, perimeterM=perimeter * 0.3048,
                      areaDeltaFt2=area_delta, perimeterDeltaFt=perimeter_delta,
                      spanXFt=max(p[0] for p in all_points) - min(p[0] for p in all_points),
                      spanYFt=max(p[1] for p in all_points) - min(p[1] for p in all_points), boundaryZFt=all_points[0][2])
        point = room.get("location", {})
        if point.get("status") == "ok":
            report["locationInsidePlan"] = sum(inside(point["xyzFt"], poly) for poly in polygons) % 2 == 1
        report["diagnostics"] = payload.get("diagnostics", [])
        return report
    except (ValueError, KeyError, TypeError, IndexError) as exc:
        report["diagnostics"] = [str(exc)]
        return report


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8-sig") as stream: record = json.load(stream)
    result = validate_payload(record.get("payload", record))
    print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))
    sys.exit(0 if result["status"] == "METRICS_MATCH" else 2)

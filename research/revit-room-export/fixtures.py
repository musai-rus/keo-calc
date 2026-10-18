"""Invented examples only; no private model IDs and no Revit calls."""
import copy
import json
import sys
from pathlib import Path
from protocol import CATEGORIES, IDENTITY, PROFILE, SCHEMA, serialize, validate

GUID = "00000000-0000-4000-8000-000000000001"


def ref(n, doc="root"):
    return {"documentKey": doc, "uniqueId": f"synthetic-{doc}-{n}", "elementId": str(n)}


def ok(value, source="synthetic fixture"):
    return {"status": "ok", "source": source, "value": value}


def unavailable(reason="Не относится к синтетическому примеру", status="not-applicable", source="synthetic fixture"):
    return {"status": status, "source": source, "reason": reason}


def document(key="root"):
    snapshot = {"versionGuid": GUID, "numberOfSaves": 1, "isModified": False, "generation": "synthetic-generation-1"}
    return {"key": key, "identity": {"kind": "synthetic", "value": "invented-document-" + key},
            "projectInformationUniqueId": "synthetic-project-info-" + key,
            "revit": {"product": "NOT EXECUTED", "version": "NOT EXECUTED", "build": "NOT EXECUTED", "apiVersion": "NOT EXECUTED"},
            "before": copy.deepcopy(snapshot), "after": copy.deepcopy(snapshot), "documentChangedEvents": 0}


def element(n, kind, doc="root", **kw):
    return dict(ref=ref(n, doc), kind=kind, versionGuid=GUID, **kw)


def spatial(n, kind, doc="root", **kw):
    if kind in {*CATEGORIES, "other"}:
        # General category constants, never IDs from a private model.
        cat_id, cat_name = CATEGORIES.get(kind, ("-2000151", "OST_GenericModel"))
        kw.setdefault("category", {"id": cat_id, "builtInCategory": cat_name, "source": "synthetic fixture using general Revit category constants"})
        kw.setdefault("roomBounding", ok(True, "synthetic boundary provenance"))
    return element(n, kind, doc, phase=ref(1, doc), level=ref(2, doc), option={"kind": "main-model"},
                   createdPhase=ok(ref(1, doc)), demolishedPhase=unavailable("Нет фазы сноса"), **kw)


def loop(points, doc="root", path=None):
    points = [[*p, 1] if len(p) == 2 else p for p in points]
    return {"segments": [{"index": i, "curve": {"kind": "Line", "start": list(a), "end": list(points[(i + 1) % len(points)])},
                          "generator": ok({"ref": ref(20, doc), "path": path or []}, "BoundarySegment.ElementId/LinkElementId")}
                         for i, a in enumerate(points)]}


def room(n=10, number="A-01", points=None, doc="root", path=None):
    points = points or [[0, 0], [4, 0], [4, 3], [0, 3]]
    location = [1, 1, 1]
    return {"ref": ref(n, doc), "path": path or [], "number": number, "name": "Синтетическая комната", "placement": "placed",
            "properties": {"areaFt2": ok(12, "Room.Area"), "perimeterFt": ok(14, "Room.Perimeter"), "volumeFt3": ok(36, "Room.Volume")},
            "limits": {"lowerLevel": ref(2, doc), "upperLevel": ref(3, doc), "lowerOffsetFt": 0, "upperOffsetFt": 0, "computationHeightFt": 1},
            "location": ok({"kind": "LocationPoint", "point": location,
                            "containment": ok({"point": location, "phase": ref(1, doc), "room": ref(n, doc), "inside": True}, "Room.IsPointInRoom")}, "Room.Location/LocationPoint.Point"),
            "boundaries": ok({"location": "Finish", "storeFreeBoundaryFaces": True, "complete": True, "planeZFt": 1,
                              "loops": [loop(points, doc, path)]}, "Room.GetBoundarySegments"),
            "section": unavailable("Solid section не реализован; это plan boundary, не срез на1.2м", "unsupported")}


def sample():
    r = room()
    data = {"schema": SCHEMA, "profile": PROFILE, "exportId": GUID, "createdUtc": "2026-10-18T00:00:00Z",
            "producer": {"id": "offline-synthetic-fixture", "version": "0.1", "sourceCommit": "synthetic-not-a-revit-export"},
            "execution": {"readOnly": True, "synthetic": True, "executedInRevit": False, "method": "pure Python fixture; no host"},
            "units": {"frame": "revit-internal-feet", "length": "ft", "area": "ft2", "volume": "ft3", "metresPerFoot": .3048, "matrixConvention": "row-major-4x4-column-vector"},
            "scope": {"rootDocumentKey": "root", "rootPhase": ref(1), "rootOption": {"kind": "main-model"}, "complete": True,
                      "rootTransform": IDENTITY[:], "rooms": [{"ref": r["ref"], "path": []}]},
            "documents": [document()], "elements": [element(1, "phase", order=0), element(2, "level", elevationFt=0), element(3, "level", elevationFt=3), spatial(10, "room"), spatial(20, "wall"), spatial(30, "window")],
            "rooms": [r], "openings": ok({"complete": True, "scope": "selected-room-hosts-and-phase-relations", "items": [
                {"ref": ref(30), "path": [], "host": ok({"ref": ref(20), "path": []}, "FamilyInstance.Host"),
                 "fromRoom": ok({"phase": ref(1), "target": {"ref": ref(10), "path": []}}, "FamilyInstance.get_FromRoom(Phase)"),
                 "toRoom": unavailable("API null; не означает exterior", "unavailable", "FamilyInstance.get_ToRoom(Phase)"),
                 "instanceTransform": ok(IDENTITY[:], "FamilyInstance.GetTransform"), "typeUniqueId": "synthetic-window-type", "locationFt": [2, 0, 1]}]})}
    for side in ["fromRoom", "toRoom"]:
        data["openings"]["value"]["items"][0][side]["phase"] = ref(1)
    return data


def with_hole():
    data = sample()
    data["rooms"][0]["boundaries"]["value"]["loops"].append(loop([[2, 1], [3, 1], [3, 2], [2, 2]]))
    data["rooms"][0]["properties"]["areaFt2"]["value"] = 11
    data["rooms"][0]["properties"]["perimeterFt"]["value"] = 18
    return data


def with_link():
    data = sample()
    child = "linked"
    data["documents"].append(document(child))
    data["elements"] += [element(1, "phase", child, order=0), element(2, "level", child, elevationFt=0),
                         element(3, "level", child, elevationFt=3), spatial(10, "room", child), spatial(20, "wall", child),
                         element(40, "link-type"), spatial(41, "link-instance", typeRef=ref(40), childDocumentKey=child,
                             loaded=True, roomBounding=ok(True), childOption={"kind": "main-model"},
                             transform=ok({"fromDocumentKey": child, "toDocumentKey": "root", "matrix": [0,-1,0,10,1,0,0,0,0,0,1,0,0,0,0,1]}, "RevitLinkInstance.GetTransform"),
                             phaseMap=ok([{"host": ref(1), "linked": ref(1, child)}], "RevitLinkType.GetPhaseMap"))]
    lr = room(10, "LINK-01", doc=child, path=[ref(41)])
    data["rooms"].append(lr)
    data["scope"]["rooms"].append({"ref": lr["ref"], "path": lr["path"]})
    return data


def examples():
    valid, hole, linked = sample(), with_hole(), with_link()
    gap = sample()
    gap["rooms"][0]["boundaries"]["value"]["loops"][0]["segments"][0]["curve"]["end"] = [3.999, 0, 1]
    bow = sample()
    bow["rooms"][0]["boundaries"]["value"]["loops"] = [loop([[0, 0], [4, 3], [4, 0], [0, 3]])]
    units = sample(); units["units"]["length"] = "mm"
    transform = with_link(); transform["elements"][-1]["transform"]["value"]["matrix"][0] = 2
    phase = sample(); phase["elements"][3]["phase"] = ref(999)
    ambiguous = sample(); ambiguous["elements"].append(spatial(11, "room"))
    second = room(11, "A-01", [[6,0],[10,0],[10,3],[6,3]])
    second["location"]["value"]["point"] = [7,1,1]
    second["location"]["value"]["containment"]["value"]["point"] = [7,1,1]
    ambiguous["rooms"].append(second)
    ambiguous["scope"]["rooms"].append({"ref": second["ref"], "path": []})
    return {"rectangle": valid, "hole": hole, "linked-rotated": linked, "ambiguous-number": ambiguous,
            "rejected-gap": gap, "rejected-bow-tie": bow, "rejected-units": units,
            "rejected-transform": transform, "rejected-phase": phase}


if __name__ == "__main__":
    target = Path(sys.argv[1])
    target.mkdir(parents=True, exist_ok=True)
    for name, data in examples().items():
        # Rejected examples retain diagnostics; the ordinary validator still fails them.
        with (target / (name + ".json")).open("x", encoding="utf-8") as out:
            out.write(serialize(data, allow_invalid=name.startswith("rejected-")))
        with (target / (name + ".report.json")).open("x", encoding="utf-8") as out:
            out.write(json.dumps(validate(data, require_integrity=False), ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"synthetic": True, "executedInRevit": False, "files": list(examples())}))

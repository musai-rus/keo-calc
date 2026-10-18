"""Offline evidence consistency only. Does not authenticate or inspect an open Viewer."""
import argparse
import json
import re
from fractions import Fraction as Q
from pathlib import Path
from protocol import deserialize, validate, _canonical, _matrix, _xyz, _num, IDENTITY

SCHEMA = "keo-viewer-binding/0.1"


def check(export, manifest, viewer, current_session):
    issues = []
    def need(ok, code, path):
        if not ok:
            issues.append({"code": code, "path": path, "severity": "error"})
    def same(a, b):
        return _canonical(a) == _canonical(b)
    report = {"bindingConsistent": False, "issues": issues, "geometryAccepted": False,
              "seedAccepted": False, "normativeAccepted": False, "revitExecutionVerified": False,
              "sourceAccuracyVerified": False, "viewerBindingVerified": False,
              "limitations": ["Offline consistency only; unsigned inputs do not authenticate upload or live browser state",
                              "No source accuracy estimate or geometry/KEO admission; no transform fitting"]}
    try:
        # Reject non-JSON, non-finite, oversized/deep objects before any comparisons.
        for value in (export, manifest, viewer):
            _canonical(value)
        need(validate(export)["valid"], "export-invalid", "export")
        need(type(manifest) is dict and type(viewer) is dict, "binding-shape", "binding")
        if issues:
            return report
        need(manifest.get("schema") == SCHEMA and viewer.get("schema") == SCHEMA, "binding-schema", "schema")
        need(manifest.get("kind") == "conversion-manifest" and viewer.get("kind") == "current-viewer-snapshot", "binding-kind", "kind")
        # Claims remain false, even if matching metadata is supplied.
        def claims(value):
            if type(value) is dict:
                for key, child in value.items():
                    if key in {"geometryAccepted", "seedAccepted", "normativeAccepted", "revitExecutionVerified", "sourceAccuracyVerified", "viewerBindingVerified", "adjacencyAccepted"}:
                        need(child is False, "unsupported-admission-claim", key)
                    claims(child)
            elif type(value) is list:
                for child in value: claims(child)
        claims(export); claims(manifest); claims(viewer)
        docs = export["documents"]
        root = next(d for d in docs if d["key"] == export["scope"]["rootDocumentKey"])
        # SDK source target is root-only. Offline linked-plan codec is broader than this binding stage.
        need(len(docs) == 1 and all(not r["path"] for r in export["rooms"]), "sdk-binding-root-only", "export.scope")
        need(export["execution"]["synthetic"] is False and export["execution"]["executedInRevit"] is True,
             "actual-capture-required", "export.execution")
        need(root["before"]["isModified"] is False and root["after"]["isModified"] is False,
             "saved-source-required", "export.documents")
        source = export.get("sourceSnapshot")
        need(type(source) is dict, "source-snapshot-required", "export.sourceSnapshot")
        if type(source) is not dict: return report
        sha = source.get("sha256")
        need(type(sha) is str and bool(re.fullmatch(r"[0-9a-f]{64}", sha)), "source-sha256", "export.sourceSnapshot.sha256")
        need(root["identity"] == {"kind": "saved-rvt-sha256", "value": sha}, "source-identity", "export.documents.identity")
        need(set(source) == {"sha256", "versionGuid", "numberOfSaves", "projectInformationUniqueId"}, "source-shape", "export.sourceSnapshot")
        need(source.get("versionGuid") == root["before"]["versionGuid"] and
             type(source.get("numberOfSaves")) is int and source.get("numberOfSaves") == root["before"]["numberOfSaves"] and
             source.get("projectInformationUniqueId") == root["projectInformationUniqueId"], "source-revision", "export.sourceSnapshot")
        need(same(manifest.get("source"), source), "conversion-source-mismatch", "manifest.source")
        need(type(manifest.get("evidenceReference")) is str and bool(manifest["evidenceReference"].strip()),
             "upload-evidence-required", "manifest.evidenceReference")
        # An opaque immutable derivative version is required separately from URN and view GUID.
        for key in ("rootUrn", "derivativeVersion", "viewGuid"):
            need(type(manifest.get(key)) is str and bool(manifest[key].strip()), "derivative-identity-required", "manifest." + key)
            need(viewer.get(key) == manifest.get(key), "viewer-identity-mismatch", "viewer." + key)
        need(type(current_session) is str and bool(current_session.strip()) and viewer.get("session") == current_session,
             "current-session-mismatch", "viewer.session")
        need(viewer.get("stable") is True and viewer.get("loadedModelCount") == 1 and type(viewer.get("loadedModelCount")) is int and viewer.get("is2d") is False,
             "viewer-not-stable-single-3d", "viewer")
        phase = export["scope"]["rootPhase"]
        option = export["scope"]["rootOption"]
        for item, path in ((manifest, "manifest"), (viewer, "viewer")):
            need(same(item.get("phase"), phase) and same(item.get("option"), option), "phase-option-mismatch-or-unknown", path)
            need(same(item.get("units"), {"source": "ft", "viewer": "m", "metresPerFoot": .3048,
                                      "matrixConvention": "row-major-4x4-column-vector"}), "binding-units", path + ".units")
            need(item.get("transformDirection") == "root-internal-feet-to-viewer-metres", "transform-direction", path)
        a, b = manifest.get("sourceToViewer"), viewer.get("sourceToViewer")
        def scaled_rigid(matrix):
            if type(matrix) is not list or len(matrix) != 16 or not all(_num(x) for x in matrix): return False
            rigid = [x / .3048 if i < 12 and i % 4 != 3 else x for i, x in enumerate(matrix)]
            return _matrix(rigid)
        need(scaled_rigid(a) and scaled_rigid(b) and same(a, b), "transform-mismatch-or-unknown", "sourceToViewer")
        # At least four independently identified non-coplanar points; exact binary64 consistency.
        # Residual acceptance is deliberately zero until an exporter-specific error model is agreed.
        points = viewer.get("controlPoints")
        need(type(points) is list and 4 <= len(points) <= 32 and same(manifest.get("controlPoints"), points),
             "independent-controls-required", "controlPoints")
        if type(points) is list and len(points) <= 32 and scaled_rigid(a):
            ids, roots = [], []
            for index, point in enumerate(points):
                if type(point) is not dict:
                    need(False, "control-shape", str(index)); continue
                uid, p, v = point.get("sourceUniqueId"), point.get("sourceFt"), point.get("viewerM")
                need(type(uid) is str and bool(uid.strip()) and uid not in ids and point.get("method") == "independent-native-point", "control-identity", str(index))
                ids.append(uid)
                need(_xyz(p) and _xyz(v), "control-point", str(index))
                if not (_xyz(p) and _xyz(v)): continue
                roots.append([Q(x) for x in p])
                for row in range(3):
                    projected = sum(Q(a[row * 4 + col]) * Q(p[col]) for col in range(3)) + Q(a[row * 4 + 3])
                    need(projected == Q(v[row]), "control-residual-nonzero", str(index))
            def determinant(a, b, c):
                return a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0])
            independent = False
            if len(roots) >= 4:
                vectors = [[v[k]-roots[0][k] for k in range(3)] for v in roots[1:]]
                import itertools
                independent = any(determinant(*triple) != 0 for triple in itertools.combinations(vectors, 3))
            need(independent, "controls-coplanar-or-insufficient", "controlPoints")
        report["bindingConsistent"] = not issues
    except (KeyError, TypeError, ValueError, StopIteration, OverflowError, RecursionError):
        need(False, "malformed-binding-input", "binding")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path); parser.add_argument("manifest", type=Path); parser.add_argument("viewer", type=Path)
    parser.add_argument("--current-session", required=True)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    try:
        result = check(*(deserialize(p.read_text(encoding="utf-8")) for p in (args.export, args.manifest, args.viewer)), args.current_session)
    except (ValueError, OSError) as error:
        result = {"bindingConsistent": False, "issues": [{"code": "input-error", "message": type(error).__name__}], "viewerBindingVerified": False}
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        with args.report.open("x", encoding="utf-8") as dest: dest.write(output)
    print(output, end="")
    raise SystemExit(0 if result["bindingConsistent"] else 2)

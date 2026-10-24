"""D0: read-only environment probe for Dynamo PythonNet3. No model writes.

IN: absolute config JSON path, enabled Boolean, run nonce (change to rerun).
OUT: JSON evidence. Configuration and runtime evidence are private local files.
"""
import datetime
import json
import ntpath
import os
import re
import sys
import uuid

PROBE_VERSION = "0.1.0"
SOURCE_SHA256 = globals().get("SOURCE_SHA256", "unbundled")


class ProbeRefused(Exception):
    pass


def canonical_path(value, extension):
    if not isinstance(value, str) or not ntpath.isabs(value):
        raise ProbeRefused("An absolute local path is required")
    path = ntpath.normpath(value)
    if path.startswith("\\\\") or ntpath.splitext(path)[1].lower() != extension:
        raise ProbeRefused("Wrong file extension or non-local path")
    return ntpath.normcase(path)


def validate_config(config):
    required = {"schema", "expected_rvt_path", "expected_sha256", "expected_revit_version", "expected_revit_build"}
    optional = {"evidence_jsonl"}
    if not isinstance(config, dict) or set(config) - required - optional or not required <= set(config):
        raise ProbeRefused("Unexpected or missing configuration fields")
    if config["schema"] != "keo-dynamo-d0-config/v1":
        raise ProbeRefused("Unsupported configuration schema")
    target = canonical_path(config["expected_rvt_path"], ".rvt")
    if not isinstance(config["expected_sha256"], str) or not re.fullmatch(r"[0-9a-fA-F]{64}", config["expected_sha256"]):
        raise ProbeRefused("An independently recorded RVT SHA-256 is required")
    for key in ("expected_revit_version", "expected_revit_build"):
        if not isinstance(config[key], str) or not config[key].strip():
            raise ProbeRefused("An explicit Revit version/build is required")
    if config.get("evidence_jsonl"):
        canonical_path(config["evidence_jsonl"], ".jsonl")
    return target


def run_probe(config, enabled, nonce, host_factory):
    result = {
        "schema": "keo-dynamo-d0-evidence/v1", "probeVersion": PROBE_VERSION,
        "sourceSha256": SOURCE_SHA256, "runId": str(uuid.uuid4()),
        "runNonce": str(nonce), "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "status": "ERROR", "modelAccepted": False, "geometryAccepted": False,
        "normativeAccepted": False, "modelWriteRequested": False,
    }
    host = None
    before = None
    try:
        target = validate_config(config)
        if type(enabled) is not bool:
            raise ProbeRefused("Enabled must be a Boolean")
        if not enabled:
            result.update(status="CANCELLED", reason="Disabled before accessing Revit")
            return result
        host = host_factory()
        identity = host.identity()
        if canonical_path(identity["path"], ".rvt") != target:
            raise ProbeRefused("Active document does not match the explicitly selected test RVT")
        if identity["revitVersion"] != config["expected_revit_version"] or identity["revitBuild"] != config["expected_revit_build"]:
            raise ProbeRefused("Revit version/build mismatch")
        # Runtime metadata is diagnostic even if the document fails the guard.
        result["environment"] = host.environment()
        before = host.snapshot()
        result["before"] = before
        if any(before[key] for key in ("isModified", "isModifiable", "isWorkshared", "isLinked", "isFamilyDocument", "isModelInCloud")):
            raise ProbeRefused("Only unchanged saved standalone local root RVT is supported by D0")
        if before["sha256"].lower() != config["expected_sha256"].lower():
            raise ProbeRefused("RVT differs from the independently recorded SHA-256")
        result["document"] = identity
        result["roomCount"] = host.room_count()
        result["status"] = "READ_ONLY_OK"
    except ProbeRefused as exc:
        result.update(status="REFUSED", reason=str(exc))
    except Exception as exc:
        result.update(status="ERROR", reason=type(exc).__name__ + ": " + str(exc))
    finally:
        if host is not None and before is not None:
            try:
                after = host.snapshot()
                result["after"] = after
                result["documentUnchanged"] = before == after
                if before != after:
                    result.update(status="ERROR", reason="Document/file changed during probe")
            except Exception as exc:
                result.update(status="ERROR", documentUnchanged=False,
                              reason="Post-check failed: " + type(exc).__name__ + ": " + str(exc))
    return result


class RevitHost:
    def __init__(self):
        import clr
        clr.AddReference("RevitAPI")
        clr.AddReference("RevitServices")
        from RevitServices.Persistence import DocumentManager
        from Autodesk.Revit import DB
        self.DB = DB
        self.manager = DocumentManager.Instance
        self.doc = self.manager.CurrentDBDocument
        self.ui = self.manager.CurrentUIApplication
        if self.doc is None or self.ui is None or self.ui.ActiveUIDocument is None:
            raise ProbeRefused("No active Revit document")
        if not self.doc.Equals(self.ui.ActiveUIDocument.Document):
            raise ProbeRefused("Dynamo and Revit active documents differ")

    def identity(self):
        app = self.ui.Application
        return {"path": str(self.doc.PathName), "title": str(self.doc.Title),
                "revitVersion": str(app.VersionNumber), "revitBuild": str(app.VersionBuild)}

    def snapshot(self):
        from System import BitConverter
        from System.IO import FileStream, FileMode, FileAccess, FileShare
        from System.Security.Cryptography import SHA256
        if not self.doc.IsValidObject or not self.doc.Equals(self.manager.CurrentDBDocument) or not self.doc.Equals(self.ui.ActiveUIDocument.Document):
            raise ProbeRefused("Active document changed")
        path = str(self.doc.PathName)
        canonical_path(path, ".rvt")
        version = self.DB.Document.GetDocumentVersion(self.doc)
        try:
            result = {"path": path, "versionGuid": str(version.VersionGUID),
                      "numberOfSaves": int(version.NumberOfSaves)}
        finally:
            version.Dispose()
        for name in ("IsModified", "IsModifiable", "IsWorkshared", "IsLinked", "IsFamilyDocument", "IsModelInCloud"):
            result[name[0].lower() + name[1:]] = bool(getattr(self.doc, name))
        stream = FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)
        hasher = SHA256.Create()
        try:
            result["fileLength"] = int(stream.Length)
            result["sha256"] = str(BitConverter.ToString(hasher.ComputeHash(stream))).replace("-", "").lower()
        finally:
            hasher.Dispose()
            stream.Dispose()
        return result

    def environment(self):
        import platform
        from System import AppDomain, Environment
        from System.Diagnostics import FileVersionInfo, Process
        names = {"DynamoCore", "DynamoRevitDS", "RevitAPI", "RevitServices", "Python.Runtime", "DSPythonNet3"}
        assemblies = []
        for assembly in AppDomain.CurrentDomain.GetAssemblies():
            name = str(assembly.GetName().Name)
            if name in names:
                info = FileVersionInfo.GetVersionInfo(assembly.Location)
                assemblies.append({"name": name, "assemblyVersion": str(assembly.GetName().Version),
                                   "fileVersion": str(info.FileVersion)})
        return {"python": sys.version, "pythonImplementation": platform.python_implementation(),
                "dotnet": str(Environment.Version), "processId": int(Process.GetCurrentProcess().Id),
                "assemblies": sorted(assemblies, key=lambda item: item["name"])}

    def room_count(self):
        collector = self.DB.FilteredElementCollector(self.doc).OfCategory(self.DB.BuiltInCategory.OST_Rooms).WhereElementIsNotElementType()
        try:
            return int(collector.GetElementCount())
        finally:
            collector.Dispose()


def dynamo_entry(inputs):
    if len(inputs) != 3:
        raise ProbeRefused("Expected configuration path, enabled Boolean and run nonce")
    path = inputs[0]
    canonical_path(path, ".json")
    if os.path.getsize(path) > 65536:
        raise ProbeRefused("Configuration exceeds 64 KiB")
    with open(path, "r", encoding="utf-8-sig") as stream:
        config = json.load(stream)
    result = run_probe(config, inputs[1], inputs[2], RevitHost)
    # Append only to an explicit local evidence log; never open the RVT for writing.
    # Invalid configuration cannot grant permission to write an output file.
    validate_config(config)
    if config.get("evidence_jsonl"):
        output = config["evidence_jsonl"]
        if os.path.exists(output):
            if os.path.getsize(output) > 10 * 1024 * 1024:
                raise ProbeRefused("Evidence log exceeds 10 MiB")
            with open(output, "r", encoding="utf-8") as stream:
                for line in stream:
                    if line.strip() and json.loads(line).get("schema") != result["schema"]:
                        raise ProbeRefused("Existing file is not a D0 evidence log")
        with open(output, "a", encoding="utf-8", newline="\n") as stream:
            stream.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + "\n")
    return json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True)


if "IN" in globals():
    try:
        OUT = dynamo_entry(IN)
    except Exception as exc:
        OUT = json.dumps({"schema": "keo-dynamo-d0-evidence/v1", "status": "ERROR",
                          "reason": type(exc).__name__ + ": " + str(exc),
                          "geometryAccepted": False, "normativeAccepted": False}, ensure_ascii=False)

"""D1 diagnostic Room capture. Root standalone only; never writes a Revit document.

The generator embeds the tested D0 host/guards. Offline imports use the same file.
This is a stage-specific diagnostic schema, not the older SDK codec or KEO input.
"""
import hashlib
import math
if "RevitHost" not in globals():
    from d0_probe import (RevitHost, ProbeRefused, canonical_path, validate_config,
                          datetime, json, os, uuid)

D1_VERSION = "0.1.0"
D1_SCHEMA = "keo-dynamo-d1-evidence/v1"
BUNDLE_SHA256 = globals().get("BUNDLE_SHA256", "unbundled")
BASE_FIELDS = {"expected_rvt_path", "expected_sha256", "expected_revit_version", "expected_revit_build"}


def base_config(config):
    return dict({key: config[key] for key in BASE_FIELDS}, schema="keo-dynamo-d0-config/v1")


def validate_d1(config):
    required = BASE_FIELDS | {"schema", "mode", "evidence_jsonl"}
    optional = {"sample_element_id", "phase_uid", "parameter", "value", "selected_room_uid"}
    if not isinstance(config, dict) or not required <= set(config) or set(config) - required - optional:
        raise ProbeRefused("Missing or unknown D1 configuration fields")
    if config["schema"] != "keo-dynamo-d1-config/v1" or config["mode"] not in ("inventory", "capture"):
        raise ProbeRefused("Unsupported D1 schema/mode")
    target = validate_config(base_config(config))
    canonical_path(config["evidence_jsonl"], ".jsonl")
    if config["mode"] == "inventory":
        if not str(config.get("sample_element_id", "")).isdigit():
            raise ProbeRefused("Inventory requires an explicit sample element id")
    else:
        for key in ("phase_uid", "selected_room_uid"):
            if not isinstance(config.get(key), str) or not config[key]:
                raise ProbeRefused("Explicit phase and selected Room UniqueId required")
        selector = config.get("parameter")
        if not isinstance(selector, dict) or set(selector) != {"kind", "key"}:
            raise ProbeRefused("Parameter selector requires kind and key")
        if selector["kind"] == "id":
            if not isinstance(selector["key"], str) or not selector["key"].lstrip("-").isdigit():
                raise ProbeRefused("Parameter id must be a decimal string")
        elif selector["kind"] == "guid":
            try:
                uuid.UUID(selector["key"])
            except (ValueError, TypeError, AttributeError):
                raise ProbeRefused("Invalid shared parameter GUID")
        else:
            raise ProbeRefused("Select parameter by id/GUID, never by localized name")
        if "value" not in config or type(config["value"]) not in (str, int, float):
            raise ProbeRefused("Explicit typed parameter value required")
        if isinstance(config["value"], float) and not math.isfinite(config["value"]):
            raise ProbeRefused("Non-finite filter value")
    return target


def matches_parameter(parameter, expected):
    if parameter is None or not parameter.get("hasValue"):
        return False
    storage = parameter["storageType"]
    value = parameter["value"]
    if storage == "String":
        return type(expected) is str and value == expected
    if storage == "Integer":
        return type(expected) is int and value == expected
    if storage == "Double":
        return type(expected) in (float, int) and math.isfinite(expected) and value == expected
    if storage == "ElementId":
        return type(expected) is str and value == expected
    raise ProbeRefused("Unsupported filter storage type")


def select_room(rows, phase_uid, expected, selected_uid):
    scoped = [row for row in rows if row["phase"]["uniqueId"] == phase_uid]
    matched = [row for row in scoped if matches_parameter(row["filterParameter"], expected)]
    selected = [row for row in matched if row["ref"]["uniqueId"] == selected_uid]
    if len(selected) != 1:
        raise ProbeRefused("Selected Room must occur exactly once in the phase/parameter result")
    counts = {"phaseRooms": len(scoped), "matchedRooms": len(matched),
              "missingParameter": sum(row["filterParameter"] is None for row in scoped),
              "emptyParameter": sum(row["filterParameter"] is not None and
                                    (not row["filterParameter"]["hasValue"] or row["filterParameter"]["value"] in (None, "")) for row in scoped)}
    return selected[0], counts


def rr(source, function):
    try:
        return {"status": "ok", "source": source, "value": function()}
    except Exception as exc:
        return {"status": "error", "source": source, "reason": type(exc).__name__ + ": " + str(exc)}


def unavailable(source, reason, status="unavailable"):
    return {"status": status, "source": source, "reason": reason}


class D1Host(RevitHost):
    @staticmethod
    def eid(value):
        return str(value.Value)

    @staticmethod
    def xyz(value):
        return [float(value.X), float(value.Y), float(value.Z)]

    def ref(self, element):
        if element is None:
            raise ProbeRefused("Unresolved element reference")
        return {"documentKey": str(element.Document.ProjectInformation.UniqueId),
                "uniqueId": str(element.UniqueId), "elementId": self.eid(element.Id)}

    def resolve(self, eid, doc=None):
        el = (doc or self.doc).GetElement(eid)
        return self.ref(el) if el is not None else None

    def param(self, parameter):
        if parameter is None:
            return None
        storage = str(parameter.StorageType)
        value = None
        if parameter.HasValue:
            if storage == "String": value = parameter.AsString()
            elif storage == "Integer": value = int(parameter.AsInteger())
            elif storage == "Double": value = float(parameter.AsDouble())
            elif storage == "ElementId": value = self.eid(parameter.AsElementId())
            else: raise ProbeRefused("Unsupported parameter storage: " + storage)
        return {"id": self.eid(parameter.Id), "name": str(parameter.Definition.Name),
                "guid": str(parameter.GUID) if parameter.IsShared else None,
                "specTypeId": str(parameter.Definition.GetDataType().TypeId),
                "storageType": storage, "hasValue": bool(parameter.HasValue), "value": value}

    def builtin(self, element, name):
        return self.param(element.get_Parameter(getattr(self.DB.BuiltInParameter, name)))

    def phase(self, room):
        p = room.get_Parameter(self.DB.BuiltInParameter.ROOM_PHASE_ID)
        if p is None or str(p.StorageType) != "ElementId":
            raise ProbeRefused("ROOM_PHASE_ID is absent or not ElementId")
        phase = self.doc.GetElement(p.AsElementId())
        if phase is None or not isinstance(phase, self.DB.Phase):
            raise ProbeRefused("Unresolved Room phase")
        return self.ref(phase)

    def option(self, element):
        option = element.DesignOption
        return {"kind": "main-model"} if option is None else {"kind": "design-option", "ref": self.ref(option)}

    def lifecycle(self, element):
        if not element.HasPhases():
            return {"hasPhases": False, "created": None, "demolished": None,
                    "source": "Element.HasPhases; lifecycle not applicable"}
        return {"hasPhases": True, "created": self.resolve(element.CreatedPhaseId, element.Document),
                "demolished": self.resolve(element.DemolishedPhaseId, element.Document),
                "source": "Element.CreatedPhaseId/DemolishedPhaseId"}

    def filter_parameter(self, room, selector):
        if selector["kind"] == "guid":
            from System import Guid
            return self.param(room.get_Parameter(Guid(selector["key"])))
        candidates = [p for p in room.Parameters if self.eid(p.Id) == selector["key"]]
        if len(candidates) > 1:
            raise ProbeRefused("Non-unique parameter id")
        return self.param(candidates[0]) if candidates else None

    def room_rows(self, selector=None):
        collector = self.DB.FilteredElementCollector(self.doc).OfCategory(self.DB.BuiltInCategory.OST_Rooms).WhereElementIsNotElementType()
        try:
            rows = []
            for room in collector:
                rows.append({"ref": self.ref(room), "phase": self.phase(room), "number": str(room.Number),
                             "name": self.builtin(room, "ROOM_NAME")["value"],
                             "filterParameter": self.filter_parameter(room, selector) if selector else None})
            return rows
        finally:
            collector.Dispose()

    def inventory(self, config):
        from System import Int64
        sample = self.doc.GetElement(self.DB.ElementId(Int64.Parse(config["sample_element_id"])))
        if sample is None or self.eid(sample.Category.Id) != str(int(self.DB.BuiltInCategory.OST_Rooms)):
            raise ProbeRefused("Sample element is not a root Room")
        return {"phases": [{"ref": self.ref(p), "name": str(p.Name)} for p in self.doc.Phases],
                "rooms": self.room_rows(), "sample": self.ref(sample),
                "sampleParameters": sorted([self.param(p) for p in sample.Parameters], key=lambda p: int(p["id"]))}

    def matrix(self, transform):
        x, y, z, o = (self.xyz(v) for v in (transform.BasisX, transform.BasisY, transform.BasisZ, transform.Origin))
        return [x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2], 0, 0, 0, 1]

    def link_inventory(self):
        collector = self.DB.FilteredElementCollector(self.doc).OfClass(self.DB.RevitLinkInstance)
        result = []
        try:
            for link in collector:
                link_type = self.doc.GetElement(link.GetTypeId())
                linked = link.GetLinkDocument()
                record = {"ref": self.ref(link), "instancePath": [self.ref(link)], "type": self.ref(link_type),
                          "loaded": linked is not None, "option": self.option(link),
                          "transform": rr("RevitLinkInstance.GetTransform; linked-internal-ft to root-internal-ft",
                                          lambda: self.matrix(link.GetTransform())),
                          "roomBoundingInstance": rr("WALL_ATTR_ROOM_BOUNDING on instance", lambda: self.builtin(link, "WALL_ATTR_ROOM_BOUNDING")),
                          "roomBoundingType": rr("WALL_ATTR_ROOM_BOUNDING on type", lambda: self.builtin(link_type, "WALL_ATTR_ROOM_BOUNDING")),
                          "nestedGeometry": unavailable("D1 scope", "Nested link geometry not traversed", "unsupported")}
                if linked is None:
                    record["phaseMap"] = unavailable("RevitLinkType.GetPhaseMap", "Link is unloaded")
                else:
                    record["linkedDocument"] = {"documentKey": str(linked.ProjectInformation.UniqueId), "isModified": bool(linked.IsModified)}
                    record["phaseMap"] = rr("RevitLinkType.GetPhaseMap; host phase -> linked phase",
                        lambda: [{"host": self.resolve(pair.Key), "linked": self.resolve(pair.Value, linked)} for pair in link_type.GetPhaseMap()])
                result.append(record)
            return result
        finally:
            collector.Dispose()

    def generator(self, segment):
        el = self.doc.GetElement(segment.ElementId)
        record = {"elementId": self.eid(segment.ElementId), "linkElementId": self.eid(segment.LinkElementId)}
        if el is None:
            return dict(record, status="unresolved", reason="Free or unavailable boundary generator")
        record.update(status="ok", ref=self.ref(el), categoryId=self.eid(el.Category.Id) if el.Category else None,
                      option=self.option(el), lifecycle=self.lifecycle(el))
        if isinstance(el, self.DB.RevitLinkInstance):
            linked = el.GetLinkDocument()
            record.update(status="unsupported", reason="Linked boundary requires separate linked geometry validation",
                          linkedRef=self.resolve(segment.LinkElementId, linked) if linked is not None else None)
        elif el.Category and el.Category.Id == self.DB.ElementId(self.DB.BuiltInCategory.OST_RoomSeparationLines):
            record["classification"] = "semantic-room-separator-not-physical-wall"
        else:
            record["classification"] = "wall" if isinstance(el, self.DB.Wall) else "other"
            record["roomBounding"] = rr("WALL_ATTR_ROOM_BOUNDING", lambda: self.builtin(el, "WALL_ATTR_ROOM_BOUNDING"))
        return record

    def external_references(self):
        # Include CAD/other references and uninstanced types; an empty RVT-instance
        # collector is not evidence that all external geometry is available.
        records = []
        for eid in self.DB.ExternalFileUtils.GetAllExternalFileReferences(self.doc):
            reference = self.DB.ExternalFileUtils.GetExternalFileReference(self.doc, eid)
            try:
                records.append({"ref": self.resolve(eid), "elementId": self.eid(eid),
                                "referenceType": str(reference.ExternalFileReferenceType),
                                "linkedFileStatus": str(reference.GetLinkedFileStatus()),
                                "geometryRelevance": "not assessed"})
            finally:
                reference.Dispose()
        return records

    def curve(self, curve):
        record = {"nativeType": str(curve.GetType().FullName), "isBound": bool(curve.IsBound)}
        if not curve.IsBound:
            return dict(record, status="unsupported", reason="Unbounded curve")
        record.update(parameterRange=[float(curve.GetEndParameter(i)) for i in (0, 1)],
                      start=self.xyz(curve.GetEndPoint(0)), end=self.xyz(curve.GetEndPoint(1)), lengthFt=float(curve.Length))
        if isinstance(curve, self.DB.Line):
            record.update(status="ok", kind="Line")
        elif isinstance(curve, self.DB.Arc):
            record.update(status="ok", kind="Arc", center=self.xyz(curve.Center), radiusFt=float(curve.Radius),
                          normal=self.xyz(curve.Normal), xDirection=self.xyz(curve.XDirection), yDirection=self.xyz(curve.YDirection))
        else:
            record.update(status="unsupported", reason="Native curve preserved by type; D1 has no complete serializer")
        return record

    def boundaries(self, room):
        options = self.DB.SpatialElementBoundaryOptions()
        options.SpatialElementBoundaryLocation = self.DB.SpatialElementBoundaryLocation.Finish
        options.StoreFreeBoundaryFaces = True
        try:
            loops = room.GetBoundarySegments(options)
            if loops is None:
                return {"status": "unavailable", "reason": "No boundary loops; not enclosed or unplaced"}
            result = []
            for loop in loops:
                output = []
                for segment in loop:
                    curve = segment.GetCurve()
                    try:
                        output.append({"curve": self.curve(curve), "generator": self.generator(segment)})
                    finally:
                        curve.Dispose()
                        segment.Dispose()
                result.append(output)
            return {"status": "ok", "source": "Room.GetBoundarySegments", "location": "Finish",
                    "storeFreeBoundaryFaces": True, "loopsInApiOrder": result,
                    "sectionAt1_2m": False, "outerHoleClassification": "not inferred from API order"}
        finally:
            options.Dispose()

    def north(self):
        location = self.doc.ActiveProjectLocation
        position = location.GetProjectPosition(self.DB.XYZ.Zero)
        try:
            return {"projectLocation": self.ref(location), "source": "ProjectLocation.GetProjectPosition(XYZ.Zero)",
                    "angleFromTrueNorthRadians": float(position.Angle), "eastWestFt": float(position.EastWest),
                    "northSouthFt": float(position.NorthSouth), "elevationFt": float(position.Elevation),
                    "appliedToInternalGeometry": False}
        finally:
            position.Dispose()

    def capture(self, config):
        rows = self.room_rows(config["parameter"])
        row, counts = select_room(rows, config["phase_uid"], config["value"], config["selected_room_uid"])
        room = self.doc.GetElement(row["ref"]["uniqueId"])
        if room is None:
            raise ProbeRefused("Room disappeared")
        if self.option(room)["kind"] != "main-model":
            raise ProbeRefused("D1 captures Main Model only; design option is unsupported")
        level = self.doc.GetElement(room.LevelId)
        location = room.Location
        location_record = unavailable("Room.Location", "Room has no LocationPoint")
        if isinstance(location, self.DB.LocationPoint):
            point = location.Point
            location_record = {"status": "ok", "source": "Room.Location/LocationPoint.Point", "xyzFt": self.xyz(point),
                               "isPointInRoom": bool(room.IsPointInRoom(point)), "isDaylightCalculationPoint": False}
        boundaries = self.boundaries(room)
        links = self.link_inventory()
        external = rr("ExternalFileUtils.GetAllExternalFileReferences/GetExternalFileReference", self.external_references)
        diagnostics = []
        if external["status"] != "ok": diagnostics.append("EXTERNAL_REFERENCE_INVENTORY_FAILED")
        elif any(item["linkedFileStatus"] != "Loaded" for item in external["value"]):
            diagnostics.append("EXTERNAL_REFERENCES_NOT_LOADED: geometry relevance unresolved")
        if any(not link["loaded"] for link in links): diagnostics.append("UNLOADED_LINKS: relevance to geometry/shading is unresolved")
        if any(link["phaseMap"]["status"] != "ok" for link in links): diagnostics.append("LINK_PHASE_MAP_INCOMPLETE")
        if boundaries["status"] != "ok": diagnostics.append("ROOM_BOUNDARIES_UNAVAILABLE")
        else:
            for loop in boundaries["loopsInApiOrder"]:
                for segment in loop:
                    if segment["curve"]["status"] != "ok": diagnostics.append("UNSUPPORTED_NATIVE_CURVE")
                    if segment["generator"]["status"] != "ok": diagnostics.append("BOUNDARY_GENERATOR_UNRESOLVED_OR_LINKED")
        if location_record["status"] != "ok" or room.Area <= 0: diagnostics.append("ROOM_UNPLACED_OR_NONPOSITIVE_AREA")
        north = rr("ProjectLocation.GetProjectPosition", self.north)
        if north["status"] != "ok": diagnostics.append("NORTH_UNAVAILABLE")
        return {"units": {"frame": "revit-internal-feet", "length": "ft", "area": "ft2", "volume": "ft3", "metresPerFoot": 0.3048,
                          "matrixConvention": "row-major-4x4-column-vector", "rootTransform": [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},
                "scope": {"kind": "one-root-room", "selected": row["ref"], "phase": row["phase"], "filter": config["parameter"],
                          "value": config["value"], "counts": counts, "linksInventoriedRegardlessOfRoomFilter": True},
                "room": {**row, "versionGuid": str(room.VersionGuid), "option": self.option(room), "lifecycle": self.lifecycle(room),
                         "location": location_record, "level": self.ref(level),
                         "levelProjectElevationFt": float(level.ProjectElevation),
                         "levelComputationHeight": self.builtin(level, "LEVEL_ROOM_COMPUTATION_HEIGHT"),
                         "constraints": {key: self.builtin(room, key) for key in ("ROOM_UPPER_LEVEL", "ROOM_UPPER_OFFSET", "ROOM_LOWER_OFFSET")},
                         "areaFt2": float(room.Area), "perimeterFt": float(room.Perimeter), "volumeFt3": float(room.Volume),
                         "volumeMeaning": "Room.Volume may be zero when volume computation is disabled; not a verified 3D volume"},
                "boundaries": boundaries, "north": north, "links": links, "externalReferences": external,
                "diagnostics": sorted(set(diagnostics)), "geometryAccepted": False, "normativeAccepted": False,
                "aperturesAndShading": "not captured by D1"}


def run_d1(config, enabled, nonce, host_factory=D1Host):
    result = {"schema": D1_SCHEMA, "version": D1_VERSION, "sourceBundleSha256": BUNDLE_SHA256,
              "runId": str(uuid.uuid4()), "runNonce": str(nonce), "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "status": "ERROR", "modelAccepted": False, "geometryAccepted": False, "normativeAccepted": False, "modelWriteRequested": False}
    host, before = None, None
    try:
        target = validate_d1(config)
        if type(enabled) is not bool: raise ProbeRefused("Enabled must be a Boolean")
        if not enabled:
            result.update(status="CANCELLED", reason="Disabled before accessing Revit")
            return result
        host = host_factory()
        identity = host.identity()
        if canonical_path(identity["path"], ".rvt") != target: raise ProbeRefused("Active document is not the explicitly selected test copy")
        if identity["revitVersion"] != config["expected_revit_version"] or identity["revitBuild"] != config["expected_revit_build"]:
            raise ProbeRefused("Unexpected Revit version/build")
        before = host.snapshot()
        result["before"] = before
        if any(before[key] for key in ("isModified", "isModifiable", "isWorkshared", "isLinked", "isFamilyDocument", "isModelInCloud")):
            raise ProbeRefused("D1 requires clean saved standalone root document")
        if before["sha256"].lower() != config["expected_sha256"].lower(): raise ProbeRefused("Test RVT hash differs from approved baseline")
        result["environment"] = host.environment()
        payload = host.inventory(config) if config["mode"] == "inventory" else host.capture(config)
        result.update(status="INVENTORY_OK" if config["mode"] == "inventory" else "CAPTURED_DIAGNOSTIC", payload=payload)
        result["payloadSha256"] = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")).hexdigest()
    except ProbeRefused as exc:
        result.update(status="REFUSED", reason=str(exc))
    except Exception as exc:
        result.update(status="ERROR", reason=type(exc).__name__ + ": " + str(exc))
    finally:
        if host is not None and before is not None:
            try:
                result["after"] = host.snapshot()
                result["documentUnchanged"] = before == result["after"]
                if not result["documentUnchanged"]: result.update(status="ERROR", reason="Document/file changed during D1")
            except Exception as exc:
                result.update(status="ERROR", documentUnchanged=False, reason="Post-check failed: " + str(exc))
    return result


def d1_entry(inputs):
    if len(inputs) != 3: raise ProbeRefused("Expected config path, enabled and run number")
    path = inputs[0]
    canonical_path(path, ".json")
    if os.path.getsize(path) > 65536: raise ProbeRefused("Configuration exceeds 64 KiB")
    with open(path, "r", encoding="utf-8-sig") as stream: config = json.load(stream)
    validate_d1(config)
    result = run_d1(config, inputs[1], inputs[2])
    output = config["evidence_jsonl"]
    if os.path.exists(output):
        if os.path.getsize(output) > 25 * 1024 * 1024: raise ProbeRefused("D1 evidence log exceeds 25 MiB")
        with open(output, "r", encoding="utf-8") as stream:
            for line in stream:
                if line.strip() and json.loads(line).get("schema") != D1_SCHEMA: raise ProbeRefused("Existing output is not a D1 evidence log")
    serialized = json.dumps(result, ensure_ascii=False, sort_keys=True, allow_nan=False)
    with open(output, "a", encoding="utf-8", newline="\n") as stream: stream.write(serialized + "\n")
    return json.dumps({key: value for key, value in result.items() if key != "payload"}, ensure_ascii=False, indent=2)


if "IN" in globals():
    try:
        OUT = d1_entry(IN)
    except Exception as exc:
        OUT = json.dumps({"schema": D1_SCHEMA, "status": "ERROR", "reason": type(exc).__name__ + ": " + str(exc),
                          "geometryAccepted": False, "normativeAccepted": False}, ensure_ascii=False)

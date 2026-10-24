"""Read-only inventory of candidate calculator inputs and plan annotation resources.

Uses D0/D1 guards. Parameter values remain candidates until their meanings,
applicability and provenance are checked; no coefficient defaults or model writes.
"""

class InputHost(D1Host):
    def params(self, element):
        return sorted([self.param(p) for p in element.Parameters], key=lambda p: p["id"])

    def descriptor(self, element):
        if element is None:
            return None
        try:
            name = str(element.Name)
        except (AttributeError, TypeError):
            p = element.get_Parameter(self.DB.BuiltInParameter.SYMBOL_NAME_PARAM)
            name = p.AsString() if p and p.HasValue else ""
        return dict(self.ref(element), name=str(name), category=self.eid(element.Category.Id) if element.Category else None)

    def outline(self, room):
        options = self.DB.SpatialElementBoundaryOptions()
        options.SpatialElementBoundaryLocation = self.DB.SpatialElementBoundaryLocation.Finish
        try:
            boundaries = room.GetBoundarySegments(options)
            if boundaries is None:
                return []
            return [[{"kind": str(s.GetCurve().GetType().Name),
                      "lengthFt": float(s.GetCurve().Length),
                      "startFt": self.xyz(s.GetCurve().GetEndPoint(0)),
                      "endFt": self.xyz(s.GetCurve().GetEndPoint(1)),
                      "generatorId": self.eid(s.ElementId)} for s in loop] for loop in boundaries]
        finally:
            options.Dispose()

    def input_inventory(self, config):
        room = self.doc.GetElement(config["selected_room_uid"])
        phase = self.doc.GetElement(config["phase_uid"])
        if room is None or not isinstance(room, self.DB.Architecture.Room):
            raise ProbeRefused("Selected UID is not a Room")
        if self.phase(room)["uniqueId"] != config["phase_uid"] or room.DesignOption is not None:
            raise ProbeRefused("Room phase/option mismatch")
        payload = {"room": self.descriptor(room), "roomParameters": self.params(room),
                   "roomOutline": self.outline(room), "projectParameters": self.params(self.doc.ProjectInformation),
                   "phase": self.descriptor(phase), "units": "internal feet; raw parameters retain specTypeId",
                   "windows": [], "rooms": [], "planResources": {}}
        location = self.doc.ActiveProjectLocation
        position = location.GetProjectPosition(self.DB.XYZ.Zero)
        payload["north"] = {"angleFromTrueNorthRadians": float(position.Angle), "projectLocation": self.descriptor(location)}
        for w in self.DB.FilteredElementCollector(self.doc).OfCategory(self.DB.BuiltInCategory.OST_Windows).WhereElementIsNotElementType():
            if not isinstance(w, self.DB.FamilyInstance):
                continue
            f = rr("get_FromRoom(phase)", lambda: self.descriptor(w.get_FromRoom(phase)))
            t = rr("get_ToRoom(phase)", lambda: self.descriptor(w.get_ToRoom(phase)))
            linked_to_room = any(x.get("value") and x["value"]["uniqueId"] == room.UniqueId for x in (f,t))
            row = {"ref": self.descriptor(w), "fromRoom": f, "toRoom": t,
                   "host": self.descriptor(w.Host), "type": self.descriptor(w.Symbol),
                   "lifecycle": self.lifecycle(w), "option": self.option(w)}
            if linked_to_room:
                row.update(parameters=self.params(w), typeParameters=self.params(w.Symbol),
                           location=rr("Location.Point", lambda: self.xyz(w.Location.Point)),
                           facing=self.xyz(w.FacingOrientation), hand=self.xyz(w.HandOrientation))
                if isinstance(w.Host, self.DB.Wall):
                    row["hostParameters"] = self.params(w.Host)
                    row["hostKind"] = str(w.Host.WallType.Kind)
                    row["hostCurve"] = str(w.Host.Location.Curve.GetType().Name)
            payload["windows"].append(row)
        for r in self.DB.FilteredElementCollector(self.doc).OfCategory(self.DB.BuiltInCategory.OST_Rooms).WhereElementIsNotElementType():
            if self.phase(r)["uniqueId"] != config["phase_uid"] or r.DesignOption is not None:
                continue
            loops = self.outline(r)
            payload["rooms"].append(dict(self.descriptor(r), number=str(r.Number), areaFt2=float(r.Area),
                                        levelId=self.eid(r.LevelId), outline=loops))
        for key, cls in (("plans",self.DB.ViewPlan), ("colorSchemes",self.DB.ColorFillScheme),
                         ("textTypes",self.DB.TextNoteType), ("viewTypes",self.DB.ViewFamilyType)):
            payload["planResources"][key] = [dict(self.descriptor(e),
                detail=rr("plan metadata",lambda: {"viewType": str(e.ViewType), "template": bool(e.IsTemplate), "level": self.descriptor(e.GenLevel)}))
                if key == "plans" else self.descriptor(e) for e in self.DB.FilteredElementCollector(self.doc).OfClass(cls)]
        payload["planResources"]["roomTagTypes"] = [dict(self.descriptor(e), family=str(e.FamilyName),parameters=self.params(e))
            for e in self.DB.FilteredElementCollector(self.doc).OfCategory(self.DB.BuiltInCategory.OST_RoomTags).WhereElementIsElementType()]
        return payload


def input_entry(inputs):
    if len(inputs) != 3:
        raise ProbeRefused("Expected config, enabled, nonce")
    canonical_path(inputs[0], ".json")
    if os.path.getsize(inputs[0]) > 65536:
        raise ProbeRefused("Configuration too large")
    with open(inputs[0], encoding="utf-8-sig") as f:
        config = json.load(f)
    required = {"schema","documentGuard","selected_room_uid","phase_uid","evidence_jsonl"}
    if set(config) != required or config["schema"] != "keo-dynamo-inputs-config/v1":
        raise ProbeRefused("Unexpected configuration")
    canonical_path(config["evidence_jsonl"], ".jsonl")
    guard = run_probe(config["documentGuard"], inputs[1], inputs[2], InputHost)
    result = {"schema":"keo-dynamo-inputs-evidence/v1", "status":guard["status"],"guard":guard,
              "bundleSha256":BUNDLE_SHA256,"geometryAccepted":False,"normativeAccepted":False,
              "runNonce":str(inputs[2]),"modelWriteRequested":False}
    if guard["status"] == "READ_ONLY_OK":
        host = InputHost()
        try:
            if host.snapshot() != guard["after"]:
                raise ProbeRefused("Changed document before inventory")
            result["payload"] = host.input_inventory(config)
            result["payloadSha256"] = hashlib.sha256(json.dumps(result["payload"],ensure_ascii=False,sort_keys=True).encode("utf-8")).hexdigest()
            result["status"] = "INPUT_CANDIDATES_CAPTURED"
        except Exception as exc:
            result.update(status="ERROR",reason=type(exc).__name__+": "+str(exc))
        finally:
            result["after"] = host.snapshot()
            result["documentUnchanged"] = result["after"] == guard["before"]
            if not result["documentUnchanged"]:
                result.update(status="ERROR",reason="Document changed during inventory")
    output = config["evidence_jsonl"]
    if os.path.exists(output):
        if os.path.getsize(output)>10*1024*1024:
            raise ProbeRefused("Evidence log too large")
        with open(output,encoding="utf-8") as f:
            if any(json.loads(line).get("schema")!=result["schema"] for line in f if line.strip()):
                raise ProbeRefused("Unexpected existing evidence")
    with open(output,"a",encoding="utf-8",newline="\n") as f:
        f.write(json.dumps(result,ensure_ascii=False,sort_keys=True)+"\n")
    return json.dumps({k:v for k,v in result.items() if k not in ("payload","guard","after")},ensure_ascii=False,indent=2)


if "IN" in globals():
    try:
        OUT = input_entry(IN)
    except Exception as exc:
        OUT = json.dumps({"status":"ERROR","reason":str(exc)},ensure_ascii=False)

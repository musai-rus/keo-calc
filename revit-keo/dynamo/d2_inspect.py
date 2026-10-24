"""D2 reconnaissance only: native room solid and candidate metadata, no KEO.

Bounding boxes are broad-phase candidates, never glazing or shading evidence.
Reuses D1 clean-document guards. No transaction, save or model mutation.
"""
if "D1Host" not in globals():
    from d1_capture import D1Host, rr, ProbeRefused, run_d1, validate_d1
    from d0_probe import canonical_path, json, os

D2_SCHEMA = "keo-dynamo-d2-inspection/v1"
if "PhysicalGeometryMixin" not in globals():
    from d2_geometry import PhysicalGeometryMixin


def overlaps_xy(a, b, padding=0.0):
    return all(a[0][i] <= b[1][i] + padding and a[1][i] >= b[0][i] - padding for i in (0, 1))


def phase_room(element, phase, side):
    # PythonNet3 resolves FromRoom/ToRoom as the parameterless property.
    # Call the phase overload explicitly; a Room itself is not a phase indexer.
    if side not in ("FromRoom", "ToRoom"):
        raise ValueError("Expected FromRoom or ToRoom")
    return getattr(element, "get_" + side)(phase)


def adapt_config(config):
    if not isinstance(config, dict) or config.get("schema") != "keo-dynamo-d2-config/v1":
        raise ProbeRefused("D2 configuration required")
    result = dict(config, schema="keo-dynamo-d1-config/v1")
    validate_d1(result)
    if result["mode"] != "capture":
        raise ProbeRefused("D2 requires explicit capture selection")
    return result


class D2Host(PhysicalGeometryMixin, D1Host):
    def phase_room_ref(self, element, phase, side):
        room = phase_room(element, phase, side)
        return self.ref(room) if room is not None else None

    def box(self, element):
        box = element.get_BoundingBox(None)
        if box is None:
            return None
        try:
            points = [self.xyz(box.Transform.OfPoint(self.DB.XYZ(x, y, z)))
                      for x in (box.Min.X, box.Max.X) for y in (box.Min.Y, box.Max.Y) for z in (box.Min.Z, box.Max.Z)]
            return [[min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)]]
        finally:
            box.Dispose()

    def face_record(self, face):
        loops = []
        for loop in face.GetEdgesAsCurveLoops():
            try:
                loops.append([self.curve(curve) for curve in loop])
            finally:
                loop.Dispose()
        data = {"nativeType": str(face.GetType().FullName), "areaFt2": float(face.Area),
                "materialId": self.eid(face.MaterialElementId), "loops": loops}
        if isinstance(face, self.DB.PlanarFace):
            data.update(originFt=self.xyz(face.Origin), normal=self.xyz(face.FaceNormal))
        else:
            data["surfaceAccepted"] = False
        return data

    def room_solid(self, room):
        options = self.DB.SpatialElementBoundaryOptions()
        options.SpatialElementBoundaryLocation = self.DB.SpatialElementBoundaryLocation.Finish
        options.StoreFreeBoundaryFaces = True
        calculator = self.DB.SpatialElementGeometryCalculator(self.doc, options)
        try:
            result = calculator.CalculateSpatialElementGeometry(room)
            try:
                solid = result.GetGeometry()
                faces = []
                for face in solid.Faces:
                    record = self.face_record(face)
                    subfaces = []
                    for subface in result.GetBoundaryFaceInfo(face) or []:
                        try:
                            boundary = subface.SpatialBoundaryElement
                            subfaces.append({"type": str(subface.SubfaceType),
                                "hostElementId": self.eid(boundary.HostElementId),
                                "linkedElementId": self.eid(boundary.LinkedElementId),
                                "linkInstanceId": self.eid(boundary.LinkInstanceId)})
                        finally:
                            subface.Dispose()
                    record["sources"] = subfaces
                    faces.append(record)
                return {"faces": faces, "volumeFt3": float(solid.Volume),
                        "source": "SpatialElementGeometryCalculator", "physicalOpeningsAccepted": False}
            finally:
                result.Dispose()
        finally:
            calculator.Dispose()
            options.Dispose()

    def metadata(self, element, phase):
        data = {"ref": self.ref(element), "class": str(element.GetType().FullName),
                "categoryId": self.eid(element.Category.Id) if element.Category else None,
                "type": self.resolve(element.GetTypeId()), "bboxFt": self.box(element),
                "option": self.option(element), "lifecycle": self.lifecycle(element),
                "phaseStatus": rr("Element.GetPhaseStatus", lambda: str(element.GetPhaseStatus(phase.Id)))}
        if isinstance(element, self.DB.FamilyInstance):
            data.update(host=self.ref(element.Host) if element.Host else None,
                        supercomponent=self.ref(element.SuperComponent) if element.SuperComponent else None,
                        children=[self.resolve(eid) for eid in element.GetSubComponentIds()],
                        fromRoom=rr("get_FromRoom(phase)", lambda: self.phase_room_ref(element, phase, "FromRoom")),
                        toRoom=rr("get_ToRoom(phase)", lambda: self.phase_room_ref(element, phase, "ToRoom")))
        if isinstance(element, self.DB.HostObject):
            data["inserts"] = rr("FindInserts(True,False,True,True)",
                lambda: [self.resolve(eid) for eid in element.FindInserts(True, False, True, True)])
        if isinstance(element, self.DB.Wall):
            grid = element.CurtainGrid
            data["wallKind"] = str(element.WallType.Kind)
            if grid is not None:
                data["panels"] = [self.resolve(eid) for eid in grid.GetPanelIds()]
                data["mullions"] = [self.resolve(eid) for eid in grid.GetMullionIds()]
        if isinstance(element, self.DB.ImportInstance):
            data.update(isLinked=bool(element.IsLinked), viewSpecific=bool(element.ViewSpecific),
                        ownerView=self.resolve(element.OwnerViewId), transform=self.matrix(element.GetTransform()))
        return data

    def capture(self, config):
        baseline = super().capture(config)
        room = self.doc.GetElement(config["selected_room_uid"])
        phase = self.doc.GetElement(config["phase_uid"])
        room_box = self.box(room)
        if room_box is None:
            raise ProbeRefused("Room has no bounding box")
        categories = ("OST_Walls", "OST_Windows", "OST_Doors", "OST_CurtainWallPanels", "OST_CurtainWallMullions",
                      "OST_Floors", "OST_Roofs", "OST_Ceilings", "OST_Columns", "OST_StructuralColumns", "OST_GenericModel")
        records, counts, missing_boxes, physical = [], {}, [], []
        for category in categories:
            collector = self.DB.FilteredElementCollector(self.doc).OfCategory(getattr(self.DB.BuiltInCategory, category)).WhereElementIsNotElementType()
            try:
                total, included = 0, 0
                for element in collector:
                    total += 1
                    box = self.box(element)
                    if box is None:
                        missing_boxes.append(self.ref(element))
                    elif overlaps_xy(box, room_box, 4.0):
                        if len(records) >= 2000:
                            raise ProbeRefused("Candidate cap reached; no truncated acceptance")
                        records.append(rr("Element metadata", lambda: self.metadata(element, phase)))
                        if category in ("OST_Windows", "OST_Doors", "OST_CurtainWallPanels"):
                            physical.append({"ref": self.ref(element), "category": category,
                                "geometry": rr("Physical geometry", lambda: self.physical_geometry(element, room))})
                        included += 1
                counts[category] = {"wholeRootModel": total, "nearRoomAllHeights": included}
            finally:
                collector.Dispose()
        imports = self.DB.FilteredElementCollector(self.doc).OfClass(self.DB.ImportInstance)
        try:
            import_records = [rr("ImportInstance metadata", lambda: self.metadata(el, phase)) for el in imports]
        finally:
            imports.Dispose()
        return {"d1": baseline, "roomSolid": rr("Native 3D room boundary", lambda: self.room_solid(room)),
                "candidateSelection": {"source": "whole root document category collectors", "roomBboxFt": room_box,
                    "paddingFt": 4.0, "heightFilter": None, "phaseFilter": None, "designOptionFilter": None,
                    "counts": counts, "missingBoundingBoxes": missing_boxes,
                    "purpose": "reconnaissance only; excludes distant shading, linked and unlisted categories"},
                "candidates": records, "imports": import_records, "physicalGeometry": physical,
                "geometryAccepted": False, "normativeAccepted": False, "d2Complete": False,
                "limits": ["No glazing faces or transmittance accepted", "No visibility rays or complete shading",
                           "Room solid may bridge openings; never substitute it for physical occluders"]}


def run_d2(config, enabled, nonce, host_factory=D2Host):
    result = run_d1(adapt_config(config), enabled, nonce, host_factory=host_factory)
    result.update(schema=D2_SCHEMA, version="0.1.0", d2Complete=False)
    return result


def d2_entry(inputs):
    if len(inputs) != 3:
        raise ProbeRefused("Expected config path, enabled, run number")
    path = inputs[0]
    canonical_path(path, ".json")
    if os.path.getsize(path) > 65536:
        raise ProbeRefused("Configuration exceeds 64 KiB")
    with open(path, "r", encoding="utf-8-sig") as stream:
        config = json.load(stream)
    result = run_d2(config, inputs[1], inputs[2])
    target = config["evidence_jsonl"]
    if os.path.exists(target):
        if os.path.getsize(target) > 25 * 1024 * 1024:
            raise ProbeRefused("Evidence log exceeds 25 MiB")
        with open(target, "r", encoding="utf-8") as stream:
            for line in stream:
                if line.strip() and json.loads(line).get("schema") != D2_SCHEMA:
                    raise ProbeRefused("Existing output is not a D2 inspection log")
    serialized = json.dumps(result, ensure_ascii=False, sort_keys=True, allow_nan=False)
    if len(serialized.encode("utf-8")) > 20 * 1024 * 1024:
        raise ProbeRefused("Inspection exceeds 20 MiB")
    with open(target, "a", encoding="utf-8", newline="\n") as stream:
        stream.write(serialized + "\n")
    return json.dumps({k: v for k, v in result.items() if k != "payload"}, ensure_ascii=False, indent=2)


if "IN" in globals():
    try:
        OUT = d2_entry(IN)
    except Exception as exc:
        OUT = json.dumps({"schema": D2_SCHEMA, "status": "ERROR", "reason": str(exc),
                          "geometryAccepted": False, "normativeAccepted": False, "d2Complete": False})

"""Read-only shaft review: saved profile and conservative above-aperture inventory.

Bounding boxes identify possible blockers, never prove an obstruction or KEO.
No model constants, transactions, acceptance flags or automatic repairs.
"""
import math


def validate_sky_review(request, captured_window_uids):
    if not isinstance(request, dict) or set(request) != {"aperture_top_z_m", "aperture_center_xy_m", "self_window_uid"}:
        raise ProbeRefused("Explicit aperture elevation, centre and captured window required")
    z, xy = request["aperture_top_z_m"], request["aperture_center_xy_m"]
    if type(z) not in (int, float) or not math.isfinite(z):
        raise ProbeRefused("Finite aperture elevation required")
    if not isinstance(xy, list) or len(xy) != 2 or any(type(v) not in (int, float) or not math.isfinite(v) for v in xy):
        raise ProbeRefused("Finite XY centre required")
    if request["self_window_uid"] not in captured_window_uids:
        raise ProbeRefused("Self element must be a captured window")
    return request


def above_aperture_metrics(box_m, center_xy, plane_z):
    if box_m is None:
        return None
    lo, hi = box_m["min"], box_m["max"]
    if (len(lo) != 3 or len(hi) != 3 or
            any(not math.isfinite(v) for v in lo + hi) or any(lo[i] > hi[i] for i in range(3))):
        raise ProbeRefused("Invalid candidate bounding box")
    if hi[2] <= plane_z:
        return None
    dx = max(lo[0] - center_xy[0], center_xy[0] - hi[0], 0)
    dy = max(lo[1] - center_xy[1], center_xy[1] - hi[1], 0)
    distance = math.hypot(dx, dy)
    return {"aboveM": hi[2] - plane_z, "nearestHorizontalM": distance,
            "upperElevationDeg": math.degrees(math.atan2(hi[2] - plane_z, distance))}


class ShaftReviewHost(ProfileHost):
    def geometry_presence(self, element):
        DB = self.DB
        opts = DB.Options()
        opts.DetailLevel = DB.ViewDetailLevel.Fine
        opts.IncludeNonVisibleObjects = False
        out = {"positiveSolids": 0, "meshTriangles": 0, "otherTypes": {}}
        geometry = None
        def visit(items):
            if items is None:
                return
            for item in items:
                if isinstance(item, DB.GeometryInstance):
                    child = item.GetSymbolGeometry()
                    try:
                        visit(child)
                    finally:
                        if child is not None: child.Dispose()
                elif isinstance(item, DB.Solid):
                    if item.Faces.Size and item.Volume > 0: out["positiveSolids"] += 1
                elif isinstance(item, DB.Mesh):
                    out["meshTriangles"] += int(item.NumTriangles)
                else:
                    name = str(item.GetType().FullName)
                    out["otherTypes"][name] = out["otherTypes"].get(name, 0) + 1
        try:
            geometry = element.get_Geometry(opts)
            visit(geometry)
            out["geometryReturned"] = geometry is not None
            return out
        finally:
            if geometry is not None: geometry.Dispose()
            opts.Dispose()

    def review_descriptor(self, element):
        out = self.descriptor(element)
        out["nativeType"] = str(element.GetType().FullName)
        out["categoryName"] = str(element.Category.Name) if element.Category else None
        return out

    def sky_review(self, request, payload):
        request = validate_sky_review(request, [w["ref"]["uniqueId"] for w in payload["windows"]])
        DB = self.DB
        self_element = self.doc.GetElement(request["self_window_uid"])
        self_ids = {self_element.UniqueId}
        if isinstance(self_element, DB.FamilyInstance):
            self_ids.update(self.doc.GetElement(i).UniqueId for i in self_element.GetSubComponentIds())
        out = {"request": request, "candidates": [], "missingBounds": [], "externalReferences": [], "excludedNativeTypes": {},
               "selfElements": sorted(self_ids), "modelElementsChecked": 0,
               "shadingAccepted": False, "scope": "All root model bounding boxes above the upper aperture; no distance cutoff. Candidates need geometry review. External/reference completeness is separate."}
        # A Revit Family is a definition, but is NOT an ElementType. Likewise,
        # views/materials can have CategoryType.Model. They are not obstacles.
        nonphysical = (DB.Architecture.Room, DB.Area, DB.View, DB.Family,
                       DB.Material, DB.ProjectInfo, DB.SunAndShadowSettings,
                       DB.PropertySetElement, DB.Plumbing.PipeSegment, DB.CurtainGridLine)
        nonphysical_categories = {DB.ElementId(b).Value for b in (
            DB.BuiltInCategory.OST_Cameras, DB.BuiltInCategory.OST_PreviewLegendComponents,
            DB.BuiltInCategory.OST_CurtaSystemFaceManager)}
        for e in DB.FilteredElementCollector(self.doc).WhereElementIsNotElementType():
            if isinstance(e, (DB.RevitLinkInstance, DB.ImportInstance)):
                out["externalReferences"].append({"ref": self.review_descriptor(e), "bbox": self.bbox(e),
                    "kind": str(e.GetType().Name), "lifecycle": self.lifecycle(e)})
            if isinstance(e, nonphysical) or (e.Category and e.Category.Id.Value in nonphysical_categories):
                native = str(e.GetType().FullName)
                out["excludedNativeTypes"][native] = out["excludedNativeTypes"].get(native, 0) + 1
                continue
            if e.Category is None or e.Category.CategoryType != DB.CategoryType.Model or e.ViewSpecific:
                continue
            out["modelElementsChecked"] += 1
            if e.UniqueId in self_ids:
                continue
            box = self.bbox(e)
            if box is None:
                row = self.review_descriptor(e)
                row.update(geometry=self.geometry_presence(e), lifecycle=self.lifecycle(e), option=self.option(e))
                out["missingBounds"].append(row)
                continue
            box_m = {k: [v * 0.3048 for v in box[k]] for k in ("min", "max")}
            metrics = above_aperture_metrics(box_m, request["aperture_center_xy_m"], request["aperture_top_z_m"])
            if metrics is not None:
                out["candidates"].append({"ref": self.review_descriptor(e), "bboxM": box_m, "bounds": metrics,
                    "lifecycle": self.lifecycle(e), "option": self.option(e)})
            if len(out["candidates"]) > 3000 or len(out["missingBounds"]) > 3000:
                raise ProbeRefused("Review inventory limit exceeded; no partial success")
        out["candidates"].sort(key=lambda r: (-r["bounds"]["upperElevationDeg"], r["ref"]["uniqueId"]))
        return out

    def tag_inventory(self, room_uid):
        DB = self.DB
        room = self.doc.GetElement(room_uid)
        return {"types": [{"ref": self.descriptor(t), "family": str(t.Family.Name), "parameters": self.params(t)}
                          for t in DB.FilteredElementCollector(self.doc).OfCategory(DB.BuiltInCategory.OST_RoomTags).WhereElementIsElementType()
                          if isinstance(t, DB.FamilySymbol)],
                "roomParameters": self.params(room)}


def shaft_review_entry(inputs):
    if len(inputs) != 3 or type(inputs[1]) is not bool:
        raise ProbeRefused("Expected config, Boolean and nonce")
    canonical_path(inputs[0], ".json")
    with open(inputs[0], encoding="utf-8-sig") as f:
        config = json.load(f)
    canonical_path(config["output_json"], ".json")
    result = {"schema": "keo-shaft-review/v1", "status": "CANCELLED", "nonce": str(inputs[2]),
              "bundleSha256": BUNDLE_SHA256, "modelWriteRequested": False, "geometryAccepted": False}
    if inputs[1]:
        host = ShaftReviewHost()
        before = profile_baseline(config, host)
        payload = host.profile(config)
        payload["skyReview"] = host.sky_review(config["sky_review"], payload)
        payload["tagInventory"] = host.tag_inventory(config["room_uid"])
        after = host.snapshot()
        if before != after:
            raise ProbeRefused("Document changed during shaft review")
        result.update(status="SHAFT_REVIEW_CAPTURED", before=before, after=after, payload=payload, documentUnchanged=True)
        result["payloadSha256"] = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
        with open(config["output_json"], "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    return json.dumps({k: v for k, v in result.items() if k not in ("payload", "before", "after")}, ensure_ascii=False, indent=2)


if "IN" in globals():
    try:
        OUT = shaft_review_entry(IN)
    except Exception as exc:
        OUT = json.dumps({"status": "ERROR", "reason": type(exc).__name__ + ": " + str(exc)}, ensure_ascii=False)

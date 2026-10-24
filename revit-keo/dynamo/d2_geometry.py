"""Physical face evidence only. Display transparency is NOT optical transmittance."""


def walk_symbol_geometry(geometry, transform, db, solid_callback, other_callback, path=(), depth=0):
    if depth > 12:
        raise ValueError("Nested geometry exceeds depth limit")
    for index, obj in enumerate(geometry):
        key = path + (index,)
        if isinstance(obj, db.GeometryInstance):
            child = obj.GetSymbolGeometry()
            combined = transform.Multiply(obj.Transform)
            try:
                walk_symbol_geometry(child, combined, db, solid_callback, other_callback, key, depth + 1)
            finally:
                if child is not None: child.Dispose()
                combined.Dispose()
        elif isinstance(obj, db.Solid):
            solid_callback(obj, transform, key)
        else:
            other_callback(obj, key)


def box_contains(outer, inner, tolerance=1e-4):
    return all(outer[0][i] - tolerance <= inner[0][i] and
               inner[1][i] <= outer[1][i] + tolerance for i in range(3))


class PhysicalGeometryMixin:
    def material_record(self, material_id):
        material = self.doc.GetElement(material_id)
        if material is None:
            return {"id": self.eid(material_id), "status": "unresolved", "opticalTransmittance": None}
        return {"ref": self.ref(material), "name": str(material.Name),
                "displayTransparencyPercent": int(material.Transparency),
                "appearanceAsset": self.resolve(material.AppearanceAssetId),
                "opticalTransmittance": None, "opticalSource": "not established"}

    def face_room_probe(self, face, room):
        if not isinstance(face, self.DB.PlanarFace):
            return {"status": "unsupported", "reason": "Nonplanar face"}
        bounds = face.GetBoundingBox()
        uv = self.DB.UV((bounds.Min.U + bounds.Max.U) / 2, (bounds.Min.V + bounds.Max.V) / 2)
        if not face.IsInside(uv):
            return {"status": "unavailable", "reason": "UV midpoint outside trimmed face"}
        point, normal = face.Evaluate(uv), face.ComputeNormal(uv)
        samples = []
        for mm in (10, 100, 500):
            delta = normal.Multiply(mm / 304.8)
            samples.append({"offsetMm": mm, "plusInSelectedRoom": bool(room.IsPointInRoom(point.Add(delta))),
                            "minusInSelectedRoom": bool(room.IsPointInRoom(point.Subtract(delta)))})
        return {"status": "ok", "pointFt": self.xyz(point), "normal": self.xyz(normal),
                "samples": samples, "visibilityAccepted": False,
                "meaning": "Local point membership only; not a ray or exterior classification"}

    def physical_geometry(self, element, room):
        options = self.DB.Options()
        options.DetailLevel = self.DB.ViewDetailLevel.Fine
        options.IncludeNonVisibleObjects = False
        options.ComputeReferences = False
        geometry = None
        solids, other, materials = [], [], {}
        face_count = 0
        def record_solid(solid, transform, key):
            nonlocal face_count
            if solid.Faces.Size == 0:
                return
            face_count += solid.Faces.Size
            if face_count > 5000:
                raise ValueError("Physical element face limit reached; no truncated acceptance")
            world = self.DB.SolidUtils.CreateTransformed(solid, transform)
            try:
                faces = []
                for face in world.Faces:
                    record = self.face_record(face)
                    material_key = self.eid(face.MaterialElementId)
                    if material_key not in materials:
                        materials[material_key] = self.material_record(face.MaterialElementId)
                    if materials[material_key].get("displayTransparencyPercent", 0) > 0:
                        record["roomProbe"] = self.face_room_probe(face, room)
                    faces.append(record)
                bounds = world.GetBoundingBox()
                try:
                    pts = [self.xyz(bounds.Transform.OfPoint(self.DB.XYZ(x, y, z)))
                           for x in (bounds.Min.X, bounds.Max.X) for y in (bounds.Min.Y, bounds.Max.Y)
                           for z in (bounds.Min.Z, bounds.Max.Z)]
                    bbox = [[min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]]
                finally:
                    bounds.Dispose()
                element_box = self.box(element)
                solids.append({"geometryPath": list(key), "symbolToRootTransform": self.matrix(transform),
                               "volumeFt3": float(world.Volume), "surfaceAreaFt2": float(world.SurfaceArea),
                               "bboxFt": bbox, "insideElementBbox": box_contains(element_box, bbox) if element_box else None,
                               "faces": faces})
            finally:
                world.Dispose()
        def record_other(obj, key):
            other.append({"geometryPath": list(key), "nativeType": str(obj.GetType().FullName),
                          "status": "not serialized", "couldAffectCompleteness": True})
        identity = self.DB.Transform.Identity
        try:
            geometry = element.get_Geometry(options)
            if geometry is None:
                raise ValueError("Element has no physical geometry")
            walk_symbol_geometry(geometry, identity, self.DB, record_solid, record_other)
            return {"source": self.ref(element), "coordinates": "root Revit internal feet",
                    "detailLevel": "Fine", "includeNonVisibleObjects": False,
                    "extraction": "GetSymbolGeometry + accumulated Transform + SolidUtils.CreateTransformed",
                    "solids": solids, "otherGeometry": other, "materials": materials,
                    "glazingAccepted": False, "visibilityAccepted": False,
                    "limits": ["Display transparency is not optical transmittance",
                               "Opposite glass faces/layers are not distinct apertures",
                               "Membership probes do not establish visibility or exterior",
                               "Shared children may be separate elements; no deduplication or full shading"]}
        finally:
            identity.Dispose()
            if geometry is not None: geometry.Dispose()
            options.Dispose()

"""Bounded native section measurements; never a daylight or shading solver."""
import math


def validate_section_probe(request, available_uids):
    if not isinstance(request,dict) or set(request)!={"element_uids","segments_m","room_points_m"}:
        raise ValueError("Section probe requires explicit elements, metre segments and room points")
    uids=request["element_uids"]
    if (not isinstance(uids,list) or not 1<=len(uids)<=8 or
        any(not isinstance(u,str) or not u for u in uids) or
        len(set(uids))!=len(uids) or not set(uids)<=set(available_uids)):
        raise ValueError("Probe elements must be 1..8 unique captured candidates")
    def point(p):
        if (not isinstance(p,list) or len(p)!=3 or
            any(type(v) not in (int,float) or not math.isfinite(v) for v in p)):
            raise ValueError("Finite XYZ metres required")
    segments=request["segments_m"]
    if not isinstance(segments,list) or not 1<=len(segments)<=48:
        raise ValueError("1..48 explicit section segments required")
    for s in segments:
        if not isinstance(s,list) or len(s)!=2:raise ValueError("Segment needs two endpoints")
        point(s[0]);point(s[1])
        if not 0.001<=math.dist(s[0],s[1])<=100:
            raise ValueError("Section segment length must be between 1 mm and 100 m")
    points=request["room_points_m"]
    if not isinstance(points,list) or len(points)>16:raise ValueError("At most 16 room points")
    for p in points:point(p)
    return request


def read_section_probe(host, room, request, available_uids):
    validate_section_probe(request,available_uids)
    DB=host.DB
    xyz=lambda p:DB.XYZ(*(v/0.3048 for v in p))
    metres=lambda p:[float(p.X)*0.3048,float(p.Y)*0.3048,float(p.Z)*0.3048]
    result={"units":"root Revit internal axes, metres","request":request,
        "roomPoints":[{"pointM":p,"inside":bool(room.IsPointInRoom(xyz(p)))} for p in request["room_points_m"]],
        "elements":[],"geometryAccepted":False,"shadingAccepted":False,
        "scope":"Explicit finite segments and elements only; no proof of unobstructed sky or complete aperture"}
    curves=[]
    options=DB.Options()
    options.DetailLevel=DB.ViewDetailLevel.Fine
    options.IncludeNonVisibleObjects=False
    options.ComputeReferences=False
    identity=DB.Transform.Identity
    intersections=DB.SolidCurveIntersectionOptions()
    intersections.ResultType=DB.SolidCurveIntersectionMode.CurveSegmentsInside
    try:
        curves=[DB.Line.CreateBound(xyz(s[0]),xyz(s[1])) for s in request["segments_m"]]
        for uid in request["element_uids"]:
            element=host.doc.GetElement(uid)
            if element is None:raise ValueError("Probe element no longer exists")
            record={"ref":host.descriptor(element),"lifecycle":host.lifecycle(element),
                "option":host.option(element),"solids":0,"hits":[],"otherGeometry":[]}
            count=[0]
            def solid(s,transform,key):
                if s.Faces.Size==0:return
                count[0]+=s.Faces.Size
                if count[0]>10000:raise ValueError("Section element face limit exceeded")
                world=DB.SolidUtils.CreateTransformed(s,transform)
                try:
                    if world.Volume<=0:raise ValueError("Section target contains a non-volume solid")
                    record["solids"]+=1
                    for index,line in enumerate(curves):
                        hit=world.IntersectWithCurve(line,intersections)
                        try:
                            for j in range(hit.SegmentCount):
                                segment=hit.GetCurveSegment(j)
                                try:
                                    record["hits"].append({"segment":index,"geometryPath":list(key),
                                        "startM":metres(segment.GetEndPoint(0)),"endM":metres(segment.GetEndPoint(1)),
                                        "lengthM":float(segment.Length)*0.3048})
                                finally:segment.Dispose()
                        finally:hit.Dispose()
                finally:world.Dispose()
            def other(obj,key):
                record["otherGeometry"].append({"geometryPath":list(key),"type":str(obj.GetType().FullName)})
            geometry=element.get_Geometry(options)
            try:
                if geometry is None:raise ValueError("No target geometry available")
                walk_symbol_geometry(geometry,identity,DB,solid,other)
            finally:
                if geometry is not None:geometry.Dispose()
            result["elements"].append(record)
    finally:
        for line in curves:line.Dispose()
        intersections.Dispose();identity.Dispose();options.Dispose()
    return result

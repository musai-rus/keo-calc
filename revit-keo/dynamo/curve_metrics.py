"""Analytic horizontal Line/Arc metrics and topology; no tessellation or Revit.

Numerical tolerances bound comparison only, not the unknown source accuracy.
Near-degenerate/touching configurations fail instead of repairing input geometry.
"""
import math

EPS = 1e-7  # feet, fixed before the real metric comparison
AREA_EPS = 1e-6  # square feet
REL = 1e-6
TAU = 2 * math.pi


def dist(a, b): return math.dist(a[:2], b[:2])
def cross(a, b): return a[0] * b[1] - a[1] * b[0]
def sub(a, b): return [a[0] - b[0], a[1] - b[1]]


def curve(raw):
    if raw.get("status") != "ok" or raw.get("kind") not in ("Line", "Arc"):
        raise ValueError("Unsupported native curve; no approximation")
    a, b = raw["start"], raw["end"]
    if any(len(p) != 3 or any(not math.isfinite(v) for v in p) for p in (a, b)):
        raise ValueError("Invalid endpoint")
    out = {"kind": raw["kind"], "a": a, "b": b}
    if raw["kind"] == "Line":
        length = math.dist(a, b)
        if length <= EPS: raise ValueError("Degenerate Line")
    else:
        c, r, x, y = raw["center"], raw["radiusFt"], raw["xDirection"], raw["yDirection"]
        t0, t1 = raw["parameterRange"]
        if not all(math.isfinite(v) for v in [*c, r, *x, *y, t0, t1]): raise ValueError("Invalid Arc data")
        determinant = cross(x, y)
        if r <= EPS or not 0 < t1 - t0 <= TAU + 1e-12: raise ValueError("Unsupported Arc range/radius")
        if max(abs(x[2]), abs(y[2])) > 1e-10 or abs(abs(determinant) - 1) > 1e-10:
            raise ValueError("Arc is not horizontal with orthonormal axes")
        if abs(sum(v*v for v in x)-1) > 1e-10 or abs(sum(v*v for v in y)-1) > 1e-10 or abs(sum(u*v for u,v in zip(x,y))) > 1e-10:
            raise ValueError("Invalid Arc axes")
        for t, endpoint in ((t0, a), (t1, b)):
            evaluated = [c[i] + r * (x[i]*math.cos(t) + y[i]*math.sin(t)) for i in range(3)]
            if math.dist(evaluated, endpoint) > EPS: raise ValueError("Arc parameters disagree with native endpoints")
        out.update(c=c, r=r, theta=math.atan2(a[1]-c[1], a[0]-c[0]), sweep=(t1-t0)*(1 if determinant>0 else -1))
        length = r * (t1-t0)
    if not math.isfinite(raw["lengthFt"]) or abs(raw["lengthFt"] - length) > EPS:
        raise ValueError("Analytic length differs from native Curve.Length")
    out["length"] = length
    return out


def at(c, t):
    if c["kind"] == "Line": return [c["a"][i] + t*(c["b"][i]-c["a"][i]) for i in range(2)]
    theta=c["theta"]+c["sweep"]*t
    return [c["c"][0]+c["r"]*math.cos(theta), c["c"][1]+c["r"]*math.sin(theta)]


def fraction(c, p):
    if dist(p,c["a"]) <= EPS: return 0.0
    if dist(p,c["b"]) <= EPS: return 1.0
    if c["kind"] == "Line":
        vector=sub(c["b"],c["a"])
        if abs(cross(vector,sub(p,c["a"]))) > EPS*c["length"]: return None
        t=sum(u*v for u,v in zip(sub(p,c["a"]),vector))/(c["length"]**2)
    else:
        if abs(dist(p,c["c"])-c["r"]) > EPS: return None
        theta=math.atan2(p[1]-c["c"][1],p[0]-c["c"][0])
        angle=((theta-c["theta"]) if c["sweep"]>0 else (c["theta"]-theta)) % TAU
        t=angle/abs(c["sweep"])
    return t if -EPS/c["length"] <= t <= 1+EPS/c["length"] else None


def unique(points):
    result=[]
    for p in points:
        if not any(dist(p,q)<=EPS for q in result): result.append(p)
    return result


def intersections(a,b):
    if a["kind"]==b["kind"]=="Line":
        v,w=sub(a["b"],a["a"]),sub(b["b"],b["a"])
        denominator=cross(v,w)
        if denominator == 0:
            return unique([p for p in (a["a"],a["b"],b["a"],b["b"]) if fraction(a,p) is not None and fraction(b,p) is not None])
        t=cross(sub(b["a"],a["a"]),w)/denominator
        points=[at(a,t)]
    elif a["kind"]=="Line" or b["kind"]=="Line":
        if b["kind"]=="Line": a,b=b,a
        unit=[v/a["length"] for v in sub(a["b"],a["a"])]
        offset=sub(b["c"],a["a"])
        along=sum(u*v for u,v in zip(unit,offset))
        perpendicular=abs(cross(unit,offset))
        if perpendicular > b["r"]+EPS: return []
        if abs(perpendicular-b["r"])<=EPS:
            roots=[along]
        else:
            h=math.sqrt(max(0,b["r"]**2-perpendicular**2)); roots=[along-h,along+h]
        points=[at(a,s/a["length"]) for s in roots]
    else:
        d=dist(a["c"],b["c"])
        if d<=EPS:
            if abs(a["r"]-b["r"])>EPS: return []
            candidates=[a["a"],a["b"],b["a"],b["b"],at(a,0.5),at(b,0.5)]
            return unique([p for p in candidates if fraction(a,p) is not None and fraction(b,p) is not None])
        if d>a["r"]+b["r"]+EPS or d<abs(a["r"]-b["r"])-EPS: return []
        along=(a["r"]**2-b["r"]**2+d*d)/(2*d)
        h2=a["r"]**2-along**2
        if h2 < -EPS*max(a["r"],b["r"]): return []
        h=math.sqrt(max(0,h2)); u=[v/d for v in sub(b["c"],a["c"])]
        center=[a["c"][i]+along*u[i] for i in range(2)]
        points=[[center[0]+sign*h*(-u[1]),center[1]+sign*h*u[0]] for sign in (-1,1)]
    return unique([p for p in points if fraction(a,p) is not None and fraction(b,p) is not None])


def contains(p,loop):
    winding=0
    for c in loop:
        if fraction(c,p) is not None: raise ValueError("Point touches boundary; containment ambiguous")
        if c["kind"]=="Line":
            a,b=c["a"],c["b"]
            if a[1]<=p[1]<b[1] or b[1]<=p[1]<a[1]:
                x=a[0]+(p[1]-a[1])*(b[0]-a[0])/(b[1]-a[1])
                if x>p[0]: winding += 1 if b[1]>a[1] else -1
        else:
            dy=p[1]-c["c"][1]
            if abs(dy)>=c["r"]: continue  # tangency is not a crossing
            dx=math.sqrt(c["r"]**2-dy**2)
            for x in (c["c"][0]-dx,c["c"][0]+dx):
                q=[x,p[1]]; t=fraction(c,q)
                if t is None or x<=p[0]: continue
                derivative=(x-c["c"][0])*c["sweep"]
                if abs(derivative)<1e-14: continue
                if derivative>0 and t<1: winding+=1
                elif derivative<0 and t>0: winding-=1
    return winding!=0


def loop_area(loop):
    origin=loop[0]["a"]
    values=[]
    for c in loop:
        if c["kind"]=="Line": values.append(cross(sub(c["a"],origin),sub(c["b"],origin)))
        else: values.append(cross(sub(c["c"],origin),sub(c["b"],c["a"]))+c["r"]**2*c["sweep"])
    return math.fsum(values)/2


def validate_curves(payload):
    report={"schema":"keo-dynamo-d1-check/v1","status":"ERROR","profile":"horizontal-native-Line-Arc-loops",
            "geometryAccepted":False,"normativeAccepted":False,"sourceAccuracy":"unknown",
            "tolerances":{"lengthFt":EPS,"areaAbsoluteFt2":AREA_EPS,"areaRelative":REL},"diagnostics":[]}
    try:
        u=payload["units"]
        if (u["frame"],u["length"],u["area"],u["metresPerFoot"]) != ("revit-internal-feet","ft","ft2",0.3048): raise ValueError("Unknown units")
        b=payload["boundaries"]
        if b["status"]!="ok" or b["location"]!="Finish": raise ValueError("Unavailable/different boundary location")
        loops=[[curve(s["curve"]) for s in loop] for loop in b["loopsInApiOrder"]]
        if not loops or any(len(loop)<2 for loop in loops): raise ValueError("Incomplete loops")
        zs=[p[2] for loop in loops for c in loop for p in (c["a"],c["b"])]
        if max(zs)-min(zs)>EPS: raise ValueError("Not a single horizontal plane")
        for loop in loops:
            for i,c in enumerate(loop):
                if math.dist(c["b"],loop[(i+1)%len(loop)]["a"])>EPS: raise ValueError("Open loop; no repair applied")
                for j,d in enumerate(loop[i+1:],i+1):
                    shared=[]
                    if j==i+1: shared.append(c["b"])
                    if i==0 and j==len(loop)-1: shared.append(c["a"])
                    for point in intersections(c,d):
                        if not any(dist(point,p)<=EPS for p in shared): raise ValueError("Self-intersection, overlap or touch")
        for i,a in enumerate(loops):
            for b in loops[i+1:]:
                if any(intersections(c,d) for c in a for d in b): raise ValueError("Loops intersect or touch")
        areas=[loop_area(loop) for loop in loops]
        if any(abs(a)<=AREA_EPS for a in areas): raise ValueError("Degenerate loop area")
        depths=[sum(contains(loop[0]["a"],other) for j,other in enumerate(loops) if i!=j) for i,loop in enumerate(loops)]
        area=math.fsum(abs(a)*(-1 if depth%2 else 1) for a,depth in zip(areas,depths))
        perimeter=math.fsum(c["length"] for loop in loops for c in loop)
        room=payload["room"]
        if area<=0 or room["areaFt2"]<=0: raise ValueError("Nonpositive Room area")
        da,dp=area-room["areaFt2"],perimeter-room["perimeterFt"]
        ok=abs(da)<=max(AREA_EPS,REL*abs(room["areaFt2"])) and abs(dp)<=max(EPS,REL*abs(room["perimeterFt"]))
        points=[p for loop in loops for c in loop for p in (c["a"],c["b"])]
        for loop in loops:
            for c in loop:
                if c["kind"]=="Arc":
                    for theta in (0,math.pi/2,math.pi,3*math.pi/2):
                        p=[c["c"][0]+c["r"]*math.cos(theta),c["c"][1]+c["r"]*math.sin(theta)]
                        if fraction(c,p) is not None: points.append(p)
        report.update(status="METRICS_MATCH" if ok else "MISMATCH",loopCount=len(loops),segmentCount=sum(map(len,loops)),
                      nestingDepths=depths,signedLoopAreasFt2=areas,areaFt2=area,perimeterFt=perimeter,
                      areaM2=area*0.3048**2,perimeterM=perimeter*0.3048,areaDeltaFt2=da,perimeterDeltaFt=dp,
                      spanXFt=max(p[0] for p in points)-min(p[0] for p in points),spanYFt=max(p[1] for p in points)-min(p[1] for p in points),boundaryZFt=zs[0],
                      diagnostics=payload.get("diagnostics",[]))
        loc=room.get("location",{})
        if loc.get("status")=="ok": report["locationInsidePlan"]=sum(contains(loc["xyzFt"],loop) for loop in loops)%2==1
    except (ValueError,KeyError,TypeError,IndexError) as exc:
        report.update(status="ERROR",diagnostics=[str(exc)])
    return report

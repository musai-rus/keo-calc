"""Targeted read-only profile inspection after a recorded diagnostic D5 apply.

No transactions, model writes or saving. The complete current snapshot must
equal the successful apply evidence; all profile inputs are reread.
This inspects candidate dimensions, not geometry/normative acceptance.
"""

def recorded_baseline(config, host):
    validate_config(config["documentGuard"])
    canonical_path(config["apply_evidence_jsonl"], ".jsonl")
    identity=host.identity()
    guard=config["documentGuard"]
    if canonical_path(identity["path"],".rvt")!=canonical_path(guard["expected_rvt_path"],".rvt"):
        raise ProbeRefused("Wrong active test document")
    if (identity["revitVersion"],identity["revitBuild"])!=(guard["expected_revit_version"],guard["expected_revit_build"]):
        raise ProbeRefused("Wrong Revit version/build")
    with open(config["apply_evidence_jsonl"],encoding="utf-8") as f:
        records=[json.loads(line) for line in f if line.strip()]
    matches=[r for r in records if r.get("status")=="PENDING_PLAN_APPLIED" and r.get("nonce")==str(config["apply_nonce"])]
    if len(matches)!=1: raise ProbeRefused("One exact successful diagnostic apply required")
    baseline=matches[0]["after"]
    current=host.snapshot()
    if current!=baseline or current["sha256"].lower()!=guard["expected_sha256"].lower():
        raise ProbeRefused("Current state differs from recorded diagnostic apply: "+json.dumps({k:[baseline[k],current[k]] for k in baseline if baseline[k]!=current[k]}))
    if any(current[k] for k in ("isModifiable","isWorkshared","isLinked","isFamilyDocument","isModelInCloud")):
        raise ProbeRefused("Unsupported document state")
    return current


def detail_selection(config, window_uids):
    """Only explicitly selected, already captured windows; never a scene export."""
    selected=config.get("detail_window_uids",[])
    if not isinstance(selected,list) or len(selected)>3 or any(not isinstance(x,str) or not x for x in selected):
        raise ProbeRefused("At most three explicit window UIDs required")
    if len(set(selected))!=len(selected) or not set(selected).issubset(set(window_uids)):
        raise ProbeRefused("Detail selection must be unique captured windows")
    return selected


class ProfileHost(InputHost):
    def bbox(self, element):
        box=element.get_BoundingBox(None)
        return None if box is None else {"min":self.xyz(box.Min),"max":self.xyz(box.Max)}

    def profile(self, config):
        DB=self.DB
        room=self.doc.GetElement(config["room_uid"])
        phase=self.doc.GetElement(config["phase_uid"])
        if not isinstance(room,DB.Architecture.Room) or self.phase(room)["uniqueId"]!=config["phase_uid"] or room.DesignOption is not None:
            raise ProbeRefused("Placed main-model Room in selected phase required")
        if room.Area<=0 or room.Location is None:raise ProbeRefused("Room not enclosed/placed")
        rb=self.bbox(room)
        out={"room":self.descriptor(room),"parameters":self.params(room),"outline":self.outline(room),
             "locationFt":self.xyz(room.Location.Point),"bbox":rb,"phase":self.descriptor(phase),
             "northRadians":float(self.doc.ActiveProjectLocation.GetProjectPosition(DB.XYZ.Zero).Angle),
             "windows":[],"hosts":[],"units":"feet; raw parameters include specTypeId"}
        transform=self.doc.ActiveProjectLocation.GetTotalTransform()
        out["projectTransform"]={"basisX":self.xyz(transform.BasisX),"basisY":self.xyz(transform.BasisY),"origin":self.xyz(transform.Origin)}
        hosts=set()
        for w in DB.FilteredElementCollector(self.doc).OfCategory(DB.BuiltInCategory.OST_Windows).WhereElementIsNotElementType():
            if not isinstance(w,DB.FamilyInstance):continue
            f=rr("FromRoom(phase)",lambda:self.descriptor(w.get_FromRoom(phase)))
            t=rr("ToRoom(phase)",lambda:self.descriptor(w.get_ToRoom(phase)))
            wb=self.bbox(w)
            related=any(v.get("value") and v["value"]["uniqueId"]==room.UniqueId for v in (f,t))
            near=wb is not None and all(wb["max"][i]>=rb["min"][i]-1 and wb["min"][i]<=rb["max"][i]+1 for i in (0,1))
            if not related and not near:continue
            out["windows"].append({"ref":self.descriptor(w),"fromRoom":f,"toRoom":t,"bbox":wb,
                "related":related,"nearXY":near,"parameters":self.params(w),"typeParameters":self.params(w.Symbol),
                "host":self.descriptor(w.Host),"lifecycle":self.lifecycle(w),"option":self.option(w),
                "facing":self.xyz(w.FacingOrientation),"hand":self.xyz(w.HandOrientation)})
            if w.Host is not None:hosts.add(w.Host.UniqueId)
        for uid in sorted(hosts):
            wall=self.doc.GetElement(uid)
            row={"ref":self.descriptor(wall),"bbox":self.bbox(wall),"parameters":self.params(wall)}
            if isinstance(wall,DB.Wall):
                curve=wall.Location.Curve
                row.update(kind=str(wall.WallType.Kind),curve=str(curve.GetType().Name),
                    startFt=self.xyz(curve.GetEndPoint(0)),endFt=self.xyz(curve.GetEndPoint(1)),
                    widthFt=float(wall.Width),lengthFt=float(curve.Length),orientation=self.xyz(wall.Orientation))
                if wall.CurtainGrid is not None:
                    row["panels"]=[{"ref":self.descriptor(p),"bbox":self.bbox(p),"parameters":self.params(p),
                        "typeParameters":self.params(self.doc.GetElement(p.GetTypeId()))}
                        for p in [self.doc.GetElement(eid) for eid in wall.CurtainGrid.GetPanelIds()]]
            out["hosts"].append(row)
        # Local overhang candidates only: no claim of complete remote shading.
        # Read nearby upper slabs/roofs to identify the exact geometry needed
        # for the calculator's overhang fields; do not export a scene mesh.
        out["localShadingCandidates"]=[]
        pad=20.0
        for bic in (DB.BuiltInCategory.OST_Floors,DB.BuiltInCategory.OST_Roofs,DB.BuiltInCategory.OST_GenericModel):
            for e in DB.FilteredElementCollector(self.doc).OfCategory(bic).WhereElementIsNotElementType():
                box=self.bbox(e)
                if box is None or box["max"][2]<=rb["min"][2]+2:continue
                if not all(box["max"][i]>=rb["min"][i]-pad and box["min"][i]<=rb["max"][i]+pad for i in (0,1)):continue
                out["localShadingCandidates"].append({"ref":self.descriptor(e),"bbox":box,"parameters":self.params(e),"lifecycle":self.lifecycle(e)})
        out["shadingScope"]={"kind":"local-candidates-only","paddingFt":pad,"remoteObstaclesAccepted":False}
        selected=detail_selection(config,[w["ref"]["uniqueId"] for w in out["windows"]])
        if selected:
            detail_host=D2Host()
            out["windowDetails"]=[{"uid":uid,"location":rr("Location",lambda: self.xyz(self.doc.GetElement(uid).Location.Point)),
                "geometry":rr("Selected window geometry",lambda:detail_host.physical_geometry(self.doc.GetElement(uid),room))}
                for uid in selected]
        return out


def profile_entry(inputs):
    if len(inputs)!=3 or type(inputs[1]) is not bool:raise ProbeRefused("Expected config, Boolean, nonce")
    canonical_path(inputs[0],".json")
    with open(inputs[0],encoding="utf-8-sig") as f:config=json.load(f)
    result={"schema":"keo-profile-read/v1","status":"CANCELLED","nonce":str(inputs[2]),
            "modelWriteRequested":False,"geometryAccepted":False,"bundleSha256":BUNDLE_SHA256}
    canonical_path(config["output_json"],".json")
    if inputs[1]:
        host=ProfileHost()
        before=recorded_baseline(config,host)
        payload=host.profile(config)
        after=host.snapshot()
        if before!=after:raise ProbeRefused("Document changed during read")
        result.update(status="PROFILE_CAPTURED",before=before,after=after,payload=payload,documentUnchanged=True)
        result["payloadSha256"]=hashlib.sha256(json.dumps(payload,ensure_ascii=False,sort_keys=True).encode("utf-8")).hexdigest()
        with open(config["output_json"],"w",encoding="utf-8") as f:json.dump(result,f,ensure_ascii=False,indent=2)
    return json.dumps({k:v for k,v in result.items() if k not in ("payload","before","after")},ensure_ascii=False,indent=2)


if "IN" in globals():
    try: OUT=profile_entry(IN)
    except Exception as exc: OUT=json.dumps({"status":"ERROR","reason":type(exc).__name__+": "+str(exc)},ensure_ascii=False)

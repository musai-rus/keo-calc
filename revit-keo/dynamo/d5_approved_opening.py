"""Explicit test-only opening + preliminary gray plan. Never auto-repair BIM.

No project IDs, paths or dimensions in code. Requires an exact profile capture,
reviewed plan fingerprint and successful rollback rehearsal before apply.
Calculations are imported from the unchanged JS runner; no KEO formula here.
"""
import math


def json_hash(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False).encode("utf-8")).hexdigest()


def validate_opening(value):
    required={"host_uid","center_m","diameter_m","z_range_m","approval"}
    if not isinstance(value,dict) or set(value)!=required:
        raise ProbeRefused("Explicit bounded opening definition required")
    if not isinstance(value["host_uid"],str) or not value["host_uid"] or not value["approval"]:
        raise ProbeRefused("Host UID and recorded human authorization required")
    def finite(values,count):
        return isinstance(values,list) and len(values)==count and all(type(x) in (int,float) and math.isfinite(x) for x in values)
    if not finite(value["center_m"],3) or not finite(value["z_range_m"],2):
        raise ProbeRefused("Finite centre and vertical host range required")
    diameter=value["diameter_m"]
    if type(diameter) not in (int,float) or not math.isfinite(diameter) or not 0.1<=diameter<=3:
        raise ProbeRefused("Supported test opening diameter: 0.1..3 m")
    low,high=value["z_range_m"]
    if not 0.01<=high-low<=3 or not low<=value["center_m"][2]<=high:
        raise ProbeRefused("Invalid host height range or sketch plane")
    return value


def opening_segments(value):
    validate_opening(value)
    x,y,_=value["center_m"]
    low,high=value["z_range_m"]
    radius=value["diameter_m"]/2
    # Centre + 8 just inside + 8 just outside the reviewed circle.
    points=[(x,y)]+[(x+r*math.cos(a*math.pi/4),y+r*math.sin(a*math.pi/4))
        for r in (radius-0.01,radius+0.01) for a in range(8)]
    return [[[a,b,low-0.05],[a,b,high+0.05]] for a,b in points]


def verify_opening_probe(probe,value,cut):
    if len(probe["elements"])!=1 or probe["elements"][0]["otherGeometry"]:
        raise ProbeRefused("Expected one completely represented solid host")
    totals=[0.0]*17
    for hit in probe["elements"][0]["hits"]:totals[hit["segment"]]+=hit["lengthM"]
    thickness=value["z_range_m"][1]-value["z_range_m"][0]
    expected=[0.0 if cut and i<9 else thickness for i in range(17)]
    if any(abs(a-b)>0.0001 for a,b in zip(totals,expected)):
        raise ProbeRefused("Host cut/control rays differ from reviewed circle: "+str(totals))
    return totals


def numeric_note(plan):
    if plan.get("status")!="PENDING" or not plan.get("preliminary"):
        raise ProbeRefused("This writer supports preliminary gray results only")
    result=plan["result"]
    for key in ("averagePercent","normPercent"):
        if type(result.get(key)) not in (int,float) or not math.isfinite(result[key]) or result[key]<0:
            raise ProbeRefused("Finite nonnegative calculator result required")
    f=lambda x:format(x,".2f").replace(".",",")
    return "КЕО (предв.): "+f(result["averagePercent"])+" %\nНорма ЕО: "+f(result["normPercent"])+" %\nУТОЧНИТЬ\n"+plan["reason"]


def runner_summary(calculation,room_uid):
    if (calculation.get("schema")!="keo-runner-preview/0.1" or calculation.get("ok") is not True
        or calculation.get("previewOnly") is not True or calculation.get("status")!="PENDING"
        or calculation.get("room",{}).get("uniqueId")!=room_uid):
        raise ProbeRefused("Successful preliminary runner result for this Room required")
    core=calculation["coreResult"]
    if core.get("ok") is not True or core["res"].get("kind")!="top":
        raise ProbeRefused("This diagnostic writer currently supports upper light only")
    return {"averagePercent":core["res"]["eFinal"],"normPercent":core["norm"]["v"],
            "coreSha256":calculation["core"]["sha256"],"inputSha256":calculation["inputSha256"]}


class ApprovedOpeningHost(PendingHost,ProfileHost):
    def note_text(self,plan):return numeric_note(plan)

    def capture_still_matches(self,config,evidence):
        if json_hash(self.profile(config["profile_config"]))!=evidence["payloadSha256"]:
            raise ProbeRefused("Fresh profile differs from the reviewed capture")

    def probe_opening(self,value):
        uid=value["host_uid"]
        return read_section_probe(self,self.doc.GetElement(self._room_uid),
            {"element_uids":[uid],"segments_m":opening_segments(value),"room_points_m":[]},[uid])

    def cut_opening(self,value):
        DB,d=self.DB,self.doc
        host=d.GetElement(value["host_uid"])
        if not isinstance(host,DB.Floor) or host.DesignOption is not None:
            raise ProbeRefused("Only an explicit main-model Floor host is supported")
        centre=DB.XYZ(*(v/0.3048 for v in value["center_m"]))
        radius=value["diameter_m"]/2/0.3048
        profile=DB.CurveArray()
        arcs=[DB.Arc.Create(centre,radius,a,a+math.pi,DB.XYZ.BasisX,DB.XYZ.BasisY) for a in (0,math.pi)]
        for arc in arcs:profile.Append(arc)
        tr=DB.Transaction(d,"КЕО — согласованный проём только в тестовой копии")
        try:
            tr.Start()
            opening=d.Create.NewOpening(host,profile,False)
            d.Regenerate()
            if opening.Host.Id!=host.Id:raise ProbeRefused("Opening host mismatch")
            if tr.Commit()!=DB.TransactionStatus.Committed:raise ProbeRefused("Opening commit failed")
            return self.ref(opening)
        finally:
            if tr.GetStatus()==DB.TransactionStatus.Started:tr.RollBack()
            tr.Dispose()
            for arc in arcs:arc.Dispose()
            profile.Dispose()


def approved_opening_entry(inputs):
    if len(inputs)!=3 or type(inputs[1]) is not bool:raise ProbeRefused("Config, Boolean and nonce required")
    # Disabled state does not even read a private config or access Revit.
    if not inputs[1]:return json.dumps({"status":"CANCELLED","rvtSaved":False})
    canonical_path(inputs[0],".json")
    with open(inputs[0],encoding="utf-8-sig") as f:config=json.load(f)
    if config.get("schema")!="keo-approved-opening/v1" or config.get("action") not in ("preview","rollback","apply"):
        raise ProbeRefused("Wrong schema or action")
    for name,ext in (("evidence_path",".json"),("result_path",".json"),("evidence_jsonl",".jsonl")):
        canonical_path(config[name],ext)
    opening=validate_opening(config["opening"])
    host=ApprovedOpeningHost()
    host._room_uid=config["room_uid"]
    guard=run_probe(config["documentGuard"],True,inputs[2],lambda:host)
    if guard["status"]!="READ_ONLY_OK":raise ProbeRefused(guard.get("reason","Clean test model required"))
    with open(config["evidence_path"],encoding="utf-8-sig") as f:evidence=json.load(f)
    if evidence.get("status")!="PROFILE_CAPTURED" or not evidence.get("documentUnchanged"):
        raise ProbeRefused("Unchanged successful profile capture required")
    if evidence["payload"]["room"]["uniqueId"]!=config["room_uid"]:
        raise ProbeRefused("Room mismatch")
    host.capture_still_matches(config,evidence)
    host.prepare(config,evidence)
    available={e["ref"]["uniqueId"] for e in evidence["payload"]["localShadingCandidates"]}
    if opening["host_uid"] not in available:raise ProbeRefused("Opening host was not captured")
    with open(config["result_path"],encoding="utf-8-sig") as f:calculation=json.load(f)
    if json_hash(calculation)!=config["result_sha256"]:
        raise ProbeRefused("Reviewed calculator result changed")
    plan={"schema":"keo-approved-opening-plan/v1","status":"PENDING","preliminary":True,
        "roomUid":config["room_uid"],"opening":opening,"color":[180,180,180],
        "result":runner_summary(calculation,config["room_uid"]),"resultSha256":config["result_sha256"],
        "reason":config["reason"],"viewName":config["view_name"],
        "sourceViewUid":config["source_view_uid"],"tagTypeUid":config["tag_type_uid"],
        "textTypeUid":config["text_type_uid"],"profilePayloadSha256":evidence["payloadSha256"],
        "bundleSha256":BUNDLE_SHA256,"rvtSaved":False}
    if not isinstance(plan["reason"],str) or not 1<=len(plan["reason"])<=240:raise ProbeRefused("Short explicit pending reason required")
    plan["noteText"]=numeric_note(plan)
    digest=json_hash(plan)
    before=host.snapshot()
    original_probe=host.probe_opening(opening)
    original_lengths=verify_opening_probe(original_probe,opening,False)
    record={"schema":"keo-approved-opening-run/v1","status":"PREVIEW_READY","nonce":str(inputs[2]),
        "plan":plan,"planSha256":digest,"before":before,"beforeCutLengthsM":original_lengths,
        "rvtSaved":False,"numericKeoAccepted":False}
    if config["action"]!="preview":
        if config.get("approved_plan_sha256")!=digest:raise ProbeRefused("Exact reviewed preview fingerprint required")
        if config["action"]=="apply":
            with open(config["evidence_jsonl"],encoding="utf-8") as f:previous=[json.loads(l) for l in f if l.strip()]
            if not any(r.get("status")=="ROLLBACK_VERIFIED" and r.get("planSha256")==digest for r in previous):
                raise ProbeRefused("Successful rollback of this exact plan required before apply")
        DB=host.DB
        group=DB.TransactionGroup(host.doc,"КЕО — пробный расчёт и согласованный проём")
        try:
            group.Start()
            apply_config=dict(config,action="apply")
            changed=host.write_pending(apply_config,evidence,plan)["elements"]
            changed["opening"]=host.cut_opening(opening)
            record["afterCutLengthsM"]=verify_opening_probe(host.probe_opening(opening),opening,True)
            note=host.doc.GetElement(changed["diagnosticText"]["uniqueId"])
            if str(note.Text).replace("\r"," ").strip().split()!=plan["noteText"].split():
                raise ProbeRefused("Numeric diagnostic text readback differs")
            record["elements"]=changed
            if config["action"]=="rollback":
                if group.RollBack()!=DB.TransactionStatus.RolledBack:raise ProbeRefused("Rollback failed")
                restored=host.snapshot()
                if any(restored[k]!=before[k] for k in before if k!="versionGuid"):
                    raise ProbeRefused("Rollback did not restore document state")
                host.capture_still_matches(config,evidence)
                verify_opening_probe(host.probe_opening(opening),opening,False)
                record.update(status="ROLLBACK_VERIFIED",profileRestored=True)
            else:
                # A disk check while rollback is still available.
                if host.snapshot()["sha256"]!=before["sha256"]:raise ProbeRefused("RVT file changed")
                if group.Assimilate()!=DB.TransactionStatus.Committed:raise ProbeRefused("Group commit failed")
                record["status"]="OPENING_AND_PRELIMINARY_PLAN_APPLIED"
        finally:
            if group.GetStatus()==DB.TransactionStatus.Started:group.RollBack()
            group.Dispose()
    record["after"]=host.snapshot()
    if record["after"]["sha256"]!=before["sha256"]:raise ProbeRefused("RVT file changed")
    with open(config["evidence_jsonl"],"a",encoding="utf-8",newline="\n") as f:
        f.write(json.dumps(record,ensure_ascii=False,sort_keys=True)+"\n")
    return json.dumps({k:v for k,v in record.items() if k not in ("before","after")},ensure_ascii=False,indent=2)


if "IN" in globals():
    try:OUT=approved_opening_entry(IN)
    except Exception as exc:OUT=json.dumps({"status":"ERROR","reason":type(exc).__name__+": "+str(exc),"rvtSaved":False},ensure_ascii=False)

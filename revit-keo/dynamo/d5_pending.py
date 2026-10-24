"""Diagnostic PENDING plan only. Never writes a numeric KEO or PASS/FAIL.

IN: explicit local config, Boolean enabled, run nonce. Bundle with D0/D1.
Preview, rollback rehearsal and apply are separate explicit actions. No RVT save.
"""
STATUS_GUID = "17be729c-280f-493e-bad6-e4e2ec7b88c1"
STATUS_NAME = "KEO_Статус"
SCHEME_NAME = "КЕО — диагностический статус"


def pending_plan(config, evidence):
    if config.get("action") not in ("preview", "rollback", "apply"):
        raise ProbeRefused("Unknown action")
    if evidence.get("status") != "INPUT_CANDIDATES_CAPTURED" or not evidence.get("documentUnchanged"):
        raise ProbeRefused("Successful unchanged Room capture required")
    room = evidence["payload"]["room"]
    if room["uniqueId"] != config["room_uid"]:
        raise ProbeRefused("Room identity mismatch")
    if not config.get("reason") or len(config["reason"]) > 240:
        raise ProbeRefused("Explicit short pending reason required")
    return {"schema":"keo-pending-plan/v1", "room":room, "status":"PENDING", "color":[180,180,180],
            "calculatedKeo":None,"normativeKeo":None,"reason":config["reason"],
            "viewName":config["view_name"],"sourceViewUid":config["source_view_uid"],
            "tagTypeUid":config["tag_type_uid"],"textTypeUid":config["text_type_uid"],
            "parameter":{"name":STATUS_NAME,"guid":STATUS_GUID,"storage":"String"},
            "sourcePayloadSha256":evidence["payloadSha256"],
            "changes":["Bind one new Room status parameter", "Set selected Room status to Уточнить",
                       "Create one independent plan", "Create one gray Room color scheme",
                       "Place existing native RoomTag and diagnostic TextNote"],
            "limitations":["No numerical calculation", "No KEO family label yet", "No RVT save", "No automatic stale monitor"]}


class PendingHost(D1Host):
    def capture_still_matches(self, config, evidence):
        probe=InputHost()
        payload=probe.input_inventory({"selected_room_uid":config["room_uid"],
                                       "phase_uid":evidence["payload"]["phase"]["uniqueId"]})
        digest=hashlib.sha256(json.dumps(payload,sort_keys=True,ensure_ascii=False).encode("utf-8")).hexdigest()
        if digest!=evidence["payloadSha256"]:
            raise ProbeRefused("Fresh input payload differs from reviewed capture")

    def prepare(self, config, evidence):
        from System import Guid
        d, DB = self.doc, self.DB
        current = self.snapshot()
        if current != evidence["after"]:
            diff = {k: [evidence["after"].get(k),v] for k,v in current.items() if evidence["after"].get(k)!=v}
            if set(diff)!={"versionGuid"}:
                raise ProbeRefused("Capture is stale: "+json.dumps(diff,ensure_ascii=False))
            # A rolled-back Revit transaction can change VersionGUID even when
            # IsModified is false. Re-read the entire captured input payload;
            # metadata alone never grants acceptance of stale geometry.
            self.capture_still_matches(config,evidence)
        room=d.GetElement(config["room_uid"])
        source=d.GetElement(config["source_view_uid"])
        tag=d.GetElement(config["tag_type_uid"])
        text=d.GetElement(config["text_type_uid"])
        if not isinstance(room,DB.Architecture.Room) or room.Area<=0 or room.Location is None:
            raise ProbeRefused("Placed enclosed Room required")
        if not isinstance(source,DB.ViewPlan) or source.IsTemplate or source.GenLevel.Id!=room.LevelId:
            raise ProbeRefused("Source plan must be on Room level")
        if not isinstance(tag,DB.FamilySymbol) or tag.Category.Id!=DB.ElementId(DB.BuiltInCategory.OST_RoomTags):
            raise ProbeRefused("Existing RoomTag type required")
        if not isinstance(text,DB.TextNoteType):
            raise ProbeRefused("Existing text type required")
        if DB.SharedParameterElement.Lookup(d,Guid(STATUS_GUID)) is not None:
            raise ProbeRefused("Status parameter already exists; explicit update workflow required")
        it=d.ParameterBindings.ForwardIterator()
        while it.MoveNext():
            if str(it.Key.Name)==STATUS_NAME:
                raise ProbeRefused("Existing status name conflicts; no overwrite")
        if any(str(v.Name)==config["view_name"] for v in DB.FilteredElementCollector(d).OfClass(DB.View)):
            raise ProbeRefused("Target plan already exists; no duplicate")
        schemes=[s for s in DB.FilteredElementCollector(d).OfClass(DB.ColorFillScheme)
                 if s.CategoryId==DB.ElementId(DB.BuiltInCategory.OST_Rooms)]
        if not schemes or any(str(s.Name)==SCHEME_NAME for s in schemes):
            raise ProbeRefused("Missing source scheme or target scheme conflict")
        return room,source,tag,text,schemes[0]

    def write_pending(self, config, evidence, plan):
        from System import Guid
        from System.Collections.Generic import List
        room,source,tag_type,text_type,scheme_source=self.prepare(config,evidence)
        baseline=self.snapshot()
        d,DB,app=self.doc,self.DB,self.ui.Application
        shared=config["shared_parameters_path"]
        canonical_path(shared,".txt")
        if not os.path.isfile(shared):
            raise ProbeRefused("Explicit shared parameter definition file required")
        old_shared=app.SharedParametersFilename
        try:
            app.SharedParametersFilename=shared
            definition_file=app.OpenSharedParameterFile()
            definition=definition_file.Groups.get_Item("KEO").Definitions.get_Item(STATUS_NAME)
            if str(definition.GUID).lower()!=STATUS_GUID or definition.GetDataType()!=DB.SpecTypeId.String.Text:
                raise ProbeRefused("Wrong status definition")
        finally:
            app.SharedParametersFilename=old_shared
        group=DB.TransactionGroup(d,"КЕО — диагностический план")
        changed={}
        try:
            group.Start()
            tr=DB.Transaction(d,"КЕО — статус и отдельный план")
            try:
                tr.Start()
                categories=app.Create.NewCategorySet()
                categories.Insert(DB.Category.GetCategory(d,DB.BuiltInCategory.OST_Rooms))
                if not d.ParameterBindings.Insert(definition,app.Create.NewInstanceBinding(categories),DB.GroupTypeId.Data):
                    raise ProbeRefused("Parameter binding failed")
                d.Regenerate()
                parameter=room.get_Parameter(Guid(STATUS_GUID))
                if parameter is None or parameter.IsReadOnly or not parameter.Set("Уточнить"):
                    raise ProbeRefused("Cannot set new Room status")
                view=d.GetElement(source.Duplicate(DB.ViewDuplicateOption.Duplicate))
                view.Name=config["view_name"]
                view.ViewTemplateId=DB.ElementId.InvalidElementId
                view.Scale=100
                view.CropBoxActive=False
                view.CropBoxVisible=False
                phase=room.get_Parameter(DB.BuiltInParameter.ROOM_PHASE_ID).AsElementId()
                view.get_Parameter(DB.BuiltInParameter.VIEW_PHASE).Set(phase)
                cat=DB.ElementId(DB.BuiltInCategory.OST_Rooms)
                view.SetCategoryHidden(cat,False)
                view.SetCategoryHidden(DB.ElementId(DB.BuiltInCategory.OST_RoomTags),False)
                scheme=d.GetElement(scheme_source.Duplicate(SCHEME_NAME))
                scheme.ParameterDefinition=parameter.Id
                scheme.Title="КЕО: требуется уточнение"
                scheme.IsLinkedFilesIncluded=False
                solid=next(e for e in DB.FilteredElementCollector(d).OfClass(DB.FillPatternElement) if e.GetFillPattern().IsSolidFill)
                entries=List[DB.ColorFillSchemeEntry]()
                entry=DB.ColorFillSchemeEntry(DB.StorageType.String)
                entry.SetStringValue("Уточнить")
                entry.Color=DB.Color(180,180,180)
                entry.FillPatternId=solid.Id
                entry.IsVisible=True
                entries.Add(entry)
                scheme.SetEntries(entries)
                view.SetColorFillSchemeId(cat,scheme.Id)
                if not tag_type.IsActive:
                    tag_type.Activate()
                p=room.Location.Point
                mark=d.Create.NewRoomTag(DB.LinkElementId(room.Id),DB.UV(p.X,p.Y),view.Id)
                mark.ChangeTypeId(tag_type.Id)
                note_text="КЕО: —   Норма: —\nУТОЧНИТЬ\n"+plan["reason"]
                # Width is paper-space feet, unlike the model-space placement.
                note=DB.TextNote.Create(d,view.Id,DB.XYZ(p.X,p.Y-5,p.Z),0.16,note_text,text_type.Id)
                changed={"view":self.ref(view),"room":self.ref(room),"scheme":self.ref(scheme),
                         "roomTag":self.ref(mark),"diagnosticText":self.ref(note),"statusParameterId":self.eid(parameter.Id)}
                if tr.Commit()!=DB.TransactionStatus.Committed:
                    raise ProbeRefused("Transaction did not commit")
            finally:
                if tr.GetStatus()==DB.TransactionStatus.Started:
                    tr.RollBack()
                tr.Dispose()
            if config["action"]=="rollback":
                if group.RollBack()!=DB.TransactionStatus.RolledBack:
                    raise ProbeRefused("Group rollback failed")
                after=self.snapshot()
                if any(after[k]!=baseline[k] for k in baseline if k!="versionGuid"):
                    raise ProbeRefused("Rollback did not restore baseline state")
                self.capture_still_matches(config,evidence)
                return {"status":"ROLLBACK_VERIFIED","proposedElements":changed,
                        "inputPayloadUnchanged":True,"versionGuidChanged":after["versionGuid"]!=baseline["versionGuid"]}
            if group.Assimilate()!=DB.TransactionStatus.Committed:
                raise ProbeRefused("Group commit failed")
            return {"status":"PENDING_PLAN_APPLIED","elements":changed}
        finally:
            if group.GetStatus()==DB.TransactionStatus.Started:
                group.RollBack()
            group.Dispose()


def pending_entry(inputs):
    if len(inputs)!=3 or type(inputs[1]) is not bool:
        raise ProbeRefused("Expected config, Boolean, nonce")
    canonical_path(inputs[0],".json")
    with open(inputs[0],encoding="utf-8-sig") as f: config=json.load(f)
    if config.get("schema")!="keo-pending-config/v1": raise ProbeRefused("Wrong configuration")
    for field,ext in (("evidence_path",".json"),("evidence_jsonl",".jsonl"),("shared_parameters_path",".txt")):
        canonical_path(config[field],ext)
    result={"schema":"keo-pending-run/v1","status":"CANCELLED","nonce":str(inputs[2]),
            "bundleSha256":BUNDLE_SHA256,"numericKeoWritten":False,"rvtSaved":False}
    if inputs[1]:
        guard=run_probe(config["documentGuard"],True,inputs[2],PendingHost)
        if guard["status"]!="READ_ONLY_OK": raise ProbeRefused(guard.get("reason","Guard failed"))
        with open(config["evidence_path"],encoding="utf-8") as f: evidence=json.load(f)
        plan=pending_plan(config,evidence)
        digest=hashlib.sha256(json.dumps(plan,sort_keys=True,ensure_ascii=False).encode("utf-8")).hexdigest()
        host=PendingHost()
        host.prepare(config,evidence)
        result.update(status="PREVIEW_READY",plan=plan,planSha256=digest,before=host.snapshot())
        if config["action"]!="preview":
            if config.get("approved_plan_sha256")!=digest:
                raise ProbeRefused("Exact reviewed plan fingerprint required")
            result.update(host.write_pending(config,evidence,plan))
        result["after"]=host.snapshot()
        if result["after"]["sha256"]!=result["before"]["sha256"]:
            raise ProbeRefused("RVT file changed")
    with open(config["evidence_jsonl"],"a",encoding="utf-8",newline="\n") as f:
        f.write(json.dumps(result,ensure_ascii=False,sort_keys=True)+"\n")
    return json.dumps({k:v for k,v in result.items() if k not in ("before","after")},ensure_ascii=False,indent=2)


if "IN" in globals():
    try:
        OUT=pending_entry(IN)
    except Exception as exc:
        OUT=json.dumps({"status":"ERROR","reason":type(exc).__name__+": "+str(exc),"rvtSaved":False},ensure_ascii=False,indent=2)

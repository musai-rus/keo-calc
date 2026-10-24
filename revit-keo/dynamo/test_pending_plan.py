import copy
import hashlib
import json
import pathlib
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).parent
ns={}
for filename in ("d0_probe.py","d1_capture.py","d4_inputs.py","d5_pending.py"):
    exec((ROOT/filename).read_text(encoding="utf-8").split('\nif "IN" in globals():\n')[0],ns)

class PendingPlanTests(unittest.TestCase):
    def setUp(self):
        self.c={"action":"preview","room_uid":"room-a","reason":"Unconfirmed aperture mapping",
                "view_name":"KEO test","source_view_uid":"plan-a","tag_type_uid":"tag-a","text_type_uid":"text-a"}
        self.e={"status":"INPUT_CANDIDATES_CAPTURED","documentUnchanged":True,
                "payload":{"room":{"uniqueId":"room-a"}},"payloadSha256":"capture-hash"}

    def test_no_numeric_result_even_if_source_claims_pass(self):
        self.e.update(statusClaim="PASS",keo=5,norm=1)
        p=ns["pending_plan"](self.c,self.e)
        self.assertEqual(p["status"],"PENDING")
        self.assertIsNone(p["calculatedKeo"])
        self.assertIsNone(p["normativeKeo"])

    def test_wrong_room_refused(self):
        self.c["room_uid"]="room-b"
        with self.assertRaises(ns["ProbeRefused"]):ns["pending_plan"](self.c,self.e)

    def test_changed_document_refused(self):
        self.e["documentUnchanged"]=False
        with self.assertRaises(ns["ProbeRefused"]):ns["pending_plan"](self.c,self.e)

    def test_failed_capture_refused(self):
        self.e["status"]="ERROR"
        with self.assertRaises(ns["ProbeRefused"]):ns["pending_plan"](self.c,self.e)

    def test_unknown_action_refused(self):
        self.c["action"]="save"
        with self.assertRaises(ns["ProbeRefused"]):ns["pending_plan"](self.c,self.e)

    def test_reason_required(self):
        for reason in ("", "x"*241):
            self.c["reason"]=reason
            with self.assertRaises(ns["ProbeRefused"]):ns["pending_plan"](self.c,self.e)

    def test_preview_and_apply_have_same_reviewed_content(self):
        p=ns["pending_plan"](self.c,self.e)
        for action in ("rollback","apply"):
            self.c["action"]=action
            self.assertEqual(p,ns["pending_plan"](self.c,self.e))

    def test_no_mutation_of_source(self):
        before=copy.deepcopy((self.c,self.e))
        ns["pending_plan"](self.c,self.e)
        self.assertEqual(before,(self.c,self.e))

    def fresh_read(self, captured, actual):
        evidence={"payload":captured,"payloadSha256":hashlib.sha256(json.dumps(captured,sort_keys=True,ensure_ascii=False).encode("utf-8")).hexdigest()}
        calls=[]
        class FakeInputHost:
            def input_inventory(self, config):
                calls.append(config)
                return actual
        with patch.dict(ns,InputHost=FakeInputHost):
            host=object.__new__(ns["PendingHost"])
            host.capture_still_matches(self.c,evidence)
        return calls

    def test_fresh_read_uses_exact_room_and_phase(self):
        payload={"phase":{"uniqueId":"phase-a"},"room":{"uniqueId":"room-a"},"north":0.1}
        self.assertEqual(self.fresh_read(payload,copy.deepcopy(payload)),[{"selected_room_uid":"room-a","phase_uid":"phase-a"}])

    def test_fresh_read_detects_geometry_change(self):
        payload={"phase":{"uniqueId":"phase-a"},"roomOutline":[{"lengthFt":3}]}
        actual=copy.deepcopy(payload)
        actual["roomOutline"][0]["lengthFt"]=3.001
        with self.assertRaises(ns["ProbeRefused"]):self.fresh_read(payload,actual)

    def test_fresh_read_detects_changed_annotation_resources(self):
        payload={"phase":{"uniqueId":"phase-a"},"planResources":{"plans":[]}}
        actual=copy.deepcopy(payload)
        actual["planResources"]["plans"].append({"uniqueId":"unexpected-view"})
        with self.assertRaises(ns["ProbeRefused"]):self.fresh_read(payload,actual)

    def test_fresh_read_detects_north_change(self):
        payload={"phase":{"uniqueId":"phase-a"},"north":0.1}
        with self.assertRaises(ns["ProbeRefused"]):self.fresh_read(payload,dict(payload,north=0.2))

if __name__=="__main__":unittest.main()

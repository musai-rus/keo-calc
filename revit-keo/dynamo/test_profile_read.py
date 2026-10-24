import copy
import io
import json
import pathlib
import unittest
from unittest.mock import mock_open, patch

ns={}
for file in ("d0_probe.py","d1_capture.py","d4_inputs.py","d4_profile.py"):
    exec((pathlib.Path(__file__).parent/file).read_text(encoding="utf-8").split('\nif "IN" in globals():\n')[0],ns)

class ProfileReadTests(unittest.TestCase):
    def setUp(self):
        self.snapshot={"versionGuid":"version-a","isModified":True,"sha256":"a"*64,
                       "isModifiable":False,"isWorkshared":False,"isLinked":False,
                       "isFamilyDocument":False,"isModelInCloud":False}
        self.current=copy.deepcopy(self.snapshot)
        self.identity={"path":"C:\\test.rvt","revitVersion":"2027","revitBuild":"27.3.0.28"}
        self.config={"documentGuard":{"schema":"keo-dynamo-d0-config/v1","expected_rvt_path":"C:\\test.rvt",
            "expected_sha256":"A"*64,"expected_revit_version":"2027","expected_revit_build":"27.3.0.28"},
            "apply_evidence_jsonl":"C:\\apply.jsonl","apply_nonce":"1"}
        owner=self
        class Host:
            def identity(self):return owner.identity
            def snapshot(self):return owner.current
        self.host=Host()

    def read(self,status="PENDING_PLAN_APPLIED",extra=None):
        records=[{"status":status,"nonce":"1","after":self.snapshot}]
        if extra:records.append(records[0])
        with patch("builtins.open",mock_open(read_data="\n".join(json.dumps(r) for r in records))):
            return ns["recorded_baseline"](self.config,self.host)

    def test_known_modified_state_and_case_insensitive_hash(self):
        self.assertEqual(self.read(),self.current)

    def test_new_document_version_refused(self):
        self.current["versionGuid"]="new-external-edit"
        with self.assertRaises(ns["ProbeRefused"]):self.read()

    def test_other_document_refused(self):
        self.identity["path"]="C:\\original.rvt"
        with self.assertRaises(ns["ProbeRefused"]):self.read()

    def test_changed_disk_refused(self):
        self.current["sha256"]="b"*64
        with self.assertRaises(ns["ProbeRefused"]):self.read()

    def test_rollback_is_not_successful_apply(self):
        with self.assertRaises(ns["ProbeRefused"]):self.read("ROLLBACK_VERIFIED")

    def test_ambiguous_apply_record_refused(self):
        with self.assertRaises(ns["ProbeRefused"]):self.read(extra=True)

    def test_details_opt_in_and_subset(self):
        self.assertEqual(ns["detail_selection"]({},["captured"]),[])
        self.assertEqual(ns["detail_selection"]({"detail_window_uids":["captured"]},["captured"]),["captured"])
        for selected in (["other"],["captured","captured"],"captured",[None],["a","b","c","d"]):
            with self.subTest(selected=selected):
                with self.assertRaises(ns["ProbeRefused"]):ns["detail_selection"]({"detail_window_uids":selected},["captured"])

    def test_clean_file_uses_d0_and_rechecks_snapshot(self):
        config={"baseline_mode":"clean-file","documentGuard":self.config["documentGuard"]}
        self.current["isModified"]=False
        with patch.dict(ns,{"run_probe":lambda c,e,n,f:{"status":"READ_ONLY_OK","after":copy.deepcopy(self.current)}}):
            self.assertEqual(ns["profile_baseline"](config,self.host),self.current)
        with patch.dict(ns,{"run_probe":lambda *a:{"status":"READ_ONLY_OK","after":{"other":"snapshot"}}}):
            with self.assertRaises(ns["ProbeRefused"]):ns["profile_baseline"](config,self.host)

    def test_clean_file_never_falls_back_on_guard_refusal(self):
        config={"baseline_mode":"clean-file","documentGuard":self.config["documentGuard"]}
        for status in ("REFUSED","ERROR"):
            with patch.dict(ns,{"run_probe":lambda *a:{"status":status,"reason":"dirty or wrong file"}}):
                with self.assertRaises(ns["ProbeRefused"]):ns["profile_baseline"](config,self.host)

    def test_baseline_mode_must_be_explicit_and_unambiguous(self):
        for config in (dict(self.config,baseline_mode="clean-file"),dict(self.config,baseline_mode="unchecked")):
            with self.assertRaises(ns["ProbeRefused"]):ns["profile_baseline"](config,self.host)

if __name__=="__main__":unittest.main()

import copy
import pathlib
import unittest

ns={}
for filename in ("d0_probe.py","d1_capture.py","d4_inputs.py","d4_profile.py","d5_pending.py","d5_approved_opening.py"):
    exec((pathlib.Path(__file__).parent/filename).read_text(encoding="utf-8").split('\nif "IN" in globals():\n')[0],ns)


class ApprovedOpeningTests(unittest.TestCase):
    def setUp(self):
        self.value={"host_uid":"floor-a","center_m":[10,20,4],"diameter_m":1,
                    "z_range_m":[4,4.5],"approval":"Explicit user request to cut test copy"}

    def test_rejects_unbounded_or_unapproved_geometry(self):
        cases=[dict(self.value,approval=""),dict(self.value,diameter_m=float("nan")),
               dict(self.value,diameter_m=True),dict(self.value,diameter_m=100),
               dict(self.value,center_m=[0,0,9]),dict(self.value,z_range_m=[4,3])]
        for value in cases:
            with self.subTest(value=value),self.assertRaises(ns["ProbeRefused"]):ns["validate_opening"](value)

    def test_verification_rejects_missing_cut_and_oversized_cut(self):
        def probe(indices):
            return {"elements":[{"otherGeometry":[],"hits":[{"segment":i,"lengthM":.5} for i in indices]}]}
        ns["verify_opening_probe"](probe(range(17)),self.value,False)
        ns["verify_opening_probe"](probe(range(9,17)),self.value,True)
        for indices in (range(17),[],range(10,17)):
            with self.assertRaises(ns["ProbeRefused"]):ns["verify_opening_probe"](probe(indices),self.value,True)

    def test_no_revit_or_file_access_when_disabled(self):
        self.assertIn("CANCELLED",ns["approved_opening_entry"]([None,False,0]))

    def test_numeric_note_cannot_claim_acceptance(self):
        plan={"status":"PENDING","preliminary":True,"reason":"Check shaft",
              "result":{"averagePercent":1.4,"normPercent":3}}
        self.assertIn("(предв.)",ns["numeric_note"](plan))
        for changed in (dict(plan,status="PASS"),dict(plan,preliminary=False)):
            with self.assertRaises(ns["ProbeRefused"]):ns["numeric_note"](changed)

    def test_calculation_binding_rejects_other_room_or_failed_result(self):
        c={"schema":"keo-runner-preview/0.1","ok":True,"previewOnly":True,"status":"PENDING",
           "room":{"uniqueId":"room-a"},"coreResult":{"ok":True,"res":{"kind":"top","eFinal":1.4},"norm":{"v":3}},
           "core":{"sha256":"hash"},"inputSha256":"input"}
        self.assertEqual(ns["runner_summary"](c,"room-a")["averagePercent"],1.4)
        with self.assertRaises(ns["ProbeRefused"]):ns["runner_summary"](c,"room-b")
        c["ok"]=False
        with self.assertRaises(ns["ProbeRefused"]):ns["runner_summary"](c,"room-a")


if __name__=="__main__":unittest.main()

"""Fail-closed probe tests; doubles do not establish Revit compatibility."""
import copy
import unittest
from d0_probe import run_probe, validate_config, ProbeRefused

CONFIG = {"schema": "keo-dynamo-d0-config/v1", "expected_rvt_path": r"C:\test\copy.rvt",
          "expected_sha256": "a" * 64, "expected_revit_version": "2027", "expected_revit_build": "27.3.0.28"}


class Host:
    def __init__(self):
        self.path = CONFIG["expected_rvt_path"]
        self.build = CONFIG["expected_revit_build"]
        self.state = {"sha256": "a" * 64, "isModified": False, "isModifiable": False,
                      "isWorkshared": False, "isLinked": False, "isFamilyDocument": False, "isModelInCloud": False}
        self.reads = 0
        self.snapshots = 0
        self.change_after = False
        self.fail_after = False

    def identity(self):
        return {"path": self.path, "revitVersion": "2027", "revitBuild": self.build}

    def snapshot(self):
        self.snapshots += 1
        if self.fail_after and self.snapshots > 1:
            raise RuntimeError("Post-read failed")
        state = dict(self.state)
        if self.change_after and self.snapshots > 1:
            state["isModified"] = True
        return state

    def environment(self):
        return {"python": "test double"}

    def room_count(self):
        self.reads += 1
        return 3


class ProbeTests(unittest.TestCase):
    def test_cancel_never_loads_revit(self):
        def forbidden():
            raise AssertionError("Must not access Revit")
        result = run_probe(CONFIG, False, 0, forbidden)
        self.assertEqual(result["status"], "CANCELLED")

    def test_other_model_refused_before_snapshot(self):
        h = Host(); h.path = r"C:\test\original.rvt"
        self.assertEqual(run_probe(CONFIG, True, 1, lambda: h)["status"], "REFUSED")
        self.assertEqual(h.snapshots, 0)
        self.assertEqual(h.reads, 0)

    def test_other_build_refused(self):
        h = Host(); h.build = "other"
        self.assertEqual(run_probe(CONFIG, True, 1, lambda: h)["status"], "REFUSED")
        self.assertEqual(h.reads, 0)

    def test_unsupported_document_states_refused(self):
        for name in ("isModified", "isModifiable", "isWorkshared", "isLinked", "isFamilyDocument", "isModelInCloud"):
            with self.subTest(name=name):
                h = Host(); h.state[name] = True
                self.assertEqual(run_probe(CONFIG, True, 1, lambda: h)["status"], "REFUSED")
                self.assertEqual(h.reads, 0)

    def test_changed_disk_refused(self):
        h = Host(); h.state["sha256"] = "b" * 64
        self.assertEqual(run_probe(CONFIG, True, 1, lambda: h)["status"], "REFUSED")
        self.assertEqual(h.reads, 0)

    def test_post_check_failure_cannot_succeed(self):
        for failure in ("change_after", "fail_after"):
            h = Host(); setattr(h, failure, True)
            result = run_probe(CONFIG, True, 1, lambda: h)
            self.assertEqual(result["status"], "ERROR")
            self.assertFalse(result["documentUnchanged"])

    def test_runtime_error_does_not_become_zero_rooms(self):
        h = Host()
        def failed():
            raise RuntimeError("API error")
        h.room_count = failed
        result = run_probe(CONFIG, True, 1, lambda: h)
        self.assertEqual(result["status"], "ERROR")
        self.assertNotIn("roomCount", result)

    def test_repeat_has_independent_run_ids_no_acceptance(self):
        results = [run_probe(CONFIG, True, i, Host) for i in (1, 2)]
        self.assertNotEqual(results[0]["runId"], results[1]["runId"])
        for result in results:
            self.assertEqual(result["status"], "READ_ONLY_OK")
            self.assertTrue(result["documentUnchanged"])
            for key in ("geometryAccepted", "normativeAccepted", "modelAccepted", "modelWriteRequested"):
                self.assertFalse(result[key])

    def test_invalid_config_cannot_access_host(self):
        variants = []
        for key, value in (("expected_rvt_path", r"C:relative.rvt"), ("expected_rvt_path", r"\\server\file.rvt"),
                           ("expected_sha256", ""), ("evidence_jsonl", r"C:\test\copy.rvt"), ("unexpected", True)):
            cfg = copy.deepcopy(CONFIG); cfg[key] = value; variants.append(cfg)
        for cfg in variants:
            with self.assertRaises(ProbeRefused):
                validate_config(cfg)


if __name__ == "__main__":
    unittest.main()

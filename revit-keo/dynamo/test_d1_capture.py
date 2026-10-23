"""Selection and fail-closed capture controls; no Revit compatibility claim."""
import copy
import unittest
from d1_capture import matches_parameter, select_room, run_d1, validate_d1, ProbeRefused
from test_d0_probe import Host, CONFIG

CFG = dict(CONFIG, schema="keo-dynamo-d1-config/v1", mode="capture", evidence_jsonl=r"C:\test\d1.jsonl",
           phase_uid="phase-a", selected_room_uid="room-a", parameter={"kind": "id", "key": "-123"}, value="01")


def row(uid="room-a", phase="phase-a", value="01", storage="String"):
    return {"ref": {"uniqueId": uid}, "phase": {"uniqueId": phase},
            "filterParameter": {"storageType": storage, "hasValue": True, "value": value}}


class CaptureHost(Host):
    def capture(self, config):
        self.reads += 1
        return {"test": "diagnostic only", "geometryAccepted": False}

    def inventory(self, config):
        self.reads += 1
        return {"rooms": []}


class D1Tests(unittest.TestCase):
    def test_selection_uses_phase_and_uid_not_number(self):
        chosen, counts = select_room([row(), row("other"), row("room-b", "other-phase")], "phase-a", "01", "room-a")
        self.assertEqual(chosen["ref"]["uniqueId"], "room-a")
        self.assertEqual(counts["matchedRooms"], 2)
        with self.assertRaises(ProbeRefused): select_room([row()], "wrong-phase", "01", "room-a")
        with self.assertRaises(ProbeRefused): select_room([row(), row()], "phase-a", "01", "room-a")

    def test_missing_empty_and_zero_are_distinct(self):
        missing = row("missing"); missing["filterParameter"] = None
        empty = row("empty", value="")
        unset = row("unset"); unset["filterParameter"]["hasValue"] = False
        _, counts = select_room([row(), missing, empty, unset], "phase-a", "01", "room-a")
        self.assertEqual((counts["missingParameter"], counts["emptyParameter"]), (1, 2))
        self.assertTrue(matches_parameter(row(value=0, storage="Integer")["filterParameter"], 0))
        self.assertFalse(matches_parameter(unset["filterParameter"], "01"))

    def test_filter_never_parses_localized_numbers(self):
        for storage, actual, expected in [("String", "01", 1), ("Integer", 1, True), ("Double", 1.5, "1,5"), ("ElementId", "100", 100)]:
            self.assertFalse(matches_parameter(row(value=actual, storage=storage)["filterParameter"], expected))
        self.assertTrue(matches_parameter(row(value=1.5, storage="Double")["filterParameter"], 1.5))

    def test_cancel_never_constructs_host(self):
        def forbidden(): raise AssertionError("Revit accessed")
        self.assertEqual(run_d1(CFG, False, 0, forbidden)["status"], "CANCELLED")

    def test_wrong_model_build_hash_and_dirty_are_refused(self):
        for attr, value in [("path", r"C:\test\original.rvt"), ("build", "wrong"), ("sha256", "b" * 64), ("isModified", True), ("isWorkshared", True)]:
            host = CaptureHost()
            if attr in host.state: host.state[attr] = value
            else: setattr(host, attr, value)
            self.assertEqual(run_d1(CFG, True, 1, lambda: host)["status"], "REFUSED")
            self.assertEqual(host.reads, 0)

    def test_changed_state_and_api_error_cannot_succeed(self):
        for mode in ("change_after", "fail_after"):
            host = CaptureHost(); setattr(host, mode, True)
            result = run_d1(CFG, True, 1, lambda: host)
            self.assertEqual(result["status"], "ERROR")
            self.assertFalse(result["documentUnchanged"])
        host = CaptureHost()
        def failed(config): raise RuntimeError("API error")
        host.capture = failed
        self.assertEqual(run_d1(CFG, True, 1, lambda: host)["status"], "ERROR")

    def test_repeat_fingerprint_and_flags(self):
        a, b = [run_d1(CFG, True, n, CaptureHost) for n in (1, 2)]
        self.assertNotEqual(a["runId"], b["runId"])
        self.assertEqual(a["payloadSha256"], b["payloadSha256"])
        self.assertEqual(a["status"], "CAPTURED_DIAGNOSTIC")
        for key in ("modelAccepted", "geometryAccepted", "normativeAccepted", "modelWriteRequested"):
            self.assertFalse(a[key])

    def test_config_does_not_allow_parameter_name_or_missing_identity(self):
        for key, value in [("selected_room_uid", ""), ("phase_uid", ""), ("value", None),
                           ("parameter", {"kind": "name", "key": "Number"}),
                           ("parameter", {"kind": "guid", "key": "invalid"}), ("evidence_jsonl", r"C:\test\copy.rvt")]:
            cfg = copy.deepcopy(CFG); cfg[key] = value
            with self.assertRaises(ProbeRefused): validate_d1(cfg)


if __name__ == "__main__": unittest.main()

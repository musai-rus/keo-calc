import copy
import unittest
from d2_inspect import overlaps_xy, adapt_config, run_d2, ProbeRefused, D2_SCHEMA, phase_room
from test_d1_capture import CFG, CaptureHost

CONFIG = dict(CFG, schema="keo-dynamo-d2-config/v1")


class D2Tests(unittest.TestCase):
    def test_phase_overload_without_parameterless_property(self):
        phase, room = object(), object()
        calls = []
        class Instance:
            @property
            def FromRoom(self):
                raise AssertionError("Parameterless property must not be used")
            @property
            def ToRoom(self):
                raise AssertionError("Parameterless property must not be used")
            def get_FromRoom(self, requested):
                calls.append(requested)
                return room
            def get_ToRoom(self, requested):
                calls.append(requested)
                return None
        instance = Instance()
        self.assertIs(phase_room(instance, phase, "FromRoom"), room)
        self.assertIsNone(phase_room(instance, phase, "ToRoom"))
        self.assertEqual(calls, [phase, phase])

    def test_candidates_include_other_heights(self):
        self.assertTrue(overlaps_xy([[0, 0, 100], [1, 1, 200]], [[0, 0, 0], [1, 1, 2]]))

    def test_separation_and_padding(self):
        a, b = [[0, 0, 0], [1, 1, 1]], [[2, 0, 0], [3, 1, 1]]
        self.assertFalse(overlaps_xy(a, b))
        self.assertTrue(overlaps_xy(a, b, 1))
        self.assertTrue(overlaps_xy(b, a, 1))

    def test_explicit_selection_and_schema_required(self):
        with self.assertRaises(ProbeRefused): adapt_config(CFG)
        with self.assertRaises(ProbeRefused): adapt_config(dict(CONFIG, mode="inventory", sample_element_id="123"))
        with self.assertRaises(ProbeRefused): adapt_config(dict(CONFIG, selected_room_uid=""))
        with self.assertRaises(ProbeRefused): adapt_config(dict(CONFIG, arbitrary=True))

    def test_does_not_mutate_configuration(self):
        original = copy.deepcopy(CONFIG)
        self.assertEqual(adapt_config(CONFIG)["schema"], "keo-dynamo-d1-config/v1")
        self.assertEqual(CONFIG, original)

    def test_cancel_never_accesses_host(self):
        def fail(): raise AssertionError("host accessed")
        result = run_d2(CONFIG, False, 1, fail)
        self.assertEqual(result["status"], "CANCELLED")
        self.assertEqual(result["schema"], D2_SCHEMA)
        self.assertFalse(result["d2Complete"])

    def test_capture_keeps_diagnostic_flags(self):
        result = run_d2(CONFIG, True, 1, CaptureHost)
        self.assertEqual(result["status"], "CAPTURED_DIAGNOSTIC")
        self.assertTrue(result["documentUnchanged"])
        for key in ("modelAccepted", "geometryAccepted", "normativeAccepted", "modelWriteRequested", "d2Complete"):
            self.assertFalse(result[key])


if __name__ == "__main__":
    unittest.main()

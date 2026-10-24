import pathlib
import unittest
ns = {"ProfileHost": object, "ProbeRefused": ValueError}
exec((pathlib.Path(__file__).parent / "d4_shaft_check.py").read_text(encoding="utf-8").split('\nif "IN" in globals():\n')[0], ns)

class ShaftReviewTests(unittest.TestCase):
    def test_below_plane_does_not_block_upper_hemisphere(self):
        self.assertIsNone(ns["above_aperture_metrics"]({"min":[-10,-10,-3],"max":[10,10,5]},[0,0],5))
    def test_overhead_has_ninety_degree_upper_bound(self):
        self.assertEqual(ns["above_aperture_metrics"]({"min":[-1,-1,4],"max":[1,1,6]},[0,0],5)["upperElevationDeg"],90)
    def test_far_obstacle_is_not_silently_excluded(self):
        self.assertGreater(ns["above_aperture_metrics"]({"min":[1000,0,0],"max":[1002,2,100]},[0,0],5)["upperElevationDeg"],0)
    def test_nonfinite_and_reversed_boxes_fail(self):
        for box in ({"min":[0,0,0],"max":[float('nan'),2,3]}, {"min":[2,0,0],"max":[1,2,3]}):
            with self.assertRaises(ValueError):ns["above_aperture_metrics"](box,[0,0],0)
    def test_exact_captured_self_window_required(self):
        r={"aperture_top_z_m":4,"aperture_center_xy_m":[0,0],"self_window_uid":"window"}
        self.assertEqual(ns["validate_sky_review"](r,["window"]),r)
        with self.assertRaises(ValueError):ns["validate_sky_review"](r,["other"])
    def test_invalid_request_is_not_assumed_clear(self):
        for r in ({}, {"aperture_top_z_m":float('inf'),"aperture_center_xy_m":[0,0],"self_window_uid":"w"}):
            with self.assertRaises(ValueError):ns["validate_sky_review"](r,["w"])

if __name__ == '__main__': unittest.main()

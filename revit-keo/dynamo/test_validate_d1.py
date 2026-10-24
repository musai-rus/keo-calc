import copy
import math
import unittest
from validate_d1 import validate_payload


def fixture(polygons=None, area=100, perimeter=40):
    polygons = polygons or [[[0,0,0], [10,0,0], [10,10,0], [0,10,0]]]
    return {"units": {"frame": "revit-internal-feet", "length": "ft", "area": "ft2", "metresPerFoot": 0.3048},
            "room": {"areaFt2": area, "perimeterFt": perimeter}, "diagnostics": [],
            "boundaries": {"status": "ok", "location": "Finish", "loopsInApiOrder": [
                [{"curve": {"kind": "Line", "status": "ok", "start": a, "end": b, "lengthFt": math.dist(a,b)}}
                 for a,b in zip(p,p[1:]+p[:1])] for p in polygons]}}


class MetricTests(unittest.TestCase):
    def test_rectangle_reversed_and_large_offset(self):
        for points in ([[0,0,0],[10,0,0],[10,10,0],[0,10,0]], [[0,10,0],[10,10,0],[10,0,0],[0,0,0]]):
            offset = [[p[0]+1e6,p[1]-1e6,2] for p in points]
            self.assertEqual(validate_payload(fixture([offset]))["status"], "METRICS_MATCH")

    def test_hole_order_and_orientation_do_not_determine_role(self):
        outer=[[0,0,0],[10,0,0],[10,10,0],[0,10,0]]
        inner=[[2,2,0],[4,2,0],[4,4,0],[2,4,0]]
        result=validate_payload(fixture([inner,outer],96,48))
        self.assertEqual(result["status"],"METRICS_MATCH")
        self.assertEqual(result["nestingDepths"],[1,0])

    def test_open_gap_nonplanar_wrong_units_and_area(self):
        f=fixture(); f["boundaries"]["loopsInApiOrder"][0][-1]["curve"]["end"]=[0,0.01,0]
        self.assertEqual(validate_payload(f)["status"],"ERROR")
        f=fixture(); f["boundaries"]["loopsInApiOrder"][0][0]["curve"]["start"][2]=1
        self.assertEqual(validate_payload(f)["status"],"ERROR")
        f=fixture(); f["units"]["length"]="m"
        self.assertEqual(validate_payload(f)["status"],"ERROR")
        self.assertEqual(validate_payload(fixture(area=99))["status"],"MISMATCH")

    def test_self_intersection_touching_and_unsupported_arc(self):
        cross=[[0,0,0],[10,10,0],[0,10,0],[10,0,0]]
        self.assertEqual(validate_payload(fixture([cross]))["status"],"ERROR")
        a=[[0,0,0],[10,0,0],[10,10,0],[0,10,0]]
        b=[[10,2,0],[12,2,0],[12,4,0],[10,4,0]]
        self.assertEqual(validate_payload(fixture([a,b]))["status"],"ERROR")
        f=fixture(); f["boundaries"]["loopsInApiOrder"][0][0]["curve"]["kind"]="Ellipse"
        self.assertEqual(validate_payload(f)["status"],"UNSUPPORTED")

    def test_metrics_do_not_accept_model_or_norms(self):
        report=validate_payload(fixture())
        self.assertFalse(report["geometryAccepted"])
        self.assertFalse(report["normativeAccepted"])


if __name__ == "__main__": unittest.main()

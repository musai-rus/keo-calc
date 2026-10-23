import copy
import math
import unittest
from curve_metrics import curve, intersections, contains, validate_curves
from test_validate_d1 import fixture


def arc(cx,cy,r,start,sweep):
    sign=1 if sweep>0 else -1
    return {"curve":{"status":"ok","kind":"Arc","center":[cx,cy,0],"radiusFt":r,
                     "start":[cx+r*math.cos(start),cy+r*math.sin(start),0],
                     "end":[cx+r*math.cos(start+sweep),cy+r*math.sin(start+sweep),0],
                     "parameterRange":[0,abs(sweep)],"lengthFt":r*abs(sweep),
                     "xDirection":[math.cos(start),math.sin(start),0],
                     "yDirection":[-sign*math.sin(start),sign*math.cos(start),0],"normal":[0,0,sign]}}


def circle(cx=0,cy=0,r=5,sign=1):
    return [arc(cx,cy,r,0,sign*math.pi),arc(cx,cy,r,sign*math.pi,sign*math.pi)]


def curved(loops,area,perimeter):
    f=fixture(area=area,perimeter=perimeter);f["boundaries"]["loopsInApiOrder"]=loops;return f


class ArcTests(unittest.TestCase):
    def test_circle_orientation_offset_and_bounds(self):
        for sign in (1,-1):
            r=validate_curves(curved([circle(1e5,-1e5,5,sign)],25*math.pi,10*math.pi))
            self.assertEqual(r["status"],"METRICS_MATCH",r)
            self.assertAlmostEqual(r["spanXFt"],10)
            self.assertAlmostEqual(r["spanYFt"],10)

    def test_concentric_hole_with_same_orientation_and_reordered_loops(self):
        r=validate_curves(curved([circle(r=2),circle(r=5)],21*math.pi,14*math.pi))
        self.assertEqual(r["status"],"METRICS_MATCH",r)
        self.assertEqual(r["nestingDepths"],[1,0])

    def test_semicircle_and_diameter(self):
        a=arc(0,0,5,0,math.pi)
        line={"curve":{"status":"ok","kind":"Line","start":[-5,0,0],"end":[5,0,0],"lengthFt":10}}
        r=validate_curves(curved([[a,line]],12.5*math.pi,5*math.pi+10))
        self.assertEqual(r["status"],"METRICS_MATCH",r)

    def test_arc_ray_endpoint_and_tangency_rules(self):
        for sign in (1,-1):
            loop=[curve(s["curve"]) for s in circle(sign=sign)]
            for point in ([0,0],[1,2],[-4,0]):self.assertTrue(contains(point,loop))
            for point in ([6,0],[-6,0],[0,6],[-6,5]):self.assertFalse(contains(point,loop))
            with self.assertRaises(ValueError):contains([5,0],loop)

    def test_overlapping_and_tangent_circles_fail(self):
        for offset in (8,10):
            r=validate_curves(curved([circle(),circle(cx=offset)],50*math.pi,20*math.pi))
            self.assertEqual(r["status"],"ERROR")

    def test_arc_parameter_corruption_and_gap_fail(self):
        for key,value in (("radiusFt",6),("end",[1,1,0]),("xDirection",[1,0,0.1])):
            loops=[circle()];loops[0][0]["curve"][key]=value
            self.assertEqual(validate_curves(curved(loops,25*math.pi,10*math.pi))["status"],"ERROR")

    def test_disjoint_components_and_line_crossings(self):
        r=validate_curves(curved([circle(),circle(cx=20)],50*math.pi,20*math.pi))
        self.assertEqual(r["status"],"METRICS_MATCH",r)
        a=curve(arc(0,0,5,0,math.pi)["curve"])
        line=curve({"status":"ok","kind":"Line","start":[0,-10,0],"end":[0,10,0],"lengthFt":20})
        self.assertEqual(len(intersections(a,line)),1)

    def test_wrong_api_metrics_are_not_adjusted(self):
        r=validate_curves(curved([circle()],70,10*math.pi))
        self.assertEqual(r["status"],"MISMATCH")
        self.assertFalse(r["geometryAccepted"])

    def test_nearly_parallel_lines_still_intersect(self):
        def line(a,b):
            return curve({"kind":"Line","status":"ok","start":a,"end":b,"lengthFt":math.dist(a,b)})
        a=line([0,0,0],[1e8,1e-5,0]); b=line([0,1e-5,0],[1e8,0,0])
        self.assertEqual(len(intersections(a,b)),1)


if __name__ == "__main__": unittest.main()

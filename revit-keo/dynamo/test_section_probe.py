import copy
import unittest
from d4_section_probe import validate_section_probe


class SectionProbeTests(unittest.TestCase):
    def setUp(self):
        self.request={"element_uids":["selected"],"segments_m":[[[0,0,0],[0,0,3]]],"room_points_m":[[1,2,.8]]}

    def test_explicit_request(self):
        self.assertEqual(validate_section_probe(self.request,["selected","other"]),self.request)

    def test_unknown_duplicate_and_excessive_elements(self):
        for ids in (["unseen"],["selected","selected"],[],list("abcdefghi"),[None]):
            with self.subTest(ids=ids):
                with self.assertRaises(ValueError):validate_section_probe(dict(self.request,element_uids=ids),["selected"])

    def test_invalid_or_unbounded_segments(self):
        for segments in ([],self.request["segments_m"]*49,[[[0,0,0],[0,0,0]]],[[[0,0,0],[0,0,101]]],[[[0,0,0],[float("nan"),0,1]]],[[[True,0,0],[0,0,1]]],[[[0,0],[0,0,1]]]):
            with self.subTest(segments=segments):
                with self.assertRaises(ValueError):validate_section_probe(dict(self.request,segments_m=segments),["selected"])

    def test_bad_points_and_unknown_fields(self):
        for points in ([[0,0,float("inf")]],[[0,0,0]]*17,"bad"):
            with self.assertRaises(ValueError):validate_section_probe(dict(self.request,room_points_m=points),["selected"])
        with self.assertRaises(ValueError):validate_section_probe(dict(self.request,units="feet"),["selected"])


if __name__=="__main__":unittest.main()

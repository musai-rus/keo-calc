import unittest
from parameter_dimensions import resolve_dimension, shaft_dimensions


def parameter(name="Top", value=2, **changes):
    return dict({"name": name, "id": "123", "guid": "abcdef", "value": value,
                 "storageType": "Double", "hasValue": True,
                 "specTypeId": "autodesk.spec.aec:length-2.0.1"}, **changes)


def mapping(**changes):
    return dict({"scope": "type", "name": "Top", "quantity": "diameter",
                 "basis": "Synthetic project mapping"}, **changes)


class ParameterDimensionTests(unittest.TestCase):
    def test_radius_is_not_diameter(self):
        self.assertAlmostEqual(resolve_dimension([], [parameter()], mapping())["valueM"], .6096)
        self.assertAlmostEqual(resolve_dimension([], [parameter()], mapping(quantity="radius"))["valueM"], 1.2192)

    def test_scope_is_not_guessed(self):
        rows = [parameter(value=3)]
        self.assertAlmostEqual(resolve_dimension(rows, [parameter()], mapping(scope="instance"))["valueM"], .9144)
        with self.assertRaises(ValueError): resolve_dimension(rows, [], mapping())

    def test_different_models_need_only_different_configuration(self):
        for name in ("Synthetic top diameter", "Диаметр другой модели"):
            self.assertAlmostEqual(resolve_dimension([], [parameter(name=name)], mapping(name=name))["valueM"], .6096)
        guid_map = mapping(); del guid_map["name"]; guid_map["guid"] = "ABCDEF"
        self.assertAlmostEqual(resolve_dimension([], [parameter()], guid_map)["valueM"], .6096)

    def test_ambiguity_and_empty_values_are_errors(self):
        for rows in ([], [parameter(), parameter()], [parameter(hasValue=False)], [parameter(value=None)]):
            with self.assertRaises(ValueError): resolve_dimension([], rows, mapping())

    def test_units_and_nonfinite_values_are_not_silently_repaired(self):
        for row in (parameter(specTypeId="autodesk.spec.aec:area-2.0.0"), parameter(value=float("nan")),
                    parameter(value=float("inf")), parameter(value=-1), parameter(value=0), parameter(value=True)):
            with self.assertRaises(ValueError): resolve_dimension([], [row], mapping())

    def test_semantics_and_basis_are_required(self):
        for m in (mapping(quantity="unknown"), mapping(basis=""), mapping(scope="auto"), mapping(id="123")):
            with self.assertRaises(ValueError): resolve_dimension([], [parameter()], m)

    def test_unequal_openings_are_independent_and_not_accepted_automatically(self):
        w = {"ref": {"uniqueId": "synthetic"}, "parameters": [],
             "typeParameters": [parameter(name="Top", value=2), parameter(name="Bottom", value=3)]}
        result = shaft_dimensions(w, {"dv": mapping(), "dn": mapping(name="Bottom")})
        self.assertLess(result["fields"]["dv"]["valueM"], result["fields"]["dn"]["valueM"])
        self.assertFalse(result["geometryAccepted"])
        with self.assertRaises(ValueError): shaft_dimensions(w, {"dv": mapping()})
        with self.assertRaises(ValueError): shaft_dimensions(w, {"dv": mapping(quantity="length"), "dn": mapping(name="Bottom")})


if __name__ == "__main__": unittest.main()

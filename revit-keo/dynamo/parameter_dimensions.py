"""Resolve explicit parameter mappings from a D4 capture; no BIM/core writes.

Names, GUIDs and instance/type scope are project configuration, never aliases
baked into the adapter. The caller must establish the parameter's meaning.
Successful unit conversion does not grant normative or geometry acceptance.
"""
import math


def resolve_dimension(instance_parameters, type_parameters, mapping):
    scope = mapping.get("scope")
    if scope not in ("instance", "type"):
        raise ValueError("Explicit instance/type scope required")
    selectors = [key for key in ("guid", "id", "name") if key in mapping]
    if len(selectors) != 1:
        raise ValueError("Exactly one parameter GUID, ID or name required")
    selector = selectors[0]
    wanted = mapping[selector]
    if not isinstance(wanted, str) or not wanted.strip():
        raise ValueError("Empty parameter selector")
    basis = mapping.get("basis")
    if not isinstance(basis, str) or not basis.strip():
        raise ValueError("Parameter meaning/source basis required")
    quantity = mapping.get("quantity")
    if quantity not in ("diameter", "radius", "length"):
        raise ValueError("Explicit radius, diameter or length semantics required")
    parameters = instance_parameters if scope == "instance" else type_parameters
    def equal(value):
        return isinstance(value, str) and (value.lower() == wanted.lower()
            if selector == "guid" else value == wanted)
    matches = [p for p in parameters if equal(p.get(selector))]
    if len(matches) != 1:
        raise ValueError("Parameter missing or ambiguous in selected scope")
    p = matches[0]
    if p.get("storageType") != "Double" or not p.get("hasValue"):
        raise ValueError("A populated Double parameter is required")
    if not str(p.get("specTypeId", "")).startswith("autodesk.spec.aec:length-"):
        raise ValueError("Parameter is not Revit length")
    raw = p.get("value")
    if isinstance(raw, bool) or not isinstance(raw, (int, float)) or not math.isfinite(raw) or raw <= 0:
        raise ValueError("Finite positive length required; missing is not zero")
    factor = 2 if quantity == "radius" else 1
    return {"valueM": raw * 0.3048 * factor,
            "outputQuantity": "length" if quantity == "length" else "diameter",
            "source": {"scope": scope, "id": p.get("id"), "guid": p.get("guid"),
                       "name": p.get("name"), "specTypeId": p["specTypeId"],
                       "rawValueFt": raw, "quantity": quantity, "basis": basis},
            "conversion": {"feetToMetres": 0.3048, "radiusToDiameter": factor}}


def shaft_dimensions(window, mappings):
    """Return only explicit calculator dimensions, with per-field provenance."""
    if not isinstance(mappings, dict) or not {"dv", "dn"}.issubset(mappings) or set(mappings) - {"dv", "dn", "hsf"}:
        raise ValueError("Independent upper/lower diameter mappings required")
    fields = {}
    for field, mapping in mappings.items():
        item = resolve_dimension(window["parameters"], window["typeParameters"], mapping)
        expected = "length" if field == "hsf" else "diameter"
        if item["outputQuantity"] != expected:
            raise ValueError("Wrong dimension meaning for " + field)
        fields[field] = item
    return {"window": window["ref"], "fields": fields, "geometryAccepted": False}

"""Offline, dependency-free Room evidence codec. Does not execute Revit or admit KEO."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import uuid
from datetime import datetime
from fractions import Fraction as Q
from pathlib import Path

SCHEMA = "keo-room-evidence/0.1"
PROFILE = "horizontal-line-plan/0.1"
CANONICAL = "python-json-sorted-utf8-v1"  # Not RFC 8785 / not a signature.
MAX_BYTES, MAX_DEPTH, MAX_ROOMS, MAX_ROOM_SEGMENTS = 5 * 1024 * 1024, 64, 256, 512
MAX_TOTAL_SEGMENTS, MAX_ELEMENTS = 8192, 20000
IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
STATUSES = {"ok", "unavailable", "unsupported", "error", "not-applicable"}
CATEGORIES = {"room": ("-2000160", "OST_Rooms"), "wall": ("-2000011", "OST_Walls"),
              "room-separator": ("-2000066", "OST_RoomSeparationLines"),
              "window": ("-2000014", "OST_Windows"), "door": ("-2000023", "OST_Doors")}


class EvidenceError(ValueError):
    def __init__(self, report):
        self.report = report
        super().__init__("; ".join(x["code"] + " at " + x["path"] for x in report["issues"][:8]))


def _report(issues, rooms=None):
    return {"valid": not any(i["severity"] == "error" for i in issues),
            "issues": issues, "rooms": rooms or [], "geometryAccepted": False,
            "seedAccepted": False, "normativeAccepted": False,
            "revitExecutionVerified": False, "sourceAccuracyVerified": False,
            "viewerBindingVerified": False, "profile": PROFILE,
            "limitations": ["valid means offline profile checks only, not authenticated source or real Room acceptance",
                            "horizontal native Line loops only; no Arc/solid-section/glazing/KEO/Viewer-binding verification",
                            "hash is integrity only, not a signature; declared completeness cannot prove native API enumeration"]}


def _issue(code, path, message, severity="error"):
    return {"code": code, "path": path, "message": message, "severity": severity}


def _canonical(value):
    def check(x, depth=0):
        if depth > MAX_DEPTH:
            raise ValueError("depth-limit")
        if type(x) in (str, bool, int, type(None)):
            return
        if type(x) is float and math.isfinite(x):
            return
        if type(x) is list:
            for v in x:
                check(v, depth + 1)
            return
        if type(x) is dict and all(type(k) is str for k in x):
            for v in x.values():
                check(v, depth + 1)
            return
        raise ValueError("non-json-or-non-finite-value")
    check(value)
    data = json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True,
                      separators=(",", ":")).encode("utf-8")
    if len(data) > MAX_BYTES:
        raise ValueError("byte-limit")
    return data


def _body(data):
    return {k: v for k, v in data.items() if k != "integrity"}


def _key(ref):
    return (ref["documentKey"], ref["uniqueId"], ref["elementId"])


def _room_key(ref, path):
    return (_key(ref), tuple(_key(p) for p in path))


def _num(x):
    return type(x) in (int, float) and math.isfinite(x) and abs(x) <= 1e9


def _text(x):
    return type(x) is str and bool(x.strip())


def _xyz(x):
    return type(x) is list and len(x) == 3 and all(_num(v) for v in x)


def _matrix(m):
    if type(m) is not list or len(m) != 16 or not all(_num(x) for x in m):
        return False
    if m[12:] != [0, 0, 0, 1]:
        return False
    # Numerical consistency of a rigid (possibly mirrored) matrix, not source accuracy.
    for i in range(3):
        for j in range(3):
            dot = sum(m[k * 4 + i] * m[k * 4 + j] for k in range(3))
            if abs(dot - (1 if i == j else 0)) > 1e-12:
                return False
    return True


def _mul(a, b):
    return [sum(Q(a[i * 4 + k]) * Q(b[k * 4 + j]) for k in range(4))
            for i in range(4) for j in range(4)]


def _point(m, p):
    return tuple(sum(m[i * 4 + j] * Q(p[j]) for j in range(3)) + m[i * 4 + 3]
                 for i in range(3))


def _cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on(p, a, b):
    return _cross(a, b, p) == 0 and all(min(a[k], b[k]) <= p[k] <= max(a[k], b[k]) for k in (0, 1))


def _intersection(a, b, c, d):
    o = [_cross(a, b, c), _cross(a, b, d), _cross(c, d, a), _cross(c, d, b)]
    if o == [0, 0, 0, 0]:
        k = 0 if a[0] != b[0] else 1
        lo, hi = max(min(a[k], b[k]), min(c[k], d[k])), min(max(a[k], b[k]), max(c[k], d[k]))
        return "overlap" if lo < hi else "touch" if lo == hi else None
    if o[0] * o[1] < 0 and o[2] * o[3] < 0:
        return "cross"
    return "touch" if any((_on(c, a, b), _on(d, a, b), _on(a, c, d), _on(b, c, d))) else None


def _inside(p, loop):
    inside = False
    for a, b in zip(loop, loop[1:] + loop[:1]):
        if _on(p, a, b):
            return None
        if (a[1] > p[1]) != (b[1] > p[1]):
            x = a[0] + (p[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            if x > p[0]:
                inside = not inside
    return inside


def _in_region(p, loops):
    values = [_inside(p, loop) for loop in loops]
    return None if any(x is None for x in values) else sum(values) % 2 == 1


def _area(loop):
    return abs(sum(a[0] * b[1] - b[0] * a[1]
                   for a, b in zip(loop, loop[1:] + loop[:1]))) / 2


def _analyze_loops(loops, path, issue):
    """Exact predicates over saved binary numbers; no snapping/tolerance closure."""
    good = True
    for k, loop in enumerate(loops):
        edges = list(zip(loop, loop[1:] + loop[:1]))
        if len(loop) < 3 or _area(loop) == 0:
            issue("degenerate-loop", f"{path}[{k}]", "Нулевая площадь или менее трёх вершин.")
            good = False
        for i, (a, b) in enumerate(edges):
            if a == b:
                issue("zero-length-segment", f"{path}[{k}][{i}]", "Нулевой сегмент.")
                good = False
            for j in range(i + 1, len(edges)):
                c, d = edges[j]
                hit = _intersection(a, b, c, d)
                adjacent = j == i + 1 or (i == 0 and j == len(edges) - 1)
                if hit and not (adjacent and hit == "touch" and ({a, b} & {c, d})):
                    issue("self-intersection", f"{path}[{k}]", f"Сегменты {i}/{j}: {hit}.")
                    good = False
    for i, a in enumerate(loops):
        for j in range(i + 1, len(loops)):
            b = loops[j]
            if any(_intersection(x, y, u, v) for x, y in zip(a, a[1:] + a[:1])
                   for u, v in zip(b, b[1:] + b[:1])):
                issue("loop-intersection-or-touch", f"{path}[{i},{j}]", "Loops пересекаются или касаются; вложенность неоднозначна.")
                good = False
    if not good:
        return None
    depths = [sum(_inside(loop[0], other) is True for j, other in enumerate(loops) if i != j)
              for i, loop in enumerate(loops)]
    area = sum(_area(loop) * (-1 if depths[i] % 2 else 1) for i, loop in enumerate(loops))
    perimeter = sum(math.hypot(float(a[0] - b[0]), float(a[1] - b[1]))
                    for loop in loops for a, b in zip(loop, loop[1:] + loop[:1]))
    return {"areaFt2": float(area), "perimeterFt": perimeter,
            "loopDepths": depths, "components": sum(d % 2 == 0 for d in depths),
            "holes": sum(d % 2 == 1 for d in depths)}


def validate(data, require_integrity=True):
    # Malformed untrusted structures must fail closed, never crash a caller.
    try:
        return _validate(data, require_integrity)
    except (KeyError, TypeError, AttributeError, ValueError, OverflowError, IndexError, RecursionError) as e:
        return _report([_issue("malformed-structure", "$", "Неверная структура JSON: " + type(e).__name__)])


def _regions_overlap(a, b):
    """Positive-area overlap by exact vertical strips, including aligned edges/holes."""
    edges_a = [(x, y) for loop in a for x, y in zip(loop, loop[1:] + loop[:1])]
    edges_b = [(x, y) for loop in b for x, y in zip(loop, loop[1:] + loop[:1])]
    if any(_intersection(x, y, u, v) == "cross" for x, y in edges_a for u, v in edges_b):
        return True
    xs = sorted({p[0] for loop in a + b for p in loop})
    def intervals(edges, x):
        ys = sorted(p[1] + (x - p[0]) * (q[1] - p[1]) / (q[0] - p[0])
                    for p, q in edges if min(p[0], q[0]) < x < max(p[0], q[0]))
        return list(zip(ys[::2], ys[1::2]))
    for x0, x1 in zip(xs, xs[1:]):
        x = (x0 + x1) / 2
        if any(max(lo, blo) < min(hi, bhi) for lo, hi in intervals(edges_a, x)
               for blo, bhi in intervals(edges_b, x)):
            return True
    return False


def _validate(data, require_integrity=True):
    issues, metrics = [], []
    def issue(code, path, message, severity="error"):
        issues.append(_issue(code, path, message, severity))
    try:
        _canonical(data)
    except (ValueError, TypeError, OverflowError, RecursionError) as e:
        return _report([_issue("invalid-json-value", "$", str(e))])
    if type(data) is not dict:
        return _report([_issue("invalid-root", "$", "Ожидался JSON object.")])
    if require_integrity or "integrity" in data:
        integ = data.get("integrity", {})
        digest = hashlib.sha256(_canonical(_body(data))).hexdigest()
        if type(integ) is not dict or integ.get("method") != CANONICAL or integ.get("sha256") != digest:
            issue("integrity-mismatch", "integrity", "Нет корректного хеша исходного payload; это не проверка происхождения/подписи.")
    if data.get("schema") != SCHEMA or data.get("profile") != PROFILE:
        issue("unsupported-schema-profile", "schema", "Поддерживается только horizontal-line-plan/0.1.")
    def claims(obj, path="$"):
        if type(obj) is dict:
            for k, v in obj.items():
                if k in {"geometryAccepted", "seedAccepted", "normativeAccepted", "revitExecutionVerified", "adjacencyAccepted"} and v is not False:
                    issue("forbidden-acceptance-claim", path + "." + k, "Допуск должен отсутствовать или быть exact false; протокол его не выдаёт.")
                claims(v, path + "." + k)
        elif type(obj) is list:
            for i, v in enumerate(obj):
                claims(v, f"{path}[{i}]")
    claims(data)
    try:
        uuid.UUID(data["exportId"])
        dt = datetime.fromisoformat(data["createdUtc"].replace("Z", "+00:00"))
        if dt.utcoffset() is None or dt.utcoffset().total_seconds() != 0:
            raise ValueError()
    except (KeyError, ValueError, TypeError, AttributeError):
        issue("invalid-export-header", "$", "Требуются UUID exportId и UTC createdUtc.")
    producer = data.get("producer")
    if type(producer) is not dict or any(not isinstance(producer.get(k), str) or not producer[k].strip() for k in ("id", "version", "sourceCommit")):
        issue("producer-missing", "producer", "Нужны id/version/sourceCommit адаптера.")
    execution = data.get("execution", {})
    if (type(execution) is not dict or execution.get("readOnly") is not True or
        type(execution.get("synthetic")) is not bool or type(execution.get("executedInRevit")) is not bool or
        execution.get("synthetic") == execution.get("executedInRevit") or not _text(execution.get("method"))):
        issue("execution-context", "execution", "Явно указать readOnly, synthetic/executedInRevit и метод. Декларация не доказывает запуск.")
    units = data.get("units")
    expected_units = {"frame": "revit-internal-feet", "length": "ft", "area": "ft2", "volume": "ft3", "metresPerFoot": 0.3048, "matrixConvention": "row-major-4x4-column-vector"}
    if units != expected_units:
        issue("units-or-frame", "units", "Единицы/направление матрицы должны точно соответствовать профилю; конверсия не угадывается.")
    docs, elems = {}, {}
    raw_docs, raw_elems, rooms = data.get("documents"), data.get("elements"), data.get("rooms")
    if type(raw_docs) is not list or not raw_docs or type(raw_elems) is not list or len(raw_elems) > MAX_ELEMENTS or type(rooms) is not list or not rooms or len(rooms) > MAX_ROOMS:
        issue("missing-or-oversized-collections", "$", "Нужны documents/elements/rooms в пределах ограничений профиля.")
        return _report(issues)
    doc_identities = set()
    for i, doc in enumerate(raw_docs):
        p = f"documents[{i}]"
        if type(doc) is not dict or not isinstance(doc.get("key"), str) or not doc["key"].strip() or doc["key"] in docs:
            issue("document-identity", p, "Пустой/повторный ключ документа.")
            continue
        docs[doc["key"]] = doc
        if (type(doc.get("identity")) is not dict or not _text(doc["identity"].get("kind")) or not _text(doc["identity"].get("value")) or
            not _text(doc.get("projectInformationUniqueId")) or type(doc.get("revit")) is not dict or
            any(not _text(doc["revit"].get(k)) for k in ("product", "version", "build", "apiVersion"))):
            issue("document-provenance", p, "Нужны устойчивая идентичность, ProjectInformation и версии API/host.")
        else:
            identity = (doc["identity"]["kind"], doc["identity"]["value"])
            if identity in doc_identities:
                issue("duplicate-document-identity", p, "Один документ должен иметь один documentKey; экземпляры задаются path.")
            doc_identities.add(identity)
        before, after = doc.get("before"), doc.get("after")
        valid_snapshot = type(before) is dict and type(after) is dict
        if valid_snapshot:
            for snapshot in (before, after):
                try:
                    uuid.UUID(snapshot["versionGuid"])
                except (KeyError, ValueError, TypeError, AttributeError):
                    valid_snapshot = False
                valid_snapshot &= type(snapshot.get("numberOfSaves")) is int and snapshot.get("numberOfSaves", -1) >= 0
                valid_snapshot &= type(snapshot.get("isModified")) is bool and _text(snapshot.get("generation"))
        if not valid_snapshot or before != after or type(doc.get("documentChangedEvents")) is not int or doc.get("documentChangedEvents") != 0:
            issue("snapshot-inconsistent", p, "До/после или поколение/события изменились либо сведения отсутствуют.")
        elif before["isModified"]:
            issue("unsaved-snapshot", p, "Несохранённый снимок нельзя объявить версией derivative Viewer.", "warning")
    def ref_shape(ref):
        return (type(ref) is dict and set(ref) == {"documentKey", "uniqueId", "elementId"} and
                ref.get("documentKey") in docs and isinstance(ref.get("uniqueId"), str) and bool(ref["uniqueId"].strip()) and
                isinstance(ref.get("elementId"), str) and re.fullmatch(r"[1-9][0-9]{0,18}", ref["elementId"]) is not None and int(ref["elementId"]) <= 2**63 - 1)
    ids, uids = set(), set()
    for i, el in enumerate(raw_elems):
        p = f"elements[{i}]"
        if type(el) is not dict or not ref_shape(el.get("ref")):
            issue("invalid-element-ref", p, "Нужны documentKey, UniqueId и положительная int64 десятичная строка.")
            continue
        key, id_key, uid_key = _key(el["ref"]), (el["ref"]["documentKey"], el["ref"]["elementId"]), (el["ref"]["documentKey"], el["ref"]["uniqueId"])
        if id_key in ids or uid_key in uids:
            issue("duplicate-element-identity", p, "ElementId/UniqueId должен задавать ровно один элемент документа.")
        ids.add(id_key); uids.add(uid_key); elems[key] = el
        try:
            uuid.UUID(el["versionGuid"])
        except (KeyError, ValueError, TypeError, AttributeError):
            issue("element-version", p, "Отсутствует VersionGuid элемента.")
        if el.get("kind") not in {"phase", "level", "option-set", "design-option", "room", "wall", "room-separator", "window", "door", "link-type", "link-instance", "other"}:
            issue("element-kind", p, "Неизвестный kind элемента.")
    def resolve(ref, p, kind=None, doc=None):
        if not ref_shape(ref) or _key(ref) not in elems:
            issue("unresolved-reference", p, "Ссылка не разрешена по всем трём идентификаторам.")
            return None
        el = elems[_key(ref)]
        if (kind and el.get("kind") not in (kind if isinstance(kind, tuple) else (kind,))) or (doc and ref["documentKey"] != doc):
            issue("reference-context", p, "Неверный тип или документ ссылки.")
            return None
        return el
    def result(r, p, required=True, source=None):
        if type(r) is not dict or r.get("status") not in STATUSES or not isinstance(r.get("source"), str) or not r["source"].strip():
            issue("read-result-format", p, "Нужны status/source результата чтения.")
            return None
        if source is not None and r["source"] != source:
            issue("unexpected-read-source", p, "Ожидался явный API source: " + source)
        if r["status"] == "ok":
            if "value" not in r or r["value"] is None:
                issue("read-result-value", p, "ok требует непустое значение.")
                return None
            return r["value"]
        if not isinstance(r.get("reason"), str) or not r["reason"].strip() or "value" in r:
            issue("read-result-reason", p, "Отказ требует reason и не должен нести успешное value.")
        if required or r["status"] != "not-applicable":
            issue("capability-" + r["status"], p, str(r.get("reason", "Причина не указана")), "error" if required else "warning")
        return None
    def option(o, p, doc):
        if type(o) is dict and o == {"kind": "main-model"}:
            return True
        if type(o) is dict and o.get("kind") == "option":
            el = resolve(o.get("ref"), p + ".ref", "design-option", doc)
            st = resolve(o.get("setRef"), p + ".setRef", "option-set", doc)
            if el and st and el.get("setRef") == o["setRef"]:
                return True
        issue("option-context", p, "Нужна Main Model либо разрешённый option/option-set в том же документе.")
        return False
    scope = data.get("scope", {})
    if type(scope) is not dict:
        scope = {}
    root = scope.get("rootDocumentKey")
    phase = scope.get("rootPhase")
    root_option = scope.get("rootOption")
    resolve(phase, "scope.rootPhase", "phase", root)
    option(root_option, "scope.rootOption", root)
    if root not in docs or scope.get("complete") is not True or not _matrix(scope.get("rootTransform")) or scope.get("rootTransform") != IDENTITY:
        issue("scope-incomplete", "scope", "Нужны root document, complete selected-room scope и явная identity rootTransform.")
    reached_links, phase_maps = set(), {}
    def at_path(path, p):
        if type(path) is not list or len(path) > 16:
            issue("instance-path", p, "Нужен путь экземпляров длиной не более16.")
            return None
        doc, ph, opt, mat, seen = root, phase, root_option, list(map(Q, IDENTITY)), set()
        seen_docs = {root}
        for i, link_ref in enumerate(path):
            lp = f"{p}[{i}]"
            link = resolve(link_ref, lp, "link-instance", doc)
            if not link:
                return None
            if _key(link_ref) in seen:
                issue("instance-cycle", lp, "Циклический путь.")
                return None
            seen.add(_key(link_ref))
            reached_links.add(_key(link_ref))
            resolve(link.get("typeRef"), lp + ".typeRef", "link-type", doc)
            if link.get("phase") != ph or (link.get("option") != {"kind": "main-model"} and link.get("option") != opt):
                issue("link-context", lp, "Контекст link instance не совпадает с родительским путём.")
            lifecycle(link, lp, doc, ph)
            child = link.get("childDocumentKey")
            if child not in docs or link.get("loaded") is not True or result(link.get("roomBounding"), lp + ".roomBounding") is not True:
                issue("link-unavailable", lp, "Связь не загружена/не Room Bounding или неизвестен child document.")
                return None
            if child in seen_docs:
                issue("instance-cycle", lp, "Путь циклически возвращается в уже пройденный документ.")
                return None
            seen_docs.add(child)
            t = result(link.get("transform"), lp + ".transform", source="RevitLinkInstance.GetTransform")
            if type(t) is not dict or t.get("fromDocumentKey") != child or t.get("toDocumentKey") != doc or not _matrix(t.get("matrix")):
                issue("invalid-transform", lp, "Нужна жёсткая аффинная матрица child-internal→parent-internal feet.")
                return None
            pm = result(link.get("phaseMap"), lp + ".phaseMap", source="RevitLinkType.GetPhaseMap")
            if type(pm) is not list:
                issue("phase-map", lp, "Нужна нативная host→linked phase map.")
                return None
            mapped, orders = {}, []
            for j, pair in enumerate(pm):
                if type(pair) is not dict:
                    issue("phase-map", lp, "Неверная пара phase map.")
                    continue
                h, c = resolve(pair.get("host"), lp, "phase", doc), resolve(pair.get("linked"), lp, "phase", child)
                if h and c:
                    hk = _key(pair["host"])
                    if hk in mapped or type(h.get("order")) is not int or type(c.get("order")) is not int:
                        issue("phase-map", lp, "Повторная host phase или неизвестный порядок.")
                    else:
                        mapped[hk] = pair["linked"]
                        orders.append((h["order"], c["order"]))
            all_host_phases = {_key(e["ref"]) for e in elems.values() if e.get("kind") == "phase" and e["ref"]["documentKey"] == doc}
            if set(mapped) != all_host_phases:
                issue("phase-map-incomplete", lp, "Нативная карта должна содержать все объявленные host phases.")
            if ref_shape(link.get("typeRef")):
                type_key = _key(link["typeRef"])
                signature = tuple(sorted((k, _key(v)) for k, v in mapped.items()))
                if type_key in phase_maps and phase_maps[type_key] != signature:
                    issue("phase-map-type-conflict", lp, "Один link type получил разные phase maps.")
                phase_maps[type_key] = signature
            if orders and any(a[1] > b[1] for a, b in zip(sorted(orders), sorted(orders)[1:])):
                issue("phase-map-order", lp, "Phase map нарушает порядок фаз.")
            if not ref_shape(ph) or _key(ph) not in mapped:
                issue("phase-not-mapped", lp, "Явная текущая host phase не сопоставлена.")
                return None
            opt = link.get("childOption")
            option(opt, lp + ".childOption", child)
            mat, ph, doc = _mul(mat, t["matrix"]), mapped[_key(ph)], child
        return doc, ph, opt, mat
    def lifecycle(el, p, doc, ph):
        for k in ("createdPhase", "demolishedPhase"):
            val = result(el.get(k), p + "." + k, required=(k == "createdPhase"))
            if k == "demolishedPhase" and type(el.get(k)) is dict and el[k].get("status") not in {"ok", "not-applicable"}:
                issue("phase-lifecycle-unknown", p, "Неизвестна фаза сноса; null без контекста не означает отсутствие сноса.")
            if val is not None:
                ephase, current = resolve(val, p + "." + k, "phase", doc), resolve(ph, p, "phase", doc)
                if ephase and current and type(ephase.get("order")) is int and type(current.get("order")) is int:
                    if (k == "createdPhase" and ephase["order"] > current["order"]) or (k == "demolishedPhase" and ephase["order"] <= current["order"]):
                        issue("element-inactive-in-phase", p, "Элемент ещё не создан или уже снесён в выбранной фазе.")

    def spatial(el, p, ctx, boundary=False):
        if not el or not ctx:
            return
        doc, ph, opt, _ = ctx
        if el["ref"]["documentKey"] != doc or el.get("phase") != ph:
            issue("phase-context", p, "Фаза/документ элемента не совпадают с контекстом пути.")
        eo = el.get("option")
        option(eo, p + ".option", doc)
        if eo != {"kind": "main-model"} and eo != opt:
            issue("option-not-selected", p, "Элемент другого варианта.")
        resolve(el.get("level"), p + ".level", "level", doc)
        if el.get("kind") in {*CATEGORIES, "other"}:
            cat = el.get("category", {})
            if (type(cat) is not dict or not isinstance(cat.get("id"), str) or not re.fullmatch(r"-?[0-9]+", cat["id"]) or
                not isinstance(cat.get("builtInCategory"), str) or not cat["builtInCategory"].strip() or not cat.get("source")):
                issue("category-provenance", p, "Нужны categoryId/BuiltInCategory и источник классификации.")
            elif el["kind"] in CATEGORIES and (cat["id"], cat["builtInCategory"]) != CATEGORIES[el["kind"]]:
                issue("category-kind-conflict", p, "CategoryId/BuiltInCategory противоречат kind.")
            elif el["kind"] == "other" and any(cat["id"] == cid or cat["builtInCategory"] == bic for cid, bic in CATEGORIES.values()):
                issue("category-kind-conflict", p, "other не может маскировать известную категорию.")
            if boundary and result(el.get("roomBounding"), p + ".roomBounding") is not True:
                issue("not-room-bounding", p, "Generating element не подтверждён как Room Bounding.")
        lifecycle(el, p, doc, ph)
    # Validate every phase/level/option table entry and every declared link, not only reached refs.
    phase_orders = set()
    for i, el in enumerate(raw_elems):
        if type(el) is not dict or not ref_shape(el.get("ref")):
            continue
        if el.get("kind") == "phase" and (type(el.get("order")) is not int or el["order"] < 0):
            issue("phase-order", f"elements[{i}]", "Нужен неотрицательный порядок фазы.")
        elif el.get("kind") == "phase":
            phase_order = (el["ref"]["documentKey"], el["order"])
            if phase_order in phase_orders:
                issue("duplicate-phase-order", f"elements[{i}]", "Порядок фаз неоднозначен в одном документе.")
            phase_orders.add(phase_order)
        if el.get("kind") == "level" and not _num(el.get("elevationFt")):
            issue("level-elevation", f"elements[{i}]", "Неизвестна отметка уровня в feet.")
        if el.get("kind") == "design-option":
            resolve(el.get("setRef"), f"elements[{i}].setRef", "option-set", el["ref"]["documentKey"])
    geometries, selected, selected_paths, total_segments = [], set(), {}, 0
    for i, room in enumerate(rooms):
        p, start_issues = f"rooms[{i}]", len(issues)
        if type(room) is not dict:
            issue("room-format", p, "Ожидался Room object.")
            continue
        el = resolve(room.get("ref"), p + ".ref", "room")
        ctx = at_path(room.get("path"), p + ".path")
        if not el or not ctx:
            continue
        key = _room_key(room["ref"], room["path"])
        if key in selected:
            issue("duplicate-room-record", p, "Повторная Room identity по тому же instance path.")
        selected.add(key)
        selected_paths[key[1]] = (room["path"], ctx)
        spatial(el, p, ctx)
        if not isinstance(room.get("number"), str) or not isinstance(room.get("name"), str):
            issue("room-label", p, "number/name должны быть строками, не ключами.")
        if room.get("placement") != "placed":
            issue("room-not-placed", p, "Room сохранён для диагностики, но не пригоден для геометрической проверки.")
        props = room.get("properties", {})
        if type(props) is not dict:
            issue("room-properties-format", p + ".properties", "Нужен object результатов чтения свойств.")
            props = {}
        for k in ("areaFt2", "perimeterFt", "volumeFt3"):
            val = result(props.get(k), p + ".properties." + k, required=k != "volumeFt3", source={"areaFt2":"Room.Area", "perimeterFt":"Room.Perimeter", "volumeFt3":"Room.Volume"}[k])
            if k == "volumeFt3" and val is None:
                continue
            if not _num(val) or val < 0 or (k != "volumeFt3" and val == 0):
                issue("room-property", p + ".properties." + k, "Требуется положительное исходное численное свойство.")
        limits = room.get("limits", {})
        if type(limits) is not dict:
            limits = {}
        for k in ("lowerLevel", "upperLevel"):
            resolve(limits.get(k), p + ".limits." + k, "level", ctx[0])
        for k in ("lowerOffsetFt", "upperOffsetFt", "computationHeightFt"):
            if not _num(limits.get(k)):
                issue("room-limit", p + ".limits." + k, "Требуется исходное значение в feet.")
        lower = resolve(limits.get("lowerLevel"), p + ".limits.lowerLevel", "level", ctx[0])
        upper = resolve(limits.get("upperLevel"), p + ".limits.upperLevel", "level", ctx[0])
        if lower and upper and all(_num(x) for x in (lower.get("elevationFt"), upper.get("elevationFt"), limits.get("lowerOffsetFt"), limits.get("upperOffsetFt"), limits.get("computationHeightFt"))):
            floor = Q(lower["elevationFt"]) + Q(limits["lowerOffsetFt"])
            top = Q(upper["elevationFt"]) + Q(limits["upperOffsetFt"])
            if top <= floor or not 0 <= Q(limits["computationHeightFt"]) <= top - floor or el.get("level") != limits["lowerLevel"]:
                issue("room-vertical-context", p + ".limits", "Противоречивы lower/upper constraints, Room.Level или computation height.")
        loc = result(room.get("location"), p + ".location", source="Room.Location/LocationPoint.Point")
        point = None
        if type(loc) is dict and loc.get("kind") == "LocationPoint" and _xyz(loc.get("point")):
            point = loc["point"]
            check = result(loc.get("containment"), p + ".location.containment", source="Room.IsPointInRoom")
            if type(check) is not dict or check.get("room") != room["ref"] or check.get("phase") != ctx[1] or check.get("point") != point or check.get("inside") is not True:
                issue("location-containment-context", p + ".location", "IsPointInRoom должен относиться к тому же XYZ/Room/фазе.")
        else:
            issue("room-location", p + ".location", "Нужен исходный LocationPoint, не bbox/centroid.")
        boundary = result(room.get("boundaries"), p + ".boundaries", source="Room.GetBoundarySegments")
        if type(boundary) is not dict:
            continue
        raw_loops = boundary.get("loops")
        if (boundary.get("location") not in {"Finish", "Center", "CoreBoundary", "CoreCenter"} or
            type(boundary.get("storeFreeBoundaryFaces")) is not bool or boundary.get("complete") is not True or
            not _num(boundary.get("planeZFt")) or type(raw_loops) is not list or not raw_loops):
            issue("boundary-context", p + ".boundaries", "Нужны все loops, boundary options и фактическая плоскость.")
            continue
        count = sum(len(l.get("segments", [])) if type(l) is dict and type(l.get("segments")) is list else 0 for l in raw_loops)
        total_segments += count
        if not 3 <= count <= MAX_ROOM_SEGMENTS or total_segments > MAX_TOTAL_SEGMENTS:
            issue("geometry-size-limit", p, "Слишком мало/много сегментов; данные не усекаются.")
            continue
        loops, bad_geometry = [], False
        for j, loop in enumerate(raw_loops):
            lp = f"{p}.boundaries.loops[{j}]"
            segments = loop.get("segments") if type(loop) is dict else None
            if type(segments) is not list or len(segments) < 3:
                issue("loop-format", lp, "Нужны минимум3 Line segments.")
                bad_geometry = True
                continue
            starts, ends = [], []
            for k, seg in enumerate(segments):
                sp = f"{lp}.segments[{k}]"
                if type(seg) is not dict:
                    issue("segment-format", sp, "Ожидался segment object.")
                    bad_geometry = True
                    continue
                gen = result(seg.get("generator"), sp + ".generator", source="BoundarySegment.ElementId/LinkElementId")
                if type(gen) is dict:
                    gel = resolve(gen.get("ref"), sp + ".generator.ref", ("wall", "room-separator", "door", "window", "other"))
                    spatial(gel, sp, at_path(gen.get("path"), sp + ".generator.path"), boundary=True)
                else:
                    issue("boundary-generator", sp, "Неизвестен generating element/path.")
                curve = seg.get("curve")
                if type(seg.get("index")) is not int or seg.get("index") != k or type(curve) is not dict or curve.get("kind") != "Line":
                    issue("unsupported-curve-or-order", sp, "Профиль поддерживает только упорядоченные native Line; дуги не тесселируются молча.")
                    bad_geometry = True
                    continue
                a, b = curve.get("start"), curve.get("end")
                if not _xyz(a) or not _xyz(b) or a[2] != boundary["planeZFt"] or b[2] != boundary["planeZFt"]:
                    issue("non-horizontal-or-invalid-coordinate", sp, "XYZ должны лежать в объявленной плоскости; unit/plane не угадываются.")
                    bad_geometry = True
                    continue
                starts.append(tuple(map(Q, a))); ends.append(tuple(map(Q, b)))
            if len(starts) == len(segments):
                if any(ends[k] != starts[(k + 1) % len(starts)] for k in range(len(starts))):
                    issue("open-boundary", lp, "Концы не совпадают точно в сохранённых координатах; snap запрещён.")
                    bad_geometry = True
                loops.append(starts)
        result(room.get("section"), p + ".section", required=False)
        if type(room.get("section")) is dict and room["section"].get("status") == "ok":
            issue("section-not-validated", p + ".section", "Этот профиль не проверяет solid section; требуется отдельный будущий профиль.")
        if bad_geometry:
            continue
        analysis = _analyze_loops(loops, p + ".boundaries.loops", issue)
        if analysis:
            if point is not None and _in_region(tuple(map(Q, point)), loops) is not True:
                issue("location-outside-plan-region", p + ".location", "XY точки вне заполненной области/в отверстии/на границе.")
            world = [[_point(ctx[3], a) for a in loop] for loop in loops]
            if len({a[2] for loop in world for a in loop}) != 1:
                issue("tilted-plan-unsupported", p, "Профиль не проверяет наклонные планы после link transform.")
            else:
                geometries.append((p, world))
            analysis.update({"ref": room["ref"], "path": room["path"], "number": room.get("number"),
                             "propertyAreaDifferenceFt2": analysis["areaFt2"] - props["areaFt2"]["value"] if type(props.get("areaFt2")) is dict and _num(props["areaFt2"].get("value")) else None,
                             "propertyPerimeterDifferenceFt": analysis["perimeterFt"] - props["perimeterFt"]["value"] if type(props.get("perimeterFt")) is dict and _num(props["perimeterFt"].get("value")) else None,
                             "predicates": "exact rational predicates over saved binary numbers; metric lengths rounded by Python float; source accuracy unknown",
                             "localLineChecksPassed": not any(x["severity"] == "error" for x in issues[start_issues:])})
            metrics.append(analysis)
    # Reject overlapping distinct Room interiors. Boundary contact alone is permitted
    # across Rooms, but is not declared authoritative adjacency.
    for i, (pa, a) in enumerate(geometries):
        for pb, b in geometries[i + 1:]:
            if a[0][0][2] != b[0][0][2]:
                continue
            if _regions_overlap(a, b):
                issue("ambiguous-room-overlap", pa + "/" + pb, "Разные Room имеют пересекающиеся/совпадающие области в одном контексте.")
    # Opening relations are separate from actual glazing/aperture geometry.
    openings = result(data.get("openings"), "openings")
    if type(openings) is not dict or openings.get("complete") is not True or type(openings.get("items")) is not list or openings.get("scope") != "selected-room-hosts-and-phase-relations":
        issue("opening-scope", "openings", "Нужна явная полнота выбранного scope host/windows/doors.")
    else:
        opening_keys = set()
        for i, op in enumerate(openings["items"]):
            p = f"openings.items[{i}]"
            if type(op) is not dict:
                issue("opening-format", p, "Ожидался opening object."); continue
            el = resolve(op.get("ref"), p, ("window", "door"))
            ctx = at_path(op.get("path"), p + ".path")
            spatial(el, p, ctx)
            if el and ctx:
                key = _room_key(op["ref"], op["path"])
                if key in opening_keys:
                    issue("duplicate-opening", p, "Повтор opening identity/path.")
                opening_keys.add(key)
            host = result(op.get("host"), p + ".host", source="FamilyInstance.Host")
            if type(host) is dict:
                spatial(resolve(host.get("ref"), p + ".host.ref", ("wall", "other")), p, at_path(host.get("path"), p + ".host.path"))
                if not el or not ref_shape(host.get("ref")) or host["ref"]["documentKey"] != el["ref"]["documentKey"] or host.get("path") != op.get("path"):
                    issue("opening-host-instance-context", p + ".host", "FamilyInstance.Host этого профиля должен принадлежать тому же документу/instance path. Linked host требует другого явного API source/профиля.")
            else:
                issue("opening-host", p, "Host не разрешён.")
            for side in ("fromRoom", "toRoom"):
                api = "FamilyInstance.get_FromRoom(Phase)" if side == "fromRoom" else "FamilyInstance.get_ToRoom(Phase)"
                relation = result(op.get(side), p + "." + side, required=False, source=api)
                if type(op.get(side)) is not dict or ctx is None or op[side].get("phase") != ctx[1]:
                    issue("opening-read-phase", p + "." + side, "Даже API null/ошибка должны сохранять явную фазу запроса.")
                if relation is not None:
                    if type(relation) is not dict or ctx is None or relation.get("phase") != ctx[1]:
                        issue("opening-room-phase", p + "." + side, "Нужна явная фаза From/To чтения."); continue
                    target = relation.get("target")
                    if type(target) is not dict:
                        issue("opening-room-reference", p + "." + side, "Нужны Room ref/path."); continue
                    spatial(resolve(target.get("ref"), p + "." + side, "room"), p, at_path(target.get("path"), p + "." + side + ".path"))
                    if not el or not ref_shape(target.get("ref")) or target["ref"]["documentKey"] != el["ref"]["documentKey"] or target.get("path") != op.get("path"):
                        issue("opening-room-instance-context", p + "." + side, "From/ToRoom должен относиться к тому же документу и экземпляру, что FamilyInstance.")
            t = result(op.get("instanceTransform"), p + ".instanceTransform", source="FamilyInstance.GetTransform")
            if not _matrix(t):
                issue("opening-transform", p, "Неизвестен instance transform в документе.")
            if not isinstance(op.get("typeUniqueId"), str) or not op["typeUniqueId"].strip() or not _xyz(op.get("locationFt")):
                issue("opening-metadata", p, "Нужны typeUniqueId и native locationFt.")
        declared = {_key(e["ref"]) for e in elems.values() if e.get("kind") in ("window", "door")}
        if not declared.issubset({k[0] for k in opening_keys}):
            issue("opening-inventory-incomplete", "openings", "Не все объявленные окна/двери представлены в inventory.")
        expected_openings = {(_key(e["ref"]), path_key) for e in elems.values() if e.get("kind") in ("window", "door")
                             for path_key, (_, ctx) in selected_paths.items() if e["ref"]["documentKey"] == ctx[0]}
        if not expected_openings.issubset(opening_keys):
            issue("opening-instance-inventory-incomplete", "openings", "Известное окно/дверь отсутствует на одном из выбранных instance paths.")
    for el in elems.values():
        if el.get("kind") == "link-instance" and _key(el["ref"]) not in reached_links:
            issue("unscoped-link", "elements", "Объявленная связь не проверена ни по одному пути выбранного scope.")
    requested = scope.get("rooms")
    if type(requested) is not list:
        issue("room-scope", "scope.rooms", "Нужен явный список выбранных Room ref/path.")
    else:
        targets = []
        for i, target in enumerate(requested):
            if type(target) is not dict:
                issue("room-scope-format", f"scope.rooms[{i}]", "Неверная запись выбранного scope не может быть пропущена молча.")
                continue
            if resolve(target.get("ref"), f"scope.rooms[{i}]", "room") is None or at_path(target.get("path"), f"scope.rooms[{i}].path") is None:
                continue
            targets.append(_room_key(target["ref"], target["path"]))
        if set(targets) != selected or len(targets) != len(set(targets)):
            issue("room-scope-mismatch", "scope.rooms", "Пропущенный, лишний или повторный выбранный Room; усечение запрещено.")
    return _report(issues, metrics)


def serialize(data, allow_invalid=False):
    """Hash and serialize a JSON snapshot without normalizing/repairing source fields."""
    report = validate(data, require_integrity=False)
    if any(i["code"] == "integrity-mismatch" for i in report["issues"]) or (not report["valid"] and not allow_invalid):
        raise EvidenceError(report)
    if type(data) is not dict:
        raise EvidenceError(report)
    body = _body(data)
    try:
        digest = hashlib.sha256(_canonical(body)).hexdigest()
        output = dict(body, integrity={"method": CANONICAL, "sha256": digest})
        text = _canonical(output).decode("utf-8") + "\n"
    except (ValueError, TypeError, OverflowError, RecursionError) as e:
        raise EvidenceError(_report([_issue("not-serializable", "$", str(e))])) from e
    return text


def deserialize(text):
    def pairs(items):
        d = {}
        for k, v in items:
            if k in d:
                raise ValueError("duplicate-json-key: " + k)
            d[k] = v
        return d
    try:
        if type(text) is not str or len(text.encode("utf-8")) > MAX_BYTES:
            raise ValueError("input-type-or-byte-limit")
        data = json.loads(text, object_pairs_hook=pairs, parse_constant=lambda x: (_ for _ in ()).throw(ValueError("non-finite-json-number: " + x)))
        _canonical(data)
        return data
    except (ValueError, TypeError, OverflowError, RecursionError) as e:
        raise EvidenceError(_report([_issue("parse-error", "$", str(e))])) from e


def find_rooms(data, number):
    """Search labels without choosing the first of multiple identities."""
    report = validate(data, require_integrity="integrity" in data if type(data) is dict else True)
    if not report["valid"] or not isinstance(number, str):
        return {"status": "invalid-data-or-query", "candidates": [], "issues": report["issues"], "seedAccepted": False}
    rows = [r for r in data.get("rooms", []) if r.get("number") == number]
    return {"status": "unique" if len(rows) == 1 else "ambiguous" if rows else "not-found",
            "candidates": [{"ref": r["ref"], "path": r["path"]} for r in rows],
            "reason": "Номер не является ключом; выбор первой/ближайшей по площади записи запрещён.",
            "seedAccepted": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--serialize", type=Path, help="Write canonical envelope exclusively; never overwrites an existing file.")
    parser.add_argument("--allow-invalid", action="store_true", help="Preserve rejected JSON as diagnostic evidence; report still fails.")
    parser.add_argument("--report", type=Path, help="Persist reasons as a separate JSON report, exclusively; never overwrites.")
    args = parser.parse_args()
    def emit(report):
        text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        print(text, end="")
        if args.report:
            with args.report.open("x", encoding="utf-8") as out:
                out.write(text)
    try:
        # Size check occurs before reading an arbitrarily large file.
        if args.input.stat().st_size > MAX_BYTES:
            raise EvidenceError(_report([_issue("byte-limit", "$", "Input exceeds5MiB.")]))
        data = deserialize(args.input.read_text(encoding="utf-8"))
        report = validate(data, require_integrity=not bool(args.serialize))
        if args.serialize:
            text = serialize(data, allow_invalid=args.allow_invalid)
            with args.serialize.open("x", encoding="utf-8") as out:
                out.write(text)
        emit(report)
        return 0 if report["valid"] else 2
    except EvidenceError as e:
        try:
            emit(e.report)
        except (OSError, UnicodeError):
            print(json.dumps(_report([_issue("report-file-error", "$", "Не удалось записать новый report; существующий файл не перезаписывается.")]), ensure_ascii=False))
        return 2
    except (OSError, UnicodeError) as e:
        print(json.dumps(_report([_issue("file-error", "$", type(e).__name__)]), ensure_ascii=False)); return 2


if __name__ == "__main__":
    sys.exit(main())

"""Synthetic protocol/geometry tests; never executes Revit or reads a model."""
import copy
import json
import math
import random
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import fixtures as F
import protocol as P


class ProtocolTests(unittest.TestCase):
    def report(self, data):
        return P.validate(data, require_integrity=False)

    def valid(self, data):
        result = self.report(data)
        self.assertTrue(result['valid'], result['issues'])
        self.assertFalse(result['geometryAccepted'])
        self.assertFalse(result['seedAccepted'])
        self.assertFalse(result['normativeAccepted'])
        self.assertFalse(result['revitExecutionVerified'])
        return result

    def rejected(self, data, code):
        result = self.report(data)
        self.assertFalse(result['valid'])
        self.assertIn(code, [i['code'] for i in result['issues']], result['issues'])
        self.assertTrue(all(i['path'] and i['message'] for i in result['issues']))
        with self.assertRaises(P.EvidenceError):
            P.serialize(data)
        return result

    def test_native_unphased_room_capability_does_not_replace_room_phase(self):
        data=F.sample(); room=data['elements'][3]
        room['lifecycleCapability']=F.ok(False,'Element.HasPhases')
        for key in ('createdPhase','demolishedPhase'):
            room[key]=F.unavailable('Element.HasPhases=false')
        self.valid(data)
        room['phase']=F.ref(999)
        self.rejected(data,'phase-context')

    def test_lifecycle_capability_cannot_bypass_phased_elements_or_unknowns(self):
        for kind in ('room','wall'):
            for mode in ('unknown','nonboolean','source','conflict','missing','forged-kind'):
                data=F.sample(); element=data['elements'][3 if kind=='room' else 4]
                element['lifecycleCapability']=F.ok(False,'Element.HasPhases')
                for key in ('createdPhase','demolishedPhase'): element[key]=F.unavailable('No lifecycle')
                if mode=='unknown': element['lifecycleCapability']=F.unavailable('unknown','unsupported','Element.HasPhases')
                if mode=='nonboolean': element['lifecycleCapability']['value']=0
                if mode=='source': element['lifecycleCapability']['source']='guess'
                if mode=='conflict': element['createdPhase']=F.ok(F.ref(1))
                if mode=='missing': del element['createdPhase']
                if mode=='forged-kind':
                    if kind=='room': element['kind']='wall'
                with self.subTest(kind=kind,mode=mode):
                    if kind=='room' and mode=='forged-kind':
                        self.rejected(data,'reference-context')
                    else:
                        self.rejected(data,'lifecycle-capability')

    def test_examples_and_known_metrics(self):
        for data, area, per, holes in [(F.sample(), 12, 14, 0), (F.with_hole(), 11, 18, 1)]:
            result = self.valid(data)['rooms'][0]
            self.assertEqual((result['areaFt2'], result['perimeterFt'], result['holes']), (area, per, holes))
        self.valid(F.with_link())

    def test_generated_example_manifest(self):
        for name, data in F.examples().items():
            report = self.report(data)
            self.assertEqual(report['valid'], not name.startswith('rejected-'), (name,report['issues']))
            sealed = P.deserialize(P.serialize(data, allow_invalid=name.startswith('rejected-')))
            self.assertEqual(P.validate(sealed)['valid'], report['valid'])
        self.assertEqual(P.find_rooms(F.examples()['ambiguous-number'],'A-01')['status'],'ambiguous')

    def test_serializer_roundtrip_deterministic_no_mutation(self):
        data = F.with_hole()
        before = copy.deepcopy(data)
        text = P.serialize(data)
        parsed = P.deserialize(text)
        self.assertTrue(P.validate(parsed)['valid'])
        self.assertEqual(text, P.serialize(parsed))
        self.assertEqual(data, before)
        del parsed['integrity']
        self.assertEqual(parsed, data)
        self.assertEqual(text, P.serialize(dict(reversed(list(data.items())))))

    def test_tamper_and_missing_hash(self):
        data = P.deserialize(P.serialize(F.sample()))
        data['rooms'][0]['name'] = 'изменено'
        self.rejected(data, 'integrity-mismatch')
        self.assertFalse(P.validate(F.sample())['valid'])
        with self.assertRaises(P.EvidenceError):
            P.serialize(data, allow_invalid=True)

    def test_invalid_can_be_preserved_as_rejected_diagnostic(self):
        data = F.sample(); data['units']['length'] = 'mm'
        output = P.deserialize(P.serialize(data, allow_invalid=True))
        self.assertEqual(output['units']['length'], 'mm')
        report = P.validate(output)
        self.assertFalse(report['valid'])
        self.assertIn('units-or-frame', [i['code'] for i in report['issues']])

    def test_strict_json_and_nonfinite(self):
        for text in ['{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}', '{"x":-Infinity}', '{"x":1e999}', '{bad']:
            with self.subTest(text=text), self.assertRaises(P.EvidenceError):
                P.deserialize(text)
        for x in [math.nan, math.inf, -math.inf, (1, 2), {1: 'numeric key'}]:
            data = F.sample(); data['extra'] = x
            self.rejected(data, 'invalid-json-value')

    def test_units_and_frames_are_not_inferred(self):
        for key, value in [('length', 'm'), ('area', 'm2'), ('volume', 'm3'), ('metresPerFoot', 1), ('matrixConvention', 'column-major'), ('frame', 'shared-coordinates')]:
            with self.subTest(key=key):
                data = F.sample(); data['units'][key] = value
                self.rejected(data, 'units-or-frame')

    def test_gap_not_snapped_even_below_raster_cell(self):
        for gap in [0.001, 1e-10]:
            data = F.sample()
            data['rooms'][0]['boundaries']['value']['loops'][0]['segments'][0]['curve']['end'][0] -= gap
            self.rejected(data, 'open-boundary')

    def test_self_crossing_and_overlap_backtrack(self):
        for points in [[[0,0],[4,3],[4,0],[0,3]], [[0,0],[4,0],[2,0],[4,3],[0,3]], [[0,0],[4,0],[2,1],[4,3],[0,3],[2,1]]]:
            data = F.sample(); data['rooms'][0]['boundaries']['value']['loops'] = [F.loop(points)]
            self.rejected(data, 'self-intersection')

    def test_duplicate_vertex_and_zero_area(self):
        data = F.sample(); data['rooms'][0]['boundaries']['value']['loops'] = [F.loop([[0,0],[4,0],[4,0],[0,3]])]
        self.rejected(data, 'zero-length-segment')
        data = F.sample(); data['rooms'][0]['boundaries']['value']['loops'] = [F.loop([[0,0],[1,0],[2,0]])]
        self.rejected(data, 'degenerate-loop')

    def test_hole_orientation_loop_order_and_vertex_order(self):
        random.seed(781)
        for _ in range(16):
            data = F.with_hole(); loops = data['rooms'][0]['boundaries']['value']['loops']
            points = [[s['curve']['start'] for s in l['segments']] for l in loops]
            random.shuffle(points)
            transformed = []
            for p in points:
                if random.choice([True, False]): p.reverse()
                shift = random.randrange(len(p)); p = p[shift:] + p[:shift]
                transformed.append(F.loop(p))
            data['rooms'][0]['boundaries']['value']['loops'] = transformed
            result = self.valid(data)['rooms'][0]
            self.assertEqual((result['areaFt2'], result['holes']), (11, 1))

    def test_point_in_hole_or_on_boundary_rejected(self):
        for point in [[2.5,1.5,1], [2,1.5,1], [0,1,1], [8,8,1]]:
            data = F.with_hole(); loc = data['rooms'][0]['location']['value']
            loc['point'] = point; loc['containment']['value']['point'] = point
            self.rejected(data, 'location-outside-plan-region')

    def test_intersecting_touching_and_duplicate_loops(self):
        for points in [[[0,1],[2,1],[2,2],[0,2]], [[3,1],[5,1],[5,2],[3,2]], [[0,0],[4,0],[4,3],[0,3]]]:
            data = F.sample(); data['rooms'][0]['boundaries']['value']['loops'].append(F.loop(points))
            self.rejected(data, 'loop-intersection-or-touch')

    def test_multiple_components_and_nested_island(self):
        data = F.with_hole(); loops = data['rooms'][0]['boundaries']['value']['loops']
        loops.append(F.loop([[2.2,1.2],[2.8,1.2],[2.8,1.8],[2.2,1.8]]))
        loops.append(F.loop([[6,0],[7,0],[7,1],[6,1]]))
        m = self.valid(data)['rooms'][0]
        self.assertEqual((m['holes'], m['components']), (1, 3))
        self.assertAlmostEqual(m['areaFt2'], 12.36)

    def test_concave_region_known_area(self):
        data = F.sample(); data['rooms'][0]['boundaries']['value']['loops'] = [F.loop([[0,0],[4,0],[4,1],[2,1],[2,3],[0,3]])]
        m = self.valid(data)['rooms'][0]
        self.assertEqual((m['areaFt2'], m['perimeterFt']), (8, 14))

    def test_arc_and_false_section_claim_not_silently_accepted(self):
        data = F.sample(); data['rooms'][0]['boundaries']['value']['loops'][0]['segments'][0]['curve']['kind'] = 'Arc'
        self.rejected(data, 'unsupported-curve-or-order')
        data = F.sample(); data['rooms'][0]['section'] = F.ok({'claimedHeightMetres': 1.2})
        self.rejected(data, 'section-not-validated')

    def test_same_xyz_containment_and_source(self):
        for mutate in [lambda r:r['location']['value']['containment']['value'].update(point=[1,1,2]),
                       lambda r:r['location']['value']['containment']['value'].update(inside=False),
                       lambda r:r['location'].update(source='bbox centroid')]:
            data = F.sample(); mutate(data['rooms'][0]); self.assertFalse(self.report(data)['valid'])

    def test_snapshot_change_events_and_generation(self):
        for key, value in [('numberOfSaves', 2), ('versionGuid', F.GUID[:-1]+'2'), ('isModified', True), ('generation', 'next')]:
            data = F.sample(); data['documents'][0]['after'][key] = value
            self.rejected(data, 'snapshot-inconsistent')
        data = F.sample(); data['documents'][0]['documentChangedEvents'] = 1
        self.rejected(data, 'snapshot-inconsistent')

    def test_unsaved_snapshot_is_explicit_not_silently_matched_to_viewer(self):
        data = F.sample()
        for k in ['before','after']: data['documents'][0][k]['isModified'] = True
        report = self.valid(data)
        self.assertIn('unsaved-snapshot', [i['code'] for i in report['issues']])

    def test_wrong_phase_level_option_and_inactive_element(self):
        data = F.sample(); data['elements'][3]['phase'] = F.ref(999)
        self.rejected(data, 'phase-context')
        data = F.sample(); data['elements'][3]['level'] = F.ref(1)
        self.rejected(data, 'reference-context')
        data = F.sample(); data['elements'][3]['option'] = {'kind':'option', 'ref':F.ref(777), 'setRef':F.ref(778)}
        self.rejected(data, 'option-context')
        data = F.sample(); data['elements'][3]['demolishedPhase'] = F.ok(F.ref(1))
        self.rejected(data, 'element-inactive-in-phase')

    def test_valid_selected_design_option_and_other_option_rejected(self):
        data = F.sample()
        data['elements'] += [F.element(50, 'option-set'), F.element(51, 'design-option', setRef=F.ref(50)), F.element(52, 'design-option', setRef=F.ref(50))]
        opt = {'kind':'option','ref':F.ref(51),'setRef':F.ref(50)}
        data['scope']['rootOption'] = opt; data['elements'][3]['option'] = copy.deepcopy(opt)
        self.valid(data)
        data['elements'][3]['option']['ref'] = F.ref(52)
        self.rejected(data, 'option-not-selected')

    def test_int64_identity_preserved_and_numeric_id_rejected(self):
        data = F.sample()
        new = F.ref(9223372036854775807)
        old = F.ref(10)
        def replace(x):
            if isinstance(x, dict):
                if x == old: x.update(new)
                else:
                    for v in x.values(): replace(v)
            elif isinstance(x, list):
                for v in x: replace(v)
        replace(data)
        self.valid(data)
        self.assertIn('9223372036854775807', P.serialize(data))
        data['rooms'][0]['ref']['elementId'] = 9223372036854775807
        self.rejected(data, 'unresolved-reference')

    def test_duplicate_and_missing_refs_category_conflicts(self):
        data = F.sample(); data['elements'].append(copy.deepcopy(data['elements'][3]))
        self.rejected(data, 'duplicate-element-identity')
        data = F.sample(); data['rooms'][0]['boundaries']['value']['loops'][0]['segments'][0]['generator']['value']['ref'] = F.ref(999)
        self.rejected(data, 'unresolved-reference')
        data = F.sample(); data['elements'][3]['category']['builtInCategory'] = 'OST_Walls'
        self.rejected(data, 'category-kind-conflict')

    def test_link_rotation_reflection_and_large_translation(self):
        for matrix in [[0,-1,0,10,1,0,0,0,0,0,1,0,0,0,0,1], [-1,0,0,1000000,0,1,0,2000000,0,0,1,0,0,0,0,1]]:
            data = F.with_link(); data['elements'][-1]['transform']['value']['matrix'] = matrix
            self.valid(data)

    def test_link_scale_shear_perspective_nan_direction(self):
        for i, value in [(0,2), (1,.5), (12,.1), (15,2), (0,math.nan)]:
            data = F.with_link(); data['elements'][-1]['transform']['value']['matrix'][i] = value
            self.assertFalse(self.report(data)['valid'])
        data = F.with_link(); data['elements'][-1]['transform']['value']['fromDocumentKey'] = 'root'
        self.rejected(data, 'invalid-transform')

    def test_link_unloaded_room_bounding_and_map(self):
        data = F.with_link(); data['elements'][-1]['loaded'] = False
        self.rejected(data, 'link-unavailable')
        data = F.with_link(); data['elements'][-1]['roomBounding']['value'] = False
        self.rejected(data, 'link-unavailable')
        data = F.with_link(); data['elements'][-1]['phaseMap']['value'] = []
        self.rejected(data, 'phase-not-mapped')
        data = F.with_link(); data['elements'][-1]['phaseMap']['source'] = 'matched by phase label'
        self.rejected(data, 'unexpected-read-source')
        data = F.with_link(); data['rooms'][1]['path'] = []
        self.rejected(data, 'phase-context')

    def test_phase_map_order_not_equal_phase_names(self):
        data = F.with_link()
        data['elements'] += [F.element(60,'phase',order=1), F.element(60,'phase','linked',order=1)]
        link = next(e for e in data['elements'] if e['kind']=='link-instance')
        link['phaseMap']['value'] = [{'host':F.ref(1),'linked':F.ref(60,'linked')},{'host':F.ref(60),'linked':F.ref(1,'linked')}]
        self.rejected(data, 'phase-map-order')

    def add_room(self, data, n, points, number='A-02'):
        data['elements'].append(F.spatial(n, 'room'))
        room = F.room(n, number, points=points)
        x0, y0 = points[0]; point = [x0+.25,y0+.25,1]
        room['location']['value']['point'] = point
        room['location']['value']['containment']['value']['point'] = point
        data['rooms'].append(room)
        data['scope']['rooms'].append({'ref':room['ref'],'path':[]})

    def test_ambiguous_overlap_equal_and_partly_aligned(self):
        for points in [[[0,0],[4,0],[4,3],[0,3]], [[2,0],[6,0],[6,3],[2,3]], [[0,0],[2,0],[4,0],[4,3],[0,3]]]:
            data = F.sample(); self.add_room(data, 11, points)
            self.rejected(data, 'ambiguous-room-overlap')

    def test_adjacent_rooms_are_not_merged_or_declared_authoritative_adjacency(self):
        data = F.sample(); self.add_room(data, 11, [[4,0],[8,0],[8,3],[4,3]])
        self.valid(data)
        self.assertNotIn('adjacencyAccepted', self.report(data))

    def test_same_number_disjoint_rooms_requires_choice(self):
        data = F.sample(); self.add_room(data, 11, [[6,0],[10,0],[10,3],[6,3]], 'A-01')
        self.valid(data)
        result = P.find_rooms(data, 'A-01')
        self.assertEqual(result['status'], 'ambiguous')
        self.assertEqual(len(result['candidates']), 2)
        self.assertFalse(result['seedAccepted'])

    def test_room_scope_and_duplicate_records(self):
        data = F.sample(); data['scope']['rooms'] = []
        self.rejected(data, 'room-scope-mismatch')
        data = F.sample(); data['rooms'].append(copy.deepcopy(data['rooms'][0]))
        self.rejected(data, 'duplicate-room-record')

    def test_unplaced_zero_area_and_missing_read_result(self):
        data = F.sample(); data['rooms'][0]['placement'] = 'unplaced'
        self.rejected(data, 'room-not-placed')
        data = F.sample(); data['rooms'][0]['properties']['areaFt2']['value'] = 0
        self.rejected(data, 'room-property')
        data = F.sample(); data['rooms'][0]['boundaries'] = F.unavailable('Revit API not executed','unsupported')
        self.rejected(data, 'capability-unsupported')

    def test_host_phase_null_and_missing_inventory(self):
        data = F.sample(); data['openings']['value']['items'][0]['fromRoom']['value']['phase'] = F.ref(999)
        self.rejected(data, 'opening-room-phase')
        data = F.sample(); data['openings']['value']['items'][0]['host']['value']['ref'] = F.ref(999)
        self.rejected(data, 'unresolved-reference')
        data = F.sample(); data['openings']['value']['items'] = []
        self.rejected(data, 'opening-inventory-incomplete')
        report = self.valid(F.sample())
        self.assertIn('capability-unavailable', [i['code'] for i in report['issues']])

    def test_size_limits_and_true_admission_claim(self):
        data = F.sample(); data['rooms'] *= P.MAX_ROOMS+1
        self.rejected(data, 'missing-or-oversized-collections')
        for flag in ['geometryAccepted','seedAccepted','normativeAccepted']:
            data = F.sample(); data[flag] = True
            self.rejected(data, 'forbidden-acceptance-claim')

    def test_review_truthy_and_nested_admission_claims(self):
        for value in [True, 1, 'true', {'pretend':True}, None, []]:
            for flag in ['geometryAccepted','seedAccepted','normativeAccepted']:
                data = F.sample(); data['rooms'][0][flag] = value
                self.rejected(data, 'forbidden-acceptance-claim')

    def test_review_cross_instance_host_and_from_room_rejected(self):
        for target, code in [('host','opening-host-instance-context'), ('fromRoom','opening-room-instance-context')]:
            data = F.with_link(); op = data['openings']['value']['items'][0]
            if target == 'host': op[target]['value'] = {'ref':F.ref(20,'linked'),'path':[F.ref(41)]}
            else: op[target]['value']['target'] = {'ref':F.ref(10,'linked'),'path':[F.ref(41)]}
            self.rejected(data, code)

    def test_review_other_cannot_mask_known_category(self):
        data = F.sample(); wall = data['elements'][4]; wall['kind'] = 'other'
        wall['category'] = {'id':'-2000014','builtInCategory':'OST_Windows','source':'Category API'}
        self.rejected(data, 'category-kind-conflict')

    def test_review_inventory_preserves_repeated_link_paths(self):
        data = F.with_link(); data['elements'].append(F.spatial(30,'window','linked'))
        op = copy.deepcopy(data['openings']['value']['items'][0]); op.update(ref=F.ref(30,'linked'),path=[F.ref(41)])
        op['host']['value'] = {'ref':F.ref(20,'linked'),'path':[F.ref(41)]}
        op['fromRoom']['value'] = {'phase':F.ref(1,'linked'),'target':{'ref':F.ref(10,'linked'),'path':[F.ref(41)]}}
        for side in ['fromRoom','toRoom']: op[side]['phase'] = F.ref(1,'linked')
        data['openings']['value']['items'].append(op)
        link2 = copy.deepcopy(next(e for e in data['elements'] if e['kind']=='link-instance'))
        link2['ref'] = F.ref(42); link2['transform']['value']['matrix'][3] = 20
        data['elements'].append(link2)
        room2 = F.room(10,'LINK-02',doc='linked',path=[F.ref(42)])
        data['rooms'].append(room2); data['scope']['rooms'].append({'ref':room2['ref'],'path':room2['path']})
        self.rejected(data, 'opening-instance-inventory-incomplete')
        op2 = copy.deepcopy(op); op2['path'] = [F.ref(42)]
        op2['host']['value']['path'] = [F.ref(42)]
        op2['fromRoom']['value']['target']['path'] = [F.ref(42)]
        data['openings']['value']['items'].append(op2)
        self.valid(data)

    def test_review_scope_malformed_entries_are_not_discarded(self):
        for value in [None,False,[],0,'invalid']:
            data = F.sample(); data['scope']['rooms'].append(value)
            self.rejected(data, 'room-scope-format')

    def test_review_provenance_types_and_boolean_root_matrix(self):
        data = F.sample(); data['documents'][0]['identity']['value'] = {'not':'a string'}
        self.rejected(data, 'document-provenance')
        data = F.sample(); data['documents'][0]['revit']['apiVersion'] = {'not':'a version'}
        self.rejected(data, 'document-provenance')
        data = F.sample(); data['scope']['rootTransform'][0] = True
        self.rejected(data, 'scope-incomplete')
        data = F.sample(); data['execution']['method'] = 1
        self.rejected(data, 'execution-context')

    def test_review_exact_vertical_bounds_and_duplicate_phase_order(self):
        data = F.sample()
        data['elements'][1]['elevationFt'] = data['elements'][2]['elevationFt'] = 1e9
        data['rooms'][0]['limits'].update(lowerOffsetFt=1e-8, upperOffsetFt=1, computationHeightFt=1)
        self.rejected(data, 'room-vertical-context')
        data = F.sample(); data['elements'].append(F.element(5,'phase',order=0))
        self.rejected(data, 'duplicate-phase-order')

    def test_review_null_from_to_retains_explicit_query_phase(self):
        data = F.sample(); del data['openings']['value']['items'][0]['toRoom']['phase']
        self.rejected(data, 'opening-read-phase')

    def test_review_link_lifecycle_and_native_source_names(self):
        data = F.with_link(); link = next(e for e in data['elements'] if e['kind']=='link-instance')
        link['demolishedPhase'] = F.ok(F.ref(1))
        self.rejected(data, 'element-inactive-in-phase')
        data = F.with_link(); link = next(e for e in data['elements'] if e['kind']=='link-instance')
        link['createdPhase'] = F.unavailable('Unknown phase','unavailable')
        self.rejected(data, 'capability-unavailable')
        data = F.with_link(); data['elements'].append(F.element(60,'phase',order=1))
        link = next(e for e in data['elements'] if e['kind']=='link-instance')
        link['phaseMap']['value'].append({'host':F.ref(60),'linked':F.ref(1,'linked')})
        link['createdPhase'] = F.ok(F.ref(60))
        self.rejected(data, 'element-inactive-in-phase')
        data = F.with_link(); link = next(e for e in data['elements'] if e['kind']=='link-instance')
        link['transform']['source'] = 'guessed by bbox alignment'
        self.rejected(data, 'unexpected-read-source')
        data = F.sample(); data['rooms'][0]['properties']['areaFt2']['source'] = 'inferred from PDF bbox'
        self.rejected(data, 'unexpected-read-source')

    def test_volume_unavailable_or_zero_does_not_invent_a_volume(self):
        data = F.sample(); data['rooms'][0]['properties']['volumeFt3'] = F.unavailable('Volume computation disabled','unavailable','Room.Volume')
        self.valid(data)
        data['rooms'][0]['properties']['volumeFt3'] = F.ok(0,'Room.Volume')
        self.valid(data)

    def test_room_inside_another_room_hole_has_no_positive_area_overlap(self):
        data = F.with_hole(); self.add_room(data,11,[[2.1,1.1],[2.9,1.1],[2.9,1.9],[2.1,1.9]])
        self.valid(data)

    def test_nested_link_composes_transforms_and_phase_maps(self):
        data = F.with_link(); data['documents'].append(F.document('grand'))
        data['elements'] += [F.element(1,'phase','grand',order=0),F.element(2,'level','grand',elevationFt=0),F.element(3,'level','grand',elevationFt=3),F.spatial(10,'room','grand'),F.spatial(20,'wall','grand'),F.element(40,'link-type','linked')]
        link = F.spatial(41,'link-instance','linked',typeRef=F.ref(40,'linked'),childDocumentKey='grand',loaded=True,roomBounding=F.ok(True),childOption={'kind':'main-model'},
                         transform=F.ok({'fromDocumentKey':'grand','toDocumentKey':'linked','matrix':[1,0,0,20,0,1,0,20,0,0,1,0,0,0,0,1]},'RevitLinkInstance.GetTransform'),
                         phaseMap=F.ok([{'host':F.ref(1,'linked'),'linked':F.ref(1,'grand')}],'RevitLinkType.GetPhaseMap'))
        data['elements'].append(link)
        rr = F.room(10,'NESTED',doc='grand',path=[F.ref(41),F.ref(41,'linked')])
        data['rooms'].append(rr); data['scope']['rooms'].append({'ref':rr['ref'],'path':rr['path']})
        self.valid(data)

    def test_cli_report_keeps_reasons_when_serialization_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); source=root/'bad.json'; report=root/'reason.json'; out=root/'not-written.json'
            data=F.sample(); data['units']['metresPerFoot']=1
            source.write_text(json.dumps(data))
            r=subprocess.run([sys.executable,'-B',str(Path(P.__file__)),str(source),'--serialize',str(out),'--report',str(report)],capture_output=True,text=True)
            self.assertEqual(r.returncode,2)
            self.assertFalse(out.exists())
            saved=json.loads(report.read_text()); self.assertFalse(saved['valid'])
            self.assertIn('units-or-frame',[i['code'] for i in saved['issues']])

    def test_malformed_collections_never_crash_or_pass(self):
        for field in ['scope','documents','elements','rooms','openings','units','execution','producer']:
            for value in [None, False, 12, 'oops', []]:
                data = F.sample(); data[field] = value
                result = self.report(data)
                self.assertFalse(result['valid'], (field,value,result))

    def test_cli_does_not_overwrite_and_persists_rejection(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); source = root/'input.json'; target = root/'out.json'
            source.write_text(json.dumps(F.sample()))
            script = str(Path(P.__file__))
            cmd = [sys.executable, '-B', script, str(source), '--serialize', str(target)]
            first = subprocess.run(cmd, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stdout)
            before = target.read_bytes()
            second = subprocess.run(cmd, capture_output=True, text=True)
            self.assertNotEqual(second.returncode, 0)
            self.assertEqual(target.read_bytes(), before)
            data = F.sample(); data['units']['length'] = 'mm'; source.write_text(json.dumps(data))
            failed = subprocess.run([sys.executable,'-B',script,str(source),'--serialize',str(root/'rejected.json'),'--allow-invalid'],capture_output=True,text=True)
            self.assertEqual(failed.returncode, 2)
            self.assertIn('units-or-frame',failed.stdout)
            self.assertEqual(P.deserialize((root/'rejected.json').read_text())['units']['length'],'mm')


if __name__ == '__main__':
    unittest.main(verbosity=2)

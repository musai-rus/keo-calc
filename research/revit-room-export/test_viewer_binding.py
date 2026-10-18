"""Invented binding evidence; not C# compilation, Revit execution or live Viewer QA."""
import copy
import unittest
from fixtures import sample, ref
from protocol import serialize, deserialize
from viewer_binding import check, SCHEMA


def fixture():
    export = sample()
    export['execution'].update(synthetic=False, executedInRevit=True)
    # These values are invented, including the declaration above; no actual API execution.
    source = dict(sha256='a'*64, versionGuid=export['documents'][0]['before']['versionGuid'],
                  numberOfSaves=1, projectInformationUniqueId=export['documents'][0]['projectInformationUniqueId'])
    export['sourceSnapshot'] = source
    export['documents'][0]['identity'] = dict(kind='saved-rvt-sha256', value=source['sha256'])
    export = deserialize(serialize(export))
    matrix = [.3048,0,0,0, 0,.3048,0,0, 0,0,.3048,0, 0,0,0,1]
    points = [dict(sourceUniqueId='synthetic-point-'+str(i), sourceFt=p,
                   viewerM=[x*.3048 for x in p], method='independent-native-point')
              for i,p in enumerate([[0,0,0],[1,0,0],[0,1,0],[0,0,1]])]
    manifest = dict(schema=SCHEMA, kind='conversion-manifest', source=source,
        evidenceReference='synthetic conversion record only', rootUrn='synthetic-urn',
        derivativeVersion='synthetic-immutable-derivative-version', viewGuid='synthetic-view',
        phase=ref(1), option=dict(kind='main-model'),
        units=dict(source='ft',viewer='m',metresPerFoot=.3048,matrixConvention='row-major-4x4-column-vector'),
        transformDirection='root-internal-feet-to-viewer-metres', sourceToViewer=matrix,controlPoints=points)
    viewer = copy.deepcopy(manifest)
    viewer.update(kind='current-viewer-snapshot', session='synthetic-session',stable=True,loadedModelCount=1,is2d=False)
    del viewer['source']; del viewer['evidenceReference']
    return export, manifest, viewer


class BindingTests(unittest.TestCase):
    def test_consistent_is_not_admission(self):
        result = check(*fixture(), 'synthetic-session')
        self.assertTrue(result['bindingConsistent'], result)
        for key in ('geometryAccepted','seedAccepted','normativeAccepted','revitExecutionVerified','sourceAccuracyVerified','viewerBindingVerified'):
            self.assertIs(result[key], False)

    def test_model_revision_phase_units_transform_and_stale_rejected(self):
        changes = [('rootUrn','other-model'),('derivativeVersion','other-revision'),('viewGuid','other-view'),
                   ('phase',ref(999)),('option',None),('units',None),('sourceToViewer',None),
                   ('transformDirection','reverse'),('session','stale'),('stable',False),('is2d',True),('loadedModelCount',2)]
        for field, value in changes:
            with self.subTest(field=field):
                e,m,v = fixture(); v[field] = value
                self.assertFalse(check(e,m,v,'synthetic-session')['bindingConsistent'])

    def test_source_fields_cannot_be_copied_from_other_file(self):
        for field in ('sha256','versionGuid','numberOfSaves','projectInformationUniqueId'):
            with self.subTest(field=field):
                e,m,v = fixture(); m['source'][field] = 'other'
                self.assertFalse(check(e,m,v,'synthetic-session')['bindingConsistent'])

    def test_boolean_save_number_cannot_equal_integer(self):
        e,m,v=fixture(); m['source']['numberOfSaves']=True
        self.assertFalse(check(e,m,v,'synthetic-session')['bindingConsistent'])

    def test_integrity_and_actual_capture_required(self):
        for mode in ('integrity','synthetic','modified','identity','scope'):
            e,m,v = fixture()
            if mode=='integrity': e['rooms'][0]['name']='changed'
            else:
                del e['integrity']
                if mode=='synthetic': e['execution'].update(synthetic=True,executedInRevit=False)
                if mode=='modified':
                    for k in ('before','after'): e['documents'][0][k]['isModified']=True
                if mode=='identity': e['documents'][0]['identity']['kind']='filename'
                if mode=='scope': e['scope']['rootPhase']=ref(999)
                e=deserialize(serialize(e,allow_invalid=True))
            with self.subTest(mode=mode): self.assertFalse(check(e,m,v,'synthetic-session')['bindingConsistent'])

    def test_control_points_no_fit_or_tolerance(self):
        for mode in ('coplanar','residual','duplicate','method','missing','malformed'):
            e,m,v=fixture()
            points=v['controlPoints']
            if mode=='coplanar': points[-1].update(sourceFt=[1,1,0],viewerM=[.3048,.3048,0])
            if mode=='residual': points[-1]['viewerM'][2]+=.0000000001
            if mode=='duplicate': points[-1]['sourceUniqueId']=points[0]['sourceUniqueId']
            if mode=='method': points[-1]['method']='computed-from-transform'
            if mode=='missing': points.pop()
            if mode=='malformed': points[-1]=None
            m['controlPoints']=copy.deepcopy(points)
            with self.subTest(mode=mode): self.assertFalse(check(e,m,v,'synthetic-session')['bindingConsistent'])

    def test_matrix_scale_mirror_and_nonfinite(self):
        for mode in ('double-scale','shear','nonfinite','boolean','projective'):
            e,m,v=fixture()
            a=v['sourceToViewer']
            if mode=='double-scale': a[0]*=.3048
            if mode=='shear': a[1]=.1
            if mode=='nonfinite': a[0]=float('nan')
            if mode=='boolean': a[0]=True
            if mode=='projective': a[15]=2
            m['sourceToViewer']=a[:]
            with self.subTest(mode=mode): self.assertFalse(check(e,m,v,'synthetic-session')['bindingConsistent'])

    def test_no_admission_claims_or_forged_known_fields(self):
        for key in ('geometryAccepted','normativeAccepted','viewerBindingVerified','sourceAccuracyVerified','adjacencyAccepted'):
            for val in (True,1,'false',{}):
                e,m,v=fixture(); v[key]=val
                with self.subTest(key=key,val=val): self.assertFalse(check(e,m,v,'synthetic-session')['bindingConsistent'])

    def test_malformed_inputs_rejected_without_crash(self):
        for value in (None,[],True,{},'x',float('inf'),{'x':object()}):
            for position in (0,1,2):
                args=list(fixture()); args[position]=value
                with self.subTest(value=str(value),position=position): self.assertFalse(check(*args,'synthetic-session')['bindingConsistent'])

if __name__ == '__main__': unittest.main()

import copy,hashlib,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from release_common import ROOT,validate_receipt,sha
from normalize_lock import normalize

class ReleaseGates(unittest.TestCase):
    def fixture(self):
        identity={'sourceCommit':'a'*40,'target':'linux-x64','abi':'glibc-2.35','payloadFormatVersion':1,'lockfileSha256':sha(ROOT/'runtime/package-lock.json'),'integrationPatchSha256':sha(ROOT/'patches/integration.json'),'nodeArchiveSha256':json.loads((ROOT/'node-checksums.json').read_text())['node-v24.22.0-linux-x64.tar.xz'],'payloadSha256':'d'*64}
        full=hashlib.sha256(json.dumps(identity,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        m={'product':'devneya','version':'0.1.0','buildId':full[:20],'fullIdentity':full,'identity':identity,'target':'linux-x64','sourceCommit':'a'*40,'nodeVersion':'24.22.0','dshVersion':'0.2.0-rc.2','tuiVersion':'0.15.0','releaseEligible':True}
        spec=json.loads((ROOT/'tests/scenarios.json').read_text())
        r={'buildId':m['buildId'],'sourceCommit':m['sourceCommit'],'target':'linux-x64','binarySha256':'b'*64,'passed':True,'scenarios':[{'scenario':k,'pass':True,'buildId':m['buildId'],'sourceCommit':m['sourceCommit'],'target':'linux-x64','durationMs':1,'actualResult':'observed','expectedResult':v} for k,v in spec.items()]}
        return m,r
    def test_complete_receipt_and_exact_source(self):
        m,r=self.fixture();validate_receipt(m,r,'linux-x64',m['sourceCommit'])
        with self.assertRaises(AssertionError):validate_receipt(m,r,'linux-x64','c'*40)
    def test_missing_failed_duplicate_and_false_aggregate_rejected(self):
        for mutation in ['missing','failed','duplicate','aggregate']:
            m,r=self.fixture()
            if mutation=='missing':r['scenarios'].pop()
            elif mutation=='failed':r['scenarios'][0]['pass']=False
            elif mutation=='duplicate':r['scenarios'].append(copy.deepcopy(r['scenarios'][0]))
            else:r['passed']=False
            with self.assertRaises(AssertionError):validate_receipt(m,r,'linux-x64')
    def test_candidate_and_identity_mismatch_rejected(self):
        m,r=self.fixture();m['releaseEligible']=False
        with self.assertRaises(AssertionError):validate_receipt(m,r,'linux-x64')
    def test_recomputed_identity_cannot_substitute_another_build_input(self):
        for key in ['sourceCommit','target','abi','nodeArchiveSha256','lockfileSha256','integrationPatchSha256','payloadFormatVersion']:
            m,r=self.fixture();m['identity'][key]=2 if key=='payloadFormatVersion' else 'e'*64
            full=hashlib.sha256(json.dumps(m['identity'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
            m['fullIdentity']=full;m['buildId']=r['buildId']=full[:20]
            with self.assertRaises(AssertionError):validate_receipt(m,r,'linux-x64')
        m,r=self.fixture();m['fullIdentity']='0'*64
        with self.assertRaises(AssertionError):validate_receipt(m,r,'linux-x64')
    def test_metadata_normalization_preserves_every_artifact_identity(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'lock.json';original=json.loads((ROOT/'runtime/package-lock.json').read_text());p.write_text(json.dumps(original))
            normalize(p);self.assertEqual(json.loads(p.read_text()),original)
            changed=copy.deepcopy(original)
            prefix='node_modules/@deepseek-harness-tui/dsh-tui/node_modules/@dsh-std/'
            for name,spec in changed['packages'].items():
                if name.startswith(prefix):
                    for dep in spec.get('dependencies',{}):spec['dependencies'][dep]='workspace:*'
            p.write_text(json.dumps(changed));normalize(p);self.assertEqual(json.loads(p.read_text()),original)

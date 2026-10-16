"""Shared fail-closed release identity and acceptance validation."""
import hashlib,json,re,stat,tarfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CONFIG=json.loads((ROOT/'build.json').read_text())

def sha(file):
    with file.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def validate_receipt(manifest,receipt,target,source=None,allow_candidate=False):
    required=json.loads((ROOT/'tests/scenarios.json').read_text())
    assert manifest['product']=='devneya' and manifest['version']==CONFIG['version']
    assert manifest['target']==target and receipt['target']==target
    assert receipt['buildId']==manifest['buildId'] and receipt['sourceCommit']==manifest['sourceCommit']
    if source:assert manifest['sourceCommit']==source
    assert manifest['releaseEligible'] is True or allow_candidate,'Candidate builds cannot be published'
    inputs=manifest['identity']
    assert inputs['sourceCommit']==manifest['sourceCommit'] and inputs['target']==target
    assert re.fullmatch('[0-9a-f]{40}',manifest['sourceCommit'])
    assert inputs['payloadFormatVersion']==CONFIG['payloadFormatVersion']
    assert inputs['abi']==('glibc-2.35' if target.startswith('linux') else CONFIG['targets'][target]['baseline'])
    assert inputs['lockfileSha256']==sha(ROOT/'runtime/package-lock.json')
    assert inputs['integrationPatchSha256']==sha(ROOT/'patches/integration.json')
    suffix={'windows-x64':'win-x64.zip'}.get(target,target+('.tar.xz' if target.startswith('linux') else '.tar.gz'))
    checksums=json.loads((ROOT/'node-checksums.json').read_text())
    assert inputs['nodeArchiveSha256']==checksums[f'node-v{CONFIG["node"]}-{suffix}']
    assert re.fullmatch('[0-9a-f]{64}',inputs['payloadSha256'])
    identity=json.dumps(manifest['identity'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
    full=hashlib.sha256(identity).hexdigest()
    assert full==manifest['fullIdentity'] and manifest['buildId']==full[:20]
    assert manifest['nodeVersion']==CONFIG['node'] and manifest['dshVersion']==CONFIG['dsh'] and manifest['tuiVersion']==CONFIG['tui']
    scenarios=receipt['scenarios'];names=[s['scenario'] for s in scenarios]
    expected=list(required)
    if target=='windows-x64':expected.append('standard-user-bootstrap')
    assert len(names)==len(set(names)) and set(names)==set(expected),'Incomplete or duplicate acceptance scenarios'
    for result in scenarios:
        assert result['pass'] is True and result['actualResult'] and result['expectedResult'] and result['durationMs']>=0,result['scenario']
        assert result['buildId']==manifest['buildId'] and result['sourceCommit']==manifest['sourceCommit'] and result['target']==target
    assert receipt['passed'] is True
    assert re.fullmatch('[0-9a-f]{64}',receipt['binarySha256'])

def read_archive(file):
    if file.name.endswith('.zip'):
        with zipfile.ZipFile(file) as archive:
            names=archive.namelist();assert len(names)==len(set(names))
            assert all(stat.S_ISREG(item.external_attr>>16) for item in archive.infolist())
            manifest=json.loads(archive.read('build-manifest.json'));receipt=json.loads(archive.read('acceptance-report.json'))
            binary='devneya.exe';data=archive.read(binary)
    else:
        with tarfile.open(file) as archive:
            names=archive.getnames();assert len(names)==len(set(names))
            assert all(item.isfile() for item in archive.getmembers())
            manifest=json.load(archive.extractfile('build-manifest.json'));receipt=json.load(archive.extractfile('acceptance-report.json'))
            binary='devneya';data=archive.extractfile(binary).read()
    for name in names:
        assert not name.startswith(('/', '\\')) and '\\' not in name and ':' not in name and '..' not in name.split('/')
    assert hashlib.sha256(data).hexdigest()==receipt['binarySha256']
    assert {'LICENSE','NODE_LICENSE','THIRD_PARTY_NOTICES.txt','sbom.cdx.json','build-manifest.json','acceptance-report.json',binary}<=set(names)
    return manifest,receipt

def validate_source_bundle(file, source, allow_candidate=False):
    from source_bundle import entries
    rows=entries(json.loads((ROOT/'third_party/native-sources.json').read_text()))
    expected={'archives/'+row['archive']:row['sha256'] for row in rows}
    expected.update({'third_party/'+p.relative_to(ROOT/'third_party').as_posix():sha(p) for p in (ROOT/'third_party').rglob('*') if p.is_file()})
    seen=set()
    with tarfile.open(file) as archive:
        for item in archive:
            assert item.isfile() and item.name not in seen,'Unexpected corresponding-source entry'
            seen.add(item.name)
            stream=archive.extractfile(item)
            if item.name=='source-manifest.json':
                manifest=json.load(stream)
                assert manifest['schemaVersion']==1 and manifest['product']==CONFIG['product'] and manifest['version']==CONFIG['version']
                assert manifest['sourceCommit']==source and (manifest['releaseEligible'] is True or allow_candidate)
                assert manifest['indexSha256']==sha(ROOT/'third_party/native-sources.json')
            else:
                assert item.name in expected,'Unknown corresponding-source file'
                assert hashlib.file_digest(stream,'sha256').hexdigest()==expected[item.name],'Corresponding-source content differs'
    assert seen==set(expected)|{'source-manifest.json'},'Incomplete corresponding-source archive'

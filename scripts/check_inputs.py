#!/usr/bin/env python3
import json
import re
import hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
b=json.loads((ROOT/'build.json').read_text());p=json.loads((ROOT/'runtime/package.json').read_text());lock=json.loads((ROOT/'runtime/package-lock.json').read_text())
assert (b['version'],b['dsh'],b['tui'],b['node'],b['npm'],b['go'],b['python'])==('0.1.0','0.2.0-rc.2','0.15.0','24.22.0','11.19.1','1.27.2','3.14.4')
assert p['dependencies']==lock['packages']['']['dependencies']
for name,spec in lock['packages'].items():
 if re.search(r'(?:^|/)node_modules/@deepseek-ai/dsh-[^/]+$',name):assert spec['version']=='0.2.0-rc.2',name
 if name and not spec.get('inBundle'):
  assert spec.get('integrity','').startswith('sha512-'),name
  assert spec.get('resolved','').startswith('https://registry.npmjs.org/'),name
assert all(re.fullmatch('[0-9a-f]{64}',x) for x in json.loads((ROOT/'node-checksums.json').read_text()).values())
assert not any(k in p['overrides'] for k in ['resolve.exports'])
assert json.loads((ROOT/'tests/package.json').read_text())['dependencies']['node-pty']=='1.1.0'
assert all(re.fullmatch('[0-9a-f]{40}', b[k]) for k in ['dshSource','tuiSource'])
assert set(b['linuxAcceptanceImages'])=={'linux-x64','linux-arm64'}
assert all(re.fullmatch(r'docker.io/library/ubuntu@sha256:[0-9a-f]{64}',image) for image in b['linuxAcceptanceImages'].values())
from source_bundle import entries
entries(json.loads((ROOT/'third_party/native-sources.json').read_text()))
for record in json.loads((ROOT/'third_party/origins.json').read_text())['files']:
 file=ROOT/'third_party'/record['file'];assert file.resolve().is_relative_to((ROOT/'third_party').resolve())
 assert not file.is_symlink() and hashlib.sha256(file.read_bytes()).hexdigest()==record['sha256'],record['file']
print('Pinned build inputs and frozen dependency identities verified')

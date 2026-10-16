#!/usr/bin/env python3
"""Publish only a complete verified draft; never replace published assets."""
import json,os,shutil,subprocess,time
from pathlib import Path
from release_common import CONFIG,ROOT,sha
GH='/snap/gh/current/gh' if Path('/snap/gh/current/gh').exists() else shutil.which('gh')
REPO=CONFIG['repository'];TAG=os.environ['RELEASE_TAG'];assert TAG=='v'+CONFIG['version']

def gh(*args,allow_missing=False):
    p=subprocess.run([GH,*args],cwd=ROOT,text=True,capture_output=True)
    if p.returncode:
        if allow_missing and '404' in p.stderr:return None
        raise RuntimeError('GitHub command failed: '+' '.join(args[:3])+': '+p.stderr)
    return p.stdout

gh('auth','status')
# This settings endpoint requires Administration:read, which GITHUB_TOKEN
# cannot request. The release review audits it with an administrator's CLI.
# Draft assembly and the no-replacement rule work under either policy.
# https://docs.github.com/en/rest/repos/repos#check-if-immutable-releases-are-enabled-for-a-repository
try:
    immutable=json.loads(gh('api',f'repos/{REPO}/immutable-releases'))
except RuntimeError as error:
    if not any(status in str(error) for status in ['HTTP 403','HTTP 404']):raise
    print('Immutable settings API requires Administration:read; use the pre-tag administrator audit. No policy value is inferred.')
else:
    print('Immutable releases:',bool(immutable['enabled']),'enforced by owner:',bool(immutable['enforced_by_owner']))
release=gh('api',f'repos/{REPO}/releases/tags/{TAG}',allow_missing=True)
if release:
    release=json.loads(release)
    if not release['draft']:raise SystemExit('A published release already exists; its assets will not be replaced')
else:
    gh('release','create',TAG,'--repo',REPO,'--verify-tag','--draft','--title',f'devneya {CONFIG["version"]}','--notes-file',str(ROOT/'release-notes.md'))
    release=json.loads(gh('api',f'repos/{REPO}/releases/tags/{TAG}'))
assets={p.name:p for p in (ROOT/'release-assets').iterdir() if p.is_file()}
assert 'SHA256SUMS' in assets and 'provenance.sigstore.json' in assets
existing={a['name']:a for a in release['assets']};assert set(existing)<=set(assets),'Draft has unexpected assets'
for name,file in sorted(assets.items()):
    if name in existing:
        assert existing[name].get('digest')=='sha256:'+sha(file),'Draft asset differs; refusing replacement'
    else:gh('release','upload',TAG,str(file),'--repo',REPO)
# GitHub may compute the digest asynchronously. Never publish on names alone.
for attempt in range(30):
    assembled=json.loads(gh('api',f'repos/{REPO}/releases/{release["id"]}'))
    uploaded={a['name']:a for a in assembled['assets']}
    if set(uploaded)==set(assets) and all(uploaded[n].get('digest')=='sha256:'+sha(f) for n,f in assets.items()):break
    time.sleep(2)
else:raise SystemExit('Uploaded asset set or digest verification failed; draft remains unpublished')
gh('release','edit',TAG,'--repo',REPO,'--draft=false','--notes-file',str(ROOT/'release-notes.md'))
print(f'https://github.com/{REPO}/releases/tag/{TAG}')

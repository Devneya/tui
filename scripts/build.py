#!/usr/bin/env python3
"""Native builder: verified Node + frozen npm tree -> embedded ZIP -> Go launcher."""
import argparse
import hashlib
import json
import os
import platform
import shutil
import stat
import subprocess
import sys
import tarfile
import time
import urllib.request
import zipfile
from pathlib import Path

from apply_patches import apply

if not __debug__:
    raise RuntimeError('Optimized Python is unsupported: required build checks must remain enabled')

REPO = Path(__file__).resolve().parents[1]
BUILD = REPO / '.build'
CONFIG = json.loads((REPO / 'build.json').read_text())
CHECKSUMS = json.loads((REPO / 'node-checksums.json').read_text())

def sha(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()

def run(args, *, cwd=REPO, env=None):
    print('+', ' '.join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), cwd=cwd, env=env, check=True)

def read(args):
    return subprocess.check_output(list(map(str, args)), cwd=REPO, text=True).strip()

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

def node_distribution(target):
    suffix = {'windows-x64': 'win-x64.zip'}.get(target, target + ('.tar.xz' if target.startswith('linux-') else '.tar.gz'))
    name = f'node-v{CONFIG["node"]}-{suffix}'
    archive = BUILD / 'downloads' / name
    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        temporary = archive.with_suffix('.download')
        with urllib.request.urlopen(f'https://nodejs.org/dist/v{CONFIG["node"]}/{name}', timeout=180) as response, temporary.open('wb') as dest:
            shutil.copyfileobj(response, dest)
        temporary.replace(archive)
    if sha(archive) != CHECKSUMS[name]:
        raise ValueError('Node distribution checksum mismatch')
    unpack = BUILD / ('node-' + target)
    if unpack.exists():
        shutil.rmtree(unpack)
    unpack.mkdir()
    if name.endswith('.zip'):
        with zipfile.ZipFile(archive) as z:
            for entry in z.infolist():
                if entry.filename.startswith(('/', '\\')) or '..' in Path(entry.filename).parts or ':' in entry.filename:
                    raise ValueError('Unsafe Node archive path')
            z.extractall(unpack)
    else:
        with tarfile.open(archive) as t:
            t.extractall(unpack, filter='data')
    node_root, = list(unpack.iterdir())
    node = node_root / ('node.exe' if target.startswith('windows') else 'bin/node')
    npm = node_root / ('node_modules/npm/bin/npm-cli.js' if target.startswith('windows') else 'lib/node_modules/npm/bin/npm-cli.js')
    assert read([node, '--version']) == 'v' + CONFIG['node']
    assert read([node, npm, '--version']) == CONFIG['npm']
    return node_root, node, npm, CHECKSUMS[name]

def copy_materialized(source, dest, allowed):
    """Materialize internal npm .bin links, reject escaping or cyclic links."""
    allowed = allowed.resolve()
    def copy(src, dst, ancestors):
        resolved = src.resolve(strict=True)
        if not resolved.is_relative_to(allowed):
            raise ValueError(f'Staging link escapes installed tree: {src.relative_to(allowed)}')
        if resolved in ancestors:
            raise ValueError(f'Cyclic source link: {src}')
        if resolved.is_dir():
            dst.mkdir(parents=True, exist_ok=True)
            for child in sorted(resolved.iterdir()):
                copy(child, dst / child.name, ancestors | {resolved})
        elif resolved.is_file():
            shutil.copyfile(resolved, dst)
            os.chmod(dst, 0o755 if resolved.stat().st_mode & 0o111 else 0o644)
        else:
            raise ValueError(f'Nonregular staging file: {src}')
    copy(source, dest, set())

def inventory(app, legal):
    components, notices = [], []
    for manifest in sorted((app / 'node_modules').rglob('package.json')):
        # Actual npm package roots only; avoid nested test/config fixtures.
        rel = manifest.parent.relative_to(app / 'node_modules')
        parts = rel.parts
        if not parts or not (len(parts) == 1 or parts[-2] == 'node_modules' or parts[-2].startswith('@')):
            continue
        try:
            pkg = json.loads(manifest.read_text(encoding='utf-8'))
        except (ValueError, UnicodeError):
            continue
        if not pkg.get('name') or not pkg.get('version'):
            continue
        component = {'type': 'library', 'name': pkg['name'], 'version': pkg['version'], 'bom-ref': 'npm:' + str(rel), 'purl': 'pkg:npm/' + pkg['name'].replace('@', '%40', 1) + '@' + pkg['version'], 'properties': [{'name':'devneya:installedPath','value':str(rel).replace('\\','/')}]}
        license = pkg.get('license', 'UNDECLARED')
        if isinstance(license, str):
            component['licenses'] = [{'license': {'name': license}}]
        components.append(component)
        notices.append(f'\n\n=== {pkg["name"]}@{pkg["version"]} ({license}) ===\n')
        for file in sorted(manifest.parent.iterdir()):
            if file.is_file() and file.name.lower().startswith(('license', 'licence', 'copying', 'notice', 'copyright')):
                notices.append(file.read_text(encoding='utf-8', errors='replace'))
        if pkg['name'].startswith('@img/sharp-libvips-'):
            if pkg['version'] != '1.3.4':
                raise ValueError('Native source/notices inventory must be reviewed for the changed libvips distribution')
            notices.append((manifest.parent/'README.md').read_text(encoding='utf-8'))
            actual = json.loads((manifest.parent/'versions.json').read_text())
            native = json.loads((REPO/'third_party/native-sources.json').read_text())
            sources = {row['name']:row for row in native['components']}
            for name, version in actual.items():
                if sources[name]['version'] != version:
                    raise ValueError('Native dependency lacks matching corresponding source: '+name)
                components.append({'type':'library','name':name,'version':version,'bom-ref':'native:'+name,'externalReferences':[{'type':'distribution','url':sources[name]['source']}],'properties':[{'name':'devneya:linkedBy','value':pkg['name']}]})
    origins = json.loads((REPO/'third_party/origins.json').read_text())
    for record in origins['files']:
        file = REPO/'third_party'/record['file']
        if sha(file) != record['sha256']:
            raise ValueError('Third-party notice preimage changed: '+record['file'])
        if 'LICENSE' in file.name.upper() or 'COPYING' in file.name.upper() or 'NOTICES' in file.name.upper() or file.name in ['GPL-3.0.txt','LGPL-3.0.txt']:
            notices.append(f'\n\n=== {record["component"]} {record["version"]} — {record["file"]} ===\n'+file.read_text(encoding='utf-8'))
    for name, version, license in [('github.com/gofrs/flock','v0.13.1','BSD-3-Clause'),('golang.org/x/sys','v0.47.0','BSD-3-Clause'),('Go runtime',CONFIG['go'],'BSD-3-Clause'),('Node.js',CONFIG['node'],'MIT')]:
        components.append({'type':'library','name':name,'version':version,'bom-ref':'runtime:'+name,'licenses':[{'license':{'id':license}}]})
    legal.mkdir(parents=True, exist_ok=True)
    shutil.copytree(REPO/'third_party',legal/'third_party',dirs_exist_ok=True)
    (legal / 'THIRD_PARTY_NOTICES.txt').write_text(''.join(notices), encoding='utf-8')
    sbom = {'bomFormat':'CycloneDX','specVersion':'1.6','version':1,'components':components}
    write_json(legal / 'sbom.cdx.json', sbom)
    return components

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', required=True, choices=CONFIG['targets'])
    parser.add_argument('--candidate', action='store_true', help='allow dirty local source, ineligible for publication')
    args = parser.parse_args()
    target = args.target
    native_os = {'linux':'linux','darwin':'darwin','win32':'windows'}.get(sys.platform)
    native_arch = {'x86_64':'x64','amd64':'x64','aarch64':'arm64','arm64':'arm64'}.get(platform.machine().lower())
    if target != f'{native_os}-{native_arch}':
        raise ValueError('Build each target on its native OS and CPU')
    if platform.python_version() != CONFIG['python']:
        raise ValueError('Wrong Python version')
    go = os.environ.get('DEVNEYA_GO') or ('/snap/go/current/bin/go' if Path('/snap/go/current/bin/go').exists() else shutil.which('go'))
    if read([go, 'version']).split()[2] != 'go' + CONFIG['go']:
        raise ValueError('Wrong Go version')
    dirty = bool(read(['git', 'status', '--porcelain', '--untracked-files=normal']))
    if dirty and not args.candidate:
        raise ValueError('Release input must be a clean committed source tree')
    source = read(['git', 'rev-parse', 'HEAD'])
    timestamp = int(read(['git', 'show', '-s', '--format=%ct', 'HEAD']))
    node_root, node, npm, node_sha = node_distribution(target)
    install = BUILD / ('install-' + target)
    if install.exists():
        shutil.rmtree(install)
    install.mkdir(parents=True)
    for name in ['package.json', 'package-lock.json']:
        shutil.copyfile(REPO / 'runtime' / name, install / name)
    lock_before = sha(install / 'package-lock.json')
    env = {k:v for k,v in os.environ.items() if not k.lower().startswith('npm_config_')}
    env.pop('NODE_OPTIONS', None); env.pop('NODE_PATH', None)
    builder_home=BUILD/('builder-home-'+target);builder_home.mkdir(parents=True,exist_ok=True,mode=0o700)
    builder_tmp=BUILD/('builder-tmp-'+target);builder_tmp.mkdir(parents=True,exist_ok=True,mode=0o700)
    env.update(HOME=str(builder_home),USERPROFILE=str(builder_home),XDG_CACHE_HOME=str(builder_home/'.cache'),TMPDIR=str(builder_tmp),TMP=str(builder_tmp),TEMP=str(builder_tmp))
    if target.startswith('windows'):
        env.update(APPDATA=str(builder_home/'AppData/Roaming'),LOCALAPPDATA=str(builder_home/'AppData/Local'))
    env.update(PATH=str(node.parent) + os.pathsep + env.get('PATH', ''), npm_config_cache=str(BUILD / 'npm-cache'), npm_config_userconfig=str(REPO / 'runtime' / 'builder.npmrc'), npm_config_globalconfig=str(REPO / 'runtime' / 'global.npmrc'))
    run([node, npm, 'ci', '--strict-peer-deps', '--omit=dev', '--include=optional', '--no-audit', '--no-fund', '--strict-allow-scripts'], cwd=install, env=env)
    if sha(install / 'package-lock.json') != lock_before:
        raise ValueError('Frozen install modified lockfile')
    apply(install / 'node_modules', REPO / 'artifacts' / target / 'integration.diff')
    run([node, npm, 'ls', '--all'], cwd=install, env=env)
    run([node, REPO / 'scripts/verify_dependencies.mjs', install], env=env)
    run([node, '--test', '--test-isolation=none', REPO / 'tests/integration-patches.test.mjs'], env={**env,'DEVNEYA_TEST_APP':str(install)})
    stage = BUILD / ('stage-' + target)
    if stage.exists():
        shutil.rmtree(stage)
    (stage / 'bin').mkdir(parents=True)
    copy_materialized(install, stage / 'app', install)
    shutil.copyfile(REPO / 'runtime/entry.mjs', stage / 'app/entry.mjs')
    shutil.copyfile(node, stage / 'bin' / node.name)
    os.chmod(stage / 'bin' / node.name, 0o755)
    (stage / 'bin/dsh').write_text('#!/bin/sh\nDEVNEYA_BIN_DIR=$(CDPATH= cd -- "${0%/*}" && pwd)\nexec "$DEVNEYA_BIN_DIR/node" "$DEVNEYA_BIN_DIR/../app/node_modules/@deepseek-ai/dsh/lib/bin.js" "$@"\n')
    os.chmod(stage / 'bin/dsh', 0o755)
    (stage / 'bin/dsh.cmd').write_bytes(b'@echo off\r\n"%~dp0node.exe" "%~dp0..\\app\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js" %*\r\n')
    legal = stage / 'legal'
    components = inventory(stage / 'app', legal)
    run([sys.executable, REPO/'scripts/native_inventory.py', stage, '--target', target, '--output', REPO/'artifacts'/target/'native-inventory.json'])
    shutil.copyfile(node_root / 'LICENSE', legal / 'NODE_LICENSE')
    shutil.copyfile(REPO / 'LICENSE', legal / 'LICENSE')
    files = {}
    folded = set()
    for file in sorted(stage.rglob('*')):
        if file.is_symlink():
            raise ValueError('Residual staged symlink')
        if file.is_dir():
            continue
        name = file.relative_to(stage).as_posix()
        if name.casefold() in folded:
            raise ValueError('Windows filename collision: ' + name)
        folded.add(name.casefold())
        files[name] = {'size':file.stat().st_size,'sha256':sha(file),'mode':0o755 if file.stat().st_mode & 0o111 else 0o644}
    generated = REPO / 'internal/payload/generated'
    generated.mkdir(parents=True, exist_ok=True)
    payload = generated / 'payload.zip'
    zip_time = time.gmtime(max(timestamp, 315532800))[:6]
    with zipfile.ZipFile(payload, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, spec in files.items():
            info = zipfile.ZipInfo(name, date_time=zip_time)
            info.create_system=3; info.external_attr=(stat.S_IFREG | spec['mode']) << 16; info.compress_type=zipfile.ZIP_DEFLATED
            with (stage / name).open('rb') as source_file, archive.open(info, 'w', force_zip64=True) as dest:
                shutil.copyfileobj(source_file, dest)
    patch_sha = hashlib.sha256((REPO / 'patches/integration.json').read_bytes()).hexdigest()
    identity = {'sourceCommit':source,'target':target,'abi':'glibc-2.35' if target.startswith('linux') else CONFIG['targets'][target]['baseline'],'nodeArchiveSha256':node_sha,'lockfileSha256':lock_before,'integrationPatchSha256':patch_sha,'payloadSha256':sha(payload),'payloadFormatVersion':CONFIG['payloadFormatVersion']}
    full = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    meta = {'schemaVersion':1,'product':CONFIG['product'],'version':CONFIG['version'],'buildId':full[:20],'fullIdentity':full,'sourceCommit':source,'target':target,'nodeVersion':CONFIG['node'],'dshVersion':CONFIG['dsh'],'tuiVersion':CONFIG['tui'],'identity':identity,'files':files,'releaseEligible':not dirty and not args.candidate,'toolchain':{'go':CONFIG['go'],'python':platform.python_version(),'npm':CONFIG['npm']},'runner':{'os':platform.platform(),'image':os.environ.get('ImageOS','local'),'imageVersion':os.environ.get('ImageVersion','local')},'baseline':CONFIG['targets'][target]['baseline'],'patchesSha256':patch_sha,'dependencyCount':len(components)}
    write_json(generated / 'metadata.json', meta)
    out = REPO / 'dist' / target
    out.mkdir(parents=True, exist_ok=True)
    binary = out / ('devneya.exe' if target.startswith('windows') else 'devneya')
    goenv = {**env,'CGO_ENABLED':'0','GOTOOLCHAIN':'local','GOPATH':str(BUILD/'go'),'GOCACHE':str(BUILD/'go-cache'),'GOOS':target.split('-')[0],'GOARCH':'amd64' if target.endswith('x64') else 'arm64'}
    run([go,'build','-mod=readonly','-trimpath','-tags=release','-ldflags=-s -w -buildid=','-o',binary,'./cmd/devneya'], env=goenv)
    if target.startswith('darwin'):
        run(['codesign','--force','--sign','-',binary])
        run(['codesign','--verify','--strict',binary])
    run([sys.executable, REPO/'scripts/native_inventory.py', out, '--target', target, '--output', REPO/'artifacts'/target/'launcher-native-inventory.json'])
    shutil.copyfile(generated / 'metadata.json', out / 'build-manifest.json')
    # Replace this generated notice tree. copytree preserves upstream read-only
    # license modes, which would prevent a later build from overwriting it.
    if (out/'legal').exists():
        shutil.rmtree(out/'legal')
    shutil.copytree(legal, out / 'legal')
    run([binary,'--version'])
    print(f'Built {binary}; acceptance and packaging are separate required gates', flush=True)

if __name__ == '__main__':
    main()

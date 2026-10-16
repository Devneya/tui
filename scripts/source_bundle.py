#!/usr/bin/env python3
"""Assemble checked corresponding sources; never execute downloaded source."""
import argparse
import concurrent.futures
import gzip
import hashlib
import json
import os
import re
import subprocess
import tarfile
import urllib.request
from pathlib import Path

from release_common import CONFIG, ROOT, sha


def entries(index):
    result = [*index['components'], index['packagingSource'], *index['patches'], *index['rustCrates']]
    seen = set()
    for row in result:
        name = row['archive']
        if not re.fullmatch(r'(?:crates/)?[A-Za-z0-9_+.-]+', name) or Path(name).name in ('.', '..') or name.casefold() in seen:
            raise ValueError('Invalid or duplicate corresponding-source archive name')
        seen.add(name.casefold())
        if not row['source'].startswith('https://') or not re.fullmatch('[0-9a-f]{64}', row['sha256']):
            raise ValueError('Unpinned corresponding source: '+row['name'])
    return result


def download(row, cache):
    file = cache/row['archive']
    if not file.exists():
        file.parent.mkdir(parents=True,exist_ok=True)
        temporary = file.with_name(file.name+'.download')
        with urllib.request.urlopen(row['source'], timeout=45) as response, temporary.open('wb') as output:
            while block := response.read(1024*1024):
                output.write(block)
        if sha(temporary) != row['sha256']:
            raise ValueError('Corresponding source checksum mismatch: '+row['name'])
        temporary.replace(file)
    if not file.is_file() or file.is_symlink() or sha(file) != row['sha256']:
        raise ValueError('Cached source checksum mismatch: '+row['name'])
    return file


def collect_notices(rows, cache):
    """Preparation only: preserve original license bytes with archive origins."""
    directory = ROOT/'third_party'
    path = directory/'origins.json'
    origins = json.loads(path.read_text())
    known = {record['file'] for record in origins['files']}
    count = 0
    for row in rows:
        if row['archive'].endswith('.patch'):
            continue
        with tarfile.open(cache/row['archive']) as archive:
            for member in archive:
                name = Path(member.name).name
                if not member.isfile() or member.size > 512*1024 or not re.fullmatch(r'(?:LICEN[CS]E|COPYING|COPYRIGHT|NOTICE|PATENTS|OFL)(?:[._-].*)?',name,re.I):
                    continue
                prefix = hashlib.sha256(member.name.encode()).hexdigest()[:12]
                safe_basename = re.sub(r'[^A-Za-z0-9_.-]', '_', name)
                relative = f'native-licenses/{row["archive"]}/{prefix}-{safe_basename}'
                file = directory/relative
                data = archive.extractfile(member).read()
                if relative in known:
                    if sha(file) != hashlib.sha256(data).hexdigest():
                        raise ValueError('Existing native notice differs: '+relative)
                    continue
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(data)
                origins['files'].append({'file':relative,'component':row['name'],'version':row.get('version','source patch'),'origin':row['source'],'archiveMember':member.name,'sha256':hashlib.sha256(data).hexdigest()})
                known.add(relative)
                count += 1
    path.write_text(json.dumps(origins,indent=2)+'\n')
    print(f'Preserved {count} additional native source license files',flush=True)


def build(rows, cache, candidate):
    source = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    dirty = bool(subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip())
    if dirty and not candidate:
        raise ValueError('Corresponding-source release requires a clean committed checkout')
    timestamp = int(subprocess.check_output(['git','show','-s','--format=%ct','HEAD'],cwd=ROOT,text=True))
    out = ROOT/'dist/sources'
    out.mkdir(parents=True,exist_ok=True)
    manifest = {'schemaVersion':1,'product':CONFIG['product'],'version':CONFIG['version'],'sourceCommit':source,'releaseEligible':not candidate and not dirty,'indexSha256':sha(ROOT/'third_party/native-sources.json')}
    receipt = out/'source-manifest.json'
    receipt.write_text(json.dumps(manifest,indent=2)+'\n')
    files = {'source-manifest.json':receipt}
    files.update({'archives/'+row['archive']:cache/row['archive'] for row in rows})
    files.update({'third_party/'+file.relative_to(ROOT/'third_party').as_posix():file for file in (ROOT/'third_party').rglob('*') if file.is_file()})
    dest = out/f'devneya-v{CONFIG["version"]}-native-sources.tar.gz'
    with dest.open('wb') as output, gzip.GzipFile(filename='',fileobj=output,mode='wb',mtime=timestamp,compresslevel=1) as compressed, tarfile.open(fileobj=compressed,mode='w|') as archive:
        for name,file in sorted(files.items()):
            info = tarfile.TarInfo(name)
            info.size=file.stat().st_size;info.mode=0o644;info.mtime=timestamp;info.uid=info.gid=0;info.uname=info.gname=''
            with file.open('rb') as stream:
                archive.addfile(info,stream)
    dest.with_suffix(dest.suffix+'.sha256').write_text(sha(dest)+'  '+dest.name+'\n')
    print(dest,flush=True)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--candidate',action='store_true')
    p.add_argument('--collect-notices',action='store_true',help='Dependency preparation: update committed license inventory')
    args=p.parse_args()
    rows=entries(json.loads((ROOT/'third_party/native-sources.json').read_text()))
    cache=ROOT/'.build/native-sources';cache.mkdir(parents=True,exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures=[pool.submit(download,row,cache) for row in rows]
        for count,result in enumerate(concurrent.futures.as_completed(futures),1):
            result.result()
            if count%25==0 or count==len(rows):
                print(f'Checked corresponding source {count}/{len(rows)}',flush=True)
    if args.collect_notices:
        collect_notices(rows,cache)
    else:
        build(rows,cache,args.candidate)


if __name__=='__main__':
    main()

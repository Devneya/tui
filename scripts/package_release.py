#!/usr/bin/env python3
import argparse,gzip,json,os,shutil,stat,subprocess,tarfile,time,zipfile
from pathlib import Path
from release_common import CONFIG,ROOT,sha,validate_receipt

p=argparse.ArgumentParser();p.add_argument('--target',required=True,choices=CONFIG['targets']);p.add_argument('--candidate',action='store_true');args=p.parse_args()
source=ROOT/'dist'/args.target
manifest=json.loads((source/'build-manifest.json').read_text());receipt=json.loads((source/'acceptance-report.json').read_text())
validate_receipt(manifest,receipt,args.target,allow_candidate=args.candidate)
binary=source/('devneya.exe' if args.target.startswith('windows') else 'devneya')
assert sha(binary)==receipt['binarySha256'],'Executable changed since acceptance'
files={binary.name:binary,'build-manifest.json':source/'build-manifest.json','acceptance-report.json':source/'acceptance-report.json'}
for name in ['LICENSE','THIRD_PARTY_NOTICES.txt','sbom.cdx.json','NODE_LICENSE']:files[name]=source/'legal'/name
for file in (source/'legal/third_party').rglob('*'):
    if file.is_file():files['third_party/'+file.relative_to(source/'legal/third_party').as_posix()]=file
# The complete dependency tree also carries every package's original notices.
timestamp=int(subprocess.check_output(['git','show','-s','--format=%ct',manifest['sourceCommit']],cwd=ROOT,text=True).strip())
out=ROOT/'dist/packages';out.mkdir(parents=True,exist_ok=True)
name=f'devneya-v{CONFIG["version"]}-{args.target}'
if args.target.startswith('windows'):
    dest=out/(name+'.zip')
    with zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name,file in sorted(files.items()):
            info=zipfile.ZipInfo(name,time.gmtime(max(timestamp,315532800))[:6]);info.create_system=3;info.external_attr=(stat.S_IFREG|0o644)<<16;info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,file.read_bytes())
else:
    dest=out/(name+'.tar.gz')
    with dest.open('wb') as stream,gzip.GzipFile(filename='',fileobj=stream,mode='wb',mtime=timestamp,compresslevel=9) as gz,tarfile.open(fileobj=gz,mode='w|') as archive:
        for name,file in sorted(files.items()):
            info=tarfile.TarInfo(name);info.size=file.stat().st_size;info.mtime=timestamp;info.mode=0o755 if name=='devneya' else 0o644;info.uid=info.gid=0;info.uname=info.gname=''
            with file.open('rb') as f:archive.addfile(info,f)
(dest.with_suffix(dest.suffix+'.sha256')).write_text(sha(dest)+'  '+dest.name+'\n')
print(dest)

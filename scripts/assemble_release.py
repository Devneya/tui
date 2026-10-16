#!/usr/bin/env python3
import json,os,shutil
from pathlib import Path
from release_common import CONFIG,ROOT,sha,read_archive,validate_receipt,validate_source_bundle
source=os.environ['RELEASE_SOURCE'];tag=os.environ['RELEASE_TAG'];assert tag=='v'+CONFIG['version']
windows=json.loads((ROOT/'windows-qualification/qualification.json').read_text())
win_ok=os.environ.get('WINDOWS_QUALIFIED')=='true'
assert windows['qualified'] is win_ok,'Windows explicit output and qualification receipt differ'
required={k for k,v in CONFIG['targets'].items() if v['required']};targets=required|({'windows-x64'} if win_ok else set())
assets=ROOT/'release-assets';assets.mkdir(exist_ok=True);assert not list(assets.iterdir()),'Release asset directory must start empty'
receipts=[]
for target in sorted(targets):
    directory=ROOT/'release-input'/('accepted-'+target)
    suffix='.zip' if target.startswith('windows') else '.tar.gz'
    filename=f'devneya-{tag}-{target}{suffix}';file=directory/filename
    checksum=file.with_suffix(file.suffix+'.sha256').read_text().strip();assert checksum==sha(file)+'  '+filename
    manifest,receipt=read_archive(file);validate_receipt(manifest,receipt,target,source)
    shutil.copyfile(file,assets/filename);receipts.append((target,manifest,receipt))
assert set(p.name for p in (ROOT/'release-input').iterdir() if p.name.startswith('accepted-'))=={'accepted-'+t for t in targets},'Unexpected accepted platform artifacts'
sources=ROOT/'source-input'/f'devneya-{tag}-native-sources.tar.gz'
assert sources.with_suffix(sources.suffix+'.sha256').read_text().strip()==sha(sources)+'  '+sources.name
validate_source_bundle(sources,source)
shutil.copyfile(sources,assets/sources.name)
lines=[f'devneya {CONFIG["version"]} packages Chimney {CONFIG["tui"]}, DSH {CONFIG["dsh"]} (explicitly accepted upstream prerelease), and Node {CONFIG["node"]}.','',f'Source: `{source}`.','', 'Download your platform archive, extract the executable and run it from a project directory. Use `/provider` to configure an inference provider.','', 'Accepted native builds:','']
for target,manifest,receipt in receipts:lines.append(f'- {target}: {manifest["baseline"]}; tested on {receipt["os"]}; build `{manifest["buildId"]}`; {len(receipt["scenarios"])} acceptance scenarios passed.')
lines+=['', 'Windows: included as a qualified preview.' if win_ok else windows['reason'],'','macOS binaries are ad-hoc signed and not notarized. No paid signing is supplied for this release.','', 'Application dependencies are embedded. Developer shell tools and optional external services remain separate. Replace the whole executable to update; settings and sessions remain under the documented application root.']
lines+=['',f'Native library corresponding sources and build recipes: `{sources.name}`. Platform archives and each extracted runtime include third-party licenses and notices.']
(ROOT/'release-notes.md').write_text('\n'.join(lines)+'\n')

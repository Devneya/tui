#!/usr/bin/env python3
import json,os,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];tag=os.environ['RELEASE_TAG']
if not re.fullmatch(r'v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)',tag):raise SystemExit('Invalid release tag format')
if tag!='v'+json.loads((root/'build.json').read_text())['version']:raise SystemExit('Tag version differs from committed product version')
subprocess.run(['git','merge-base','--is-ancestor','HEAD','origin/main'],cwd=root,check=True)
source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
if subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip():raise SystemExit('Release source is not clean')
with open(os.environ['GITHUB_OUTPUT'],'a') as out:out.write('source='+source+'\n')

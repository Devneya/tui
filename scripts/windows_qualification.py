#!/usr/bin/env python3
import json,os,platform,subprocess
from pathlib import Path
stages={name:os.environ.get(name.upper()+'_OUTCOME','not-run') for name in ['build','acceptance','package','upload']}
qualified=os.environ.get('QUALIFIED')=='true' and all(v=='success' for v in stages.values())
r={'schemaVersion':1,'target':'windows-x64','qualified':qualified,'preview':True,'os':platform.platform(),'stages':stages,'reason':'All build, acceptance, package and upload stages passed' if qualified else 'Windows omitted: '+', '.join(k+'='+v for k,v in stages.items() if v!='success')}
r['sourceCommit']=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
failure=Path('artifacts/windows-x64/native-inventory-failure.json')
if not qualified and stages['build']=='failure' and failure.exists():
    r['failure']=json.loads(failure.read_text(encoding='utf-8'))
    r['reason']+='; '+r['failure']['reason']
acceptance=Path('dist/windows-x64/acceptance-report.json')
if acceptance.exists():
    r['acceptance']=json.loads(acceptance.read_text(encoding='utf-8'))
p=Path('artifacts/windows-x64/qualification.json');p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(r,indent=2)+'\n')

#!/usr/bin/env python3
import json,os,platform
from pathlib import Path
stages={name:os.environ.get(name.upper()+'_OUTCOME','not-run') for name in ['build','acceptance','package','upload']}
qualified=os.environ.get('QUALIFIED')=='true' and all(v=='success' for v in stages.values())
r={'schemaVersion':1,'target':'windows-x64','qualified':qualified,'preview':True,'os':platform.platform(),'stages':stages,'reason':'All build, acceptance, package and upload stages passed' if qualified else 'Windows omitted: '+', '.join(k+'='+v for k,v in stages.items() if v!='success')}
p=Path('artifacts/windows-x64/qualification.json');p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(r,indent=2)+'\n')

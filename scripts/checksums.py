#!/usr/bin/env python3
import sys
from pathlib import Path
from release_common import sha
root=Path(sys.argv[1]);files=sorted(f for f in root.iterdir() if f.is_file() and f.name!='SHA256SUMS')
assert files
(root/'SHA256SUMS').write_text(''.join(sha(f)+'  '+f.name+'\n' for f in files))

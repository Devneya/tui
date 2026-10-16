#!/usr/bin/env python3
"""Correct only Chimney 0.15.0's ten bundled workspace metadata references.

Run AFTER the pinned npm package-lock-only operation, BEFORE reviewing the lock.
The published tarball URL/integrity and all installed versions remain unchanged.
The matching staged-manifest patch is mandatory before npm ls validation.
"""
import argparse
import json
from pathlib import Path

def normalize(file):
    lock = json.loads(file.read_text())
    packages = lock['packages']
    prefix = 'node_modules/@deepseek-harness-tui/dsh-tui/'
    assert packages[prefix[:-1]]['version'] == '0.15.0'
    changes = 0
    for path, spec in packages.items():
        if not path.startswith(prefix + 'node_modules/@dsh-std/'):
            continue
        for name, version in spec.get('dependencies', {}).items():
            assert version in ('workspace:*', '0.1.0'), (path, name, version)
            assert packages[prefix + 'node_modules/' + name]['version'] == '0.1.0'
            spec['dependencies'][name] = '0.1.0'
            changes += 1
    assert changes == 10, changes
    file.write_text(json.dumps(lock, indent=2) + '\n')

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('lockfile', type=Path)
    normalize(p.parse_args().lockfile)

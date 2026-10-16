#!/usr/bin/env python3
"""Apply exact-version distribution patches only to an isolated installed tree."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

def apply(root: Path, diff_path: Path):
    spec = json.loads((REPO / 'patches/integration.json').read_text(encoding='utf-8'))
    pending = []
    for patch in spec['patches']:
        package = root / patch['package']
        manifest = json.loads((package / 'package.json').read_text(encoding='utf-8'))
        if manifest['version'] != patch['version']:
            raise ValueError(f"Wrong source version: {patch['package']}")
        file = package / patch['path']
        raw = file.read_bytes()
        if hashlib.sha256(raw).hexdigest() != patch['sha256']:
            raise ValueError(f'Patch preimage mismatch: {file}')
        before = raw.decode('utf-8')
        after = before
        for replacement in patch['replacements']:
            a, b = replacement['before'], replacement['after']
            if after.count(a) != 1:
                raise ValueError(f'Non-unique patch anchor: {file}')
            after = after.replace(a, b)
        pending.append((file, before, after, patch))
    # Check all inputs before any mutations.
    diffs = []
    for file, before, after, patch in pending:
        name = patch['package'] + '/' + patch['path']
        diffs.extend(difflib.unified_diff(before.splitlines(True), after.splitlines(True), fromfile='a/' + name, tofile='b/' + name))
        file.write_bytes(after.encode('utf-8'))
    # npm's hidden install cache predates the patched package manifests.
    (root / '.package-lock.json').unlink(missing_ok=True)
    diff_path.parent.mkdir(parents=True, exist_ok=True)
    diff_path.write_text(''.join(diffs), encoding='utf-8')
    return len(pending)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('node_modules', type=Path)
    parser.add_argument('--diff', type=Path, required=True)
    args = parser.parse_args()
    print(f'Patched {apply(args.node_modules.resolve(), args.diff)} version-bound files')

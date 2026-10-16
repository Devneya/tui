# Distribution patches

`integration.json` is the authoritative patch set. Every entry pins its source
package version, entire file SHA-256, and unique replacement anchors. The builder
validates all preimages before modifying its isolated dependency tree and writes
an actual unified diff. `integration.diff` is a review copy, regenerated from a
clean installation. The patch-set SHA-256 is part of the embedded build identity.

- A: owned TUI storage (three published files); real user home is preserved.
- B: block managed update network/download/package-manager paths and present the
  whole-release message at `/update` before any shutdown. Disable the optional
  agent SDK installer in the managed front end. `/restart` is preserved.
- C: use workspace-write and ask as initial Windows defaults. Explicit later
  permission choices remain upstream behavior.
- D: guard both compiled plugin-manager operation entry points before any I/O.
- E: correct ten `workspace:*` references in six bundled `@dsh-std` manifests to
  the exact sibling versions already shipped in Chimney's published tarball
  (`0.1.0`). npm 11.19.1 does not support the unconverted workspace protocol.
  `scripts/normalize_lock.py` makes the corresponding metadata-only correction
  after strict lock preparation. Tarball integrity, source code and component
  versions remain unchanged. No peer enforcement exemption is used.
- G: point working-activity's independent language-file reader at the owned TUI
  root. This preserves live language changes and prevents a Chinese host locale
  or an unrelated upstream preference from overriding the English first launch.
- F: mark the TUI and stock working-activity entry as mandatory in managed builds;
  DSH's default audit otherwise warns and leaves an unusable host running.

The bootstrap calls the RC.2 CLI's exported `runCli`, passing the verified
`resolvedProfile` installation hook through its forwarded profile options, with
`app/package.json` as installation anchor. RC.2's resolver intentionally omits a
profile bundle itself from its dependency fallback; anchoring at DSH alone does
not expose Chimney, which is co-installed by devneya. The application manifest
includes both packages, so the native resolver handles them without a profile
node_modules symlink. This exact RC.2 behavior has a regression test and must be
reverified whenever the upstream version changes.

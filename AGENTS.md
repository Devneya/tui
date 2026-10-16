# AGENTS.md

## Project purpose

Build **devneya**, a terminal application based on **DeepSeek Harness (DSH)**. Version 1 packages an agreed existing TUI with DSH and the required runtime into a self-contained executable.

The source, GitHub Actions workflows, and downloadable GitHub Releases belong in **[Devneya/tui](https://github.com/Devneya/tui)**. The executable is named **`devneya`** on Linux/macOS and **`devneya.exe`** on Windows.

The product brief is [DSH_TUI_BINARY_HANDOFF.md](DSH_TUI_BINARY_HANDOFF.md). It defines the intended experience:

```text
Download the executable → run it from a project directory → configure a provider in the UI → work.
```

Follow that handoff for detailed requirements, incident history, packaging constraints, and release acceptance.

## Current state

- The handoff records requirements and research. The implemented launcher, frozen runtime, native CI and release assembly are tracked in [IMPLEMENTATION_LEDGER.md](IMPLEMENTATION_LEDGER.md); use its exact receipts for qualification claims.
- The selected pair is Chimney `@deepseek-harness-tui/dsh-tui@0.15.0` at `18e4a206afc367f055a2b3379bb221abcbb5d99e` and DSH `@deepseek-ai/dsh@0.2.0-rc.2` at `639ed015397290b3745d163aafe02ffee4aa3f84`. The DSH RC is explicitly accepted for this build and must not be described as stable.
- The packaging contract is a Go executable containing a ZIP of ordinary Node and a frozen npm dependency tree. Build tools are Node `24.22.0`, npm `11.19.1`, Go `1.27.2`, and Python `3.14.4`.
- Required targets are Linux x64/arm64 on Ubuntu 22.04 with glibc 2.35, and macOS x64/arm64 on macOS 15. Windows x64 on Windows Server 2025 is preview-only and must pass qualification before distribution.
- Build natively in GitHub Actions. Run the complete handoff acceptance suite before creating a `vSEMVER` release tag; release assets include binaries, checksums, version metadata, and license notices. macOS builds use ad-hoc signatures and are not notarized; no paid signing is planned.
- The launcher and bootstrap implement `DEVNEYA_HOME` and the owned storage layout. All 29 acceptance scenarios are required per distributed Linux/macOS target; compilation and version output alone do not qualify a build.
- See [README.md](README.md) for commands, storage and platform boundaries. Complete native CI and the nonpublishing assembly rehearsal before creating a tag. Windows remains conditional; do not bypass its qualification failures.
- [dsh_tui.sh](dsh_tui.sh) is an existing launch experiment using `npx`, `pnpm@10`, `dsh@latest`, and a `dsh-tui` profile. It does not establish a reproducible release or the self-contained product.

## Product constraints

- Distribute one executable containing the required application runtime and dependencies. First launch must reach the UI/provider setup offline, without installing packages or requiring system Node, Bun, DSH, or a package manager.
- Prepare the selected DSH composition/profile internally. Preserve the invoking project directory as the workspace.
- Default to English throughout bootstrap, errors, setup, and the UI. Support provider setup without requiring a DeepSeek key for another provider.
- Keep application-owned runtime, data, preferences, caches, and logs under one documented application root. Preserve user settings and sessions during startup, repair, and updates.
- Keep existing DSH installations, credentials, package caches, and shell configuration untouched unless an explicit migration is requested.
- Pin the full compatibility set and lockfile. Inspect the selected release's actual boot contract, dynamic assets, native dependencies, and worker/subprocess paths before claiming qualification.
- Resolve upstream updates when preparing a new devneya release. Released binaries must use their embedded versions on every launch; replace the tested application as a whole when updating.
- Complete handoff section 10 on each distributed target before creating a release tag. Record the tested platform and feature coverage.

## Notes and their scope

Read [DSH_TUI_BINARY_HANDOFF.md](DSH_TUI_BINARY_HANDOFF.md) first for product work.

The numbered notes explore agent roles, context, and compaction. Use them as background when relevant to a requested feature. Their proposals do not automatically become TUI requirements. For that research, read in this order:

1. [02 - Status audit.md](<02 - Status audit.md>) — separates existing practice, vocabulary, and open ideas.
2. [00 - Start here.md](<00 - Start here.md>) — research orientation.
3. [01 - Architecture summary and findings.md](<01 - Architecture summary and findings.md>) — full narrative; read the status audit before designing from it.
4. [03 - References and evidence.md](<03 - References and evidence.md>) — research sources, limits, and correction log.

If extending the harness research, follow the two A/B experiments in file 02 before adding architecture. The advocate and compaction proposals remain research ideas unless explicitly adopted for this product.

## Working conventions

- Keep this file short and point to detailed notes instead of copying them.
- Distinguish requirements, proposals, reported incidents, and verified behavior. A suggested installation route or upstream build script is not proof of a working product.
- Preserve confidence labels on research claims: `[deployed]` production use, `[measured]` study results, `[vendor]` maker's claim, `[argued]` reasoning. Treat vendor claims as unaudited.
- Log corrections in the correction list in file 03 rather than silently rewriting the record.
- Verify current upstream behavior against exact source revisions when implementing; moving links and historical activity dates are not compatibility evidence.
- Prefer concrete, checkable changes over additional framework vocabulary.
- Do not give unsolicited advice or propose next steps unless asked.

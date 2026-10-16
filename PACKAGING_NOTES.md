# devneya v0.1.0 packaging contract

**Updated:** 2026-10-16
**Status:** Implemented packaging contract. Exact qualification runs and release status are recorded in [IMPLEMENTATION_LEDGER.md](IMPLEMENTATION_LEDGER.md); acceptance receipts remain the release gate.

## Source pair and toolchain

| Component | Version | Pinned source |
|---|---|---|
| Chimney TUI, `@deepseek-harness-tui/dsh-tui` | `0.15.0` | [`ccch1mneyyy/dsh-TUI`](https://github.com/ccch1mneyyy/dsh-TUI), `18e4a206afc367f055a2b3379bb221abcbb5d99e` |
| DeepSeek Harness, `@deepseek-ai/dsh` | `0.2.0-rc.2` | [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness), `639ed015397290b3745d163aafe02ffee4aa3f84` |

The selected DSH version is an explicitly accepted release candidate. It is not stable. Do not replace it with an alpha or describe it as a stable release. A future upstream change requires a separately reviewed and qualified compatibility set.

Pinned build tools: Node `24.22.0`, npm `11.19.1`, Go `1.27.2`, and Python `3.14.4`. Use a committed npm lockfile and frozen dependency installation. Record each input's source revision or digest and each output's SHA-256 in the generated release manifest. Do not edit `build.json` as part of documentation work; it is the separate implementation ledger.

## Executable format

Each platform artifact is a Go executable named `devneya` (`devneya.exe` on Windows). The executable contains an embedded ZIP with:

- the ordinary Node `24.22.0` runtime for the target platform;
- the frozen npm-installed TUI/DSH dependency tree and required dynamic assets;
- the runtime metadata needed to verify, extract and launch that tree.

At startup, the Go launcher extracts the ZIP into the application-owned runtime directory, validates the extracted tree, then invokes that explicit Node path. Preserve ordinary Node package boundaries, ESM/dynamic loading, native modules and filesystem assets. Runtime repair rebuilds only this extracted runtime from the embedded payload.

Do not use Bun compilation, Node SEA, `@yao-pkg/pkg`, `npx`, or `bunx`. Do not invoke a package manager or resolve dependencies on end-user startup. The executable must not require system Node, Bun, DSH, npm, pnpm or another package manager.

## Target matrix

Build each target natively in GitHub Actions using a matching OS/CPU runner. The OS versions below are exact minimum qualification baselines, not evidence that qualification has passed.

| Status | Target | Baseline |
|---|---|---|
| Required | `linux-x64` | Ubuntu 22.04, glibc 2.35 |
| Required | `linux-arm64` | Ubuntu 22.04, glibc 2.35 |
| Required | `darwin-x64` | macOS 15 |
| Required | `darwin-arm64` | macOS 15 |
| Preview only | `windows-x64` | Windows Server 2025; distribute only after full qualification on that target |

Only include targets whose finished executable passes every required acceptance item. Windows remains preview-only and unqualified; unresolved native dependencies must not be treated as supplied by an installed developer toolchain.

No paid signing is planned. Linux and Windows executables are unsigned. macOS executables use ad-hoc signatures and are not notarized. State this clearly with every release.

## Candidate build and release gate

The candidate workflow builds each target natively in GitHub Actions from frozen source revisions and the committed lockfile. Run the complete acceptance suite in the handoff against the packaged candidate, with a recorded platform, build identity, result, and feature coverage. Keep the accepted artifacts and verify that their source revision matches the release revision.

Only after all required acceptance passes may the release `vSEMVER` tag be created and pushed. GitHub Actions then publishes the accepted artifacts to GitHub Releases in `Devneya/tui`, with SHA-256 checksums, exact component/runtime/tool versions and source revisions, license notices, dependency inventory/SBOM, and the acceptance report. Do not create a release tag for an unaccepted candidate.

## Storage and compatibility contract

`DEVNEYA_HOME`, when set, must be an absolute path to a private application root. Filesystem roots and the user's home directory are refused. An existing nonempty directory must carry devneya's ownership marker; otherwise startup refuses to claim it. Defaults:

- Linux: `$XDG_DATA_HOME/devneya` when `XDG_DATA_HOME` is absolute, or `~/.local/share/devneya` when it is unset or not absolute.
- macOS: `~/Library/Application Support/devneya`.
- Windows: `%LOCALAPPDATA%\devneya`; `LOCALAPPDATA` must be absolute.

Keep replaceable runtime files in `runtime/<build-id>/`. DSH profiles and provider credentials live under `data/`, with the devneya profile at `data/profiles/devneya/`; saved sessions and attachments live separately under `data/sessions/`. TUI preferences, including language configuration, live under `tui/`. Caches and redacted logs also remain beneath the application root. Replacing or repairing the executable must preserve profiles, credentials, preferences, and sessions. Do not modify an existing DSH installation, its credentials, package caches, or shell configuration.

The full acceptance matrix in [DSH_TUI_BINARY_HANDOFF.md](DSH_TUI_BINARY_HANDOFF.md#10-acceptance-tests--release-is-blocked-until-these-pass) is the release gate. At minimum, it covers cold offline startup, a clean home without system runtimes, provider setup without a DeepSeek key, session resume, tools/workers, isolation, recovery, relocation, concurrency, and update/rollback. See the implementation ledger and archived acceptance receipts for measured results.

## Licensing

Include Chimney and DSH license texts plus copyright and license notices for every bundled runtime, library, font/asset and binary. Verify redistribution terms and produce the complete dependency inventory before release.

## References

- [DSH RC.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2)
- [Pinned Chimney source](https://github.com/ccch1mneyyy/dsh-TUI/tree/18e4a206afc367f055a2b3379bb221abcbb5d99e)
- [Pinned DSH source](https://github.com/deepseek-ai/deepseek-harness/tree/639ed015397290b3745d163aafe02ffee4aa3f84)
- [Full product and acceptance handoff](DSH_TUI_BINARY_HANDOFF.md)

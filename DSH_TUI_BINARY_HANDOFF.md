# Engineering handoff: devneya — self-contained DSH + selected TUI executable

**Prepared:** 2026-10-16

**Targets (selected, 2026-10-16):** Linux x64/arm64 on Ubuntu 22.04 with glibc 2.35; macOS x64/arm64 on macOS 15. Windows x64 on Windows Server 2025 is preview-only and may ship only after full qualification.

**Status:** Implementation contract recorded; no claim that the standalone executable or acceptance suite is complete.
**Selected TUI and DSH:** Chimney `@deepseek-harness-tui/dsh-tui@0.15.0` and DSH `@deepseek-ai/dsh@0.2.0-rc.2`; exact source revisions are recorded in section 4. DSH RC.2 is explicitly accepted for this build and is not a stable release.

## 0. Agreed version 1 scope — 2026-10-16

These are user requirements, superseding the earlier Linux-only scope and proposed `dshtui` product name:

- **Product and executable:** `devneya` (`devneya.exe` on Windows).
- **Repository:** [Devneya/tui](https://github.com/Devneya/tui), containing source, build workflows, and release documentation.
- **Deliverable:** a self-contained binary per supported platform that starts the agreed existing TUI plus DSH, with application dependencies included.
- **Build and distribution:** GitHub Actions builds the platform artifacts and publishes them to GitHub Releases in `Devneya/tui`, with checksums and the exact bundled-version manifest.
- **Selected compatibility set:** use the exact versions and source revisions recorded in section 4. Updates require a new compatibility review and tested build. No dependency resolution or installation on end-user startup.

The choice of Chimney and explicit acceptance of DSH RC.2 supersede the pending recommendation in Appendix E. Build native target artifacts in GitHub Actions. Complete all required acceptance for the candidate before creating and pushing a `vSEMVER` release tag; publish only the accepted candidate artifacts. macOS executables are ad-hoc signed and not notarized. No paid signing is planned. No release tag or release readiness is claimed by this handoff.

## 1. Build this product

Deliver one downloadable executable that starts **DeepSeek Harness (DSH) plus the selected interactive terminal UI**, with its runtime and application dependencies included.

The intended user experience is:

```text
Download the executable → run it from a project directory → configure a provider in the UI → work.
```

The user must not need to install, activate, repair, or understand Node, npm, npx, nvm, Bun, pnpm, DSH profiles, or global packages. Do not turn the earlier installation commands into an installer and call that a self-contained binary.

### Required behavior

| Requirement | Acceptance condition |
|---|---|
| Self-contained application | Starts without an existing Node/Bun/DSH installation and without a package manager on PATH. |
| No dependency downloads on startup | Clean first launch reaches the UI/provider setup with network access disabled. Inference still requires a configured provider or local server. |
| One chosen TUI | TUI identity and exact version are fixed in the build; changing the TUI produces another tested build. |
| Automatic initialization | Any required DSH profile/composition is prepared internally. No manual plugin-install command. |
| Installation independence | Existing `~/.dsh`, npm caches, global packages, or shell runtime selections are not silently reused. |
| One managed parent directory | Runtime extraction, application settings, cache, and logs live under a documented application root. Project files remain in the user's project. |
| English first launch | English includes bootstrap errors and provider setup, not just the screen after boot. |
| Provider-neutral setup | Another inference provider can be configured without first supplying a DeepSeek API key. |
| Repeatable launch | Starting again does not reinstall packages, recreate user settings, or require shell exports. |
| Safe failure/recovery | Broken extracted runtime can be rebuilt from the executable without deleting credentials or sessions. |

**Scope boundary:** “Self-contained” refers to the application runtime, not an entire operating system or a model server. Specify libc/system-library requirements and separately inventory tools such as Bash, Git, ripgrep, Neovim, browsers, and optional MCP servers. Bundle a required tool or document its requirement; an optional missing tool should not prevent the basic TUI from opening.

## 2. What DSH, the TUI, and the profile actually are

**DSH** is DeepSeek's agent backend/host. Its official quick start uses a browser UI. Its supported CLI also has headless and automation modes, but the removed official interactive TUI is not a current bundled interface. DSH remains a developer preview with breaking compatibility changes. [S01–S03]

**A community TUI** supplies terminal presentation, input, approval dialogs, and other interactions on top of that backend. Similar project names do not identify the same package.

**A profile** is the saved application composition: which plugin bundles to load and their configuration. In DSH's profile-based CLI, it has a `package.json`/`dsh.profile` manifest and `cordis.patch.yml`, under `$DSH_HOME/profiles/<name>`. The stock `dsh plugin` route delegates package operations to pnpm. [S02, S04]

Consequently, installing the DSH CLI does not automatically install a particular community TUI. Our binary must bridge that gap itself. A newer TUI may own its application entry/composition rather than using the older plugin launcher; inspect the selected release instead of assuming every TUI starts identically. Chimney's current README explicitly describes that transition. [T01]

### Original TUI versus the one previously attempted

The attempted package was **`@deepseek-harness-tui/dsh-tui`**, repository **`ccch1mneyyy/dsh-TUI`**. It is a separate React/Ink-oriented implementation, not the package named `@dsh-tui/dsh-tui`. Its package author is **chimney / ccch1mneyyy**; its README lists CikeSeven, T-Auto, AdamPlatin123, and Nagi-ovo alongside the owner as maintainers. [S05, T01]

The removed official implementation used `pi-tui`. **Turtle UI** contains that former code; **`dsh-tui/dsh-tui`** separately describes recovering/adapting the deleted implementation. Treat either as a specific codebase requiring its own compatibility tests, not an automatic official replacement. [S03, T18, T19]

## 3. Actual incident history — preserve these as regression cases

**Evidence in this section is the user's pasted logs and screenshot**, not a reconstruction from documentation.

| Observation | What it establishes | What it does not establish |
|---|---|---|
| Early launches used Node `22.14.0`, later `18.19.1`. | Those runs used an unsupported runtime for the attempted TUI. Its `0.14.0` engine range is `^22.19 \|\| >=24`. [S06] | The runtime version was not proven to cause every subsequent exception. |
| A later run explicitly used Node `24.22.0`, npm `11.19.1`. | Runtime selection was corrected in that shell. | DSH still failed, so upgrading Node was not the complete repair. |
| npm emitted peer conflicts involving DSH `0.2.0-rc.2`, `dsh-session-projection@0.1.7-rc.2`, `dsh-working-activity@0.5.1`, and React 18/19 ranges. | The assembled dependency tree had conflicting peer expectations. | Warnings alone do not prove a particular runtime failure or compatibility. |
| The launcher said installation succeeded but the profile plugin remained unreadable. | Profile initialization had not yielded a readable installed plugin. | No definitive cause of that half-installed state was established. |
| `dsh` was not found by a later launcher. | That launcher could not successfully locate/run the CLI it expected. | A global installation was not inherently required. |
| After dependency repair: `profile "dsh-tui" does not exist`. | The CLI got further, but that environment had no such profile. | It was not another instance of the previous import error. |
| Earlier paths used `/home/alex`; later paths used `/home/ubuntu`. | Different home-directory environments were involved. | A successful setup in one home cannot be assumed to exist in the other. |

### Reproduced `resolve.exports` failure and successful narrow repair

The failing installation was:

```text
~/.npm/_npx/3b8a2d1717a04559
@deepseek-ai/dsh@0.2.0-rc.2
@deepseek-ai/dsh-app-boot@0.2.0-rc.2
resolve.exports@2.0.4
```

The user's diagnostic output, under Node `24.22.0`, was:

```text
Resolved file: .../node_modules/resolve.exports/dist/index.mjs
Available exports: []
```

DSH failed at:

```text
import { imports } from "resolve.exports";
SyntaxError: The requested module 'resolve.exports' does not provide an export named 'imports'
```

An npm override to **`resolve.exports: 2.0.3`** followed by reinstall changed the diagnostic to:

```text
imports: function
```

DSH then advanced to the missing-profile error. Therefore this override fixed the observed missing export in that installation. The DSH tag declares `^2.0.3`, and the `2.0.3` source defines `imports`. [S07, S08]

**Do not generalize this into “all published 2.0.4 copies are broken.”** The conversation did not determine whether the cause was publication, cache corruption, registry/mirror behavior, or another local issue. Do not infer compromise from an empty export list alone.

For the new build, reproduce and inspect the resolved artifact in a fresh dependency tree. Retain the override only when justified, record its reason and integrity hash, and put it in the real build manifest/lockfile—not an npx cache. Add an assertion that the exact module resolved from DSH's boot package exposes an `imports` function. [S09]

### Other relevant observations

The `0.14.0` launcher selected Chinese unless `DSH_TUI_LANG=en`; this was program text, not model output. Its first-run screen checked for an existing DeepSeek key; it was not the key-entry form previously described. The screenshot showed an option to skip the guide. Provider setup was to be reached separately. [S10, S11; screenshot]

The repair install reported **12 audit findings: 7 moderate and 5 high**. No advisory-level assessment was performed. This is not a current audit of the proposed binary. Review the actual locked release tree; do not use `npm audit fix --force` as an unexplained compatibility repair.

A subsequent exception was mentioned after another install attempt, but its contents were not supplied. No diagnosis of it is available.

### Suggestions that were NOT demonstrated to work end-to-end

The standalone Chimney `0.15.0` download, `dsh-claude-tui@0.1.8` one-command route, isolated nvm installer, Bun execution, and a custom SEA/pkg build were **suggested**, not shown successfully running through a provider/tool/session test by the user. Do not promote any of those suggestions to a validated baseline.

## 4. Selected compatibility set and frozen inputs

The implementation uses the following exact upstream pair. The corresponding candidate source revisions, not moving branches or tags alone, are the inputs to the build:

| Component | Selected version | Source |
|---|---|---|
| TUI | Chimney `@deepseek-harness-tui/dsh-tui@0.15.0` | [`ccch1mneyyy/dsh-TUI`](https://github.com/ccch1mneyyy/dsh-TUI), commit `18e4a206afc367f055a2b3379bb221abcbb5d99e` |
| Harness | `@deepseek-ai/dsh@0.2.0-rc.2` | [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness), commit `639ed015397290b3745d163aafe02ffee4aa3f84` |

DSH `0.2.0-rc.2` is a prerelease. The user explicitly accepted this RC for the selected build; do not label it stable or substitute an alpha. A future upstream change requires a new compatibility review and a separately accepted build.

The pinned build tool versions are Node `24.22.0`, npm `11.19.1`, Go `1.27.2`, and Python `3.14.4`. Use npm with a committed lockfile for the frozen application dependency tree. Record artifact hashes, lockfile hash, native builder image/OS, launcher source revision, dependency notices, and the generated version manifest for each candidate. Release builds must use frozen inputs and fail on dependency drift; no resolution occurs on end-user startup. [S09, S12]

The platform baseline is Linux x64 and arm64 on Ubuntu 22.04 / glibc 2.35, and macOS x64 and arm64 on macOS 15. Each artifact is built natively in GitHub Actions. Windows x64 on Windows Server 2025 is preview-only and may be distributed only if the full acceptance suite passes there. macOS builds use ad-hoc signatures and are not notarized; paid signing is out of scope.

The prior comparative evidence and candidate ranking remain in Appendix E as historical research. The user selection above supersedes its pending recommendation; Appendix A retains the earlier inventory.

## 5. Historical Chimney standalone implementation — reference only

The following files were inspected as background research. Their `pkg`/pnpm standalone build is not the devneya packaging design and will not be used as the devneya executable or runtime tree:

| File | Role in the inspected upstream standalone build |
|---|---|
| `scripts/make-standalone-bundle.mjs` | Assembles a dependency archive and calls the upstream executable packager. [S13] |
| `standalone/package.json` and `pnpm-lock.yaml` | Dependency set for that older standalone build. [S14] |
| `standalone/entry.mjs` | Initializes storage/profile, points it at extracted dependencies and loads DSH. [S15] |
| `standalone/cacheGuard.cjs` | Integrity/completeness check and temporary extraction flow. [S16] |
| `standalone/pkg.config.json` | Upstream configuration for assets embedded by its `pkg` build. [S17] |

The inspected build script uses **`@yao-pkg/pkg@6.22.0`** and Node 24 targets. Its existing Linux x64 entry point is:

```bash
node scripts/make-standalone-bundle.mjs --targets node24-linux-x64
```

Its output naming is `dist-standalone/dsh-tui-standalone-linux-x64.tar.gz`, containing the executable. This is an **upstream build entry point**, not a complete clean-machine recipe or a tested command for an arbitrary TUI. It is not the devneya build command. [S13]

### Historical findings that inform the devneya acceptance cases

**Version mismatch:** the inspected standalone manifest pins DSH and many DSH packages to **`0.1.1-rc.2`** and contains a TUI `0.9.2` specification. The script rewrites the TUI specification from the repository version; that does not upgrade the pinned backend. Synchronize runtime manifest, lockfile, version constants and generated metadata. Verify the versions inside the finished executable. [S13–S15]

**Reproducibility:** the script performs a lockfile-only resolution step before its frozen install. For our release, separate reviewed dependency updates from the immutable build; a frozen step after an automatic lock rewrite is not evidence of unchanged inputs. [S13]

**Storage:** the inspected launcher separates its runtime cache and standalone DSH home. Additionally, Chimney's TUI documents its own `~/.dsh-tui` data directory, independent of `DSH_HOME`. Merely setting `DSH_HOME` does not satisfy the one-parent requirement. [S11, S15]

**Locale:** the inspected cache guard contains a Chinese extraction message. `DSH_TUI_LANG=en` in the ordinary launcher does not prove all standalone bootstrap messages are translated. [S16]

**Profile ownership:** the reference entry writes a profile manifest and copies a patch on launch. Our launcher must distinguish generated composition from user overrides; do not overwrite edited provider/settings layers during every startup. [S15]

**Text rendering:** the reference includes a fallback `Intl.Segmenter`. Test actual grapheme handling, emoji, combining marks and wide characters; a fallback that starts successfully is not proof of correct terminal layout. [S15]

These historical findings inform the required acceptance cases; they are not claims that a devneya binary failed tests. No devneya executable was tested here.

## 6. Packaging architecture

### Selected design: Go launcher with embedded ZIP payload

Build one Go executable for each target. Embed a ZIP payload containing the exact ordinary Node `24.22.0` runtime, the frozen npm-installed DSH/TUI dependency tree, and required runtime assets. The Go launcher extracts and validates that payload under the application's runtime directory, then invokes the extracted Node executable by its explicit path and starts the selected entry point. Preserve ordinary Node package boundaries, ESM loading, dynamic imports and filesystem assets.

The dependency tree is built from the selected source revisions and committed lockfile with npm `11.19.1`. Do not run package managers or resolve dependencies on user startup. The binary must not depend on a system Node, Bun, DSH, npm, or package manager. Build native artifacts in GitHub Actions with Go `1.27.2` and Python `3.14.4` available for the build pipeline.

This design is the selected contract; no implementation or compatibility success is implied. Acceptance must verify extraction integrity and repair, relocation, native modules, dynamic assets, worker/child-process paths and runtime isolation in the finished executable.

### Explicitly outside the selected design

Do not use Bun compilation, Node SEA, `@yao-pkg/pkg`, `npx`, or `bunx` as the packaging mechanism. These were considered in the earlier research below and in the references, but are not part of this implementation. The old Chimney standalone builder is reference material only; its old backend and `pkg` output do not define the devneya dependency tree or executable.

**Subprocess trap:** a packaged application's `process.execPath` is its own executable; do not assume spawning it with an arbitrary JavaScript filename is equivalent to running an ordinary `node` command. Audit worker threads, forked workers, PTC/code-execution tools, subagents, restart and updater paths. Prove each path uses a working bundled runtime rather than recursing into the launcher or finding system Node.

The earlier SEA, Bun, `pkg`, and package-manager notes are historical packaging research, not the selected implementation plan. Switching package managers does not repair an incompatible plugin or a missing export. [S19–S23]

## 7. Launcher and filesystem contract to implement

The following is the selected application interface and storage contract. It still requires implementation and acceptance; this documentation does not claim the behavior is already present.

```text
Executable: ./devneya (devneya.exe on Windows)
Default application roots:
  Linux: $XDG_DATA_HOME/devneya/ when XDG_DATA_HOME is set, otherwise ~/.local/share/devneya/
  macOS: ~/Library/Application Support/devneya/
  Windows: %LOCALAPPDATA%\devneya\
Optional override: DEVNEYA_HOME=/absolute/private/path

<application-root>/
  runtime/<build-id>/     # replaceable, versioned Node runtime/code/assets
  data/settings/          # credentials, provider/model preferences and TUI settings
  data/sessions/          # DSH sessions and attachments
  cache/                  # disposable application cache
  logs/                   # redacted diagnostics
```

Runtime files are replaceable and separate from settings and sessions. The root and its private permissions must be owned by the current user; `DEVNEYA_HOME`, when set, must be an absolute path.

One downloadable executable may create these files. “Single file to distribute” is not “never writes supporting files.” A PATH symlink is optional; running the downloaded executable directly must work. Do not change shell startup files or replace the user's Node installation.

### Startup sequence

1. Read embedded build metadata; choose the application root and preserve the invoking working directory.
2. Set DSH/TUI path configuration **before imports that inspect environment variables**. Default to the owned home, not unrelated installations. Any migration/import of old data is explicit.
3. Locate the runtime by a build ID incorporating target, runtime, DSH, TUI, lockfile and launcher identity—not just a display version.
4. Validate the existing runtime; otherwise extract the embedded archive into a temporary directory under the same filesystem. Verify before atomically publishing it. Mark completion last.
5. Prepare the selected composition from a versioned template. Separate generated files from mutable user overrides and migrate schemas explicitly.
6. Start the selected TUI/DSH entry with the intended workspace, arguments and terminal streams. Never invoke npx/pnpm to finish first-run setup.
7. Restore terminal modes and flush session state on exit; propagate a meaningful exit status.

Use safe archive extraction: reject absolute/traversing paths and escaping links, and verify every package link resolves within the embedded npm tree. Include the complete locked `node_modules` contents; no path may point back to a developer checkout or build-machine cache. Guard concurrent first launches and interrupted extraction. Treat executable/runtime integrity separately from user data integrity.

Path isolation requires an audit of all selected plugins, not just DSH. Prefer supported path overrides; patch hardcoded TUI paths when necessary. Avoid changing the process-wide `HOME` merely to redirect one plugin, because that changes the agent's view of the user's environment.

Provide a diagnostic mode that reports the embedded runtime, actual DSH/TUI versions, paths, platform, missing optional tools and validation failures without exposing credentials. Provide a runtime-only repair path. Neither should delete session data or prompt for a global package install.

## 8. Credentials and provider setup

The user should reach the interface with no API key exported. Display missing authentication as a setup task, not a boot crash. The selected Chimney interface documents `/provider`, `/model`, and `/resume`; expose and document those commands in the shipped UI. [S11, T01]

For a custom inference provider, configuration generally needs a route name, API protocol, base URL (including `/v1` when that provider requires it), exact model ID(s), and that provider's authentication. Built-in routes can supply defaults. DSH's adapter distinguishes custom route requirements from catalogue routes. [S24]

**Do not require a DeepSeek key for an unrelated provider.** Do not embed anyone's API key, OAuth token, browser session, or home-directory configuration into the release.

Chimney documents an owner-readable credential file and independent TUI preferences. Verify the selected version's actual behavior under the custom home. Owner-only YAML/JSON is not encryption. Use restrictive directory/file permissions, redact logs, and do not print secrets in diagnostic dumps. [S11]

Previously discussed options were `deepseek-official` for API-key use and `deepseek-account` for supported DSH account sign-in. Their availability depends on the backend/frontend combination; do not promise modern account login from the old standalone backend. Subscription tokens are not interchangeable with general API keys. [S11]

For a local server without authentication, test the selected adapter. Earlier research noted that a compatible adapter could require a placeholder key/header even if the server did not. Handle that as an adapter-specific case, not a universal requirement or a reason to ask for a real secret. [S24]

## 9. Build pipeline and dependency inventory

Implement the pipeline in a clean container or equivalent isolated builder with pinned inputs. The build machine may use compilers/package managers; the target user must not need them.

| Stage | Required result |
|---|---|
| Freeze | Exact source commits, package versions, lockfile, runtime and builder/packager identities. |
| Install/build | Frozen install; review and allow necessary lifecycle/native builds in the builder. Do not blindly suppress every install script. |
| Compatibility gate | Validate declared DSH engines/peer ranges and exercise real APIs. No unexplained peer-conflict bypass as the release policy. |
| Stage | Include built JS, package manifests/exports/imports, patches, schemas, prompts, presets, renderer/WASM/native assets and worker entry points actually used. |
| Relocation gate | Staged tree works after moving it and removing access to the source checkout and package-manager cache. |
| Package | Put the ordinary Node runtime and frozen npm tree in the embedded ZIP; produce an artifact for each supported OS/CPU/libc combination. |
| Acceptance | Run section 10 against the packaged executable, not just the source tree. |
| Candidate validation | Build each target natively in GitHub Actions, run and record all required acceptance, and retain the accepted artifacts for promotion. |
| Release | Only after all required acceptance passes, create and push a `vSEMVER` tag for the accepted source revision and publish its accepted artifacts, checksums, manifest, license notices, dependency inventory/SBOM, test results and supported-platform statement to GitHub Releases in `Devneya/tui`. |

Build tools are Node `24.22.0`, npm `11.19.1`, Go `1.27.2`, and Python `3.14.4`. The required platform matrix is Linux x64/arm64 on Ubuntu 22.04 with glibc 2.35 and macOS x64/arm64 on macOS 15. Windows x64 on Windows Server 2025 remains preview-only until the full suite passes there. Native builds run on GitHub Actions runners for the matching target OS and CPU.

macOS artifacts are ad-hoc signed and not notarized; no paid signing is planned. Document this before download. Do not create or push a `vSEMVER` release tag until every required target and acceptance item has passed for the candidate. Release publication includes the accepted binaries, SHA-256 checksums, exact version/source manifest, licenses/notices, dependency inventory/SBOM and acceptance report.

Inventory native modules and external programs by inspecting the chosen release. Sharp/libvips, FFI loaders, platform addons and terminal-related components are candidates already visible in the inspected dependency manifests, not a guaranteed exhaustive list. [S14]

Do not assume a cross-platform packager target automatically supplies the correct native dependency tree. Match architecture, libc and native ABI; test the oldest supported OS. Record the **actual embedded** Node patch version—the builder's `node --version` and a target string such as `node24-linux-x64` are not enough evidence.

Review security findings against the shipped dependency tree. Keep justified overrides as reviewed patches. Generate third-party notices for runtime, libraries, fonts/assets and any bundled binaries; verify redistribution terms before release. Do not copy Claude Code or other proprietary application code into this product.

Disable or replace upstream package-manager-based self-updates. Update the whole tested release, not just the TUI while leaving DSH behind. Optional plugin installation must either be an explicitly supported, tested extra capability or fail clearly as unavailable in this build; it must not be a hidden prerequisite for startup.

## 10. Acceptance tests — release is blocked until these pass

All tests below apply to the **finished executable**. Record environment, build ID, expected result and actual result. “It compiled” and “`--version` worked” are not end-to-end acceptance.

| Test | Pass condition |
|---|---|
| Empty home / no runtimes | Fresh non-root user, no Node/npm/Bun/pnpm/nvm/DSH. Binary opens its TUI. |
| Cold offline launch | Empty application root and no network. UI/provider setup appears without registry access or dependency downloads. |
| Contaminated environment | Old/broken Node 18/22, DSH, npm caches and unrelated profiles present. Embedded versions still run; old data remains untouched. |
| Storage boundary | All application-owned writes stay under the chosen root; project changes occur only through expected workspace actions. |
| Locale | First-run progress, errors, setup and UI are English by default. |
| Custom provider | Configure a non-DeepSeek provider without a DeepSeek key or shell export; stream a response and persist selection. |
| Authentication failure | Missing/invalid key, invalid model and unreachable endpoint produce useful recoverable errors, not stack-trace boot loops. |
| Tools and approvals | Read and edit a disposable file; run a harmless shell command; allow/deny an approval; show results correctly. |
| Code execution / workers | Exercise every bundled worker/PTC/subagent path offered by the product without system Node or Bun. |
| Session persistence | Clean exit, restart and resume retain history, selected model and settings. |
| TTY handling | PTY/SSH/tmux as supported; resize, paste, Ctrl+C, EOF and Unicode work; terminal restored after exit or failure. |
| Runtime recovery | Delete/corrupt a managed runtime file; next launch repairs from embedded payload while preserving data. |
| Concurrency/interruption | Two first launches or interruption during extraction do not publish a half-installed runtime. |
| Relocation | Move executable; use spaces in paths; invoke from another project. No build-machine path dependency. |
| Permissions | Non-root and restrictive umask work; unavailable write locations fail clearly; credentials remain private. |
| Dependency regression | DSH-resolved `resolve.exports` has the needed export; no missing-profile setup; native modules load. |
| Update/rollback | A whole-release replacement can be rolled back without silently corrupting settings/sessions. |

Use a local mock inference service for deterministic CI, plus a separately authorized real-provider smoke test. Keep API keys out of recorded test artifacts. Run the cold-offline test separately from tests that need a mock or remote provider. A claimed single-binary product should also be tested with package-manager executables absent, not merely unused by the happy path.

### Engineer's final delivery

Deliver the executable, one-command build entry point, pinned source/lockfiles, target/runtime manifest, checksum/signing information, dependency notices, acceptance report, and a short user guide covering start, provider setup, storage, update and uninstall. Identify any untested optional features explicitly. Make reliability claims only within the tested platform/feature matrix.

## Appendix A. TUI inventory preserved from the conversation

This is **19 identified projects, not every possible fork**. README references were reopened for this handoff. The **date/pulse column is copied from the earlier survey dated 2026-10-15 and was not refreshed from commit history**. Those historical labels are not present-day compatibility or reliability evidence. Recheck repository ownership, release artifacts, CI, recent substantive changes and exact DSH support before choosing.

| Project / repository | Distinction to evaluate | Earlier reported update / pulse (2026) |
|---|---|---|
| **Chimney** — `ccch1mneyyy/dsh-TUI`; npm `@deepseek-harness-tui/dsh-tui` [T01] | Separate React/Ink-oriented frontend, panels/images, existing standalone packaging; original attempted package. | Oct 15 / very active |
| **DSH Relay** — `cyjyyd/dsh-ssh-tui` [T02] | SSH/reconnection focus; separates display from long-lived agent work. | Oct 15 / active |
| **dshline** — `riesbri/dshline` [T03] | Terminal-scrollback-oriented interaction rather than exclusively owning a fullscreen display. | Oct 14 / active |
| **Neovim TUI** — `kovey/dsh-nvim-tui` [T04] | Actual Neovim buffers/splits/editing; account for Neovim as another runtime/tool requirement. | Oct 14 / active |
| **Martty** — `openma-ai/Martty` [T05] | DSH-first frontend with ACP connections to other agents. | Oct 13 / active |
| **SeekTTY** — `Hilbert-beinghappy/seektty` [T06] | Terminal workspace integrating host-discovered providers, tools and plugins. | Oct 13 / active |
| **Claude-style TUI** — `cogine-ai/dsh-claude-tui`; npm `dsh-claude-tui` [T07] | Independent Claude-like interface with packaged/pinned DSH and runtime selection. Not Claude Code. | Oct 11 / active |
| **Mayfly** — `Ephemeral-AI-Lab/mayfly` [T08] | Multi-agent/side-conversation workspace, panels and charts; successor to Blue. | Oct 9 / active |
| **Pi-style TUI** — `fan56/dsh-tui-pi` [T09] | Uses pi-tui with Pi-style interaction. Not the Pi agent itself. | Oct 8 / active |
| **OpenCode-inspired TUI** — `rayafriandion/dsh-oc-tui`; npm `dsh-oc-tui` [T10] | Independent OpenCode-inspired rendering; formerly discussed as `deepseek-harness-tui`. | Oct 5 / maintained |
| **Tianshu** — `huiliyi37/dsh-tianshu-tui` [T11] | Custom renderer, coding-oriented diagnostics and themes. | Sep 30 / occasional |
| **Tomowang TUI** — `tomowang/dsh-tui`; npm `@tomowang/dsh-tui` [T12] | Fullscreen session/provider interface using DSH's saved history. | Sep 28 / occasional |
| **Blue** — `dsh-blue/blue` [T13] | Earlier terminal workspace; README points to Mayfly as successor. | Sep 28 / archived in prior survey |
| **OpenCode bridge** — `chiro2001/dsh-oc` [T14] | Uses the actual OpenCode TUI through a bridge; different from an inspired reimplementation. | Sep 11 / quiet |
| **OMP-style TUI** — `mytianyi0712/dsh-tui-plugin-OhMyPi` [T15] | Ports OMP-style interaction onto DSH. Not the OMP agent itself. | Sep 3 / slow personal-needs maintenance |
| **Mini TUI** — `boxeryao/dsh-mini-tui` [T16] | Answer-focused, less visible successful-tool noise. | Aug 16 / quiet |
| **Grok TUI bridge** — `chen-001/dsh-grok-tui` [T17] | Connects a Grok-style terminal frontend to DSH. | Aug 15 / quiet |
| **Restored original** — `dsh-tui/dsh-tui`; npm `@dsh-tui/dsh-tui` [T18] | Recovered/adapted deleted official pi-tui code. Not Chimney's package. | Aug 14 / quiet; recovered-test caveat reported |
| **Turtle UI** — `turtle1999/turtle-ui` [T19] | Former official implementation and tests; current README describes sibling DSH checkout/build requirements. | Aug 13 / quiet |

The earlier conversation associated Turtle UI's owner with the official removal commit. Treat that identity/commit detail as historical context to verify if needed; the packaging-relevant fact is the repository's documented code provenance.

## Appendix B. Why Pi, OMP and Claude Code seemed simpler

| Tool / installation route | Packaging lesson |
|---|---|
| **Pi installer** | Documents pinned dependencies; its ordinary npm route does not pin transitive dependencies the same way. The installer was discussed as able to provision Node; independently verify the selected installer revision when copying that behavior. [S25] |
| **OMP binary route** | Installer offers a prebuilt executable and checksum verification. Separate from its Bun package-install route. The binary route avoids relying on the user's system Node. [S26] |
| **Claude Code native route** | Ships a platform-specific executable; Bun identifies it as a Bun executable. Current Claude docs say even npm distribution installs the native binary through platform packages, rather than running the application with the user's Node. [S27, S28] |

The transferable idea is **prepare and validate dependencies before distribution**. The number of user-visible commands or the choice of package manager is not the reliability mechanism. Do not assume another product's build invocation can package DSH's plugin architecture unchanged.

## Appendix C. Old installation locations and cleanup boundary

Locations mentioned in the conversation:

```text
~/.dsh/profiles/dsh-tui                       # ordinary failed/attempted profile
~/.npm/_npx/3b8a2d1717a04559                  # manually repaired cache on ubuntu account
~/.local/opt/dsh-tui-0.15.0/                  # proposed standalone download location
~/.local/share/dshtui/nvm/                   # proposed isolated nvm/Node install
~/.local/share/dshtui/data/                  # proposed isolated DSH home
~/.cache/dshtui/npm/                         # proposed separate npm cache
~/.local/share/dshtui/npm-cache/             # later proposed consolidated cache instead
```

These paths are historical, not build inputs. Some were only suggested and may not exist. The earlier installer used two parent locations by choice, not necessity; consolidating directories would not itself fix dependency compatibility. Also, a DSH home override alone does not prove every TUI writes inside that home.

Do not delete `~/.dsh`, credentials, Node, or whole npm caches to make the new binary work. Start with a fresh owned application root. Import or archive previous state only explicitly, with a backup. A cache-specific override must never become a hidden requirement of the shipped application.

## Appendix D. Sources and verification scope

Primary documentation/source links below were opened on **2026-10-16**. Most `main`/`master` links are moving references, not immutable evidence of a release. The engineer must record exact commits and artifact checksums for the selected build. User-log findings are identified in section 3. Commit/pulse dates in Appendix A are historical and not freshly verified. No standalone binary was built, downloaded and executed as part of preparing this handoff.

### Core, packaging and operations

- **S01 — DSH project / preview / web quick start:** <https://github.com/deepseek-ai/deepseek-harness>
- **S02 — DSH CLI modes and profile contract:** <https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/apps/cli/README.md>
- **S03 — Official TUI removal decision:** <https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/.agents/notes/archived/simplification/2026-08-04-remove-tui-package.md>
- **S04 — DSH application boot and composition:** <https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/boot/app-boot/README.md>
- **S05 — Chimney package identity / author / build tool declaration:** <https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/main/package.json>
- **S06 — Attempted TUI 0.14.0 manifest / engines:** <https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/v0.14.0/package.json>
- **S07 — DSH 0.2.0-rc.2 boot dependency manifest:** <https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.2.0-rc.2/packages/boot/app-boot/package.json>
- **S08 — resolve.exports 2.0.3 source:** <https://raw.githubusercontent.com/lukeed/resolve.exports/v2.0.3/src/index.ts>
- **S09 — npm package manifest / overrides:** <https://docs.npmjs.com/cli/v11/configuring-npm/package-json/>
- **S10 — TUI 0.14.0 launcher / locale / initialization:** <https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/v0.14.0/bin/dsh-tui.js>
- **S11 — TUI 0.14.0 provider configuration / storage:** <https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/v0.14.0/docs/configuration.en.md>
- **S12 — Frozen npm installs:** <https://docs.npmjs.com/cli/v11/commands/npm-ci/>
- **S13 — Existing standalone build script:** <https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/main/scripts/make-standalone-bundle.mjs>
- **S14 — Existing standalone runtime manifest:** <https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/main/standalone/package.json>
- **S15 — Existing standalone entry:** <https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/main/standalone/entry.mjs>
- **S16 — Existing standalone cache validation/extraction:** <https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/main/standalone/cacheGuard.cjs>
- **S17 — Existing executable asset configuration:** <https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/main/standalone/pkg.config.json>
- **S18 — yao-pkg/pkg:** <https://github.com/yao-pkg/pkg>
- **S19 — Node 24 SEA documentation:** <https://nodejs.org/docs/latest-v24.x/api/single-executable-applications.html>
- **S20 — Current Node SEA documentation / --build-sea history:** <https://nodejs.org/api/single-executable-applications.html>
- **S21 — Bun single-file executables:** <https://bun.com/docs/bundler/executables>
- **S22 — npm exec/npx cache and execution model:** <https://docs.npmjs.com/cli/v11/commands/npm-exec/>
- **S23 — bunx / shebang and --bun behavior:** <https://bun.com/docs/pm/bunx>
- **S24 — DSH provider adapter:** <https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/llm/llm-pi-ai/README.md>
- **S25 — Pi installation routes:** <https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/quickstart.md>
- **S26 — OMP installer:** <https://raw.githubusercontent.com/can1357/oh-my-pi/main/scripts/install.sh>
- **S27 — Claude Code distribution documentation:** <https://code.claude.com/docs/en/setup>
- **S28 — Bun's description of Claude Code packaging:** <https://bun.com/>

### TUI project references

- **T01 — Chimney:** <https://raw.githubusercontent.com/ccch1mneyyy/dsh-TUI/main/README.md>
- **T02 — DSH Relay:** <https://raw.githubusercontent.com/cyjyyd/dsh-ssh-tui/main/README.md>
- **T03 — dshline:** <https://raw.githubusercontent.com/riesbri/dshline/main/README.md>
- **T04 — Neovim TUI:** <https://raw.githubusercontent.com/kovey/dsh-nvim-tui/main/README.md>
- **T05 — Martty:** <https://raw.githubusercontent.com/openma-ai/Martty/main/README.md>
- **T06 — SeekTTY:** <https://raw.githubusercontent.com/Hilbert-beinghappy/seektty/main/README.md>
- **T07 — Claude-style TUI:** <https://raw.githubusercontent.com/cogine-ai/dsh-claude-tui/main/README.md>
- **T08 — Mayfly:** <https://raw.githubusercontent.com/Ephemeral-AI-Lab/mayfly/main/README.md>
- **T09 — Pi-style TUI:** <https://raw.githubusercontent.com/fan56/dsh-tui-pi/main/README.md>
- **T10 — OpenCode-inspired TUI:** <https://raw.githubusercontent.com/rayafriandion/dsh-oc-tui/main/README.md>
- **T11 — Tianshu:** <https://raw.githubusercontent.com/huiliyi37/dsh-tianshu-tui/main/README.md>
- **T12 — Tomowang TUI:** <https://raw.githubusercontent.com/tomowang/dsh-tui/main/README.md>
- **T13 — Blue:** <https://raw.githubusercontent.com/dsh-blue/blue/master/README.md>
- **T14 — OpenCode bridge:** <https://raw.githubusercontent.com/chiro2001/dsh-oc/main/README.md>
- **T15 — OMP-style TUI:** <https://raw.githubusercontent.com/mytianyi0712/dsh-tui-plugin-OhMyPi/main/README.md>
- **T16 — Mini TUI:** <https://raw.githubusercontent.com/boxeryao/dsh-mini-tui/main/README.md>
- **T17 — Grok TUI bridge:** <https://raw.githubusercontent.com/chen-001/dsh-grok-tui/main/README.md>
- **T18 — Restored original:** <https://raw.githubusercontent.com/dsh-tui/dsh-tui/main/README.md>
- **T19 — Turtle UI:** <https://raw.githubusercontent.com/turtle1999/turtle-ui/main/README.md>

## Appendix E. Refreshed TUI comparison — 2026-10-16

**Scope:** Rechecked all 19 repositories in Appendix A through the authenticated GitHub CLI. Read default-branch commit metadata, release metadata, and archive status for all 19; inspected pinned README/manifests for seven leading candidates and CI configuration/results for six. No candidate executable or test suite was run locally for this comparison. `[measured]` below identifies counts and statuses observed through the API; `[vendor]` identifies upstream feature/acceptance claims; `[argued]` identifies the selection judgment.

**Current decision:** The user selected Chimney `0.15.0` at source commit `18e4a206afc367f055a2b3379bb221abcbb5d99e` with DSH `0.2.0-rc.2` at source commit `639ed015397290b3745d163aafe02ffee4aa3f84`, and explicitly accepted the DSH RC for this build. Section 4 records the implementation pins. This appendix remains the historical comparison record; its pending recommendation below has been superseded. The decision does not mean the packaged executable has passed acceptance.

### Historical recommendation (pending when this comparison was written)

**[argued] The comparison recommended Chimney (`ccch1mneyyy/dsh-TUI`) for devneya v1.** It combined the strongest observed development activity, broad terminal features, and existing standalone release work for Linux, macOS, and Windows. The comparison proposed **TUI `0.15.0` plus DSH `0.2.0-rc.2`**, pending agreement on using a DSH RC and validation of that exact packaged combination. SeekTTY `1.3.0` was the strongest alternative when documented cross-platform lifecycle acceptance was the deciding factor. Neither was independently established as the most stable TUI. The user later selected the proposed Chimney/DSH pair and accepted the RC; this historical comparison is not acceptance evidence for devneya.

### Activity and release evidence

**[measured]** Counts below cover commits reachable from the observed default-branch head since **2026-10-02 00:00 UTC**, including merges and documentation. Counts measure activity, not quality. For Chimney, 78 of the newest 100 commit subjects began with `feat`, `fix`, `perf`, or `refactor`; this supports substantive activity beyond release automation, but is not an audit of every change.

| Candidate | Commits in window | Default-branch commit date (UTC) | Latest release observed | Existing CI at observed head |
|---|---:|---|---|---|
| Chimney | 498 | Oct 16 | `0.15.0`, Oct 13 | 18 checks succeeded; includes Windows/macOS platform smoke |
| DSH Relay | 88 | Oct 16 | `0.8.3`, Oct 13 | 5 checks succeeded; Linux host matrix and Windows job |
| dshline | 19 | Oct 14 | `0.26.1`, Oct 14 | 19 checks succeeded, 6 skipped; Windows launcher included |
| Claude-style | 10 | Oct 11 | `0.1.8`, Oct 11 | 4 checks succeeded; Ubuntu Node matrix |
| Pi-style | 9 | Oct 16 | `2.27.1`, Oct 8 | One Linux build/test/host-boot job succeeded; latest Oct 16 change is documentation |
| SeekTTY | 8 | Oct 13 | `1.3.0`, Oct 13 | 8 checks succeeded; Linux/macOS/Windows lifecycle matrix on Node 22/24 |

**[measured]** The broader scan found Martty on `0.3.2-beta.3` (Oct 13); Mayfly with Oct 9 changes and no GitHub release; and the OMP-style TUI newly active on Oct 16 after a longer gap, with `0.4.0` and a subsequent dependency-import fix. Neovim's latest Oct 14 change documents its external Neovim requirement. The remaining candidates had default-branch commits from Oct 5 or earlier; Blue is archived. These observations changed the older activity labels in Appendix A but do not establish compatibility or stability.

### Features and qualification boundaries

| Candidate | Upstream-described strengths [vendor] | Selection judgment [argued] |
|---|---|---|
| Chimney | Streaming/tool UI, images, side panels, model/provider/auth setup, session resume/fork/rewind, presets, skills, MCP, goals and subagents; native downloads for Linux x64/arm64, macOS x64/arm64 and Windows x64 | Best overall match for an actively maintained, feature-rich binary wrapper. Features on current main must be checked against the selected release. |
| SeekTTY | Broad native DSH surfaces, provider/forms/settings management, agent tree, files, approvals, images, plans/goals and plugin management; release-specific packed-artifact acceptance record | Strongest documented cross-platform lifecycle evidence in this review. Its release is a JS package; devneya still needs its own embedded runtime and packaging. |
| DSH Relay | SSH disconnect/reconnect continuity, separate host/display lifetimes, ANSI renderer, approvals, questions, subagents and terminal diagnostics | Strong fit if SSH resilience drives the choice. Fewer of Chimney's richer presentation features; no standalone binary assets on the observed release. |
| dshline | Real terminal scrollback, bounded redraws, providers via Harness contracts, sessions, jobs/subagents, files/images and profile composition | Strong option for a scrollback-oriented interface. Existing native packaging and macOS lifecycle evidence are less complete for this particular distribution goal. |
| Pi-style | Session/history search, subagent steering, themes, model profiles, questions, pruning and companion plugins | Feature-rich, but observed CI is Linux-only and the rolling host selection differs from devneya's frozen-release contract. |
| Claude-style | Familiar coding-agent layout, providers, durable sessions, approvals/questions, images, subagents and shrinkwrap-pinned DSH | Smaller maintenance footprint and weaker Windows qualification than the leading options. Its README explicitly calls Windows unqualified. |

**[vendor]** SeekTTY's exact `1.3.0` tarball verification reports 2,369 passing tests with four existing skips, 26 native terminal steps and 17 management steps on Windows using local model fixtures. Its green three-OS CI extends lifecycle coverage, not manual desktop mouse/clipboard qualification. These are upstream results, not tests performed for devneya. [E04]

### Historical material doubts and implementation boundaries

The comparison identified the questions below before the user recorded the implementation choice. The selected RC.2 is now an explicit decision, and the old Chimney standalone tree is reference material only: the selected build must package the pinned versions from section 4 using the Go executable plus embedded ZIP architecture. These decisions do not remove the need for the acceptance checks in section 10.

- **[measured] No stable DSH release existed in the observed GitHub release list.** All 29 releases were marked prerelease; `latestRelease` was null. The newest was `0.2.1-alpha.5`, while the newest RC was `0.2.0-rc.2`. The inspected Chimney, SeekTTY and Claude-style manifests targeted RC.2. **[argued]** The user later explicitly accepted RC.2 for this build. Do not label it stable or silently substitute the alpha. [E01, E02, E04, E06]
- **[measured] Chimney's `0.15.0` standalone manifest pinned DSH `0.1.1-rc.2`, while its frontend manifest targeted `0.2.0-rc.2`.** **[argued]** Renaming its downloadable executable cannot satisfy the selected devneya baseline. Build the runtime tree from the pinned compatibility set and inspect the versions actually embedded. [E02]
- **[vendor] Chimney documents a Windows default of `danger-full-access` with approvals `never`.** **[argued]** Do not inherit that silently into devneya; explicitly configure and qualify the shipped permission behavior. [E03]
- **[measured] Chimney's release workflow cross-builds its standalone assets on Ubuntu; its separate Windows/macOS CI jobs compile/import the frontend and exercise selected launcher paths.** **[argued]** That evidence does not replace devneya's tests of the finished executable on each target OS. [E03]
- **[argued]** A green CI run, a larger feature list, or a stable-looking TUI version does not establish overall stability. Keep the distinction between upstream evidence and devneya's own acceptance report.

### Pinned sources and observed CI

- **E01 — DSH:** [release list](https://github.com/deepseek-ai/deepseek-harness/releases); [RC.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2); [preview status at observed revision](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/README.md).
- **E02 — Chimney release:** [`0.15.0` assets](https://github.com/ccch1mneyyy/dsh-TUI/releases/tag/v0.15.0); [release frontend manifest](https://github.com/ccch1mneyyy/dsh-TUI/blob/18e4a206afc367f055a2b3379bb221abcbb5d99e/package.json); [release standalone manifest](https://github.com/ccch1mneyyy/dsh-TUI/blob/18e4a206afc367f055a2b3379bb221abcbb5d99e/standalone/package.json).
- **E03 — Chimney current source/CI:** [README](https://github.com/ccch1mneyyy/dsh-TUI/blob/3535326087d64794debbbe73947194b3cc44614c/README.md); [CI configuration](https://github.com/ccch1mneyyy/dsh-TUI/blob/3535326087d64794debbbe73947194b3cc44614c/.github/workflows/ci.yml); [release workflow](https://github.com/ccch1mneyyy/dsh-TUI/blob/3535326087d64794debbbe73947194b3cc44614c/.github/workflows/release-bundle.yml); [green run at observed head](https://github.com/ccch1mneyyy/dsh-TUI/actions/runs/38883970464).
- **E04 — SeekTTY:** [README](https://github.com/Hilbert-beinghappy/seektty/blob/42a2a7fa2a01b5a10a2e2ce368c151c8e0fdafc5/README.md); [release verification](https://github.com/Hilbert-beinghappy/seektty/blob/42a2a7fa2a01b5a10a2e2ce368c151c8e0fdafc5/docs/release-v1.3.0-verification.md); [green three-OS CI run](https://github.com/Hilbert-beinghappy/seektty/actions/runs/38354672480).
- **E05 — Relay:** [README](https://github.com/cyjyyd/dsh-ssh-tui/blob/8b9cda03de7e4140005019bd5bff47eed4e9b2cf/README.md); [green run](https://github.com/cyjyyd/dsh-ssh-tui/actions/runs/38885522306).
- **E06 — Claude-style:** [README and Windows qualification boundary](https://github.com/cogine-ai/dsh-claude-tui/blob/b010d7fa3bff00dbdc7ea1d6cda112a14681ba56/README.md); [pinned manifest](https://github.com/cogine-ai/dsh-claude-tui/blob/b010d7fa3bff00dbdc7ea1d6cda112a14681ba56/package.json).
- **E07 — dshline:** [README](https://github.com/riesbri/dshline/blob/8b91e0efb088162fae3b919230378b66ed58d943/README.md); [green run](https://github.com/riesbri/dshline/actions/runs/38528559762).
- **E08 — Pi-style:** [README](https://github.com/fan56/dsh-tui-pi/blob/c389223904e8a8a727abdf0500add2227021570c/README.md); [observed Linux CI](https://github.com/fan56/dsh-tui-pi/actions/runs/38877879545).

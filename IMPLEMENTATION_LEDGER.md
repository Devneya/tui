# Implementation ledger — devneya 0.1.0

Release status: **not qualified; no release tag created**. Required scenarios remain gates even when the local environment cannot run them. Raw logs belong in ignored `artifacts/implementation/`.

## Unit 1 — reconcile decisions (in progress)

- Inputs: user-approved implementation handoff, existing `AGENTS.md` and `DSH_TUI_BINARY_HANDOFF.md` read before changes. Preserve all pre-existing untracked research files.
- Changes: `build.json` now records tool versions and five native build targets. Documentation reconciliation underway.
- Commands: `git status --short`; `git log -3 --oneline`; `git remote -v`; `cat AGENTS.md DSH_TUI_BINARY_HANDOFF.md`; `/snap/go/current/bin/go version`; `python3 --version`; `/snap/gh/current/gh auth status`; `/snap/gh/current/gh api repos/Devneya/tui`; `/snap/gh/current/gh api repos/Devneya/tui/immutable-releases --jq '[.enabled,.enforced_by_owner] | @tsv'`; `curl -fsSL https://nodejs.org/dist/v24.22.0/SHASUMS256.txt`.
- Evidence: remote main initially `d2e1dc7d51dcd99b7e727c0764bb601ab39de55c`; authenticated repository admin/push access; immutable releases disabled and not organization enforced; installed Go 1.27.2 and Python 3.14.4. Network access requires sandbox escalation; snap wrappers cannot run, direct binaries work.
- Next: unit 2, strict dependency lock preparation with pinned Node/npm.

## Unit 2 — freeze dependencies (in progress)

- Changes: corrected `runtime/package.json` with explicitly approved Cordis/Schemastery/UI/React/activity compatibility pins and scoped activity override. No resolver downgrade.
- Pending: exact Node archive verification, strict lock generation, install/import/native gates.

## Unit 1 — complete

- Changed: `AGENTS.md`, `DSH_TUI_BINARY_HANDOFF.md`, `PACKAGING_NOTES.md`, `README.md`, correction list in file 03, `build.json`.
- Verification: documentation review and `git diff --check`; selected versions, architecture, baselines and tag policy are recorded, with targets explicitly unqualified.
- Next unit: 2.

## Units 2–4 — staged runtime verified; executable qualification pending

- Changed: `runtime/package.json`, `runtime/package-lock.json`, `runtime/entry.mjs`, builder npm configuration, `patches/*`, `scripts/{apply_patches,normalize_lock,verify_dependencies}.*`, `tests/integration-patches.test.mjs`.
- Commands: pinned Node/npm `npm install --package-lock-only --strict-peer-deps --ignore-scripts --no-audit --no-fund`; `python3 scripts/normalize_lock.py runtime/package-lock.json`; isolated `npm ci --strict-peer-deps --omit=dev --include=optional --no-audit --no-fund`; version-scoped lifecycle approvals and `npm rebuild --foreground-scripts`; `python3 scripts/apply_patches.py .build/app/node_modules --diff artifacts/implementation/integration.diff`; `npm ls --all`; `node scripts/verify_dependencies.mjs .build/app`; `DEVNEYA_TEST_APP=... node --test --test-isolation=none tests/integration-patches.test.mjs`; staged `entry.mjs --devneya-doctor`; interactive staged `entry.mjs` with no DeepSeek key.
- Evidence: `artifacts/implementation/{lock,npm-ci-normalized,npm-rebuild,npm-ls-patched-fresh}.log`, `dependency-gates.json`, `staged-doctor.json`, `integration-patches.tap`. 620 installed packages, one physical Cordis, all DSH family at RC.2, resolver ESM export and native module loading pass. English TUI and actual `/provider` menu observed under staged runtime.
- Discovered corrections: Chimney bundles ten unsupported `workspace:*` metadata edges; normalize to actual bundled 0.1.0 and patch staged manifests with original tarball integrity retained (patch E). Remove npm's obsolete hidden manifest cache after patches. RC.2 bin is import-guarded and requires its exported `runCli`; forward its verified resolvedProfile hook with the app manifest anchor. Anchoring at DSH alone cannot import Chimney through the native resolver. Require TUI/activity activation explicitly (patch F). No versions, peer enforcement, package architecture or permission policies changed.
- Next unit: 5 verification, then unit 6 finished-executable acceptance. Unit 4 remains incomplete until live `/update`, `/restart`, package-manager and permission scenarios pass.

## Unit 5 — launcher implemented; unit tests pass

- Changed: `cmd/devneya`, `internal/launcher`, `internal/payload`, `go.mod`, `go.sum`.
- Commands: direct Go 1.27.2 `go mod tidy`; `go test -mod=readonly -race ./...`; `CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -mod=readonly -trimpath ...`.
- Evidence: `artifacts/implementation/go-unit-tests.log`, `windows-compile.log`. Tests cover CLI, ownership refusal, symlinks, validation, repair/data preservation, concurrent publication, interrupted staging, archive traversal/collisions, identity, environment isolation and development-build failure. Windows cross-compilation is not Windows acceptance.
- Next unit: 6.

## Unit 6 — local Linux candidate (in progress)

- Changed: `scripts/build.py`, test-only locked `tests/package*.json`, mock provider and tests.
- Commands: `python3 scripts/build.py --target linux-x64 --candidate`; finished executable `--version`, `doctor --json`; separate pinned `node-pty@1.1.0` strict install; `node --test --test-isolation=none tests/mock-provider.test.mjs`.
- Evidence: `artifacts/implementation/build-linux-x64.log`, `binary-doctor.json`, `test-ci.log`, `mock-tests.tap`; executable doctor passes native imports and profile checks; mock tests 6/6 pass. First candidate did not dispatch runCli; fixed in bootstrap and rebuilding. It is ineligible for publication (dirty candidate source).
- Host: Ubuntu 26.04.1, x64; not the Ubuntu 22.04 release baseline. Network namespace attempts fail with EPERM; passwordless sudo is unavailable. Rootless Podman is available for investigation. These are environment limits, not acceptance passes.
- Next unit: continue finished-executable acceptance; do not tag.

## Further unit 4/6 verification

- Finished executable configured `devneya-ci` through actual `/provider` UI, then streamed a local mock turn; `artifacts/implementation/provider-ui-receipt.json` and `provider-probe.log`.
- A fresh non-root Ubuntu 22.04 container with `--network none` reached the actual English provider UI (not only doctor), using pinned image digest recorded in `build.json`. Linux native inventory rejects required objects exceeding GLIBC 2.35; alternative musl assets are explicitly outside this target ABI.
- Initial audit had three underlying advisories affecting 14 packages. Narrow security overrides pin Sharp 0.35.5, MCP client/core 2.2.0, and fflate 0.8.3 without changing DSH/TUI. Fresh strict lock generation was necessary: updating an old lock left an invalid nested Sharp resolution. `npm-audit-fixed.json` reports zero known advisories for the installed fixed tree. See `SECURITY_REVIEW.md` for advisory links and reachability review.
- Live status lines exposed an independent upstream working-activity language reader; patch G now points it at owned TUI preferences and a regression verifies English under a Chinese locale. Windows directory privacy now uses an inheritable owner/system/administrators DACL; POSIX permission bits alone are insufficient there.
- First expanded finished-binary suite was **15/29**, therefore failed. Precise receipts are `dist/linux-x64/acceptance-report.json`; raw local diagnostics under `artifacts/linux-x64`. The PTY harness initially matched old completion text before new tool results settled; unique turn markers and a screen accumulator fix that driver error. All mandatory unfinished/failing scenarios remain release failures.
- Commands added: `python3 scripts/check_inputs.py`; `python3 -m unittest discover -s tests -p 'test_*.py'` (4 pass); `node --test --test-isolation=none tests/terminal-screen.test.mjs` (2 pass); `go test -mod=readonly -race ./...` (pass including concurrent ownership); `python3 scripts/build.py --target linux-x64 --candidate`; native inventory and strict dependency gates (pass); audit (zero known findings).
- Next: complete unit 6 and then native CI qualification. Workflows and release assembly are implemented but remain unexecuted and unqualified. No tag created.

## Unit 4 — local integration acceptance complete; unit 6 — local Linux complete

- Changed: launcher and bootstrap, version-bound patches A–G, frozen manifests, native builder, isolated PTY fixtures, mock provider and all 29 acceptance scenarios. Required native target qualification is still unit 7.
- Exact completed run: `DEVNEYA_ACCEPTANCE_TMP="$PWD/.build/acceptance" DEVNEYA_CONTAINER_ENGINE=/usr/bin/podman DEVNEYA_ROLLBACK_BINARY="$PWD/.build/rollback-devneya" .build/node-v24.22.0-linux-x64/bin/node tests/acceptance.mjs --target linux-x64 --directory dist/linux-x64`.
- Evidence: `artifacts/implementation/acceptance-linux-x64-reviewed.log`, `dist/linux-x64/acceptance-report.json`: **29/29 pass**, build `112b14456217548fd191`, local Ubuntu 26.04.1 x64 with separate fresh non-root Ubuntu 22.04 network-disabled container. This dirty-source candidate is explicitly ineligible for publication. Actual `/provider`, plugin-manager refusal in the running TUI, allow/deny, PTC bundled Node, subagents, `/resume`, `/restart`, Unicode/paste/EOF, orphan checks, recovery and data-compatible rollback all passed.
- Driver corrections: terminal query replies are emulated as VT100 DA1; current-screen matches avoid old modal/completion text. Chat readiness recognizes the actual resumed composer. Unreachable endpoint displays “Connection error.” PTC returns console output as plain tool text. Fixture workspaces get their own Git boundary, preserving real workspace-write policy. Alternate builds receive the 180-second first-extraction budget; warm starts retain 60 seconds. Disposable fixtures clean themselves after sanitized receipts are saved. A full test run exhausted the old temporary-filesystem quota before cleanup was added; that run remains failed in its log.
- Commands: `python3 scripts/build.py --target linux-x64 --candidate`; `python3 scripts/native_inventory.py dist/linux-x64 --target linux-x64 --output artifacts/linux-x64/launcher-native-inventory.json`; `go test -mod=readonly -race ./...`; `go vet -mod=readonly ./...` (direct pinned Go and project-owned caches); `python3 -m unittest discover -s tests -p 'test_*.py'` (19 pass); pinned Node tests for mock provider, screen and terminal replies (10 pass); eight patch regressions and native/dependency gates pass in the build; `.build/tools/actionlint .github/workflows/*.yml` (v1.7.12, pass); `python3 scripts/check_inputs.py` (pass).
- Next unit: 7, native GitHub Actions builds and acceptance on all four required targets plus explicit Windows qualification. No tag or release yet.

## Units 7–8 — pipeline implemented; qualification and assembly pending

- Changed: pinned official Actions workflows, exact first-parent rollback fixture builder, release identity/receipt gates, archive/checksum/draft publication helpers, native ABI/library inventory, third-party notices and corresponding-source assembly. Build lifecycle scripts use an owned builder home/cache/tmp. Windows and macOS remain unqualified; cross-compilation alone is not qualification.
- Corresponding sources: pinned 28 native-library archives, complete upstream build recipe and five patches, plus 357 registry crates verified against the shipped librsvg Cargo.lock. Preserved 715 native license files, GNU LGPL/GPL text, and Go/module notices with byte hashes. The source asset is separate from the runtime; compilers and package managers are not shipped.
- Commands: `python3 scripts/source_bundle.py --collect-notices`; `python3 scripts/source_bundle.py --candidate`; `validate_source_bundle(..., allow_candidate=True)` rehearsal; `python3 scripts/package_release.py --target linux-x64 --candidate`. Evidence: `artifacts/implementation/native-source-notices.log`, `source-bundle-rehearsal.log`, `package-linux-candidate.log`; source bundle 201,786,568 bytes, SHA-256 `f66f8798aa271e64aea74dec248813a156b6b8e01bc9c5d087b89381b2b1df54`. Candidate receipts cannot pass publication gates. Native platform assets and a complete nonpublishing release assembly remain pending.
- Repository access: `/snap/gh/current/gh auth status` succeeds; Actions enabled; release publication is tag-gated. The pipeline builds an actual committed first-parent data-compatible rollback fixture.
- Next unit: finish 7, then assemble actual accepted platform outputs in 8.

## Unit 7 — committed native CI input

- Implementation baseline committed as `27775933e8d5d786db776fafe9b483923b2a83af`. This follow-up documentation commit leaves the same data-compatible DSH/TUI composition and gives native CI a real first parent for rollback.
- Local candidate platform archive validated with `read_archive(...)` and `validate_receipt(..., allow_candidate=True)`; the finished executable digest, all 29 receipts, pinned build inputs, notices and source identities agree. Publication still rejects this dirty-source candidate.
- Commands: `git diff --cached --check`; pinned `gofmt -l cmd internal` (clean); staged credential-pattern scan (no credential material detected); `git commit -m 'Implement self-contained devneya runtime and qualification pipeline'`. Original upstream notice whitespace is retained under explicit Git attributes and checked by hashes.
- Next: push the two committed revisions and inspect all native CI outcomes. No release tag yet.

## Unit 7 — first native CI failures diagnosed

- Run: `https://github.com/Devneya/tui/actions/runs/38948893377`, source `28d68b92bc52654805e50dc1f32f4cdf7f1ab569`. Unit/source-bundle job passed. All four required native targets built their finished executable and passed dependency/native/patch gates. Linux x64/arm64 and macOS ARM64 then failed rollback-worktree cleanup because Go module-cache directories are read-only; macOS Intel confirmed the same cleanup error after its successful parent build. Windows failed UTF-8 diff output under its default code page before qualification. No platform is accepted from this run.
- Reproduced local real-parent build: source `27775933e8d5d786db776fafe9b483923b2a83af`, executable build `45fd41ca132c57971179` built successfully, then the same Git worktree cleanup failed. Its remaining tracked files were checked against that commit before removing only the owned failed-cleanup directory. The copied, verified baseline executable is retained under `.build/rollback/linux-x64`.
- Changes: `build_baseline.py` grants owner-write only inside its newly created clean worktree, skips symlinks, then removes it through Git. It still refuses existing unknown directories and tracked changes. `build.py` replaces its generated notice output to support repeated builds with upstream read-only notices. `apply_patches.py` writes diffs explicitly as UTF-8. Windows PTY fixtures expose only separately installed developer-tool directories that contain no application runtime. Release/build scripts reject optimized Python, which would disable assertion-based checks.
- Commands: raw job logs retrieved through `/snap/gh/current/gh api repos/Devneya/tui/actions/jobs/JOB_ID/logs`; `python3 -m unittest tests.test_build_baseline -v` (9 pass, including read-only cache cleanup); `python3 -m unittest discover -s tests -p 'test_*.py'` (21 pass); pinned Node syntax check; actionlint (pass). Raw artifacts: `artifacts/implementation/ci-*-job.log`, `baseline-linux-x64.log`, `build-linux-x64-committed.log`.
- Next: rerun unit 7 with these build/test-harness fixes. No release tag.

- Additional unit 7 fixture correction: the original Ubuntu 22.04 digest was an amd64 image manifest, not a multi-CPU index. `podman manifest inspect docker.io/library/ubuntu:22.04` verified the matching native ARM64 digest. `build.json` now pins both architecture-specific images; the Ubuntu 22.04/glibc 2.35 baseline is unchanged.

- Unit 7 root-validation review: compare the existing application directory's filesystem identity with HOME before accepting its ownership marker. This covers case/normalization aliases on Windows and macOS. The finished-executable permissions scenario now supplies a valid marker and verifies that HOME and any physical case alias are rejected. Linux race tests pass; native validation remains required.


## Unit 7 — Linux accepted; macOS PTY fixture corrected

- Run `https://github.com/Devneya/tui/actions/runs/38950799947`, source `adeabe610a254427b8b77e1fce377a75df347ead`: both Linux targets passed all 29 scenarios on native Ubuntu 22.04 runners, including offline non-root startup. Both macOS builds passed native/dependency gates and rollback preparation but failed before PTY spawn. Windows failed native-library qualification; no Windows artifact is accepted.
- Changes: the locked test-only node-pty 1.1.0 tarball publishes both Darwin spawn-helper files without execute bits. `tests/prepare-pty.mjs` verifies that version and the selected regular helper before granting execute permission. The runtime beta package already ships executable helpers. Patch B now also adapts managed help tips that otherwise advertise package installation, upstream binary updates and unrelated storage. Nonmanaged upstream tips retain their original text. The Windows inventory recognizes documented OS d3d9.dll and reports all unresolved libraries together; the exact locked LibreOffice executable also requires unbundled msvcp140/vcruntime140 DLLs, so Windows remains unqualified without redistribution evidence.
- Commands: GitHub job log API and `gh run download ... --pattern qualification-*`; local locked Windows tarball SHA-512 verification and PE import inspection; `python3 -m unittest discover -s tests -p 'test_*.py'` (21 pass); `DEVNEYA_TEST_APP="$PWD/.build/install-linux-x64" .build/node-v24.22.0-linux-x64/bin/node --test --test-isolation=none tests/integration-patches.test.mjs` (9 pass); `node --check tests/prepare-pty.mjs`; actionlint; `git diff --check` (pass).
- Evidence: `artifacts/implementation/ci2-{darwin-arm64,darwin-x64,windows}-job.log` and `ci2-receipts/`. Official Direct3D OS API reference: https://learn.microsoft.com/en-us/windows/win32/api/d3d9/nf-d3d9-direct3dcreate9 . All remaining mandatory scenarios still block their target. Next: finish unit 7 for the revised source, then actual accepted-asset assembly in unit 8. No tag created.

# 03 — References and evidence

Every source used, what it is, what it contributed, and how far it can be trusted.

**Confidence key:** **[deployed]** running in production · **[measured]** a study with numbers · **[vendor]** the maker's own claim · **[argued]** reasoning, not evidence.

---

## Deployed systems

**omp advisor** — https://omp.sh/docs/advisor — [deployed]
Contributed the concrete mechanisms: delta-fed reviews (only what is new since the last review), read-only default tools, severity routing (note / concern / blocker), cooldown after an interrupting note, catch-up policy controlling how far a reviewer may lag, reviewer-only priors in a separate file, rosters of specialists with per-entry models and tool grants, and advisors excluded from peer rosters so they cannot be recruited as workers.

**omp vibe mode** — https://omp.sh/docs/vibe — [deployed]
Contributed the director/worker split: the director is stripped to read plus worker control and cannot edit or execute; workers are persistent keep-alive sessions with their own transcripts; verification is done by reading the touched files. Key line: worker completion means the turn settled, not that its claims are correct.

**Claude advisor tool** — https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool — [deployed]
Contributed the in-turn consultation pattern: the executor calls the advisor mid-generation, the advisor receives the full transcript, runs tool-less, and returns guidance as a tool result. Output cap around 2048 tokens gave roughly a 7× reduction in advisor output with near-zero truncation.

**Prime Agent Rust rewrite** — https://www.primeintellect.ai/blog/prime-agent-rust — [vendor, unaudited]
Contributed the production role structure: Root (orchestrates, writes no product code, negotiates priorities with humans), Planner, Implementer, Reviewer (adversarial, deliberately a *different model*), Verifier (compiles and runs parity checks in a fresh sandbox). Merge requires review and verification to pass. Reported: ~1,981 agents, ~193B tokens of full-scale GLM-5.3, ~10,000 sandboxes, two weeks. Cold start 14.18× faster, memory 4.76× smaller, install 172.1 MB → 59.6 MB.

## Measured studies

**NSED / Mixture-of-Models** — https://ar5iv.labs.arxiv.org/html/2601.16863 — [measured]
Contributed: small (<20B) ensembles matching or exceeding 100B+ models on AIME 2025 and LiveCodeBench; roster selection formalised as a cost-constrained optimisation; the requirement that mean verifier precision exceed 0.5 or iteration converges on wrong answers faster; self-grading structurally masked; and quadratic context fatigue implying an optimal stopping point.

**Small agent collaboration vs one big model** — https://ar5iv.labs.arxiv.org/html/2601.11327 — [measured]
Contributed the counterweight: on GAIA, tools beat scale (4B+tools 18.18% vs 32B no-tools 12.73%), but absolute scores stay low (best agentic 25.45%, Level 3 0–11.5%) and the dominant failures are orchestration failures — skipped tools, non-termination, output-format drift. Extra reasoning hurt at both 4B (13.33 → 9.09) and 32B (25.45 → 23.03).

**Context Language Models** — https://arxiv.org/abs/2609.37725 — [measured]
Contributed: external summarisation loses exact details and invents others; letting the working model manage its own memory file beat summary-based methods (59.4% on deep research, ~20% less compute); but with a small model, plain summarisation won (34.7% vs 28.8%), and models cannot estimate their own context fullness.

**Recursive Language Models** — https://arxiv.org/abs/2512.24601 — [measured]
Contributed the technique: material stays outside the prompt as a variable in a code environment; the model sees only size and a short preview, writes code to slice it, and can call itself on slices. Reported: 6–11M token deep research 91.3 vs 0.0; code-repo QA 62.0 vs 24.0.

**RLM reproduction** — https://arxiv.org/abs/2603.02615 — [measured; single author, not peer-reviewed]
Contributed the limits: Kimi K2 scored 86.6% plain and only 60% / 55% when wrapped — the technique hurt a model that was already capable. Easy retrieval ran 100% → 85% → 70% as recursion deepened. Latency 3.6s → 89.3s → 344.5s, one run at 1,223s.

**Prime Agent technical report** — https://arxiv.org/abs/2608.23552 — [vendor]
Contributed: largest gains for GLM-5.2; Opus 5 and GPT-5.6 at or slightly below their native harnesses; on one benchmark, "the choice of harness has little effect." Their own conclusion: the capability is underused because models were not trained to operate it.

---

## What is NOT confirmed

- **Prime's numbers.** No independent audit. Press repeated the vendor post; no cached-versus-fresh token breakdown published. The vendor itself warns the speed comparisons lack a common benchmark.
- **The advocate.** Unproven anywhere. The *gap* is observed — Prime's four roles all grade against the same automated checks, and a cheating shortcut passed both review and verification. Whether a separate seat closes that gap is the bet.
- **Advocate behaviour.** Whether it holds human register over a long run; whether a read-only advocate reliably catches injected instructions; which model makes the best advocate (disposition versus benchmark rank).
- **RLM beyond ~10M tokens.** A 1 GB document is roughly 250M tokens — 25 to 40 times beyond anything demonstrated.
- **Milestone as cue versus gate.** Unmeasured.
- **Whether the human-side seat survives in a harness that does not enforce it.** This harness cannot strip the agent's write tools, so it would be discipline rather than architecture.
- **Different model family versus different checkpoint** for critics. Assumed, not tested.

---

## Corrections made during the session

1. Wrote notes into the `potemkin.co` vault — wrong location. File removed.
2. Described the big-context model as holding the whole record. A million tokens is not everything. Correct framing: **in hand versus on disk**.
3. Called GLM-5.3 a cheap-tier model. Flash is the cheap tier; the port ran on full-scale. This weakens the cheap-executor claim rather than supporting it.
4. Listed four "actionable" rules that turned out to be three descriptions of the status quo plus one guardrail on a component that may not need to exist. See file 02.
5. Drifted into the source material's own vocabulary after reading papers directly into the conversation layer — the exact failure the design is meant to prevent. Fix adopted: delegate the read, keep the conversation layer clean.
6. **2026-10-16 — Project scope correction (user clarification).** The previous `AGENTS.md` described this directory as a harness-design project. The user clarified that the project is a TUI based on DSH. `AGENTS.md` now points to `DSH_TUI_BINARY_HANDOFF.md` as the product brief; files 00–03 remain background research.
7. **2026-10-16 — Version 1 requirements (user clarification).** Product/executable name is `devneya`; repository is `Devneya/tui`; GitHub Actions must build and publish the releases. Linux and macOS are required targets, with Windows if feasible. These supersede the handoff's initial Linux-only scope and proposed `dshtui` name. TUI choice and a DSH prerelease policy remained open at this point in the record; item 8 records the later selection and authorization. The refreshed upstream evidence is recorded in handoff Appendix E.
8. **2026-10-16 — Packaging decision and status correction (user authorization).** The selected pair is Chimney `@deepseek-harness-tui/dsh-tui@0.15.0` from `18e4a206afc367f055a2b3379bb221abcbb5d99e` and DSH `@deepseek-ai/dsh@0.2.0-rc.2` from `639ed015397290b3745d163aafe02ffee4aa3f84`; RC.2 is explicitly accepted and remains a prerelease. The selected format is a Go executable containing a ZIP of ordinary Node `24.22.0` and the frozen npm tree, with npm `11.19.1`, Go `1.27.2`, and Python `3.14.4` pinned. Required targets are Linux x64/arm64 on Ubuntu 22.04 with glibc 2.35 and macOS x64/arm64 on macOS 15; Windows x64 on Windows Server 2025 is preview-only pending qualification. Build natively in GitHub Actions. Do not create or push a `vSEMVER` release tag until all required acceptance passes. Linux/macOS are currently unqualified; macOS binaries are ad-hoc signed and not notarized; no paid signing is planned. This corrects the pending-choice wording in item 7 and handoff Appendix E without changing its historical comparison evidence. No implementation or acceptance completion is claimed.
9. **2026-10-16 — Implementation verification corrections.** Strict package-lock preparation alone did not establish that npm ci worked: Chimney 0.15.0 bundles ten unconverted workspace metadata references. The staged manifests and lock metadata now receive version-bound corrections to the bundled 0.1.0 identities without changing artifact integrity or bypassing peer enforcement. RC.2's CLI requires calling its exported `runCli`; its verified forwarded application-profile hook needs the app manifest as installation anchor to expose the co-installed TUI. Live testing also found working-activity reads its own upstream language path independently, requiring a managed-path patch. The actual standard preset advertises `read`, `write`, and `edit`; the earlier `str_replace_editor` observation is not the default standard-preset tool catalogue. These findings are recorded with tests in the implementation ledger and patch notes.
10. **2026-10-16 — Native qualification evidence.** Source `317f18522e17c2f7b944398732e56e47d808ccd5` passed all 29 scenarios on both native Ubuntu 22.04 CPU runners. Both macOS 15.7.9 runners passed 27/29; shell and PTC failed after the no-runtime test PATH omitted Apple's `sandbox-exec`, and DSH correctly refused unconfined execution. The test fixture now exposes this OS facility without exposing a system application runtime. Test-only node-pty 1.1.0 also needed executable bits on its published Darwin spawn helpers. These fixture corrections require a new complete native run and do not establish macOS qualification by themselves.
11. **2026-10-16 — Complete native results and stricter cleanup oracle.** Source `c78a8cc8a167d318c0febfdd03f1e1ebef7b39ae` reported 29/29 on all four required native runners and passed complete nonpublishing archive assembly. Windows failed native DLL qualification and was excluded. Final review identified that macOS physical temporary paths and the TUI's changed process title could weaken command-name-based orphan detection. The final harness uses canonical paths, real executable-path inspection and a positive live-process assertion; a new full run is required before final publication. The repository immutable-setting API also requires Administration:read; an administrator's audit is separate from contents-only automatic publication.
12. **2026-10-16 — Draft release API correction.** All four binaries passed the tag workflow's complete native suite at source `b0fe8cc036b517d4cb84ba3d13ee88386e017019`. Publication stopped after creating an empty unpublished draft: GitHub's release-by-tag endpoint does not expose drafts. The publisher now uses the paginated release list, rejects duplicate matches and resumes the existing draft. Regression tests model the actual API distinction. No release assets had been uploaded; the implementation ledger records the old tag identity and requires fresh qualification before retrying an unpublished tag.

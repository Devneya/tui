# 01 — Architecture summary and findings

*First summary/result of the harness design discussion. Verbatim write-up.*

## What you set out to build

No single model does everything. One works. Others check it from different angles. One stays on your side of the table — never executing, keeping the work legible, making sure what reaches you is in your language rather than the shorthand a model drifts into after a few hours of work. Each seat on a different model, picked for cost.

## How it fits together

The executor works and keeps its own memory file — a running note of what it's holding, what it decided, what it ruled out. It owns that file because it's the only party that knows what it's doing; anyone else deciding what to keep is guessing.

Checking happens on two clocks. Continuously, a model from a different family watches the work as it happens and can flag a problem, redirect it, or stop it. On demand, when the executor is stuck or about to commit to an approach, it can pull in a stronger model for a plan and go back to work.

At a milestone — a feature done, a decision settled — three things happen together. The executor tidies its memory. The advocate re-primes. And you get a summary you can actually read. That's why the milestone is the unit: both kinds of memory need resetting at the same moment anyway, so it costs nothing to also hand you a legible checkpoint there.

The advocate's one hard constraint is that it never executes. That isn't a safety rule, it's what keeps its viewpoint intact: an agent that can edit starts thinking "what should I change?", and one that can only read and talk to you thinks "what does this person need to understand?" Those are different jobs. And it reads the diffs, the commits, the test output — never the executor's description of them — because anything downstream of the executor's own account inherits its mistakes, and that's the kind of error nobody later catches.

Underneath all of it: the record lives on disk. Nothing holds it in context — not even a million-token window, which sounds like everything until you've worked on something real for a month. Compaction shrinks what's in hand, never what exists. Once the record is safe and findable, forgetting stops being destructive, and the ledger only has to carry decisions and locations rather than knowledge.

## Where your instincts held

**Different model per role, balanced on cost** — right, and it's the best-supported thing here. There's a formal version of it (choosing a roster under a cost limit) and a deployed one (Prime's reviewer is deliberately a different model from the implementer).

**The human-side seat** — your strongest call, and the evidence for it came from someone else's failure. Prime ran planner, implementer, reviewer, verifier, and all four graded against the same automated checks. Their agent kept a cheat as a reusable "skill" and passed review *and* verification. Nothing in that structure was holding the human's intent.

**The pollution intuition** — correct, and it has a measured form: noise builds up faster than signal, so there's an optimal number of review rounds, and past it you're paying for damage. You applied it to one run; it's the same principle that says the advocate shouldn't live inside the executor's context at all.

**Milestone as the unit** — held, with one change: make it a cue, not a gate. Nudge the executor to tidy up; don't force a rewrite on a schedule.

## Where it was a miss

**Two cheap models ≈ one big model** — half right, badly bounded. It holds where the answer can be checked. On messy long work the failures are things like skipping a tool it needed, never stopping, or drifting off the required output format — and a panel doesn't fix those. The showcase that looked like your proof ran on the full-scale model, not the cheap one.

**A dedicated cheap compaction model** — a miss, measurably. The gain comes from the worker deciding what to keep, and it grows with how good the worker is. With a small model, plain summarizing beat it.

**The 1M hand-over librarian** — dissolved rather than failed. Reading turned out to be a skill of whoever is working, not a separate job. And the premise was wrong: a million tokens isn't a record, it's just a bigger desk.

**RLM as the answer** — conditional, not general. It rescued models that couldn't hold the material and made one that could *worse*.

## The pattern underneath

Every idea that assumed a cheap model could exercise judgment failed. Every idea about who holds which perspective held. So the savings you were looking for weren't in cheap models at all — they were in the structure. Cheap models where a test can tell right from wrong; the expensive one where nobody can. And the free win is the record on disk: you stop paying to remember.

---

## Drift: causes, and what actually helps

Smaller models drift faster because they have less spare capacity to hold the goal while working. The mechanisms:

1. **Accumulation.** Failed attempts, contradictions and verbose output stay in the window and compete for attention. Noise grows faster than signal.
2. **Distance from the anchor.** The longer the run, the further the model is from the original request — and it *remembers* that request rather than re-reading it. Memory decays; a file doesn't.
3. **Self-reference.** Once its own output is in context, it treats it as established. Its guesses become premises.
4. **Cheap shorthand.** Once a compressed name exists, using it costs less than expanding it, so the expansion is silently lost.
5. **No self-observation.** Models can't see their own state: they can't judge how full the context is, and they can't tell they've wandered. They drift without noticing.
6. **Contract decay.** Format and constraints fade with distance from where they were stated.
7. **Loops.** Especially with reasoning on — the model reasons its way into repeating an action with no stopping condition.

**What does not work.** A panel of models, because it grades the *output* while drift is a *process* property — every member sees the same drifted output and judges it on its own terms. More thinking, which measured worse. Asking the model to be careful, since it cannot observe the drift.

**What works.** The theme: shorten the loop, keep the anchor external.

- **Reset more often.** Drift is a function of distance from the source. Cheap models need *more milestones*, not more reasoning.
- **Re-read the goal, don't remember it.** The original request, verbatim, at every boundary.
- **An external fixed reference.** Not peers grading output — a party holding the user's intent that reads the artifacts. That is the difference between the advocate and a panel: a fixed outside reference instead of the output grading itself.
- **Deliberately narrow desks.** Less material to drift among.
- **Separate contexts.** If the writer and the checker share a context, they share the drift.
- **Make steps checkable.** Drift is invisible without a check — see below.
- **Bound the loop.** Step caps, explicit stopping conditions, a cooldown after an intervention.
- **Shorter, tighter tasks.** Drift scales with length and ambiguity.

**Practical rule for cheap models: swap thinking for re-anchoring.** More resets, more re-reads, shorter tasks, smaller desks. This is the real function of the milestone — not memory management, but three anti-drift actions happening at once: context trimmed, goal re-injected, advocate re-primed from artifacts.

### Making steps checkable without paying for a check at every step

"Checkable" is a property of the task, not an activity performed constantly. The economics only work when the checks are already free:

- **Free checks, already in the pipeline.** Compiler, type checker, test suite, formatter, build. Writing code *is* being checked — you find out immediately at no extra cost.
- **Cheap checks, run at boundaries.** The existing test suite, a diff against a reference implementation, a schema or format assertion, running the same input twice and comparing.
- **Expensive checks, best avoided.** A second model reading everything; human review; prose consistency.

So you do not check every step — you choose work where the free checks already cover most steps, and run the cheap ones at boundaries. The decision rule: **if verification costs less than the gap between a cheap and an expensive model, use the cheap one; if it costs more, use the expensive one.** That is the whole economics.

How to make a task more checkable, in rough order of leverage:

1. Prefer work with an executable oracle: a compiler, a test suite, a reference implementation to diff against.
2. Turn the goal into assertions *before* starting — write the failing test first.
3. Keep steps small enough that failure is visible immediately. A small diff is checkable by eye.
4. Fix the output contract and make it machine-checkable: a schema, an exact format, an exact string.
5. Where no oracle exists — that is exactly where the expensive model and the advocate belong.

---

## Units of work: the two-tier plan, and why the tiers align with the context

### The plan

Two tiers, and mixing them is what makes it look heavy:

- **Every step.** Free checks only — compiler, types, build. The working set turns over. No ceremony at all.
- **Every milestone.** The six-step boundary: trim the working set, re-inject the anchor, run the full checks, update the ledger, re-prime the advocate, emit the human summary.
- **Per milestone or coarser.** The summary that reaches the human. Units small enough to make summaries meaningless just produce summaries of nothing.

Unit-size rule: **shrink the unit until the free checks can catch a mistake inside it, then stop.**

For a small model this *is* the strategy — shorter units, more boundaries. Trading model capability for loop discipline. It stays cheap because the ceremony is mostly re-reading files rather than inference.

### Why the tiers align with the context

Because context and work share one lifecycle, and if you don't align them, they fight.

**Context only grows.** Every tool call adds tokens and nothing subtracts them. Left alone, context fills until quality degrades — and the point of degradation has no relationship to the work. Structure is what creates a place for context to shrink.

**Compaction is lossy, and its loss is only meaningful relative to a unit.** Compacting mid-task risks dropping the detail the task is about. Compacting at a task boundary drops the *process* of a finished thing and keeps its *result*. The unit of work is what makes forgetting safe; a token threshold is not.

**The same boundary is the only meaningful point for the other four things.** You cannot check "is this right" mid-edit — only "does this hold" when a unit completes. Drift accumulates over distance, so the boundary is where re-anchoring pays. A summary of half a task is noise. And the ledger only has something to record once something is finished.

So one event — *a unit of work is complete* — is simultaneously the safe point to forget, the meaningful point to verify, the natural point to re-anchor, the right point to re-prime the advocate, and the only point where a summary is worth reading. That is why they are one mechanism rather than five separate chores.

**And it is why cheap models become viable.** A cheap model's failure mode is drift, which scales with distance from the anchor rather than with intelligence. So the lever is unit length, not capability. Shorter units, more boundaries, less distance. You buy reliability with structure instead of with a bigger model — and the structure is cheap, because the boundary ceremony is mostly re-reading files while inference is what costs money. The substitution is cheap operations for expensive ones.

**Corollary.** Context compaction is not a memory chore running alongside the work. It is the reset that lets the next unit start clean. Pinned to work boundaries it discards exactly what is finished and keeps exactly what is live. Pinned to token thresholds it destroys work in progress.

---

## The context model

There are only three kinds of thing in a working model's context:

| Slot | Content | How it gets there |
|---|---|---|
| **1. The instruction** | goal, constraints, output contract | **injected** — verbatim, re-injected at every boundary |
| **2. The decisions** | what was decided, what was ruled out, where things live | **re-read from a file** at every boundary, never remembered |
| **3. The material** | files, diffs, errors currently being worked on | **resolved** — looked up on demand |

Plus a line or two of instruments: fullness gauge, milestone count.

Only slot 3 comes from the library function. The rule that matters: **the anchor is injected, the working set is resolved.** Anything resolved has been *chosen* by something, and a model cannot miss what it never saw — so the goal must be immune to being chosen. Same reason the decisions are re-read rather than summarized: summarizing is choosing.

`resolve` — the library function: given a question, return the material to put in front of a model. Called upfront it is a briefing; called mid-task it is a lookup. Same operation, different trigger.

"Desk" = the material currently out. A big-context model is a big desk: more material out at once, nothing more.

## The library stack

Four layers, and each matters only if the one below it is insufficient:

1. **Extract** — turn the source into something sliceable. The real bottleneck for PDFs, binaries and scans.
2. **Index** — find things without reading everything. For a repo this is grep, glob, git history and an LSP symbol index; nothing new to build. For a large corpus, a text index with a query tool returning locations and snippets.
3. **Retrieve** — return pointers plus verbatim excerpts. If what comes back fits in context, read it and stop.
4. **RLM** — only if the retrieval result *still* does not fit **and** the question is answerable by filtering, counting or aggregating. Not for questions needing a global view of the whole.

Rule at every layer: **pointers, not content.**

## Seats and tools

A model is a **seat** when its output holds judgment that must be weighed — no mechanical way to accept or reject it. It is a **tool** when its output is mechanically checkable, a transformation of form, or a lookup. The interface does not decide it: Claude's advisor is exposed as a tool call but is a seat.

Turned into tools:

- Cheap compactor → candidate summaries plus log keeping
- Big-context model → the desk
- Reader/translator → converts dense source material into the register a seat needs
- Search and index → retrieval
- The fullness gauge → an instrument
- Prime's "Verifier" → the checks decide, not the model

Stayed seats: the executor, the critics, the advocate.

The pattern: **transformation jobs become tools; judgment jobs stay seats.**

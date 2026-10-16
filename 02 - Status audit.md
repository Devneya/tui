# 02 — Status audit: what is already solved, what is genuinely new

Purpose: separate *design* from *vocabulary*. Most of what these notes describe is either standard practice or already true in existing harnesses. This file marks the difference.

**Read this before acting on file 01.** File 01 explains the design; this file says how much of it is real.

---

## Already addressed — descriptive, not prescriptive

These are descriptions of the status quo, not recommendations. Nothing to build.

| Item | Why it is already handled |
|---|---|
| **Re-read the goal at boundaries** | The original message stays in context in every harness; the goal is present until compaction rewrites it. Residual action: exempt the anchor from compaction. A one-line rule, not a mechanism. |
| **Keep units short** | Standard practice, human or agent — small commits, atomic changes. No harness can enforce it; the agent picks its own step size. Advice, not engineering. |
| **Keep the goal out of the search path** | Structurally already true. System prompt and user message are never retrieved; they are always in context. This is a constraint on the desk/briefing component, and only matters if that component gets built. |
| **Record on disk, pointers not content** | Already the default. Transcripts are on disk, git holds history, agents read files rather than being handed content. |

---

## Genuinely not addressed anywhere

Three items. These are the actual payload of the whole design.

1. **Who owns compaction content.** Existing harnesses let a summarizer rewrite your history at a threshold. The evidence says the working model should own it — measured, and only for strong models.
2. **Compaction triggered by work boundaries rather than token thresholds.** A real departure from current behaviour. Thresholds have no relationship to the work; boundaries do.
3. **The advocate**, with its three rules: reads artifacts rather than narration, never executes, reports to the human directly rather than through the orchestrator. None of this is standard — subagents today are briefed by narration, reviewers get full tool grants, and everything funnels through the orchestrator.

### The uncomfortable shape of that

Two of the three are about the one operation that actually destroys information. The third is the unproven bet. Everything else in these notes is either existing practice or naming.

---

## Vocabulary warning

These are names for things that either already happen or would happen anyway. They are not mechanisms:

- **"The four seats"** — critic and verifier already exist in production. Naming them is not a contribution.
- **"The three slots"** — a description of any context window. Its only actionable consequence is one rule: do not let the goal be summarized or searched.
- **"The library function"** — one name for search, lookup and briefing, which were always the same operation.
- **"The six steps"** — one event described six ways.

Frameworks are cheap to produce and feel like progress. That is exactly how they accumulate past their usefulness.

---

## How to test rather than argue

Two rules are cheap to A/B on real work:

1. **Boundary re-anchoring** — re-read the goal verbatim at each boundary, versus relying on the model to remember it.
2. **Unit length** — shorter units with more boundaries, versus longer units with fewer.

If neither moves anything measurable, the surrounding vocabulary should be dropped and only the three open items kept.

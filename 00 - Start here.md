# Start here

Working notes for a harness design — roles, models, context handling. Written to be picked up cold.

## State of things

The starting problem: one model does everything, and it drifts — into its own shorthand, away from the goal, and away from what the human actually asked for.

The proposed fix: split the work across several seats on different models, chosen for cost, with one seat permanently on the human's side.

What survived scrutiny is thinner than the original design. Three things are genuinely new. The rest is either standard practice or naming. File 02 draws that line explicitly — read it before acting on anything in file 01.

## The three open items

1. **Who owns compaction content** — the working model, not an external summarizer. Measured, but only for strong models.
2. **Compaction at work boundaries rather than token thresholds.**
3. **The advocate** — read-only, reads artifacts rather than narration, reports to the human directly. Unproven anywhere; the gap it fills is observed.

## Files

- **01 — Architecture summary and findings** — the narrative: what the design is, how it fits together, which instincts held and which missed, drift and its remedies, units of work and why they align with the context, the context model, the library stack, seats vs tools.
- **02 — Status audit** — what is already solved versus genuinely new, the vocabulary warning, and the two cheap tests.
- **03 — References and evidence** — every source, what it contributed, and what is not confirmed.

## Where to pick up

The cheapest next step is not more design. It is the two A/B tests in file 02 — boundary re-anchoring, and unit length — run on real work.

If neither moves anything measurable, drop the surrounding vocabulary and keep only the three open items above.

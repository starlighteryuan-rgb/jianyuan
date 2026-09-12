# Architecture — Personal Awareness MVP (Approved, Patched)

Baseline commit: `5d0c63f`
Supersedes: `ARCHITECTURE_PROPOSAL.md` (kept as historical pre-review proposal, not deleted)
Status: Approved architecture incorporating Review Patches 1–10
Author: Single Architect / Repo Steward

This document is the patched, authoritative version. Tech stack and overall
architecture style (Modular Monolith, TypeScript, Next.js, PostgreSQL, Prisma,
framework-agnostic domain core, `SemanticJudgmentPort`, explicit Relation
Engine pipeline, External Reference sidecar) are unchanged from the proposal
and are not re-discussed here.

# 1. Architecture Summary

Unchanged from proposal: modular monolith, domain core isolated from I/O and
LLM SDKs behind ports, explicit Relation Engine pipeline, External Reference
quarantined to a one-directional re-entry path. This patch round changes
*internal structure* of several entities/flows to fix identity, auditability,
and epistemic-leak risks identified in review — it does not change the
architecture style.

# 2. Tech Stack

Unchanged. See `ARCHITECTURE_PROPOSAL.md` §2.

# 3. Repository Structure

Unchanged from proposal, with one addition: `domain/discovery` now owns a
persisted entity (not only a computed view — see §6 below), and
`domain/reflection` now owns two entities (`ReflectionEpisode` and
`UserReflectionRecord`) instead of one.

# 4. Domain / Data Model (Patched)

**Record** — *(Patch 1, Patch 2)*
- Dropped: single-value `epistemic_role`.
- Added: `RecordEpistemicRole` table, `(record_id, role)`, many rows per Record allowed.
  Constraint: **one Record → 0..N epistemic roles → exactly one `evidence_unit_id`.**
- Added: `evidence_unit_id` (first-class, distinct from `source_fingerprint`).
  - `source_fingerprint` = ingestion dedup only (same raw source re-ingested → same Record).
  - `evidence_unit_id` = evidence-independence identity.
  - Rule: a genuinely new, independent source of information gets a new `evidence_unit_id`.
  - Rule: records that are `derived_from` / `summarizes` / `reformats` another record
    **inherit the parent's `evidence_unit_id` by default**, unless an explicit rule
    determines the derived record introduces new independent factual content (in
    which case it gets a new `evidence_unit_id`, with lineage still pointing to the parent).
  - Rule: records related by `references` **also inherit the parent's
    `evidence_unit_id` by default**, for a different and opposite-facing reason than
    the three relations above. Those three inherit because the derived record restates
    the same information; `references` inherits because a record that merely *points at*
    something is not thereby a new independent source. The relation records
    provenance/lineage only — it preserves the link while explicitly indicating
    **"this is not new independent evidence."** A reference-derived record therefore
    inherits because it does not represent a new evidence source, which is a distinct
    thing from creating new evidentiary support. The same explicit-determination
    override applies: a new `evidence_unit_id` requires an explicit rule, never a
    default.
    - This is what allows §27's "if the user relates an external reference back to
      themselves, create a NEW `UserReflectionRecord`" to be honoured without the
      reaction manufacturing independent support (§38, INV-06, INV-03). The user's
      *meaning* is recorded and remains theirs (INV-18); only the *evidentiary claim*
      is withheld. Inheritance is the automatic **denial** of a new unit, never an
      automatic grant, so §8's "separate, explicit determination, not automatic"
      boundary is preserved.
    - Gate 5 needs no special case: it counts DISTINCT `evidence_unit_id`s, so a
      reference and every reaction to it collapse to one unit and the gate closes on
      its own.
    - `responds_to` / `revises` / `supersedes` deliberately do NOT inherit and instead
      fail closed — those touch §23/§37 prompt contamination and the §25 meaning
      lifecycle, where the contract wants a human decision on the record's very
      admissibility.
  - Example: R1 (original) → EU1; R2 (summarizes R1) → EU1; R3 (reformats R2) → EU1.
  - Example: X1 (external reference) → EU9; U1 (user's own words, `references` X1) → EU9.
    Two Records, one Evidence Unit.
  - `evidence_unit_id` is what deterministic no-double-counting checks key on —
    this removes the dependency on full transitive lineage-graph traversal for
    protecting INV-03/INV-16 in the MVP.

**LineageEdge** — unchanged (generic, polymorphic, explains *how* records relate;
`evidence_unit_id` handles *whether they count as independent evidence*, a
separate concern from lineage).

**RelationClaim** — *(Patch 8)*
- Now explicitly stores, per claim: `evidence_dimension_scores` (6 × 0–3),
  `evidence_dimension_reasons` (6 × text, from LLM), `evidence_numeric_score`
  (deterministic, computed from scores+weights), `evidence_support_level`
  (deterministic, thresholded from numeric score).
- Division of labor: LLM produces only the per-dimension judgment + reason;
  code owns weighting, arithmetic, and level assignment. Fully auditable —
  every stored score traces to a stored reason.
- No manual user override of any dimension score exists anywhere in this model
  (Patch 9 — see §11).

**Hypothesis** — unchanged in shape. Gate mechanics updated, see §7.

**Discovery** — *(Patch 6; StateAssignment scope resolved — Patch B)*
- No longer a pure computed view. Minimal stable persisted entity:
  `Discovery { id, subject_ref, discovery_kind, stable_key }`.
- `presentation_state` / archive / restore bind to this stable `id`, not to a
  recomputed transient object — expressed as target-scoped `StateAssignment`
  rows keyed to `Discovery.id` (see `StateAssignment` below).
- Attention Priority and Presentation Level remain **computed on read**, not
  stored as permanent fact — only identity is persisted, not the score.

**ReflectionEpisode** — *(Patch 4)*
- `meaning_commitment` removed.
- Retains only: `elicitation_mode`, `stimulus_type`, `system_followup_count`,
  stimulus/target lineage.
- Describes *how a reflection was elicited*, nothing about what the user
  actually committed to.

**UserReflectionRecord** — *(Patch 3, Patch 4)*
- Promoted to a distinct domain entity, not flattened into a plain `Record`.
- Shape: `{ id, record_id → Record, meaning_commitment (tentative|confirmed),
  valid_at_time, current_effect, superseded_by_ref, superseded_at }`.
- Shares with its underlying `Record`: provenance, raw expression, time
  semantics, `evidence_unit_id`.
- Owns its own Meaning lifecycle (commitment level, supersession over time) —
  this is the field that moved out of `ReflectionEpisode` (Patch 4).

**Directive** — *(Patch 5)*
- Fields: `allow_analysis`, `allow_storage`, `allow_passive_presentation`,
  `allow_proactive_presentation`, `applies_to_future_similar`, `scope`.
- `allow_passive_presentation` and `allow_proactive_presentation` are
  independent fields — "don't proactively remind me about this" does not
  imply "don't show it if I look" and vice versa.
- `allow_storage` and `allow_analysis` are independent — "just record it,
  don't analyze it" is expressible directly.

**ReflectionPreference, CurrentFocusContext** — unchanged from proposal.

**StateAssignment** — *(Patch B)*
- Target types frozen for MVP: `RelationClaim`, `Hypothesis`, `Discovery`.
- Discovery's `presentation_state` / archive / restore are expressed via
  target-scoped `StateAssignment` rows keyed to `Discovery.id`.
- `ReflectionEpisode` does not participate in `StateAssignment` — it is a
  historical interaction episode, not a cognitive target requiring
  archive/suspend/`user_position`.

# 5. Module Boundaries

Unchanged, with two additions:
- `domain/discovery` now has a persistence dependency for the stable
  `Discovery` identity (via its repository port), in addition to its existing
  computed-score responsibilities.
- `domain/reflection` now internally separates `ReflectionEpisode` logic from
  `UserReflectionRecord` (meaning-lifecycle) logic — these are two cohesive
  but distinct responsibilities inside the same module.

# 6. End-to-End Data Flow (Patched — Patch 7)

Pipeline stages (Ingest → Relation Engine → Hypothesis → Discovery) are
unchanged from the proposal. The Reflection stage's description changes:

```
Reflection Episode (elicited per elicitation_mode/stimulus_type):
  → optional user response
  → UserReflectionRecord created (own meaning_commitment, own lifecycle)
  → underlying Record re-enters Record storage
  → Evidence Eligibility evaluated SEPARATELY, not assumed
  → creating a new Record/UserReflectionRecord does NOT by itself grant
    a new evidence_unit_id or "independent support" status
```

This replaces the prior wording "re-enters Record layer as new evidence."
Independent evidentiary status is a separate determination (per Patch 2's
`evidence_unit_id` rules — provenance, elicitation context, lineage, and
whether genuinely new factual content was supplied), evaluated the same way
for any Record regardless of origin. This applies specifically to: prompted
responses, reactions to an AI hypothesis, and reactions to an External
Reference — none of these automatically mint a new `evidence_unit_id`.

# 7. LLM vs Deterministic Code Boundary (Patched — Patch 10)

Responsibility split (LLM produces semantic judgments; code enforces
structure/legality) is unchanged in principle. Mechanism for H2 (positive
directional support) and Gate 6 (abstraction ceiling) is now structured
output, not keyword matching:

- `SemanticJudgmentPort` returns structured results:
  - `positive_directional_support: { pass, support_basis, supporting_record_refs, explanation }`
    *(Patch A)* — `support_basis` is a required enum: `directional_observation`
    | `compatibility_only` | `absence_of_contradiction` | `insufficient`.
  - `abstraction_ceiling: { prohibited_claim_detected, category, explanation }`
- Deterministic code validates *structure*, not semantics:
  - H2 passes only if **all** of: `pass == true`; `support_basis ==
    "directional_observation"`; `supporting_record_refs` is non-empty; every
    ref independently passes Gate 2/Gate 5.
  - If `support_basis` is `compatibility_only`, `absence_of_contradiction`, or
    `insufficient`, H2 fails regardless of the `pass` field *(Patch A —
    replaces the prior free-text `explanation` heuristic)*.
  - `explanation` is retained for audit/explainability only — deterministic
    code never parses or reinterprets it to decide pass/fail. Principle
    preserved: Compatibility is not Support. LLM judges semantics (via
    `support_basis`); code validates structure and legality only.
  - `prohibited_claim_detected = true` hard-fails regardless of any other field.
- The keyword list from the original proposal is dropped as the enforcement
  mechanism. Principle stays: LLM judges semantics, code enforces legality and
  structure — implemented via required structured fields, not string matching.

# 8. Zhihu / External Reference Integration

Unchanged in placement and quarantine boundary. One clarification per Patch 7:
when a user relates an External Reference back to themselves, a new
`UserReflectionRecord` is created — but per Patch 2/Patch 7, whether that
record constitutes a new independent `evidence_unit_id` is a separate,
explicit determination, not automatic. The External Reference content itself
still never becomes eligible `record_refs` input to a personal RelationClaim
(Gate 2 hard filter, unchanged).

# 9. MVP Scope (Clarified)

Core semantic pipeline must run in full for the demo:
`Record → Relation → Hypothesis → Discovery → Reflection`, plus `Lineage`,
`Directive`, all Hard Gates, full Evidence Scoring, `StateAssignment`, and
`evidence_unit_id` identity. None of these are cut for MVP.

UI is minimal — exactly four surfaces:
1. Capture
2. Awareness Stream
3. Reflection panel
4. Minimal Directive / Settings UI

Explicitly excluded from hackathon MVP: Lineage graph UI, Meaning-history
visualization, a complex External Reference browser, multi-agent
infrastructure, background-job infrastructure. (Consistent with, and now
explicit alongside, the proposal's original MUST/SHOULD/POST-HACKATHON list.)

# 10. Implementation Phases

Unchanged ordering from the proposal (Foundation → Ingestion/Directives →
Relation Engine → Hypothesis → Discovery/Attention → Reflection → External
Reference sidecar → UI → Hardening). Foundation phase now additionally
includes the `evidence_unit_id` model and `RecordEpistemicRole` table, since
both are load-bearing for later phases (Relation Engine's no-double-counting
check depends on `evidence_unit_id` existing first).

# 11. Major Risks and Fallbacks (Patched)

- Removed: manual UI override of an evidence dimension score (Patch 9 — this
  was a risk in itself, not an acceptable fallback). Replaced with:
  - If a dimension judgment is unusable: `score_status = unavailable | needs_retry`,
    retried or left explicitly unscored — never user-edited.
  - If the user disagrees with a claim: update `user_position` (StateAssignment),
    which never touches evidence fields.
  - If the user supplies new concrete facts: ingest as a new Record, and let
    that flow through Evidence Eligibility / Relation Engine normally.
- Risk "H2/Gate 6 could silently slip" — fallback mechanism updated per Patch
  10 (structured-output validation replaces the keyword-guard approach); risk
  itself and its severity are otherwise unchanged from the proposal.
- All other risks (LLM latency/quality, candidate-generation noise, lineage
  traversal complexity, Zhihu scope creep, auth gap, Attention-Priority
  weighting ambiguity, archive/suspend conflation) are unchanged from the
  proposal.

# 12. Contract Preservation Check (Patched additions)

In addition to the mappings already established in the proposal:
- **INV-03 / INV-16 (no double counting / one source = one evidence unit)** —
  enforcement mechanism is now the first-class `evidence_unit_id` and its
  derivation rules (Patch 2), not `source_fingerprint` alone. This is a
  strengthening: independence identity is explicit and queryable without full
  graph traversal.
- **INV-18 (user owns meaning)** — now enforced structurally by
  `UserReflectionRecord` owning `meaning_commitment` exclusively (Patch 3/4);
  `ReflectionEpisode` has no field that could be mistaken for a meaning
  commitment.
- **Evidence Support auditability** (Section 9/10 of the contract) — now
  structurally guaranteed: `RelationClaim` cannot have a `evidence_support_level`
  without corresponding stored `evidence_dimension_scores` and
  `evidence_dimension_reasons` (Patch 8).
- **No epistemic-surrender via convenience** — Patch 9 closes the specific
  path by which a user's disagreement could have silently mutated a
  descriptive evidence score.

# 13. Open Questions (Updated)

Resolved by this patch round:
- Attention Priority scale: resolved as `low | medium | high` for MVP (not a
  percentage). Five signals retained; exact deterministic aggregation function
  still deferred, but the output scale is now decided. `evidence_support_level`
  remains structurally excluded as an input.
- Directive `applies_to_future_similar` scope: resolved as explicit-only —
  scope must come from an explicit topic/tag, source, relation axis, or
  user-selected scope. No AI-driven automatic broadening of "similar" for MVP.
- `StateAssignment` target-type scope: resolved for MVP as `RelationClaim`,
  `Hypothesis`, `Discovery` (Patch B). Discovery's presentation_state/archive/
  restore are expressed via target-scoped StateAssignment. `ReflectionEpisode`
  is explicitly excluded — it is a historical interaction episode, not an
  archive/suspend/user_position target.

Still unresolved (carried forward, not invented):
- Exact deterministic aggregation function for the five Attention Priority
  signals into low/medium/high.
- `ReflectionPreference` → system behavior mapping (e.g. how `intervention_level`
  concretely affects follow-up caps or presentation eligibility).
- `CurrentFocusContext.source` schema shape (implementation-time decision, not
  a contract question).
- Precise rule set for "does a derived record introduce new independent
  factual content" (Patch 2) — the *existence* of this rule is decided, its
  exact criteria are not yet enumerated.

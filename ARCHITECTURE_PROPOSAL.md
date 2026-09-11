# Architecture Proposal — Personal Awareness MVP

Baseline commit: `5d0c63f`
Author: Single Architect / Repo Steward
Status: Proposal — awaiting review, no implementation started

---

# 1. Architecture Summary

The MVP is a **modular monolith**, not a distributed system and not a multi-agent product. Domain logic (entities, gates, scoring arithmetic, state transitions) lives in a framework-agnostic core with zero knowledge of LLMs, HTTP, or the database. LLM calls are isolated behind narrow "semantic judgment" ports that the domain layer defines and an adapter implements — this is what lets us honor Section 31 (`LLM 可以产生语义判断，代码负责执行约束`) as an actual dependency-direction rule, not just a comment.

The Relation Engine is built as an explicit, ordered pipeline (Section 34) rather than a single "run the model and store what it says" call. Every gate in Section 8 and every admission rule in Section 14 is a named, testable function. Nothing about hackathon time pressure changes this — it's the cheapest way to keep the contract intact, not an added cost.

External Reference (including Zhihu) is architecturally quarantined: it is reachable from the personal-evidence chain in exactly one direction (user relates it back → new `UserReflectionRecord`), never the reverse.

# 2. Proposed Tech Stack

| Layer | Choice | Why for this MVP |
|---|---|---|
| Language | TypeScript, end-to-end | One language, one type system. Discriminated unions let us make illegal states (e.g. "upgrade `observation_time` to `event_time`") a compile error, not a runtime hope. |
| Domain core | Plain TypeScript package, no framework deps | Section 40.2/40.3: deterministic enforcement over agent infra; must be testable in isolation and not entangled with a web framework's lifecycle. |
| Web app | Next.js (App Router) | Single deployable for hackathon speed; API routes double as the `api/` layer. Frontend and backend ship together, no separate CORS/infra story. |
| Database | PostgreSQL | Relational integrity for provenance/lineage foreign keys; JSONB for the genuinely open-ended fields (evidence dimension reasons, open relation-type taxonomy) without needing schema migrations every time the taxonomy grows. |
| ORM | Prisma | Fast schema iteration, TS-native types, good enum + JSONB support. Mature, boring, well-documented — matches "use existing mature dependencies where practical." |
| LLM provider | Single provider client behind an internal `SemanticJudgmentPort` interface | Domain code never imports a vendor SDK. Swapping providers later is a persistence/adapter change, not a domain change. |
| Background work | None dedicated for MVP; CurrentFocusContext fading computed lazily on read | Avoids introducing a job queue/infra dependency the hackathon doesn't need (Section 40.3 spirit: don't build infra the product doesn't need yet). |
| Auth | Minimal single-user session/password gate | Out of contract scope, but this is a network-exposed app — flagging now: **without at least a basic auth gate, personal Records are exposed to anyone who reaches the URL.** This must be a MUST HAVE, not deferred silently. |

This is a single-process, single-database system. No multi-agent runtime is being built into the product — Codex Luna/Sol are dev-time engineering tools per `CLAUDE.md`, entirely outside this architecture.

# 3. Repository Structure

```
/domain              framework-agnostic core, no I/O, no LLM SDK, no Prisma
  /record             Record, Provenance, TimeSemantics value objects
  /lineage            LineageEdge model, no-double-counting checks
  /directive          Directive, permission resolution logic
  /relation           RelationClaim, Gates 1-6, scoring arithmetic, pipeline orchestration types
  /hypothesis         Hypothesis, H1-H6 admission checks
  /state              StateAssignment (target-scoped), suspend/archive rules
  /discovery          Attention Priority computation, Presentation Level gating
  /reflection         ReflectionEpisode, provenance fields, follow-up cap, meaning commitment/revision
  /focus-context      CurrentFocusContext lifecycle
  /ports              interfaces the domain depends on but does not implement
                       (SemanticJudgmentPort, RecordRepositoryPort, ClockPort, ...)

/llm                 adapters implementing SemanticJudgmentPort
  /prompts            prompt templates per LLM responsibility (Section 31 list, 1:1)

/persistence         Prisma schema + repository implementations of domain ports

/external-reference  Zhihu + generic external reference ingestion, isolated module
  /zhihu              Zhihu-specific fetch/classify logic

/app                 use-case orchestration ("application services")
                       composes domain + llm + persistence per pipeline stage
                       this is the ONLY layer allowed to see both domain and adapters

/api                 Next.js route handlers, thin, HTTP <-> application services

/ui                  Next.js pages/components (Awareness Stream, Reflection UI,
                       Directive settings, Reflection Preferences settings)

/contracts           shared TS types mirroring ENGINEERING_CONTRACT.md entities 1:1
                       every other module imports FROM here, never redefines

/tests               unit tests per domain module + invariant regression tests (INV-01..18)
```

Dependency direction is strict: `ui → api → app → domain ← persistence/llm/external-reference`. `domain` has no outgoing dependency on anything except `contracts`.

# 4. Domain / Data Model

All entities are Postgres tables (via Prisma) unless noted as query-only.

**Record**
- `id`, `epistemic_role` (enum, extensible via JSONB overflow for out-of-taxonomy roles), `raw_content` (verbatim, modal language untouched), `origin`, `actor`, `source_ref`, `captured_at`
- `time_kind` (enum: `event_time | observation_time | capture_time | user_reported_time | user_reported_interval`) + `time_value` (timestamp or interval range) — modeled as a **discriminated union type** in `/contracts` so code cannot silently reinterpret one kind as another
- `source_fingerprint` (deterministic hash of origin+source_ref+content) — this is the mechanism that makes INV-16 enforceable: re-ingesting the same original source resolves to the same Record, not a new one

**LineageEdge** (generic, polymorphic — not embedded per-entity)
- `child_type`, `child_id`, `parent_type`, `parent_id`, `relation_to_parent` (`derived_from | responds_to | references | revises | supersedes | summarizes | ...`)
- Applies across Record, RelationClaim, Hypothesis, ReflectionEpisode, UserReflectionRecord uniformly. A single generic table (rather than per-entity `parent_refs` columns) is what makes cross-entity no-double-counting graph checks tractable — this is a structural choice, not a contract requirement, and I'm flagging it as such.

**RelationClaim**
- `record_refs[]`, `comparison_axis`, `relation_type` (open string, not a closed enum — taxonomy is explicitly non-exhaustive per Section 7.1), `evidence` (structured per-dimension reasons, JSONB), `evidence_support_level` (derived, `weak|observed|supported|strong`)
- Linked `StateAssignment` via `(target_type='RelationClaim', target_id)`

**Hypothesis**
- `anchor_refs[]` (Supported Relations or independent Observed Patterns satisfying H1), `explanatory_text`, `positive_support_notes`, `discriminating_predictions` (strengthen/weaken descriptions, H5), `alternatives[]` (H4)
- Linked `StateAssignment` via `(target_type='Hypothesis', target_id)`

**Discovery** — modeled primarily as a **computed view**, not a heavy persisted entity: `attention_priority` + `presentation_level`, recomputed from RelationClaim/Hypothesis state + CurrentFocusContext. A thin persisted row exists only to record what was actually shown (for Product Event logging, Section 39), not to be the source of truth for the score itself.

**ReflectionEpisode**
- `elicitation_mode`, `stimulus_type`, `system_followup_count` (server-incremented, capped), `meaning_commitment`
- Links to the RelationClaim/Hypothesis (if `stimulus_type` implies one) via LineageEdge

**UserReflectionRecord**
- Stored as a `Record` with `epistemic_role = user_expression` (or `user_reported_pattern`/`user_reported_interval` as applicable) plus a `meaning_commitment` field and a lineage edge `responds_to` the ReflectionEpisode

**Directive**
- `allow_analysis`, `allow_passive_storage`, `allow_proactive_presentation`, `applies_to_future_similar`, `scope` (what "similar future records" means — see Open Questions), revocable via `supersedes` lineage rather than hard delete (preserves provenance of what was permitted when)

**ReflectionPreference**
- `hypothesis_visibility`, `early_surface_tolerance`, `intervention_level`, `archive_reopen_policy`, `explanation_density` — plain settings, no inferred-identity coupling anywhere in the schema

**CurrentFocusContext**
- `source`, `last_mentioned_at`, `explicit_duration`, `relevance_state` (`active|fading|inactive`) — deliberately outside the Record/Lineage graph; it informs Discovery only, never becomes evidence itself

**StateAssignment** (generic, target-scoped table — no case-global row exists)
- `(target_type, target_id)` unique key, `user_position`, `workflow_state`, `presentation_state`

# 5. Module Boundaries

- `domain/relation` owns Gates 1–6 and the scoring arithmetic. It does not call an LLM or a database — it receives already-fetched Records and a `SemanticJudgmentPort` result as plain data, and returns a pass/fail + score.
- `domain/hypothesis` owns H1–H6 the same way; it depends on `domain/relation`'s output types (a Hypothesis cannot exist without a qualifying anchor) but not on `domain/relation`'s internals.
- `domain/discovery` depends on `domain/state` and `domain/focus-context` output, never reaches into `domain/relation`'s evidence internals — this is the structural guarantee behind Section 36 (evidence strength ≠ attention).
- `domain/reflection` depends on whatever Discovery decided to surface, but owns its own follow-up-cap and provenance logic independently.
- `external-reference` has **no import path into `domain/relation` or `domain/hypothesis`**. The only sanctioned bridge is: application layer sees a user tie an external reference to themselves → calls `domain/record` to create a new `UserReflectionRecord` → that new record enters the normal pipeline like any other. The external content itself never becomes `record_refs` input to a personal-evidence claim.
- `app/` is the only layer allowed to sequence `domain → llm → domain → persistence` calls. No domain module calls another domain module's port implementation directly.

# 6. End-to-End Data Flow

```
Ingest (Zhihu / user input / other source)
  → Record created (Provenance + Time Semantics attached, fingerprint-deduped)
  → Directive resolution (Gate 1) checked before any analysis proceeds

Relation Engine (per Section 34, one Record batch at a time):
  Candidate Generation      [LLM port]         open, semantically generous
  → Evidence Admissibility  [deterministic]    Gates 1, 2, 5
  → Claim Validation        [hybrid]           Gates 3, 4, 6
  → Evidence Scoring        [hybrid]           LLM: 0-3 per dimension w/ reasons
                                                code: weights + threshold (deterministic)
  → State Transition        [deterministic]    creates/updates StateAssignment

Hypothesis Admission (only from Supported+ Relations or qualifying pattern pairs):
  H1 anchor check [deterministic] → H2-H5 [LLM-assessed, deterministic-guarded] → H6 [deterministic]

Discovery/Attention:
  compute Attention Priority [hybrid] from Novelty/Temporal Depth [deterministic]
    + Current Relevance [LLM, from explicit CurrentFocusContext only]
    + Reflection/Action Potential, Interpretation Risk [LLM, bounded]
  → Presentation Level gating [deterministic, Section 18 table]

Reflection Episode (only if presented at Level 2, or user-initiated):
  provenance tagged → optional user response → UserReflectionRecord created
  → re-enters Record layer as new evidence (not a re-score of the old episode)
```

# 7. LLM vs Deterministic Code Boundary

Directly mirroring Section 31, with no additions:

**LLM (via `SemanticJudgmentPort`, one method per responsibility):**
structured observed-claim extraction · comparison axis proposal · candidate relation generation · per-dimension 0–3 evidence judgments with reasons · hypothesis generation · alternative generation · positive directional support assessment · explanatory gain assessment · discriminating predictions · current relevance interpretation (from explicit traceable context only) · derived-artifact summaries (clearly tagged as such).

**Deterministic code (domain layer, unit-testable, no model call):**
permissions/directives · lineage rules · no-double-counting · score arithmetic and thresholds · state transitions · target-scoped state · CurrentFocusContext TTL/fading · proactive-presentation gates · archive/restore · max automatic follow-up · canonical IDs/fingerprint dedup · time-semantics type enforcement · evidence-unit identity.

Where the contract's gate is inherently semantic but consequential (H2 "compatibility is not support," Gate 6 abstraction ceiling), I'm adding a **deterministic guard, not a replacement**: a keyword/pattern rejector that hard-fails known-insufficient phrasings (Section 14 H2 list: "not ruled out," "compatible with," "no contradiction found") even if the LLM's structured output claims support. This is defense-in-depth, not a reinterpretation of the gate — the LLM still does the actual judgment; code just refuses to accept a judgment that contradicts its own stated insufficiency language.

# 8. Zhihu / External Reference Integration

- `external-reference/zhihu` ingests content and classifies it at the boundary: user-authored content with body + timestamp → eligible as `user_expression`/`observed_event` (real Personal Trace candidate); follow/like/view data → `platform_metadata`, time-kind `observation_time` only (never upgraded to a claimed follow date — Section 28).
- Everything ingested through this module defaults to `epistemic_role = external_reference` unless it passes the user-authored-content classification above.
- **Hard filter at Gate 2 (Evidence Admissibility):** any Record with `epistemic_role = external_reference` is rejected as `record_refs` input to a RelationClaim targeting a personal descriptive claim. This is a deterministic check, not an LLM instruction — it cannot be prompted around.
- Retrieval is user-triggered for MVP (Section 27 exception: "if the user explicitly requests outside perspective, it may be shown"), not a background crawler — this also sidesteps a chunk of engineering risk (see Section 11).
- The only re-entry path: user explicitly relates an external reference back to themselves → application layer creates a **new** `UserReflectionRecord` (a genuinely new evidence unit, lineage `references` the external Record) → that new record, not the external content, is what may support future claims.

# 9. MVP Scope

**MUST HAVE**
- Record ingestion with Provenance, Time Semantics (as a discriminated union), fingerprint dedup
- Generic LineageEdge table + direct (non-transitive) no-double-counting check
- Directive entity + resolution service gating analysis/storage/presentation, revocable via supersede
- Full Relation Engine pipeline (all 5 stages, all 6 gates present even if candidate generation is simple)
- Evidence Support Score: all 6 dimensions, deterministic weighting/thresholding
- StateAssignment for RelationClaim and Hypothesis (workflow_state, presentation_state, user_position)
- Hypothesis module with all 6 admission gates structurally enforced
- Discovery/Attention with Presentation Level gating (Level 3 hard-disabled)
- ReflectionEpisode with provenance fields + follow-up cap enforcement
- UserReflectionRecord creation flow feeding back into Record layer
- External Reference sidecar with Gate 2 exclusion enforced (manual/user-triggered fetch only)
- Minimal auth gate
- Basic UI: capture, Awareness Stream (Level 2), Reflection interaction, Directive management

**SHOULD HAVE**
- CurrentFocusContext with real fading lifecycle (MVP may stub Current Relevance as `unknown`, which the contract explicitly permits — it just restricts Level 3, which is already off)
- ReflectionPreference settings UI
- Automated Zhihu ingestion beyond manual paste
- Tuned (vs. placeholder) Attention Priority weighting
- Meaning Revision UI (revises/supersedes) surfaced to the user

**POST-HACKATHON**
- Level 3 proactive push (explicitly disabled by default per contract, no reason to build early)
- Multi-user/multi-tenant support
- Full External Reference taxonomy (Experience/Practical/Perspectives/Professional ranking)
- Lineage graph exploration/audit UI
- Background jobs (scheduled focus-context fading, batch re-evaluation of Observation Space)
- Product Event analytics

# 10. Implementation Phases

1. **Foundation** — `/contracts` types, Prisma schema for Record/LineageEdge/Directive/StateAssignment, dedup fingerprinting. Nothing else can start meaningfully before this.
2. **Ingestion + Directives** — Record creation pipeline, Provenance/Time Semantics enforcement, Directive resolution service (Gate 1 dependency for everything downstream).
3. **Relation Engine** — full 5-stage pipeline, Gates 1–6, 6-dimension scoring, StateAssignment transitions. Depends on Phase 2.
4. **Hypothesis Admission** — H1–H6, depends on Phase 3 producing Supported+ Relations.
5. **Discovery/Attention** — Attention Priority + Presentation Level gating, depends on Phase 3–4 state existing.
6. **Reflection + UserReflectionRecord** — depends on Phase 5 surfacing something to react to; feeds back into Phase 2's Record layer.
7. **External Reference/Zhihu sidecar** — isolated, can be built in parallel with Phases 3–5; final integration check happens after Phase 6 exists (to verify the re-entry path).
8. **UI wiring** — can start once each phase's application-service API stabilizes; does not block backend phase ordering.
9. **Hardening** — auth, deployment, and an automated regression suite asserting INV-01 through INV-18 directly, before demo.

# 11. Major Risks and Fallbacks

1. **LLM judgment latency/quality for 6-dimension scoring under hackathon time.** Fallback: allow manual override in UI for a dimension score if the model output is clearly unusable; never skip the deterministic arithmetic layer itself.
2. **Open-taxonomy candidate generation produces noise.** Fallback: seed the prompt with the example taxonomy plus an explicit "novel relation" escape hatch, and cap candidates per batch.
3. **Full transitive lineage-graph traversal for no-double-counting is complex to build in time.** Fallback for MVP: direct check only ("has this exact Record already been counted as evidence within this RelationClaim") rather than full graph transitivity; upgrade post-hackathon. This is a scope reduction in *rigor*, not a violation — INV-16/03 still hold for the direct case, which covers the common failure mode.
4. **H2/Gate 6 are inherently semantic and could silently slip.** Fallback: the deterministic keyword-guard described in Section 7, applied as defense-in-depth.
5. **Zhihu integration scope creep.** Fallback: ship manual-paste-only ingestion for MVP; the Gate 2 boundary is enforced in code regardless of how content arrives, so this is a safe scope cut.
6. **Auth cut for demo speed leaves an unauthenticated, network-exposed personal-data endpoint.** This is flagged as a real risk, not something to silently skip — minimal password/session gate is MUST HAVE, not optional polish.
7. **Attention Priority has no contract-specified weighting formula** (unlike Evidence Support's explicit weights) — risk of accidentally reintroducing "rank by evidence strength" by convenience. Fallback: implement the Attention Priority function so it structurally never receives `evidence_support_level` as an input at all, making the INV-09/Section 36 violation impossible rather than just discouraged.
8. **Suspension/Archive semantics get conflated under time pressure.** Fallback: INV-10 and INV-11 get dedicated regression tests before Phase 3 is considered done, not deferred to Phase 9.

# 12. Contract Preservation Check

| Contract rule | Enforcing mechanism |
|---|---|
| INV-16 (one source = one Evidence Unit) | `source_fingerprint` dedup at Record ingestion |
| INV-03 / Section 6.1 (no double counting) | Generic LineageEdge + Gate 5 direct-duplication check |
| INV-01 (AI hypothesis ≠ fact) | Hypothesis never stored with an implicit "confirmed" state; `StateAssignment.user_position` is separate from evidence fields entirely |
| INV-04 / INV-05 (agreement/disagreement don't move evidence) | `user_position` and `evidence_support_level` are structurally separate fields updated by separate code paths; no code path lets a `user_position` write touch `evidence_support_level` |
| INV-07 / INV-08 (snapshot/interval ≠ event) | Time Semantics modeled as a discriminated union; no conversion function between `time_kind` variants exists in `domain/record` |
| INV-09 / Section 36 (evidence ≠ attention) | `domain/discovery` has no import path to `domain/relation`'s evidence internals; Attention Priority function signature excludes `evidence_support_level` |
| INV-10 / INV-11 (archive/suspend preserve evidence) | Archive/suspend are `presentation_state`/`workflow_state` writes only; evidence fields on RelationClaim are immutable once scored, only re-scored by new independent facts entering Phase 3 again |
| INV-14 (compatibility ≠ support) | Deterministic keyword-guard on H2 admission, Section 7 |
| INV-15 (no invented baseline) | Dimension 10.4 scoring capped at 1 in code unless the LLM's evidence excerpt explicitly contains a baseline statement (checked structurally, not just prompted) |
| INV-17 (directive scope: analysis vs presentation) | Directive schema has separate `allow_analysis`/`allow_proactive_presentation` fields, resolved independently in Gate 1 vs Presentation Level gating |
| INV-18 (user owns meaning) | `meaning_commitment`/`UserReflectionRecord` writes are only ever user-initiated in the application layer; no automated process sets `meaning_commitment = confirmed` |
| Section 23 (follow-up cap) | `system_followup_count` incremented server-side only, capped in `domain/reflection` before any LLM follow-up call is issued |
| Section 27/28 (External Reference doesn't define user) | `external-reference` module has no import path into `domain/relation`; Gate 2 hard filter |

# 13. Open Questions

- **Attention Priority weighting formula** — contract defines the five signals (Section 17) but not their weights or aggregation function, unlike Evidence Support (Section 9). Needs a product decision before Phase 5; I have not invented one.
- **StateAssignment target-type scope** — Section 16 examples cover RelationClaim and Hypothesis. Whether Discovery or ReflectionEpisode also need target-scoped state is not specified. Proposing RelationClaim + Hypothesis only for MVP, but flagging as unconfirmed rather than deciding unilaterally.
- **Gate 3 (Operational Comparability) and Gate 6 (Abstraction Ceiling) pass/fail ownership** — the contract clearly assigns axis *proposal* and generation to the LLM, but doesn't specify how much of the actual gate *decision* is LLM self-critique vs. rule-based code. I've proposed a hybrid (LLM proposes, deterministic guard backstops known-bad patterns) but this needs explicit confirmation, not silent invention.
- **Directive "scope" granularity** — Section 26's example ("以后类似的也别主动提醒我") implies a notion of "similar future records," but the contract doesn't define how similarity is determined (topic tag? source platform? LLM classification?). Not resolved here.
- **ReflectionPreference → system behavior mapping** — fields like `intervention_level` clearly should affect follow-up caps or presentation eligibility, but the contract doesn't specify the exact mapping. Left unresolved rather than guessed.
- **CurrentFocusContext.source schema** — no enumerated shape given in the contract. Deferred to implementation-time decision, not a contract question, but noted so it isn't silently invented as if it were normative.

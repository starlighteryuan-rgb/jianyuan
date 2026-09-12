/**
 * Domain enumerations transcribed from ENGINEERING_CONTRACT v0.2.1.
 *
 * These are declared as const objects + derived union types rather than TS
 * `enum` so the domain core stays plain, structurally comparable, and free of
 * runtime framework coupling.
 *
 * IMPORTANT: value sets here mirror the contract. Do not collapse, merge, or
 * extend them for engineering convenience (ENGINEERING_CONTRACT §42).
 */

/* ── Record epistemic roles (ENGINEERING_CONTRACT §4) ─────────────────── */

export const EPISTEMIC_ROLES = [
  'observed_event',
  'observed_state',
  'user_expression',
  'user_reported_pattern',
  'user_reported_interval',
  'platform_metadata',
  'external_reference',
  'ai_hypothesis',
  'directive',
  'product_event',
] as const;

export type EpistemicRole = (typeof EPISTEMIC_ROLES)[number];

/* ── Time semantics (ENGINEERING_CONTRACT §5) ─────────────────────────── */

/**
 * The system MUST NOT upgrade one time semantic into another
 * (ENGINEERING_CONTRACT §5, INV-07, INV-08).
 */
export const TIME_SEMANTICS = [
  'event_time',
  'observation_time',
  'capture_time',
  'user_reported_time',
  'user_reported_interval',
] as const;

export type TimeSemantic = (typeof TIME_SEMANTICS)[number];

/* ── Provenance origin (ENGINEERING_CONTRACT §4.1) ────────────────────── */

export const PROVENANCE_ORIGINS = [
  'directly_observed',
  'imported',
  'generated',
  'user_reported',
] as const;

export type ProvenanceOrigin = (typeof PROVENANCE_ORIGINS)[number];

export const PROVENANCE_ACTORS = ['user', 'system', 'ai', 'platform'] as const;

export type ProvenanceActor = (typeof PROVENANCE_ACTORS)[number];

/* ── Lineage relations (ENGINEERING_CONTRACT §6) ──────────────────────── */

/**
 * Contract §6 lists: derived_from, responds_to, references, revises,
 * supersedes, summarizes — and states the set is extensible.
 * `reformats` is the one extension named by docs/architecture.md §4 (Patch 2).
 */
export const LINEAGE_RELATIONS = [
  'derived_from',
  'responds_to',
  'references',
  'revises',
  'supersedes',
  'summarizes',
  'reformats',
] as const;

export type LineageRelation = (typeof LINEAGE_RELATIONS)[number];

/* ── Target-scoped state (ENGINEERING_CONTRACT §16) ───────────────────── */

/**
 * MVP target scope frozen by docs/architecture.md §4 (Patch B):
 * RelationClaim, Hypothesis, Discovery.
 *
 * `reflection_episode` is deliberately ABSENT. A ReflectionEpisode records
 * elicitation provenance only; it is not a target of user_position,
 * archive, or suspension.
 */
export const STATE_TARGET_TYPES = [
  'relation_claim',
  'hypothesis',
  'discovery',
] as const;

export type StateTargetType = (typeof STATE_TARGET_TYPES)[number];

export const USER_POSITIONS = [
  'none',
  'agrees',
  'disagrees',
  'uncertain',
] as const;

export type UserPosition = (typeof USER_POSITIONS)[number];

export const WORKFLOW_STATES = ['active', 'suspended'] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const PRESENTATION_STATES = ['active', 'archived'] as const;
export type PresentationState = (typeof PRESENTATION_STATES)[number];

/* ── Reflection provenance (ENGINEERING_CONTRACT §22) ─────────────────── */

export const ELICITATION_MODES = [
  'spontaneous',
  'prompted',
  'unknown',
] as const;

export type ElicitationMode = (typeof ELICITATION_MODES)[number];

export const STIMULUS_TYPES = [
  'none',
  'open_question',
  'evidence_relation',
  'hypothesis',
  'external_reference',
  'unknown',
] as const;

export type StimulusType = (typeof STIMULUS_TYPES)[number];

/* ── Meaning commitment (ENGINEERING_CONTRACT §24) ───────────────────── */

/**
 * Owned exclusively by UserReflectionRecord, never by ReflectionEpisode
 * (docs/architecture.md §4 Patch 3/4, INV-18).
 */
export const MEANING_COMMITMENTS = ['tentative', 'confirmed'] as const;
export type MeaningCommitment = (typeof MEANING_COMMITMENTS)[number];

/** ENGINEERING_CONTRACT §25 meaning lifecycle. */
export const MEANING_EFFECTS = ['current', 'superseded'] as const;
export type MeaningEffect = (typeof MEANING_EFFECTS)[number];

/* ── Discovery (docs/architecture.md §4 Patch 6) ──────────────────────── */

export const DISCOVERY_KINDS = [
  'relation_discovery',
  'hypothesis_discovery',
] as const;

export type DiscoveryKind = (typeof DISCOVERY_KINDS)[number];

export const DISCOVERY_SUBJECT_TYPES = [
  'relation_claim',
  'hypothesis',
] as const;

export type DiscoverySubjectType = (typeof DISCOVERY_SUBJECT_TYPES)[number];

/* ── Reflection response (§21, §16) ──────────────────────────────────── */

/**
 * How the user responded to something the system presented.
 *
 * FROZEN FOR MVP by user decision: `accepted | questioned | rejected |
 * uncertain`. `confirmed` is explicitly NOT an MVP state, so
 * `MeaningCommitment` stays `tentative` throughout (see
 * `MEANING_COMMITMENTS`).
 *
 * This is a REFLECTION-LAYER vocabulary and is deliberately NOT the same thing
 * as `user_position`. §16 freezes `user_position` to
 * `none | agrees | disagrees | uncertain`, and widening that enum would be a
 * contract change. So the two coexist: a response is what the user did in a
 * reflection episode, and `toUserPosition` projects it — lossily, explicitly,
 * in one place — onto the frozen state vocabulary.
 *
 * Why the distinction is worth keeping: `questioned` and `uncertain` both
 * project to `uncertain`, but they are different acts. Questioning engages;
 * being unsure withholds. Collapsing them at the point of capture would
 * discard that, and §21 requires "I don't know yet" remain a first-class
 * option rather than a fallback.
 */
export const REFLECTION_RESPONSES = [
  'accepted',
  'questioned',
  'rejected',
  'uncertain',
] as const;

export type ReflectionResponse = (typeof REFLECTION_RESPONSES)[number];

/* ── Reflection preferences (§33) ────────────────────────────────────── */

/**
 * §33 — interaction style only.
 *
 *   > Onboarding preferences describe interaction style.
 *   > They are NOT personality traits.
 *   > Do not infer stable identity from these preferences.
 *
 * FROZEN FOR MVP by user decision: minimum interaction preferences, with no
 * expansion into a personality model. §33 lists five possible preferences; MVP
 * implements the three that change concrete system behaviour and omits
 * `early_surface_tolerance` and `archive_reopen_policy`, which would need
 * proactive-surfacing machinery that L3-off makes unreachable anyway.
 *
 * Every value below is a behavioural dial. None describes the person.
 */
export const HYPOTHESIS_VISIBILITIES = ['hidden', 'on_request', 'shown'] as const;
export type HypothesisVisibility = (typeof HYPOTHESIS_VISIBILITIES)[number];

/**
 * How much the system may follow up.
 *
 * `minimal` means no automatic follow-up at all. `standard` permits the single
 * follow-up §23 allows. There is deliberately no value permitting more: the
 * one-follow-up cap is a contract limit, not a preference (§23), and the user's
 * freeze confirms no chat loop.
 */
export const INTERVENTION_LEVELS = ['minimal', 'standard'] as const;
export type InterventionLevel = (typeof INTERVENTION_LEVELS)[number];

export const EXPLANATION_DENSITIES = ['brief', 'full'] as const;
export type ExplanationDensity = (typeof EXPLANATION_DENSITIES)[number];

/* ── Attention and presentation (§17, §18, §19, §20) ─────────────────── */

/**
 * Attention Priority (ENGINEERING_CONTRACT §17; docs/architecture.md §13).
 *
 * Resolved as a three-value scale for MVP, NOT a percentage: a numeric score
 * would invite ranking and comparison the contract does not support.
 *
 * `evidence_support_level` is STRUCTURALLY EXCLUDED as an input (INV-09, §36):
 * strong evidence support does not imply high attention priority, and attention
 * is not a measure of epistemic strength.
 */
export const ATTENTION_PRIORITIES = ['low', 'medium', 'high'] as const;

export type AttentionPriority = (typeof ATTENTION_PRIORITIES)[number];

/**
 * Presentation Level (ENGINEERING_CONTRACT §18).
 *
 *   l1 — stored only; not surfaced.
 *   l2 — available when the user looks (passive).
 *   l3 — proactively brought to the user (active).
 *
 * L3 is DISABLED BY DEFAULT for MVP (§18, §40.5). Ordered least-to-most
 * intrusive so a ceiling can be expressed as an index comparison.
 */
export const PRESENTATION_LEVELS = ['l1', 'l2', 'l3'] as const;

export type PresentationLevel = (typeof PRESENTATION_LEVELS)[number];

/**
 * Current Relevance (ENGINEERING_CONTRACT §18, §19).
 *
 * Four-valued, and `unknown` is deliberately DISTINCT from `low`: §18 treats
 * them differently. Unknown relevance prohibits proactive presentation but does
 * not prohibit passive availability — the system may not push something whose
 * relevance it cannot establish, but neither may it hide it from a user who
 * actively looks.
 *
 * A subject with no CurrentFocusContext is `unknown`, never `low`.
 */
export const RELEVANCE_STATES = ['unknown', 'low', 'medium', 'high'] as const;

export type RelevanceState = (typeof RELEVANCE_STATES)[number];

/* ── Directive scope (docs/architecture.md §4 Patch 5, §13) ──────────── */

/**
 * `applies_to_future_similar` scope is explicit-only for MVP: it must come
 * from an explicit topic/tag, source, relation axis, or user-selected scope.
 * No AI-driven broadening of "similar" (docs/architecture.md §13).
 */
export const DIRECTIVE_SCOPE_KINDS = [
  'topic_tag',
  'source',
  'relation_axis',
  'user_selected',
] as const;

export type DirectiveScopeKind = (typeof DIRECTIVE_SCOPE_KINDS)[number];

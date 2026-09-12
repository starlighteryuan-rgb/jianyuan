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

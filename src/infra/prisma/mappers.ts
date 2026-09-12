/**
 * Domain <-> Prisma row mapping.
 *
 * Two representations meet here, and neither may bend the other:
 *   - Domain enums are lowercase snake_case string unions.
 *   - Prisma enums are SCREAMING_SNAKE_CASE.
 *
 * Every mapping below is an EXPLICIT exhaustive table rather than a
 * `.toUpperCase()` transformation. That is deliberate: `satisfies Record<...>`
 * makes a missing member a compile error, so adding a contract enum value
 * without mapping it cannot ship silently. A casing trick would also silently
 * "work" for a value that should have been rejected.
 *
 * The delicate part of this file is TIME SEMANTICS. The domain models time as a
 * discriminated union (`TimePoint | ReportedInterval`); the row stores flat
 * nullable columns. Reassembling a domain value therefore requires the row to
 * be internally consistent. When it is not, `toDomainTime` REFUSES rather than
 * defaulting — fabricating a time would violate ENGINEERING_CONTRACT §5 and
 * could upgrade one semantic into another (INV-07, INV-08).
 */

// TYPE-ONLY import. The mapping tables below use plain string literals rather
// than Prisma's enum objects, so this module carries no runtime dependency on
// the generated client. That keeps mapper tests fast and, more importantly,
// runnable with no database and no query engine present.
import type { $Enums } from '../../../generated/prisma/client';

import type {
  DirectiveScopeKind,
  ElicitationMode,
  EpistemicRole,
  ExplanationDensity,
  HypothesisVisibility,
  InterventionLevel,
  LineageRelation,
  MeaningCommitment,
  MeaningEffect,
  ProvenanceActor,
  ProvenanceOrigin,
  StimulusType,
  TimeSemantic,
} from '../../domain/shared/enums';
import type { ReflectionEpisode } from '../../domain/reflection/reflection-episode';
import type { UserReflectionRecord } from '../../domain/reflection/user-reflection-record';
import type { ReflectionPreference } from '../../domain/reflection/reflection-preference';
import type { PersonalRecord } from '../../domain/record/record';
import type { Directive } from '../../domain/directive/directive';
import type { LineageEdge } from '../../domain/lineage/lineage-edge';
import {
  EVIDENCE_DIMENSIONS,
  isDimensionScore,
  type DimensionJudgment,
  type DimensionJudgments,
  type EvidenceDimension,
  type EvidenceSupportLevel,
  type ScoreStatus,
} from '../../domain/relation/evidence-dimensions';
import {
  buildStoredClaim,
  type RelationClaimCandidate,
  type StoredRelationClaim,
} from '../../domain/relation/relation-claim';
import type {
  AnchorPath,
  StoredHypothesis,
  SupportBasis,
} from '../../domain/hypothesis/hypothesis';
import type { Discovery } from '../../domain/discovery/discovery';
import type {
  CurrentFocusContext,
  FocusSourceKind,
} from '../../domain/discovery/focus-context';
import type {
  DiscoveryKind,
  DiscoverySubjectType,
} from '../../domain/shared/enums';
import {
  directiveId,
  discoveryId,
  evidenceUnitId,
  focusContextId,
  hypothesisId,
  lineageEdgeId,
  recordId,
  reflectionEpisodeId,
  relationClaimId,
  sourceFingerprint,
  userReflectionRecordId,
} from '../../domain/shared/ids';
import type { TimeAssertion } from '../../domain/shared/time-semantics';
import { isReportedInterval } from '../../domain/shared/time-semantics';
import { type Result, err, ok } from '../../domain/shared/result';

/* ── Enum tables ──────────────────────────────────────────────────────── */

const invert = <D extends string, P extends string>(
  forward: Readonly<Record<D, P>>,
): Readonly<Record<P, D>> => {
  const out = {} as Record<P, D>;
  for (const [domain, prisma] of Object.entries(forward) as [D, P][]) {
    out[prisma] = domain;
  }
  return out;
};

const EPISTEMIC_ROLE_TO_DB = {
  observed_event: 'OBSERVED_EVENT',
  observed_state: 'OBSERVED_STATE',
  user_expression: 'USER_EXPRESSION',
  user_reported_pattern: 'USER_REPORTED_PATTERN',
  user_reported_interval: 'USER_REPORTED_INTERVAL',
  platform_metadata: 'PLATFORM_METADATA',
  external_reference: 'EXTERNAL_REFERENCE',
  ai_hypothesis: 'AI_HYPOTHESIS',
  directive: 'DIRECTIVE',
  product_event: 'PRODUCT_EVENT',
} as const satisfies Record<EpistemicRole, $Enums.EpistemicRole>;

const TIME_SEMANTIC_TO_DB = {
  event_time: 'EVENT_TIME',
  observation_time: 'OBSERVATION_TIME',
  capture_time: 'CAPTURE_TIME',
  user_reported_time: 'USER_REPORTED_TIME',
  user_reported_interval: 'USER_REPORTED_INTERVAL',
} as const satisfies Record<TimeSemantic, $Enums.TimeSemantic>;

const PROVENANCE_ORIGIN_TO_DB = {
  directly_observed: 'DIRECTLY_OBSERVED',
  imported: 'IMPORTED',
  generated: 'GENERATED',
  user_reported: 'USER_REPORTED',
} as const satisfies Record<ProvenanceOrigin, $Enums.ProvenanceOrigin>;

const PROVENANCE_ACTOR_TO_DB = {
  user: 'USER',
  system: 'SYSTEM',
  ai: 'AI',
  platform: 'PLATFORM',
} as const satisfies Record<ProvenanceActor, $Enums.ProvenanceActor>;

const LINEAGE_RELATION_TO_DB = {
  derived_from: 'DERIVED_FROM',
  responds_to: 'RESPONDS_TO',
  references: 'REFERENCES',
  revises: 'REVISES',
  supersedes: 'SUPERSEDES',
  summarizes: 'SUMMARIZES',
  reformats: 'REFORMATS',
} as const satisfies Record<LineageRelation, $Enums.LineageRelation>;

const DIRECTIVE_SCOPE_KIND_TO_DB = {
  topic_tag: 'TOPIC_TAG',
  source: 'SOURCE',
  relation_axis: 'RELATION_AXIS',
  user_selected: 'USER_SELECTED',
} as const satisfies Record<DirectiveScopeKind, $Enums.DirectiveScopeKind>;

const EPISTEMIC_ROLE_FROM_DB = invert(EPISTEMIC_ROLE_TO_DB);
const TIME_SEMANTIC_FROM_DB = invert(TIME_SEMANTIC_TO_DB);
const PROVENANCE_ORIGIN_FROM_DB = invert(PROVENANCE_ORIGIN_TO_DB);
const PROVENANCE_ACTOR_FROM_DB = invert(PROVENANCE_ACTOR_TO_DB);
const LINEAGE_RELATION_FROM_DB = invert(LINEAGE_RELATION_TO_DB);
const DIRECTIVE_SCOPE_KIND_FROM_DB = invert(DIRECTIVE_SCOPE_KIND_TO_DB);

export const epistemicRoleToDb = (r: EpistemicRole): $Enums.EpistemicRole =>
  EPISTEMIC_ROLE_TO_DB[r];
export const epistemicRoleFromDb = (r: $Enums.EpistemicRole): EpistemicRole =>
  EPISTEMIC_ROLE_FROM_DB[r];
export const lineageRelationToDb = (
  r: LineageRelation,
): $Enums.LineageRelation => LINEAGE_RELATION_TO_DB[r];
export const lineageRelationFromDb = (
  r: $Enums.LineageRelation,
): LineageRelation => LINEAGE_RELATION_FROM_DB[r];

/* ── Time semantics ───────────────────────────────────────────────────── */

/** Flat time columns as stored on the `record` table. */
export interface TimeColumns {
  readonly timeSemantic: $Enums.TimeSemantic;
  readonly timeAt: Date | null;
  readonly intervalFrom: Date | null;
  readonly intervalTo: Date | null;
  readonly intervalReportedAs: string | null;
}

export type TimeMappingError = {
  readonly kind: 'inconsistent_time_columns';
  readonly semantic: $Enums.TimeSemantic;
  readonly detail: string;
};

/** Domain -> columns. Total: the union guarantees the needed fields exist. */
export const toTimeColumns = (time: TimeAssertion): TimeColumns =>
  isReportedInterval(time)
    ? {
        timeSemantic: TIME_SEMANTIC_TO_DB.user_reported_interval,
        timeAt: null,
        intervalFrom: time.from,
        intervalTo: time.to,
        // Preserved verbatim (§4.2, §12): "这半年" is part of the source.
        intervalReportedAs: time.reportedAs,
      }
    : {
        timeSemantic: TIME_SEMANTIC_TO_DB[time.semantic],
        timeAt: time.at,
        intervalFrom: null,
        intervalTo: null,
        intervalReportedAs: null,
      };

/**
 * Columns -> domain. Partial by necessity: a row can be internally
 * inconsistent, and this refuses instead of inventing a value.
 */
export const toDomainTime = (
  cols: TimeColumns,
): Result<TimeAssertion, TimeMappingError> => {
  const semantic = TIME_SEMANTIC_FROM_DB[cols.timeSemantic];

  if (semantic === 'user_reported_interval') {
    if (cols.intervalReportedAs === null) {
      // The user's wording IS the evidence for a reported interval. Without it
      // there is nothing faithful to reconstruct (§12).
      return err({
        kind: 'inconsistent_time_columns',
        semantic: cols.timeSemantic,
        detail:
          'user_reported_interval requires intervalReportedAs; refusing to ' +
          'fabricate the user wording.',
      });
    }

    return ok({
      semantic: 'user_reported_interval',
      from: cols.intervalFrom,
      to: cols.intervalTo,
      reportedAs: cols.intervalReportedAs,
    });
  }

  if (cols.timeAt === null) {
    return err({
      kind: 'inconsistent_time_columns',
      semantic: cols.timeSemantic,
      detail: `${semantic} requires timeAt; refusing to substitute another time.`,
    });
  }

  return ok({ semantic, at: cols.timeAt });
};

/* ── Record ───────────────────────────────────────────────────────────── */

/**
 * The subset of a `record` row this mapper reads. Declared structurally rather
 * than importing Prisma's model type, so the mapper is unit-testable with plain
 * objects and no database.
 */
export interface RecordRow extends TimeColumns {
  readonly id: string;
  readonly sourceFingerprint: string;
  readonly evidenceUnitId: string;
  readonly provenanceOrigin: $Enums.ProvenanceOrigin;
  readonly provenanceActor: $Enums.ProvenanceActor;
  readonly sourceRef: string;
  readonly capturedAt: Date;
  readonly rawExpressionVerbatim: string | null;
  readonly rawExpressionLanguage: string | null;
  readonly createdAt: Date;
}

export type RecordMappingError = TimeMappingError;

export const toDomainRecord = (
  row: RecordRow,
  roles: readonly $Enums.EpistemicRole[],
): Result<PersonalRecord, RecordMappingError> => {
  const time = toDomainTime(row);
  if (!time.ok) return err(time.error);

  return ok({
    id: recordId(row.id),
    // Two distinct branded types from two distinct columns. They are never
    // derived from one another (INV-16, arch §4 Patch 2).
    sourceFingerprint: sourceFingerprint(row.sourceFingerprint),
    evidenceUnitId: evidenceUnitId(row.evidenceUnitId),
    epistemicRoles: roles.map(epistemicRoleFromDb),
    provenance: {
      origin: PROVENANCE_ORIGIN_FROM_DB[row.provenanceOrigin],
      actor: PROVENANCE_ACTOR_FROM_DB[row.provenanceActor],
      sourceRef: row.sourceRef,
      capturedAt: row.capturedAt,
    },
    time: time.value,
    rawExpression:
      row.rawExpressionVerbatim === null
        ? null
        : {
            verbatim: row.rawExpressionVerbatim,
            language: row.rawExpressionLanguage ?? 'und',
          },
    createdAt: row.createdAt,
  });
};

/** Domain -> row payload, excluding the role rows (written separately). */
export const toRecordRow = (record: PersonalRecord): RecordRow => ({
  id: record.id,
  sourceFingerprint: record.sourceFingerprint,
  evidenceUnitId: record.evidenceUnitId,
  provenanceOrigin: PROVENANCE_ORIGIN_TO_DB[record.provenance.origin],
  provenanceActor: PROVENANCE_ACTOR_TO_DB[record.provenance.actor],
  sourceRef: record.provenance.sourceRef,
  capturedAt: record.provenance.capturedAt,
  rawExpressionVerbatim: record.rawExpression?.verbatim ?? null,
  rawExpressionLanguage: record.rawExpression?.language ?? null,
  createdAt: record.createdAt,
  ...toTimeColumns(record.time),
});

/* ── Directive ────────────────────────────────────────────────────────── */

export interface DirectiveRow {
  readonly id: string;
  readonly allowAnalysis: boolean;
  readonly allowStorage: boolean;
  readonly allowPassivePresentation: boolean;
  readonly allowProactivePresentation: boolean;
  readonly appliesToFutureSimilar: boolean;
  readonly scopeKind: $Enums.DirectiveScopeKind | null;
  readonly scopeValue: string | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * Note all four permission booleans map straight across, one column each.
 * There is no derivation, defaulting, or collapsing between them at the
 * persistence boundary (INV-17).
 */
export const toDomainDirective = (row: DirectiveRow): Directive => ({
  id: directiveId(row.id),
  allowAnalysis: row.allowAnalysis,
  allowStorage: row.allowStorage,
  allowPassivePresentation: row.allowPassivePresentation,
  allowProactivePresentation: row.allowProactivePresentation,
  appliesToFutureSimilar: row.appliesToFutureSimilar,
  scope:
    row.scopeKind === null || row.scopeValue === null
      ? null
      : {
          kind: DIRECTIVE_SCOPE_KIND_FROM_DB[row.scopeKind],
          value: row.scopeValue,
        },
  revokedAt: row.revokedAt,
  createdAt: row.createdAt,
});

export const toDirectiveRow = (d: Directive): DirectiveRow => ({
  id: d.id,
  allowAnalysis: d.allowAnalysis,
  allowStorage: d.allowStorage,
  allowPassivePresentation: d.allowPassivePresentation,
  allowProactivePresentation: d.allowProactivePresentation,
  appliesToFutureSimilar: d.appliesToFutureSimilar,
  scopeKind: d.scope === null ? null : DIRECTIVE_SCOPE_KIND_TO_DB[d.scope.kind],
  scopeValue: d.scope?.value ?? null,
  revokedAt: d.revokedAt,
  createdAt: d.createdAt,
});

/* ── LineageEdge ──────────────────────────────────────────────────────── */

export interface LineageEdgeRow {
  readonly id: string;
  readonly childId: string;
  readonly parentId: string;
  readonly relationToParent: $Enums.LineageRelation;
  readonly createdAt: Date;
}

export const toDomainLineageEdge = (row: LineageEdgeRow): LineageEdge => ({
  id: lineageEdgeId(row.id),
  childId: recordId(row.childId),
  parentId: recordId(row.parentId),
  relationToParent: lineageRelationFromDb(row.relationToParent),
  createdAt: row.createdAt,
});

export const toLineageEdgeRow = (e: LineageEdge): LineageEdgeRow => ({
  id: e.id,
  childId: e.childId,
  parentId: e.parentId,
  relationToParent: lineageRelationToDb(e.relationToParent),
  createdAt: e.createdAt,
});

/* ── RelationClaim ────────────────────────────────────────────────────── */

const SUPPORT_LEVEL_TO_DB = {
  weak: 'WEAK',
  observed: 'OBSERVED',
  supported: 'SUPPORTED',
  strong: 'STRONG',
} as const satisfies Record<EvidenceSupportLevel, $Enums.EvidenceSupportLevel>;

const DIMENSION_TO_DB = {
  structural_strength: 'STRUCTURAL_STRENGTH',
  independent_support: 'INDEPENDENT_SUPPORT',
  temporal_adequacy: 'TEMPORAL_ADEQUACY',
  specificity_baseline_contrast: 'SPECIFICITY_BASELINE_CONTRAST',
  counterevidence_balance: 'COUNTEREVIDENCE_BALANCE',
  evidence_fidelity: 'EVIDENCE_FIDELITY',
} as const satisfies Record<EvidenceDimension, $Enums.EvidenceDimension>;

const SCORE_STATUS_TO_DB = {
  scored: 'SCORED',
  unavailable: 'UNAVAILABLE',
  needs_retry: 'NEEDS_RETRY',
} as const satisfies Record<ScoreStatus, $Enums.DimensionScoreStatus>;

const SUPPORT_LEVEL_FROM_DB = invert(SUPPORT_LEVEL_TO_DB);
const DIMENSION_FROM_DB = invert(DIMENSION_TO_DB);
const SCORE_STATUS_FROM_DB = invert(SCORE_STATUS_TO_DB);

export const supportLevelToDb = (
  l: EvidenceSupportLevel,
): $Enums.EvidenceSupportLevel => SUPPORT_LEVEL_TO_DB[l];
export const supportLevelFromDb = (
  l: $Enums.EvidenceSupportLevel,
): EvidenceSupportLevel => SUPPORT_LEVEL_FROM_DB[l];
export const dimensionToDb = (
  d: EvidenceDimension,
): $Enums.EvidenceDimension => DIMENSION_TO_DB[d];
export const dimensionFromDb = (
  d: $Enums.EvidenceDimension,
): EvidenceDimension => DIMENSION_FROM_DB[d];

export interface RelationClaimRow {
  readonly id: string;
  readonly axisQuestion: string;
  readonly axisDimension: string;
  readonly relationType: string;
  readonly evidenceSummary: string;
  readonly assertsTemporalOrdering: boolean;
  readonly numericScore: number | null;
  readonly supportLevel: $Enums.EvidenceSupportLevel | null;
  readonly createdAt: Date;
}

export interface RelationClaimDimensionRow {
  readonly dimension: $Enums.EvidenceDimension;
  readonly status: $Enums.DimensionScoreStatus;
  readonly score: number | null;
  readonly reason: string;
}

export type RelationClaimMappingError = {
  readonly kind: 'inconsistent_relation_claim';
  readonly detail: string;
};

/**
 * Reassemble a claim from its flat rows.
 *
 * This is where the Patch 8 coupling is defended at the persistence boundary.
 * SQL cannot declaratively express "a support level implies six SCORED
 * dimension rows, each with a reason", so the invariant is re-checked here and
 * a violating row set is REFUSED rather than repaired.
 *
 * Refusing matters: silently reconstructing a partial assessment would
 * manufacture an unaudited support level, which is exactly what Patch 8 exists
 * to prevent.
 */
export const toDomainRelationClaim = (
  row: RelationClaimRow,
  dimensionRows: readonly RelationClaimDimensionRow[],
): Result<StoredRelationClaim, RelationClaimMappingError> => {
  const candidate: RelationClaimCandidate = {
    recordRefs: [],
    comparisonAxis: {
      question: row.axisQuestion,
      dimension: row.axisDimension,
    },
    relationType: row.relationType,
    evidenceSummary: row.evidenceSummary,
    assertsTemporalOrdering: row.assertsTemporalOrdering,
  };

  const hasLevel = row.supportLevel !== null;
  const hasScore = row.numericScore !== null;

  if (hasLevel !== hasScore) {
    return err({
      kind: 'inconsistent_relation_claim',
      detail:
        `Claim ${row.id} has supportLevel=${String(row.supportLevel)} but ` +
        `numericScore=${String(row.numericScore)}; a level and its numeric ` +
        'score are produced together by deterministic code (§9).',
    });
  }

  // No assessment: legitimate for a claim recorded before scoring, or one left
  // explicitly unscored (arch §11 Patch 9).
  if (!hasLevel) {
    return ok(
      buildStoredClaim({
        id: relationClaimId(row.id),
        candidate,
        assessment: null,
        createdAt: row.createdAt,
      }),
    );
  }

  // A level is present, so every dimension must be present AND scored.
  const judgmentEntries: [EvidenceDimension, DimensionJudgment][] = [];

  for (const dimension of EVIDENCE_DIMENSIONS) {
    const dbDimension = DIMENSION_TO_DB[dimension];
    const found = dimensionRows.find((d) => d.dimension === dbDimension);

    if (found === undefined) {
      return err({
        kind: 'inconsistent_relation_claim',
        detail:
          `Claim ${row.id} carries a support level but has no judgment row ` +
          `for ${dimension}; a level may not exist without all six dimension ` +
          'scores and reasons (Patch 8).',
      });
    }

    const status = SCORE_STATUS_FROM_DB[found.status];

    if (status !== 'scored') {
      return err({
        kind: 'inconsistent_relation_claim',
        detail:
          `Claim ${row.id} carries a support level but ${dimension} is ` +
          `${status}; an incomplete assessment must have no level at all ` +
          '(arch §11 Patch 9).',
      });
    }

    if (found.score === null || !isDimensionScore(found.score)) {
      return err({
        kind: 'inconsistent_relation_claim',
        detail:
          `Claim ${row.id} dimension ${dimension} is SCORED but its score ` +
          `${String(found.score)} is not on the 0–3 scale (§9).`,
      });
    }

    if (found.reason.trim().length === 0) {
      return err({
        kind: 'inconsistent_relation_claim',
        detail:
          `Claim ${row.id} dimension ${dimension} has a score with no reason; ` +
          'every stored score must trace to a stored reason (Patch 8).',
      });
    }

    judgmentEntries.push([
      dimension,
      { status: 'scored', score: found.score, reason: found.reason },
    ]);
  }

  const judgments = Object.fromEntries(judgmentEntries) as DimensionJudgments;

  return ok(
    buildStoredClaim({
      id: relationClaimId(row.id),
      candidate,
      assessment: {
        judgments,
        numericScore: row.numericScore ?? 0,
        supportLevel: SUPPORT_LEVEL_FROM_DB[row.supportLevel ?? 'WEAK'],
      },
      createdAt: row.createdAt,
    }),
  );
};

export const toRelationClaimRow = (
  claim: StoredRelationClaim,
): RelationClaimRow => ({
  id: claim.id,
  axisQuestion: claim.comparisonAxis.question,
  axisDimension: claim.comparisonAxis.dimension,
  relationType: claim.relationType,
  evidenceSummary: claim.evidenceSummary,
  assertsTemporalOrdering: claim.assertsTemporalOrdering,
  numericScore: claim.assessment?.numericScore ?? null,
  supportLevel:
    claim.assessment === null
      ? null
      : SUPPORT_LEVEL_TO_DB[claim.assessment.supportLevel],
  createdAt: claim.createdAt,
});

/** Dimension rows for a claim. Empty when there is no assessment. */
/* ── Reflection (§21, §22, §24, §25, §33) ────────────────────────────── */

const ELICITATION_MODE_TO_DB = {
  spontaneous: 'SPONTANEOUS',
  prompted: 'PROMPTED',
  unknown: 'UNKNOWN',
} as const satisfies Record<ElicitationMode, $Enums.ElicitationMode>;

const STIMULUS_TYPE_TO_DB = {
  none: 'NONE',
  open_question: 'OPEN_QUESTION',
  evidence_relation: 'EVIDENCE_RELATION',
  hypothesis: 'HYPOTHESIS',
  // Retained because §22 freezes the enum. MVP never produces it: no external
  // content reaches the reflection layer and no plugin ships.
  external_reference: 'EXTERNAL_REFERENCE',
  unknown: 'UNKNOWN',
} as const satisfies Record<StimulusType, $Enums.StimulusType>;

const MEANING_COMMITMENT_TO_DB = {
  tentative: 'TENTATIVE',
  // Retained in the enum but never written in MVP: `confirmed` is frozen out,
  // so every stored meaning is tentative (§24).
  confirmed: 'CONFIRMED',
} as const satisfies Record<MeaningCommitment, $Enums.MeaningCommitment>;

const MEANING_EFFECT_TO_DB = {
  current: 'CURRENT',
  superseded: 'SUPERSEDED',
} as const satisfies Record<MeaningEffect, $Enums.MeaningEffect>;

const ELICITATION_MODE_FROM_DB = invert(ELICITATION_MODE_TO_DB);
const STIMULUS_TYPE_FROM_DB = invert(STIMULUS_TYPE_TO_DB);
const MEANING_COMMITMENT_FROM_DB = invert(MEANING_COMMITMENT_TO_DB);
const MEANING_EFFECT_FROM_DB = invert(MEANING_EFFECT_TO_DB);

export interface ReflectionEpisodeRow {
  readonly id: string;
  readonly elicitationMode: $Enums.ElicitationMode;
  readonly stimulusType: $Enums.StimulusType;
  readonly systemFollowupCount: number;
  readonly stimulusRef: string | null;
  readonly targetRef: string | null;
  readonly occurredAt: Date;
}

/**
 * Row -> domain. Total.
 *
 * Note what an episode does NOT carry: no meaning commitment, no user position,
 * no response. §21/Patch 4 confine it to HOW a reflection was elicited, so there
 * is no field here that could be mistaken for what the user concluded (INV-18).
 */
export const toDomainReflectionEpisode = (
  row: ReflectionEpisodeRow,
): ReflectionEpisode => ({
  id: reflectionEpisodeId(row.id),
  elicitationMode: ELICITATION_MODE_FROM_DB[row.elicitationMode],
  stimulusType: STIMULUS_TYPE_FROM_DB[row.stimulusType],
  systemFollowupCount: row.systemFollowupCount,
  stimulusRef: row.stimulusRef,
  targetRef: row.targetRef,
  occurredAt: row.occurredAt,
});

export const toReflectionEpisodeRow = (
  e: ReflectionEpisode,
): ReflectionEpisodeRow => ({
  id: e.id,
  elicitationMode: ELICITATION_MODE_TO_DB[e.elicitationMode],
  stimulusType: STIMULUS_TYPE_TO_DB[e.stimulusType],
  systemFollowupCount: e.systemFollowupCount,
  stimulusRef: e.stimulusRef,
  targetRef: e.targetRef,
  occurredAt: e.occurredAt,
});

export interface UserReflectionRecordRow {
  readonly id: string;
  readonly recordId: string;
  readonly meaningCommitment: $Enums.MeaningCommitment;
  readonly validAtSemantic: $Enums.TimeSemantic;
  readonly validAtTime: Date | null;
  readonly validAtIntervalFrom: Date | null;
  readonly validAtIntervalTo: Date | null;
  readonly validAtIntervalReportedAs: string | null;
  readonly currentEffect: $Enums.MeaningEffect;
  readonly supersededById: string | null;
  readonly supersededAt: Date | null;
  readonly episodeId: string | null;
  readonly createdAt: Date;
}

/**
 * Row -> domain. PARTIAL, and deliberately so.
 *
 * §25 makes user meaning time-indexed, and `validAtTime` is a full
 * `TimeAssertion` — a meaning may be valid over a reported interval ("这半年"),
 * not only at a point. So the same refuse-rather-than-repair rule that governs
 * Record time applies here: if the stored columns are inconsistent, this returns
 * an error instead of fabricating bounds or inventing the user's wording (§12).
 *
 * Reuses `toDomainTime` rather than reimplementing the check, so the two can
 * never disagree about what a valid time assertion looks like.
 */
export const toDomainUserReflectionRecord = (
  row: UserReflectionRecordRow,
): Result<UserReflectionRecord, TimeMappingError> => {
  const time = toDomainTime({
    timeSemantic: row.validAtSemantic,
    timeAt: row.validAtTime,
    intervalFrom: row.validAtIntervalFrom,
    intervalTo: row.validAtIntervalTo,
    intervalReportedAs: row.validAtIntervalReportedAs,
  });

  if (!time.ok) return time;

  return ok({
    id: userReflectionRecordId(row.id),
    recordId: recordId(row.recordId),
    meaningCommitment: MEANING_COMMITMENT_FROM_DB[row.meaningCommitment],
    validAtTime: time.value,
    currentEffect: MEANING_EFFECT_FROM_DB[row.currentEffect],
    supersededByRef:
      row.supersededById === null
        ? null
        : userReflectionRecordId(row.supersededById),
    supersededAt: row.supersededAt,
    episodeRef: row.episodeId,
    createdAt: row.createdAt,
  });
};

export const toUserReflectionRecordRow = (
  r: UserReflectionRecord,
): UserReflectionRecordRow => {
  const cols = toTimeColumns(r.validAtTime);

  return {
    id: r.id,
    recordId: r.recordId,
    meaningCommitment: MEANING_COMMITMENT_TO_DB[r.meaningCommitment],
    validAtSemantic: cols.timeSemantic,
    validAtTime: cols.timeAt,
    validAtIntervalFrom: cols.intervalFrom,
    validAtIntervalTo: cols.intervalTo,
    validAtIntervalReportedAs: cols.intervalReportedAs,
    currentEffect: MEANING_EFFECT_TO_DB[r.currentEffect],
    supersededById: r.supersededByRef,
    supersededAt: r.supersededAt,
    episodeId: r.episodeRef,
    createdAt: r.createdAt,
  };
};

/* ── ReflectionPreference (§33) ──────────────────────────────────────── */

const HYPOTHESIS_VISIBILITY_TO_DB = {
  hidden: 'HIDDEN',
  on_request: 'ON_REQUEST',
  shown: 'SHOWN',
} as const satisfies Record<HypothesisVisibility, $Enums.HypothesisVisibility>;

const INTERVENTION_LEVEL_TO_DB = {
  minimal: 'MINIMAL',
  standard: 'STANDARD',
} as const satisfies Record<InterventionLevel, $Enums.InterventionLevel>;

const EXPLANATION_DENSITY_TO_DB = {
  brief: 'BRIEF',
  full: 'FULL',
} as const satisfies Record<ExplanationDensity, $Enums.ExplanationDensity>;

const HYPOTHESIS_VISIBILITY_FROM_DB = invert(HYPOTHESIS_VISIBILITY_TO_DB);
const INTERVENTION_LEVEL_FROM_DB = invert(INTERVENTION_LEVEL_TO_DB);
const EXPLANATION_DENSITY_FROM_DB = invert(EXPLANATION_DENSITY_TO_DB);

export interface ReflectionPreferenceRow {
  readonly id: string;
  readonly hypothesisVisibility: $Enums.HypothesisVisibility;
  readonly interventionLevel: $Enums.InterventionLevel;
  readonly explanationDensity: $Enums.ExplanationDensity;
  readonly updatedAt: Date;
}

/**
 * Row -> domain. Total.
 *
 * §33: these are interaction-style dials, not traits. There is nothing here to
 * validate against the person, and nothing that could be read as evidence about
 * them.
 */
export const toDomainReflectionPreference = (
  row: ReflectionPreferenceRow,
): ReflectionPreference => ({
  id: row.id,
  hypothesisVisibility:
    HYPOTHESIS_VISIBILITY_FROM_DB[row.hypothesisVisibility],
  interventionLevel: INTERVENTION_LEVEL_FROM_DB[row.interventionLevel],
  explanationDensity: EXPLANATION_DENSITY_FROM_DB[row.explanationDensity],
  updatedAt: row.updatedAt,
});

export const toReflectionPreferenceRow = (
  p: ReflectionPreference,
): ReflectionPreferenceRow => ({
  id: p.id,
  hypothesisVisibility: HYPOTHESIS_VISIBILITY_TO_DB[p.hypothesisVisibility],
  interventionLevel: INTERVENTION_LEVEL_TO_DB[p.interventionLevel],
  explanationDensity: EXPLANATION_DENSITY_TO_DB[p.explanationDensity],
  updatedAt: p.updatedAt,
});

/* ── Discovery (§17; docs/architecture.md §4 Patch 6) ─────────────────── */

const DISCOVERY_KIND_TO_DB = {
  relation_discovery: 'RELATION_DISCOVERY',
  hypothesis_discovery: 'HYPOTHESIS_DISCOVERY',
} as const satisfies Record<DiscoveryKind, $Enums.DiscoveryKind>;

const DISCOVERY_SUBJECT_TYPE_TO_DB = {
  relation_claim: 'RELATION_CLAIM',
  hypothesis: 'HYPOTHESIS',
} as const satisfies Record<DiscoverySubjectType, $Enums.DiscoverySubjectType>;

const DISCOVERY_KIND_FROM_DB = invert(DISCOVERY_KIND_TO_DB);
const DISCOVERY_SUBJECT_TYPE_FROM_DB = invert(DISCOVERY_SUBJECT_TYPE_TO_DB);

export interface DiscoveryRow {
  readonly id: string;
  readonly subjectType: $Enums.DiscoverySubjectType;
  readonly subjectRef: string;
  readonly discoveryKind: $Enums.DiscoveryKind;
  readonly stableKey: string;
  readonly createdAt: Date;
}

/**
 * Row -> domain.
 *
 * Total, and deliberately narrow: a Discovery row carries IDENTITY ONLY. There
 * is no attention priority, presentation level, or score to map, because those
 * are computed on read and never persisted (Patch 6, INV-09). If a future row
 * gained such a column, this mapper would have nowhere to put it.
 */
export const toDomainDiscovery = (row: DiscoveryRow): Discovery => ({
  id: discoveryId(row.id),
  subjectRef: {
    type: DISCOVERY_SUBJECT_TYPE_FROM_DB[row.subjectType],
    id: row.subjectRef,
  },
  discoveryKind: DISCOVERY_KIND_FROM_DB[row.discoveryKind],
  stableKey: row.stableKey,
  createdAt: row.createdAt,
});

export const toDiscoveryRow = (d: Discovery): DiscoveryRow => ({
  id: d.id,
  subjectType: DISCOVERY_SUBJECT_TYPE_TO_DB[d.subjectRef.type],
  subjectRef: d.subjectRef.id,
  discoveryKind: DISCOVERY_KIND_TO_DB[d.discoveryKind],
  stableKey: d.stableKey,
  createdAt: d.createdAt,
});

/* ── CurrentFocusContext (§19) ────────────────────────────────────────── */

const FOCUS_SOURCE_KIND_TO_DB = {
  user_stated: 'USER_STATED',
  record_derived: 'RECORD_DERIVED',
} as const satisfies Record<FocusSourceKind, $Enums.FocusSourceKind>;

const FOCUS_SOURCE_KIND_FROM_DB = invert(FOCUS_SOURCE_KIND_TO_DB);

export interface FocusContextRow {
  readonly id: string;
  readonly subjectRef: string;
  readonly sourceKind: $Enums.FocusSourceKind;
  readonly sourceRef: string;
  readonly lastMentionedAt: Date;
  readonly expiresAt: Date | null;
  readonly endedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * Row -> domain.
 *
 * Note there is no lifecycle or relevance field to map: §19 requires elastic
 * fading rather than a fabricated expiry, so both are derived from
 * `lastMentionedAt` on read. Persisting them would fabricate the precise expiry
 * the contract forbids.
 */
export const toDomainFocusContext = (
  row: FocusContextRow,
): CurrentFocusContext => ({
  id: focusContextId(row.id),
  subjectRef: row.subjectRef,
  source: {
    kind: FOCUS_SOURCE_KIND_FROM_DB[row.sourceKind],
    ref: row.sourceRef,
  },
  lastMentionedAt: row.lastMentionedAt,
  expiresAt: row.expiresAt,
  endedAt: row.endedAt,
  createdAt: row.createdAt,
});

export const toFocusContextRow = (c: CurrentFocusContext): FocusContextRow => ({
  id: c.id,
  subjectRef: c.subjectRef,
  sourceKind: FOCUS_SOURCE_KIND_TO_DB[c.source.kind],
  sourceRef: c.source.ref,
  lastMentionedAt: c.lastMentionedAt,
  expiresAt: c.expiresAt,
  endedAt: c.endedAt,
  createdAt: c.createdAt,
});

/* ── Hypothesis ───────────────────────────────────────────────────────── */

const SUPPORT_BASIS_TO_DB = {
  directional_observation: 'DIRECTIONAL_OBSERVATION',
  compatibility_only: 'COMPATIBILITY_ONLY',
  absence_of_contradiction: 'ABSENCE_OF_CONTRADICTION',
  insufficient: 'INSUFFICIENT',
} as const satisfies Record<SupportBasis, $Enums.SupportBasis>;

const ANCHOR_PATH_TO_DB = {
  supported_relation: 'SUPPORTED_RELATION',
  independent_patterns: 'INDEPENDENT_PATTERNS',
} as const satisfies Record<AnchorPath, $Enums.AnchorPath>;

const SUPPORT_BASIS_FROM_DB = invert(SUPPORT_BASIS_TO_DB);
const ANCHOR_PATH_FROM_DB = invert(ANCHOR_PATH_TO_DB);

export const supportBasisToDb = (b: SupportBasis): $Enums.SupportBasis =>
  SUPPORT_BASIS_TO_DB[b];
export const supportBasisFromDb = (b: $Enums.SupportBasis): SupportBasis =>
  SUPPORT_BASIS_FROM_DB[b];
export const anchorPathToDb = (p: AnchorPath): $Enums.AnchorPath =>
  ANCHOR_PATH_TO_DB[p];
export const anchorPathFromDb = (p: $Enums.AnchorPath): AnchorPath =>
  ANCHOR_PATH_FROM_DB[p];

export interface HypothesisRow {
  readonly id: string;
  readonly explanation: string;
  readonly anchorRefs: readonly string[];
  readonly anchorPath: $Enums.AnchorPath;
  readonly supportBasis: $Enums.SupportBasis;
  readonly supportingRecordRefs: readonly string[];
  readonly mechanism: string;
  readonly discriminatingPredictions: readonly string[];
  readonly alternatives: readonly string[];
  readonly wouldStrengthen: readonly string[];
  readonly wouldWeaken: readonly string[];
  readonly createdAt: Date;
}

/**
 * Row -> domain. TOTAL, unlike the RelationClaim mapper.
 *
 * There is no coupling here that SQL cannot express: every field maps straight
 * across, and the H4/H5 non-emptiness requirements are admission-time rules
 * rather than reconstruction hazards. A stored hypothesis that somehow lost its
 * alternatives is caught by `remainsCompetable` at the adapter boundary, not by
 * refusing to map it — the distinction matters because a hypothesis with no
 * rivals is a defect to surface, not an unreadable row.
 */
export const toDomainHypothesis = (row: HypothesisRow): StoredHypothesis => ({
  id: hypothesisId(row.id),
  explanation: row.explanation,
  anchorRefs: row.anchorRefs,
  anchorPath: ANCHOR_PATH_FROM_DB[row.anchorPath],
  supportBasis: SUPPORT_BASIS_FROM_DB[row.supportBasis],
  supportingRecordRefs: row.supportingRecordRefs,
  mechanism: row.mechanism,
  discriminatingPredictions: row.discriminatingPredictions,
  alternatives: row.alternatives,
  wouldStrengthen: row.wouldStrengthen,
  wouldWeaken: row.wouldWeaken,
  createdAt: row.createdAt,
});

export const toHypothesisRow = (h: StoredHypothesis): HypothesisRow => ({
  id: h.id,
  explanation: h.explanation,
  anchorRefs: h.anchorRefs,
  anchorPath: ANCHOR_PATH_TO_DB[h.anchorPath],
  supportBasis: SUPPORT_BASIS_TO_DB[h.supportBasis],
  supportingRecordRefs: h.supportingRecordRefs,
  mechanism: h.mechanism,
  discriminatingPredictions: h.discriminatingPredictions,
  alternatives: h.alternatives,
  wouldStrengthen: h.wouldStrengthen,
  wouldWeaken: h.wouldWeaken,
  createdAt: h.createdAt,
});

export const toRelationClaimDimensionRows = (
  claim: StoredRelationClaim,
): readonly RelationClaimDimensionRow[] => {
  const assessment = claim.assessment;
  if (assessment === null) return [];

  return EVIDENCE_DIMENSIONS.map((dimension) => {
    const judgment = assessment.judgments[dimension];

    return judgment.status === 'scored'
      ? {
          dimension: DIMENSION_TO_DB[dimension],
          status: SCORE_STATUS_TO_DB.scored,
          score: judgment.score,
          reason: judgment.reason,
        }
      : {
          dimension: DIMENSION_TO_DB[dimension],
          status: SCORE_STATUS_TO_DB[judgment.status],
          score: null,
          reason: judgment.reason,
        };
  });
};

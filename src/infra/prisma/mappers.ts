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
  EpistemicRole,
  LineageRelation,
  ProvenanceActor,
  ProvenanceOrigin,
  TimeSemantic,
} from '../../domain/shared/enums';
import type { PersonalRecord } from '../../domain/record/record';
import type { Directive } from '../../domain/directive/directive';
import type { LineageEdge } from '../../domain/lineage/lineage-edge';
import {
  directiveId,
  evidenceUnitId,
  lineageEdgeId,
  recordId,
  sourceFingerprint,
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

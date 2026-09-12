/**
 * Phase 2 tests — domain <-> row mapping.
 *
 * These run with NO database. The mappers are pure functions over plain
 * objects, and mappers.ts imports Prisma types only (`import type`), so the
 * persistence boundary is verifiable before PostgreSQL is available.
 *
 * Covers:
 *   INV-16 — sourceFingerprint and evidenceUnitId come from separate columns
 *            and are never derived from one another.
 *   INV-17 — all four Directive permission booleans survive independently.
 *   ENGINEERING_CONTRACT §4.2 — raw wording round-trips verbatim.
 *   ENGINEERING_CONTRACT §5, §12 — time semantics round-trip without upgrade,
 *            and an inconsistent row is REFUSED rather than defaulted.
 */

import { describe, expect, it } from 'vitest';

import {
  type DirectiveRow,
  type LineageEdgeRow,
  type RecordRow,
  epistemicRoleFromDb,
  epistemicRoleToDb,
  lineageRelationFromDb,
  lineageRelationToDb,
  toDirectiveRow,
  toDomainDirective,
  toDomainLineageEdge,
  toDomainRecord,
  toDomainTime,
  toLineageEdgeRow,
  toRecordRow,
  toTimeColumns,
} from '@/infra/prisma/mappers';
import type { PersonalRecord } from '@/domain/record/record';
import type { Directive } from '@/domain/directive/directive';
import type { LineageEdge } from '@/domain/lineage/lineage-edge';
import {
  EPISTEMIC_ROLES,
  LINEAGE_RELATIONS,
  TIME_SEMANTICS,
} from '@/domain/shared/enums';
import {
  directiveId,
  evidenceUnitId,
  lineageEdgeId,
  recordId,
  sourceFingerprint,
} from '@/domain/shared/ids';
import type { TimeAssertion } from '@/domain/shared/time-semantics';
import { isErr, isOk, unwrap } from '@/domain/shared/result';

const AT = new Date('2026-09-01T00:00:00Z');

const record = (over: Partial<PersonalRecord> = {}): PersonalRecord => ({
  id: recordId('rec-1'),
  sourceFingerprint: sourceFingerprint('fp-abc'),
  evidenceUnitId: evidenceUnitId('eu-xyz'),
  epistemicRoles: ['user_expression'],
  provenance: {
    origin: 'directly_observed',
    actor: 'user',
    sourceRef: 'zhihu:answer:1',
    capturedAt: AT,
  },
  time: { semantic: 'observation_time', at: AT },
  rawExpression: { verbatim: '我可能只是害怕开始', language: 'zh' },
  createdAt: AT,
  ...over,
});

describe('enum tables are bijective', () => {
  it.each(EPISTEMIC_ROLES)('round-trips epistemic role %s', (role) => {
    expect(epistemicRoleFromDb(epistemicRoleToDb(role))).toBe(role);
  });

  it.each(LINEAGE_RELATIONS)('round-trips lineage relation %s', (relation) => {
    expect(lineageRelationFromDb(lineageRelationToDb(relation))).toBe(relation);
  });

  it('maps every contract role to a distinct database value', () => {
    const dbValues = EPISTEMIC_ROLES.map(epistemicRoleToDb);
    expect(new Set(dbValues).size).toBe(EPISTEMIC_ROLES.length);
  });
});

describe('§5 — time semantics round-trip without upgrade', () => {
  it.each(
    TIME_SEMANTICS.filter((s) => s !== 'user_reported_interval'),
  )('preserves point semantic %s', (semantic) => {
    const time = { semantic, at: AT } as TimeAssertion;
    const restored = unwrap(toDomainTime(toTimeColumns(time)));

    // The tag survives the trip: no semantic is silently promoted (INV-07).
    expect(restored.semantic).toBe(semantic);
  });

  it('preserves a reported interval including user wording', () => {
    const time: TimeAssertion = {
      semantic: 'user_reported_interval',
      from: null,
      to: null,
      reportedAs: '这半年我从来不主动打电话',
    };

    const restored = unwrap(toDomainTime(toTimeColumns(time)));

    expect(restored).toEqual(time);
  });

  it('preserves interval bounds when known', () => {
    const to = new Date('2026-06-30T00:00:00Z');
    const time: TimeAssertion = {
      semantic: 'user_reported_interval',
      from: AT,
      to,
      reportedAs: '这半年',
    };

    expect(unwrap(toDomainTime(toTimeColumns(time)))).toEqual(time);
  });

  it('refuses a point row missing its timestamp', () => {
    const result = toDomainTime({
      timeSemantic: 'OBSERVATION_TIME',
      timeAt: null,
      intervalFrom: null,
      intervalTo: null,
      intervalReportedAs: null,
    });

    // Substituting another time would be a semantic upgrade.
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('inconsistent_time_columns');
    }
  });

  it('refuses an interval row missing the user wording', () => {
    const result = toDomainTime({
      timeSemantic: 'USER_REPORTED_INTERVAL',
      timeAt: null,
      intervalFrom: null,
      intervalTo: null,
      intervalReportedAs: null,
    });

    // The wording IS the evidence for a reported interval (§12).
    expect(isErr(result)).toBe(true);
  });

  it('does not populate interval columns for a point assertion', () => {
    const cols = toTimeColumns({ semantic: 'event_time', at: AT });

    expect(cols.intervalFrom).toBeNull();
    expect(cols.intervalTo).toBeNull();
    expect(cols.intervalReportedAs).toBeNull();
  });

  it('does not populate timeAt for an interval assertion', () => {
    const cols = toTimeColumns({
      semantic: 'user_reported_interval',
      from: null,
      to: null,
      reportedAs: '这半年',
    });

    expect(cols.timeAt).toBeNull();
  });
});

describe('Record mapping', () => {
  const roundTrip = (r: PersonalRecord): PersonalRecord => {
    const row = toRecordRow(r);
    return unwrap(toDomainRecord(row, r.epistemicRoles.map(epistemicRoleToDb)));
  };

  it('round-trips a full record', () => {
    const original = record();
    expect(roundTrip(original)).toEqual(original);
  });

  it('INV-16 — keeps fingerprint and evidence unit in separate columns', () => {
    const row = toRecordRow(record());

    expect(row.sourceFingerprint).toBe('fp-abc');
    expect(row.evidenceUnitId).toBe('eu-xyz');
    // Neither is derived from the other.
    expect(row.sourceFingerprint).not.toBe(row.evidenceUnitId);
  });

  it('INV-16 — reads the two identities back from their own columns', () => {
    // A row where the two identities differ must not be collapsed.
    const restored = roundTrip(
      record({
        sourceFingerprint: sourceFingerprint('fp-1'),
        evidenceUnitId: evidenceUnitId('eu-1'),
      }),
    );

    expect(restored.sourceFingerprint).toBe('fp-1');
    expect(restored.evidenceUnitId).toBe('eu-1');
  });

  it('lets two records share one evidence unit with distinct fingerprints', () => {
    // The summary/reformat case: different sources, one evidence unit.
    const a = toRecordRow(
      record({ sourceFingerprint: sourceFingerprint('fp-a') }),
    );
    const b = toRecordRow(
      record({ id: recordId('rec-2'), sourceFingerprint: sourceFingerprint('fp-b') }),
    );

    expect(a.evidenceUnitId).toBe(b.evidenceUnitId);
    expect(a.sourceFingerprint).not.toBe(b.sourceFingerprint);
  });

  it('§4.2 — preserves modal language verbatim', () => {
    const restored = roundTrip(
      record({
        rawExpression: { verbatim: '我可能是因为害怕', language: 'zh' },
      }),
    );

    expect(restored.rawExpression?.verbatim).toBe('我可能是因为害怕');
    expect(restored.rawExpression?.verbatim).toContain('可能');
  });

  it('handles a record with no raw expression', () => {
    const restored = roundTrip(record({ rawExpression: null }));
    expect(restored.rawExpression).toBeNull();
  });

  it('defaults an absent language to und rather than guessing', () => {
    const row: RecordRow = {
      ...toRecordRow(record()),
      rawExpressionVerbatim: 'text',
      rawExpressionLanguage: null,
    };

    const restored = unwrap(toDomainRecord(row, []));
    expect(restored.rawExpression?.language).toBe('und');
  });

  it('carries multiple epistemic roles through', () => {
    const restored = roundTrip(
      record({ epistemicRoles: ['user_expression', 'user_reported_pattern'] }),
    );

    expect(restored.epistemicRoles).toEqual([
      'user_expression',
      'user_reported_pattern',
    ]);
  });

  it('propagates a time-mapping refusal as a record-mapping refusal', () => {
    const row: RecordRow = { ...toRecordRow(record()), timeAt: null };
    expect(isErr(toDomainRecord(row, []))).toBe(true);
  });

  it('accepts a record with zero roles', () => {
    const restored = roundTrip(record({ epistemicRoles: [] }));
    expect(restored.epistemicRoles).toEqual([]);
  });
});

describe('Directive mapping — INV-17', () => {
  const directive = (over: Partial<Directive> = {}): Directive => ({
    id: directiveId('d-1'),
    allowAnalysis: true,
    allowStorage: true,
    allowPassivePresentation: true,
    allowProactivePresentation: false,
    appliesToFutureSimilar: false,
    scope: null,
    revokedAt: null,
    createdAt: AT,
    ...over,
  });

  it('round-trips a directive', () => {
    const original = directive();
    expect(toDomainDirective(toDirectiveRow(original))).toEqual(original);
  });

  it('preserves all 16 permission combinations', () => {
    for (const analysis of [true, false]) {
      for (const storage of [true, false]) {
        for (const passive of [true, false]) {
          for (const proactive of [true, false]) {
            const original = directive({
              allowAnalysis: analysis,
              allowStorage: storage,
              allowPassivePresentation: passive,
              allowProactivePresentation: proactive,
            });

            const restored = toDomainDirective(toDirectiveRow(original));

            // Each dimension survives on its own column. If any pair had been
            // collapsed at the persistence boundary, some combination here
            // would come back wrong.
            expect(restored.allowAnalysis).toBe(analysis);
            expect(restored.allowStorage).toBe(storage);
            expect(restored.allowPassivePresentation).toBe(passive);
            expect(restored.allowProactivePresentation).toBe(proactive);
          }
        }
      }
    }
  });

  it.each(['topic_tag', 'source', 'relation_axis', 'user_selected'] as const)(
    'round-trips a %s scope',
    (kind) => {
      const original = directive({
        appliesToFutureSimilar: true,
        scope: { kind, value: 'v-1' },
      });

      expect(toDomainDirective(toDirectiveRow(original)).scope).toEqual({
        kind,
        value: 'v-1',
      });
    },
  );

  it('round-trips a revoked directive', () => {
    const revokedAt = new Date('2026-10-01T00:00:00Z');
    const restored = toDomainDirective(toDirectiveRow(directive({ revokedAt })));

    expect(restored.revokedAt).toEqual(revokedAt);
  });

  it('treats a half-populated scope as no scope', () => {
    const row: DirectiveRow = {
      ...toDirectiveRow(directive()),
      scopeKind: 'TOPIC_TAG',
      scopeValue: null,
    };

    // Rather than inventing a scope value, which would let the directive match
    // subjects the user never named (arch §13).
    expect(toDomainDirective(row).scope).toBeNull();
  });
});

describe('LineageEdge mapping', () => {
  const edge = (over: Partial<LineageEdge> = {}): LineageEdge => ({
    id: lineageEdgeId('edge-1'),
    childId: recordId('rec-2'),
    parentId: recordId('rec-1'),
    relationToParent: 'summarizes',
    createdAt: AT,
    ...over,
  });

  it('round-trips an edge', () => {
    const original = edge();
    expect(toDomainLineageEdge(toLineageEdgeRow(original))).toEqual(original);
  });

  it.each(LINEAGE_RELATIONS)('round-trips relation %s', (relation) => {
    const restored = toDomainLineageEdge(
      toLineageEdgeRow(edge({ relationToParent: relation })),
    );

    expect(restored.relationToParent).toBe(relation);
  });

  it('carries no evidence field', () => {
    const row: LineageEdgeRow = toLineageEdgeRow(edge());

    // Lineage explains HOW records relate; independence lives on the Evidence
    // Unit. Keeping them apart is an explicit architectural requirement.
    expect('evidenceUnitId' in row).toBe(false);
    expect('independent' in row).toBe(false);
    expect('evidenceWeight' in row).toBe(false);
  });

  it('preserves child/parent direction', () => {
    const restored = toDomainLineageEdge(toLineageEdgeRow(edge()));

    expect(restored.childId).toBe(recordId('rec-2'));
    expect(restored.parentId).toBe(recordId('rec-1'));
  });
});

describe('mappers are database-free', () => {
  it('maps without any client connection', () => {
    // The whole suite proves this by running, but state it explicitly: these
    // are pure functions, and mappers.ts imports Prisma types only.
    expect(isOk(toDomainTime(toTimeColumns({ semantic: 'capture_time', at: AT })))).toBe(
      true,
    );
  });
});

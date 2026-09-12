/**
 * Phase 2 tests — end-to-end ingestion through the application service.
 *
 * Exercises the real pipeline (fingerprint → dedup lookup → directive
 * resolution → pure plan → execution) against in-memory adapters, so the
 * epistemic guarantees are verified with NO database.
 *
 * Covers:
 *   INV-16 — reclassification cannot mint a second Record or Evidence Unit.
 *   INV-03 / §37 — prompting round-trips do not manufacture evidence.
 *   INV-17 / §26 — storage and analysis permissions are independent.
 *   §4.2 — raw wording, including modal language, is preserved verbatim.
 *   §5 — time semantics pass through unmodified.
 *   §8 Gate 1 — usage permission precedes any write.
 *   docs/architecture.md §4 Patch 2, §6 Patch 7 — evidence independence rules.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  type CaptureRequest,
  type IdGenerator,
  IngestionService,
} from '@/application/ingestion-service';
import type { Directive } from '@/domain/directive/directive';
import { directiveId, evidenceUnitId, recordId } from '@/domain/shared/ids';
import { isErr, isOk, unwrap } from '@/domain/shared/result';
import { sha256 } from '@/infra/hash';
import { MemoryDirectiveRepository } from '@/infra/memory/memory-directive-repository';
import { MemoryEpistemicRoleRepository } from '@/infra/memory/memory-epistemic-role-repository';
import { MemoryLineageRepository } from '@/infra/memory/memory-lineage-repository';
import { MemoryRecordRepository } from '@/infra/memory/memory-record-repository';
import { MemoryIngestionCommitRepository } from '@/infra/memory/memory-ingestion-commit-repository';

const CAPTURED = new Date('2026-09-01T00:00:00Z');

/** Deterministic, monotonically numbered ids. */
class SequentialIds implements IdGenerator {
  private r = 0;
  private e = 0;
  private l = 0;

  nextRecordId(): string {
    this.r += 1;
    return `rec-${this.r}`;
  }

  nextEvidenceUnitId(): string {
    this.e += 1;
    return `eu-${this.e}`;
  }

  nextLineageEdgeId(): string {
    this.l += 1;
    return `edge-${this.l}`;
  }
}

let records: MemoryRecordRepository;
let roles: MemoryEpistemicRoleRepository;
let lineage: MemoryLineageRepository;
let directives: MemoryDirectiveRepository;
let service: IngestionService;

beforeEach(() => {
  records = new MemoryRecordRepository();
  roles = new MemoryEpistemicRoleRepository();
  lineage = new MemoryLineageRepository();
  directives = new MemoryDirectiveRepository();

  service = new IngestionService({
    records,
    roles,
    lineage,
    directives,
    commit: new MemoryIngestionCommitRepository(records, roles, lineage),
    hash: sha256,
    ids: new SequentialIds(),
  });
});

const capture = (over: Partial<CaptureRequest> = {}): CaptureRequest => ({
  origin: 'directly_observed',
  actor: 'user',
  sourceRef: 'zhihu:answer:123',
  verbatim: '我可能只是害怕开始以后发现自己做不好',
  language: 'zh',
  time: { semantic: 'observation_time', at: CAPTURED },
  epistemicRoles: ['user_expression'],
  capturedAt: CAPTURED,
  derivation: null,
  subject: {
    topicTags: ['starting'],
    source: 'zhihu',
    relationAxes: [],
    userSelectedRefs: [],
  },
  ...over,
});

const directive = (over: Partial<Directive> = {}): Directive => ({
  id: directiveId('d-1'),
  allowAnalysis: true,
  allowStorage: true,
  allowPassivePresentation: true,
  allowProactivePresentation: false,
  appliesToFutureSimilar: true,
  scope: null,
  revokedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('fresh capture', () => {
  it('creates a Record with a newly minted Evidence Unit', async () => {
    const outcome = unwrap(await service.ingest(capture()));

    expect(outcome.deduplicated).toBe(false);
    expect(outcome.recordId).toBe(recordId('rec-1'));

    const stored = await records.findById(outcome.recordId);
    expect(stored?.evidenceUnitId).toBe('eu-1');
  });

  it('preserves modal language verbatim (§4.2)', async () => {
    const outcome = unwrap(await service.ingest(capture()));
    const stored = await records.findById(outcome.recordId);

    // "可能" must survive. Normalizing "我可能是因为……" into "用户是因为……"
    // is explicitly forbidden.
    expect(stored?.rawExpression?.verbatim).toBe(
      '我可能只是害怕开始以后发现自己做不好',
    );
    expect(stored?.rawExpression?.verbatim).toContain('可能');
  });

  it('records und for an unspecified language rather than guessing', async () => {
    const outcome = unwrap(await service.ingest(capture({ language: null })));
    const stored = await records.findById(outcome.recordId);

    expect(stored?.rawExpression?.language).toBe('und');
  });

  it('passes time semantics through unmodified (§5)', async () => {
    const outcome = unwrap(
      await service.ingest(
        capture({ time: { semantic: 'observation_time', at: CAPTURED } }),
      ),
    );
    const stored = await records.findById(outcome.recordId);

    // Still an observation, never upgraded to an event (INV-07).
    expect(stored?.time.semantic).toBe('observation_time');
  });

  it('preserves a reported interval whole (§12, INV-08)', async () => {
    const outcome = unwrap(
      await service.ingest(
        capture({
          time: {
            semantic: 'user_reported_interval',
            from: null,
            to: null,
            reportedAs: '这半年我从来不主动打电话',
          },
          epistemicRoles: ['user_reported_interval'],
        }),
      ),
    );
    const stored = await records.findById(outcome.recordId);

    expect(stored?.time.semantic).toBe('user_reported_interval');
    // Not split into synthetic observed events.
    expect(await records.countDistinctEvidenceUnits([outcome.recordId])).toBe(1);
  });

  it('attaches the requested roles', async () => {
    const outcome = unwrap(
      await service.ingest(
        capture({ epistemicRoles: ['user_expression', 'observed_event'] }),
      ),
    );

    expect(await roles.listRoles(outcome.recordId)).toEqual(
      expect.arrayContaining(['user_expression', 'observed_event']),
    );
  });
});

describe('INV-16 — dedup and reclassification', () => {
  it('returns the same Record when the same source is re-ingested', async () => {
    const first = unwrap(await service.ingest(capture()));
    const second = unwrap(await service.ingest(capture()));

    expect(second.deduplicated).toBe(true);
    expect(second.recordId).toBe(first.recordId);
  });

  it('dedups even when the ingestion happens at a different time', async () => {
    const first = unwrap(await service.ingest(capture()));
    const later = unwrap(
      await service.ingest(
        capture({ capturedAt: new Date('2026-09-02T12:00:00Z') }),
      ),
    );

    // capturedAt is not part of source identity, so this is the same source.
    expect(later.deduplicated).toBe(true);
    expect(later.recordId).toBe(first.recordId);
  });

  it('mints no second Evidence Unit on re-ingestion', async () => {
    const first = unwrap(await service.ingest(capture()));
    await service.ingest(capture());

    const stored = await records.findById(first.recordId);
    expect(stored?.evidenceUnitId).toBe('eu-1');
    expect(await records.countDistinctEvidenceUnits([first.recordId])).toBe(1);
  });

  it('adds new roles to an existing Record without changing its Evidence Unit', async () => {
    const first = unwrap(
      await service.ingest(capture({ epistemicRoles: ['user_expression'] })),
    );
    const before = await records.findById(first.recordId);

    const again = unwrap(
      await service.ingest(
        capture({ epistemicRoles: ['user_expression', 'user_reported_pattern'] }),
      ),
    );

    expect(again.deduplicated).toBe(true);
    expect(again.rolesAdded).toEqual(['user_reported_pattern']);

    const after = await records.findById(first.recordId);
    // Reclassified, same evidence identity.
    expect(after?.evidenceUnitId).toBe(before?.evidenceUnitId);
    expect(await roles.listRoles(first.recordId)).toHaveLength(2);
  });

  it('reports no roles to add when nothing changed', async () => {
    await service.ingest(capture());
    const again = unwrap(await service.ingest(capture()));

    expect(again.rolesAdded).toEqual([]);
  });
});

describe('arch §4 Patch 2 — derived captures inherit by default', () => {
  it.each(['derived_from', 'summarizes', 'reformats'] as const)(
    'inherits the parent Evidence Unit via %s',
    async (relation) => {
      const parent = unwrap(await service.ingest(capture()));

      const child = unwrap(
        await service.ingest(
          capture({
            sourceRef: 'system:summary:1',
            verbatim: '用户表达了对开始的顾虑',
            actor: 'ai',
            origin: 'generated',
            epistemicRoles: ['ai_hypothesis'],
            derivation: {
              parentRecordId: parent.recordId,
              relationToParent: relation,
            },
          }),
        ),
      );

      const parentRow = await records.findById(parent.recordId);
      const childRow = await records.findById(child.recordId);

      expect(childRow?.evidenceUnitId).toBe(parentRow?.evidenceUnitId);
      // Two Records, ONE independent evidence unit (INV-02, §6.1).
      expect(
        await records.countDistinctEvidenceUnits([
          parent.recordId,
          child.recordId,
        ]),
      ).toBe(1);
    },
  );

  it('writes a lineage edge for a derived capture', async () => {
    const parent = unwrap(await service.ingest(capture()));
    const child = unwrap(
      await service.ingest(
        capture({
          sourceRef: 'system:summary:1',
          verbatim: 'summary',
          derivation: {
            parentRecordId: parent.recordId,
            relationToParent: 'summarizes',
          },
        }),
      ),
    );

    const edges = await lineage.directParents(child.recordId);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.parentId).toBe(parent.recordId);
    expect(edges[0]?.relationToParent).toBe('summarizes');
  });

  it('repairs a missing Lineage edge on a deduplicated retry', async () => {
    const parent = unwrap(await service.ingest(capture()));
    const derivedRequest = capture({
      sourceRef: 'system:summary:repair',
      verbatim: 'summary requiring a lineage repair',
      derivation: {
        parentRecordId: parent.recordId,
        relationToParent: 'summarizes',
      },
    });

    const first = unwrap(await service.ingest(derivedRequest));
    lineage.clear(); // Simulate a historical partial write before B3.

    const retried = unwrap(await service.ingest(derivedRequest));

    expect(retried.deduplicated).toBe(true);
    expect(retried.recordId).toBe(first.recordId);
    expect(await lineage.directParents(first.recordId)).toHaveLength(1);
    expect(await records.countDistinctEvidenceUnits([first.recordId])).toBe(1);
  });

  it('writes no lineage edge for a root capture', async () => {
    const root = unwrap(await service.ingest(capture()));
    expect(await lineage.directParents(root.recordId)).toEqual([]);
  });

  it('collapses a summary-of-a-summary into one Evidence Unit', async () => {
    const r1 = unwrap(await service.ingest(capture()));
    const r2 = unwrap(
      await service.ingest(
        capture({
          sourceRef: 's2',
          verbatim: 'v2',
          derivation: { parentRecordId: r1.recordId, relationToParent: 'summarizes' },
        }),
      ),
    );
    const r3 = unwrap(
      await service.ingest(
        capture({
          sourceRef: 's3',
          verbatim: 'v3',
          derivation: { parentRecordId: r2.recordId, relationToParent: 'reformats' },
        }),
      ),
    );

    // The R1 -> R2 -> R3 chain from arch §4 Patch 2.
    expect(
      await records.countDistinctEvidenceUnits([
        r1.recordId,
        r2.recordId,
        r3.recordId,
      ]),
    ).toBe(1);
  });

  it('mints a new unit only on an explicit audited determination', async () => {
    const parent = unwrap(await service.ingest(capture()));

    const child = unwrap(
      await service.ingest(
        capture({
          sourceRef: 's-new-fact',
          verbatim: '我平时很少点这家，但那几周连续点了',
          derivation: {
            parentRecordId: parent.recordId,
            // An INHERITING relation, so the default would be to inherit.
            // Only the explicit determination overrides that.
            relationToParent: 'derived_from',
            determination: {
              newIndependentFactualContent: true,
              reason: 'Supplies an internal baseline absent from the parent.',
              mintedEvidenceUnitId: evidenceUnitId('eu-independent'),
            },
          },
        }),
      ),
    );

    const childRow = await records.findById(child.recordId);
    const parentRow = await records.findById(parent.recordId);

    expect(childRow?.evidenceUnitId).toBe('eu-independent');
    expect(childRow?.evidenceUnitId).not.toBe(parentRow?.evidenceUnitId);
    // Now genuinely two independent units.
    expect(
      await records.countDistinctEvidenceUnits([
        parent.recordId,
        child.recordId,
      ]),
    ).toBe(2);
  });
});

describe('INV-03 / §37 — prompting does not manufacture evidence', () => {
  it('keeps one Evidence Unit across an AI ask / answer / re-ask / answer cycle', async () => {
    const original = unwrap(await service.ingest(capture()));

    // Both answers are derived artifacts of the same source lineage.
    const answers = [];
    for (const n of [1, 2]) {
      answers.push(
        unwrap(
          await service.ingest(
            capture({
              sourceRef: `chat:answer:${n}`,
              verbatim: `回答 ${n}`,
              derivation: {
                parentRecordId: original.recordId,
                relationToParent: 'derived_from',
              },
            }),
          ),
        ),
      );
    }

    expect(answers).toHaveLength(2);
    // Interaction count 3, evidence count 1.
    expect(
      await records.countDistinctEvidenceUnits([
        original.recordId,
        ...answers.map((a) => a.recordId),
      ]),
    ).toBe(1);
  });

  it('refuses to guess independence for responds_to', async () => {
    const parent = unwrap(await service.ingest(capture()));

    const result = await service.ingest(
      capture({
        sourceRef: 'chat:reply:1',
        verbatim: '对，好像是',
        derivation: {
          parentRecordId: parent.recordId,
          relationToParent: 'responds_to',
        },
      }),
    );

    // Fails closed rather than silently minting or inheriting
    // (arch §6 Patch 7).
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('evidence_unit_unresolved');
    }
  });

  it('leaves no Record behind when independence is unresolved', async () => {
    const parent = unwrap(await service.ingest(capture()));

    await service.ingest(
      capture({
        sourceRef: 'chat:reply:1',
        verbatim: 'x',
        derivation: {
          parentRecordId: parent.recordId,
          relationToParent: 'revises',
        },
      }),
    );

    expect(await records.findById(recordId('rec-2'))).toBeNull();
  });
});

describe('Gate 1 / §26 — usage permission', () => {
  it('refuses to store when allow_storage is false', async () => {
    await directives.save(directive({ allowStorage: false }));

    const result = await service.ingest(capture());

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('storage_not_permitted');
    }
  });

  it('leaves no trace when storage is refused', async () => {
    await directives.save(directive({ allowStorage: false }));
    await service.ingest(capture());

    expect(await records.findById(recordId('rec-1'))).toBeNull();
  });

  it('blocks reclassification of an existing Record too', async () => {
    const first = unwrap(await service.ingest(capture()));
    await directives.save(directive({ allowStorage: false }));

    const result = await service.ingest(
      capture({ epistemicRoles: ['user_expression', 'observed_event'] }),
    );

    expect(isErr(result)).toBe(true);
    // The earlier Record survives; only the new write is refused.
    expect(await roles.listRoles(first.recordId)).toEqual(['user_expression']);
  });

  it('still stores when analysis is forbidden but storage is not', async () => {
    // "只记录，不分析" (§26, INV-17).
    await directives.save(
      directive({ allowStorage: true, allowAnalysis: false }),
    );

    const outcome = unwrap(await service.ingest(capture()));

    expect(outcome.deduplicated).toBe(false);
    expect(await records.findById(outcome.recordId)).not.toBeNull();
    // The prohibition is carried forward for later phases to honour.
    expect(outcome.permissions.allowAnalysis).toBe(false);
  });

  it('resolves permissions on read, so revocation takes effect immediately', async () => {
    await directives.save(directive({ id: directiveId('d-1'), allowStorage: false }));
    expect(isErr(await service.ingest(capture()))).toBe(true);

    await directives.revoke(directiveId('d-1'), new Date('2026-09-05T00:00:00Z'));

    expect(isOk(await service.ingest(capture()))).toBe(true);
  });

  it('disables proactive presentation by default (§18, §40.5)', async () => {
    const outcome = unwrap(await service.ingest(capture()));
    expect(outcome.permissions.allowProactivePresentation).toBe(false);
  });
});

describe('referential integrity', () => {
  it('reports a missing parent rather than inventing lineage', async () => {
    const result = await service.ingest(
      capture({
        derivation: {
          parentRecordId: recordId('nope'),
          relationToParent: 'summarizes',
        },
      }),
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('parent_record_not_found');
    }
  });
});

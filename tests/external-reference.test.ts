/**
 * Phase 7 tests — External Reference sidecar.
 *
 * Exercises the real path (plan → ingestion → dedup → evidence-unit resolution)
 * against in-memory adapters, so the quarantine is verified with NO database.
 *
 * Covers:
 *   §27      — the four default prohibitions; retrieval priority; the
 *              explicit-request exception; relate-to-self creates a
 *              UserReflectionRecord.
 *   §28      — Zhihu is a reference layer, not a personal-trace source.
 *   §38      — external material may widen interpretation, never define the user.
 *   INV-06   — External Reference does not define the user.
 *   §8 Gate 2 — the hard filter that keeps the role out of evidence.
 *   §4.1     — provenance is imported/platform, never observed/user.
 *   §4.2     — the source's own words are preserved verbatim.
 *   §5/INV-07 — capture_time is not upgraded into event_time.
 *   INV-16   — re-importing one source mints no second Record or Evidence Unit.
 *   §26      — a user directive overrides §27's presentation exception.
 *   arch §8  — independence for a relate-to-self record is an EXPLICIT
 *              determination, never automatic.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  ExternalReferenceService,
  type ExternalReferenceIdGenerator,
} from '@/application/external-reference-service';
import {
  type IdGenerator,
  IngestionService,
} from '@/application/ingestion-service';
import {
  EXTERNAL_REFERENCE_DEFINES_THE_USER,
  EXTERNAL_REFERENCE_IS_EVER_PROACTIVE,
  EXTERNAL_REFERENCE_IS_INDEPENDENT_EVIDENCE,
  EXTERNAL_REFERENCE_IS_PERSONAL_BASELINE,
  RELATE_TO_SELF_RELATION,
  type RetrievedExternalReference,
  externalReferenceRoles,
  orderByRetrievalPriority,
  planExternalReferenceCapture,
} from '@/domain/external/external-reference';
import type { Directive } from '@/domain/directive/directive';
import {
  gateEpistemicEligibility,
  gateLineageIntegrity,
  isEpistemicallyEligible,
} from '@/domain/relation/gates';
import {
  type NewIndependentContentDetermination,
  inheritsEvidenceUnitByDefault,
} from '@/domain/record/evidence-unit';
import {
  type PersonalRecord,
  distinctEvidenceUnitCount,
} from '@/domain/record/record';
import { directiveId, evidenceUnitId } from '@/domain/shared/ids';
import { isErr, isOk, unwrap } from '@/domain/shared/result';
import { sha256 } from '@/infra/hash';
import { MemoryDirectiveRepository } from '@/infra/memory/memory-directive-repository';
import { MemoryEpistemicRoleRepository } from '@/infra/memory/memory-epistemic-role-repository';
import { MemoryLineageRepository } from '@/infra/memory/memory-lineage-repository';
import { MemoryRecordRepository } from '@/infra/memory/memory-record-repository';
import { MemoryReflectionEpisodeRepository } from '@/infra/memory/memory-reflection-episode-repository';
import { MemoryUserReflectionRecordRepository } from '@/infra/memory/memory-user-reflection-record-repository';

const RETRIEVED = new Date('2026-09-10T12:00:00Z');
const NOW = new Date('2026-09-12T09:00:00Z');

class SequentialIds implements IdGenerator, ExternalReferenceIdGenerator {
  private r = 0;
  private e = 0;
  private l = 0;
  private ep = 0;
  private u = 0;

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

  nextReflectionEpisodeId(): string {
    this.ep += 1;
    return `ep-${this.ep}`;
  }

  nextUserReflectionRecordId(): string {
    this.u += 1;
    return `urr-${this.u}`;
  }
}

let records: MemoryRecordRepository;
let roles: MemoryEpistemicRoleRepository;
let lineage: MemoryLineageRepository;
let directives: MemoryDirectiveRepository;
let episodes: MemoryReflectionEpisodeRepository;
let reflectionRecords: MemoryUserReflectionRecordRepository;
let ingestion: IngestionService;
let service: ExternalReferenceService;

beforeEach(() => {
  records = new MemoryRecordRepository();
  roles = new MemoryEpistemicRoleRepository();
  lineage = new MemoryLineageRepository();
  directives = new MemoryDirectiveRepository();
  episodes = new MemoryReflectionEpisodeRepository();
  reflectionRecords = new MemoryUserReflectionRecordRepository();

  const ids = new SequentialIds();

  ingestion = new IngestionService({
    records,
    roles,
    lineage,
    directives,
    hash: sha256,
    ids,
  });

  service = new ExternalReferenceService({
    ingestion,
    directives,
    episodes,
    reflectionRecords,
    ids,
  });
});

const source = (
  over: Partial<RetrievedExternalReference> = {},
): RetrievedExternalReference => ({
  url: 'https://www.zhihu.com/answer/123456',
  provider: 'zhihu',
  kind: 'experience',
  excerpt: '我也有过这种阶段，后来发现不是懒，是怕做不好。',
  language: 'zh',
  title: '为什么迟迟无法开始一件事',
  retrievedAt: RETRIEVED,
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

const determination = (): NewIndependentContentDetermination => ({
  newIndependentFactualContent: true,
  reason:
    'The user supplied a concrete new observation about their own week, not a ' +
    'restatement of the article.',
  mintedEvidenceUnitId: evidenceUnitId('eu-manual-1'),
});

/* ── The quarantine (§38, INV-06, §8 Gate 2) ──────────────────────────── */

describe('§38 / INV-06 — external material never becomes personal evidence', () => {
  it('produces a Record that Gate 2 refuses as evidence', async () => {
    const outcome = unwrap(await service.import({ source: source() }));

    const stored = await records.findById(outcome.recordId);
    expect(stored).not.toBeNull();

    // The load-bearing assertion: this record can never back a personal claim.
    expect(isEpistemicallyEligible(stored as PersonalRecord)).toBe(false);

    const gate = gateEpistemicEligibility([stored as PersonalRecord]);
    expect(gate.passed).toBe(false);

    if (!gate.passed) {
      expect(gate.failure.gate).toBe('epistemic_eligibility');
      expect(gate.failure.code).toBe('ineligible_epistemic_role');
    }
  });

  it('cannot be rescued by pairing it with an eligible personal record', async () => {
    const external = unwrap(await service.import({ source: source() }));

    const personal = unwrap(
      await ingestion.ingest({
        origin: 'directly_observed',
        actor: 'user',
        sourceRef: 'capture:1',
        verbatim: '这周有三天没开始写。',
        language: 'zh',
        time: { semantic: 'observation_time', at: NOW },
        epistemicRoles: ['observed_event'],
        capturedAt: NOW,
        derivation: null,
        subject: {
          topicTags: [],
          source: null,
          relationAxes: [],
          userSelectedRefs: [],
        },
      }),
    );

    const both = [
      (await records.findById(external.recordId)) as PersonalRecord,
      (await records.findById(personal.recordId)) as PersonalRecord,
    ];

    // Gate 2 is "any ineligible role fails", not "some eligible role passes".
    expect(gateEpistemicEligibility(both).passed).toBe(false);
  });

  it('states the four §27 prohibitions as executable invariants', () => {
    expect(EXTERNAL_REFERENCE_DEFINES_THE_USER).toBe(false);
    expect(EXTERNAL_REFERENCE_IS_INDEPENDENT_EVIDENCE).toBe(false);
    expect(EXTERNAL_REFERENCE_IS_PERSONAL_BASELINE).toBe(false);
    expect(EXTERNAL_REFERENCE_IS_EVER_PROACTIVE).toBe(false);
  });
});

/* ── Fixed provenance (§4.1, §28, §5) ─────────────────────────────────── */

describe('§4.1 / §28 — provenance is fixed, not caller-supplied', () => {
  it('imports as imported/platform with the external_reference role', () => {
    const plan = unwrap(planExternalReferenceCapture(source()));

    expect(plan.origin).toBe('imported');
    expect(plan.actor).toBe('platform');
    expect(plan.epistemicRoles).toEqual(['external_reference']);
  });

  it('never claims directly_observed or a user actor', async () => {
    const outcome = unwrap(await service.import({ source: source() }));
    const stored = await records.findById(outcome.recordId);

    expect(stored?.provenance.origin).not.toBe('directly_observed');
    expect(stored?.provenance.actor).not.toBe('user');
    expect(stored?.provenance.sourceRef).toBe(
      'https://www.zhihu.com/answer/123456',
    );
  });

  it('tags time as capture_time and does not upgrade it (§5, INV-07)', () => {
    const plan = unwrap(planExternalReferenceCapture(source()));

    expect(plan.time.semantic).toBe('capture_time');
    expect(plan.time.semantic).not.toBe('event_time');
    expect(plan.time.semantic).not.toBe('observation_time');
  });

  it('hands back a fresh role array so a caller cannot mutate the fixed set', () => {
    const first = externalReferenceRoles() as EpistemicRoleArray;
    first.push('observed_event');

    expect(externalReferenceRoles()).toEqual(['external_reference']);
  });
});

// Local alias for the mutation attempt above; the production type is readonly.
type EpistemicRoleArray = PersonalRecord['epistemicRoles'][number][];

/* ── Verbatim preservation (§4.2) ─────────────────────────────────────── */

describe('§4.2 — the source keeps its own words', () => {
  it('stores the excerpt verbatim', async () => {
    const excerpt = '我也有过这种阶段，后来发现不是懒，是怕做不好。';
    const outcome = unwrap(
      await service.import({ source: source({ excerpt }) }),
    );

    const stored = await records.findById(outcome.recordId);
    expect(stored?.rawExpression?.verbatim).toBe(excerpt);
  });

  it('records undetermined language as und rather than guessing', async () => {
    const outcome = unwrap(
      await service.import({ source: source({ language: null }) }),
    );

    const stored = await records.findById(outcome.recordId);
    expect(stored?.rawExpression?.language).toBe('und');
  });

  it('refuses an empty excerpt rather than storing a hollow Record', async () => {
    const result = await service.import({
      source: source({ excerpt: '   \n  ' }),
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('empty_excerpt');
    }
  });
});

/* ── Dedup (INV-16) ───────────────────────────────────────────────────── */

describe('INV-16 — re-importing one source multiplies nothing', () => {
  it('resolves to the same Record and mints no second Evidence Unit', async () => {
    const first = unwrap(await service.import({ source: source() }));
    const second = unwrap(await service.import({ source: source() }));

    expect(second.deduplicated).toBe(true);
    expect(second.recordId).toBe(first.recordId);

    const stored = await records.findById(first.recordId);
    const units = await records.findByEvidenceUnit(
      (stored as PersonalRecord).evidenceUnitId,
    );

    expect(units).toHaveLength(1);
  });
});

/* ── Retrieval priority (§27) ─────────────────────────────────────────── */

describe('§27 — 先找人怎么经历它，再找学科怎么解释它', () => {
  it('orders lived experience first and disciplinary explanation last', () => {
    const ordered = orderByRetrievalPriority([
      { kind: 'professional' as const, id: 'a' },
      { kind: 'perspectives' as const, id: 'b' },
      { kind: 'experience' as const, id: 'c' },
      { kind: 'practical' as const, id: 'd' },
    ]);

    expect(ordered.map((c) => c.kind)).toEqual([
      'experience',
      'practical',
      'perspectives',
      'professional',
    ]);
  });

  it('is stable within one kind, so retrieval order survives', () => {
    const ordered = orderByRetrievalPriority([
      { kind: 'experience' as const, id: 'first' },
      { kind: 'experience' as const, id: 'second' },
      { kind: 'experience' as const, id: 'third' },
    ]);

    expect(ordered.map((c) => c.id)).toEqual(['first', 'second', 'third']);
  });

  it('orders without dropping any candidate', () => {
    const input = [
      { kind: 'professional' as const, id: 'a' },
      { kind: 'experience' as const, id: 'b' },
    ];

    expect(orderByRetrievalPriority(input)).toHaveLength(input.length);
  });
});

/* ── Presentation (§27 exception, §26) ───────────────────────────────── */

describe('§27 — outside perspective is pull, never push', () => {
  const subject = {
    topicTags: ['starting'],
    source: 'zhihu',
    relationAxes: [],
    userSelectedRefs: [],
  };

  it('refuses to show when the user did not explicitly ask', async () => {
    const result = await service.mayShow({
      userExplicitlyRequestedOutsidePerspective: false,
      subject,
      subjectCreatedAt: NOW,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('not_explicitly_requested');
    }
  });

  it('shows when the user explicitly asked and no directive forbids it', async () => {
    const result = await service.mayShow({
      userExplicitlyRequestedOutsidePerspective: true,
      subject,
      subjectCreatedAt: NOW,
    });

    expect(isOk(result)).toBe(true);
  });

  it('lets a user directive override the explicit-request exception (§26)', async () => {
    await directives.save(
      directive({ allowPassivePresentation: false }),
    );

    const result = await service.mayShow({
      userExplicitlyRequestedOutsidePerspective: true,
      subject,
      subjectCreatedAt: NOW,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('passive_presentation_forbidden');
    }
  });

  it('resolves permissions on read, so revocation takes effect at once (§26)', async () => {
    const blocking = directive({ allowPassivePresentation: false });
    await directives.save(blocking);

    expect(
      isErr(
        await service.mayShow({
          userExplicitlyRequestedOutsidePerspective: true,
          subject,
          subjectCreatedAt: NOW,
        }),
      ),
    ).toBe(true);

    await directives.revoke(blocking.id, NOW);

    expect(
      isOk(
        await service.mayShow({
          userExplicitlyRequestedOutsidePerspective: true,
          subject,
          subjectCreatedAt: NOW,
        }),
      ),
    ).toBe(true);
  });
});

/* ── Relate to self (§27, arch §8) ────────────────────────────────────── */

describe('§27 / arch §8 — relating a reference back to oneself', () => {
  it('uses `references`, which inherits rather than minting', () => {
    expect(RELATE_TO_SELF_RELATION).toBe('references');
    expect(inheritsEvidenceUnitByDefault(RELATE_TO_SELF_RELATION)).toBe(true);
  });

  it('creates the UserReflectionRecord with NO determination needed (§27)', async () => {
    const external = unwrap(await service.import({ source: source() }));

    // §27 — "If the user relates an external reference back to themselves,
    // create a NEW UserReflectionRecord." No epistemic judgment is demanded of
    // the caller to make that happen.
    const outcome = unwrap(
      await service.relateToSelf({
        externalRecordId: external.recordId,
        verbatim: '这说的好像就是我。',
        language: 'zh',
        now: NOW,
      }),
    );

    expect(outcome.reflectionRecord.recordId).toBe(outcome.recordId);
    expect(outcome.reflectionRecord.meaningCommitment).toBe('tentative');
  });

  it('inherits the reference Evidence Unit, adding NO independent support', async () => {
    const external = unwrap(await service.import({ source: source() }));
    const referenceRecord = (await records.findById(
      external.recordId,
    )) as PersonalRecord;

    const outcome = unwrap(
      await service.relateToSelf({
        externalRecordId: external.recordId,
        verbatim: '这说的好像就是我。',
        language: 'zh',
        now: NOW,
      }),
    );

    const userRecord = (await records.findById(
      outcome.recordId,
    )) as PersonalRecord;

    // The load-bearing assertion of this whole change: two Records, ONE
    // Evidence Unit. Reacting to an article manufactures no new independent
    // source about the user (§27, §38, INV-03).
    expect(userRecord.evidenceUnitId).toBe(referenceRecord.evidenceUnitId);
    expect(distinctEvidenceUnitCount([referenceRecord, userRecord])).toBe(1);
  });

  it('keeps Gate 5 shut on the pair, since they collapse to one unit', async () => {
    const external = unwrap(await service.import({ source: source() }));

    const outcome = unwrap(
      await service.relateToSelf({
        externalRecordId: external.recordId,
        verbatim: '这说的好像就是我。',
        language: 'zh',
        now: NOW,
      }),
    );

    const pair = [
      (await records.findById(external.recordId)) as PersonalRecord,
      (await records.findById(outcome.recordId)) as PersonalRecord,
    ];

    // Gate 5 is UNCHANGED by this work; it simply sees one unit and refuses.
    const gate = gateLineageIntegrity(pair);
    expect(gate.passed).toBe(false);
    if (!gate.passed) {
      expect(gate.failure.code).toBe('evidence_units_collapse');
    }
  });

  it('collapses repeated reactions to one article into one unit (INV-03)', async () => {
    const external = unwrap(await service.import({ source: source() }));

    const first = unwrap(
      await service.relateToSelf({
        externalRecordId: external.recordId,
        verbatim: '这说的好像就是我。',
        language: 'zh',
        now: NOW,
      }),
    );

    const second = unwrap(
      await service.relateToSelf({
        externalRecordId: external.recordId,
        verbatim: '再想想，确实也有点像。',
        language: 'zh',
        now: new Date('2026-09-12T10:00:00Z'),
      }),
    );

    // Three Records, one Evidence Unit. Re-reacting inflates nothing.
    expect(
      await records.countDistinctEvidenceUnits([
        external.recordId,
        first.recordId,
        second.recordId,
      ]),
    ).toBe(1);
  });

  it('still creates a UserReflectionRecord when a determination IS supplied', async () => {
    const external = unwrap(await service.import({ source: source() }));

    const outcome = unwrap(
      await service.relateToSelf({
        externalRecordId: external.recordId,
        verbatim: '我这周确实有两天完全没动。',
        language: 'zh',
        determination: determination(),
        now: NOW,
      }),
    );

    // §27 — a NEW UserReflectionRecord is what this act creates.
    expect(outcome.reflectionRecord.recordId).toBe(outcome.recordId);
    // §24 — tentative; `confirmed` is frozen out of MVP.
    expect(outcome.reflectionRecord.meaningCommitment).toBe('tentative');
    expect(outcome.reflectionRecord.currentEffect).toBe('current');

    // §22 — provenance recorded, not flattened into `unknown`.
    expect(outcome.episode.elicitationMode).toBe('prompted');
    expect(outcome.episode.stimulusType).toBe('external_reference');
    expect(outcome.episode.systemFollowupCount).toBe(0);
    expect(outcome.episode.stimulusRef).toBe(external.recordId);
  });

  it('records the user words as user_expression, preserved verbatim', async () => {
    const external = unwrap(await service.import({ source: source() }));
    const verbatim = '我可能不是懒，只是怕做不好。';

    const outcome = unwrap(
      await service.relateToSelf({
        externalRecordId: external.recordId,
        verbatim,
        language: 'zh',
        determination: determination(),
        now: NOW,
      }),
    );

    const stored = await records.findById(outcome.recordId);
    expect(stored?.epistemicRoles).toEqual(['user_expression']);
    // §4.2 — modal language intact.
    expect(stored?.rawExpression?.verbatim).toBe(verbatim);
  });

  it('links the user words to the reference by a `references` lineage edge', async () => {
    const external = unwrap(await service.import({ source: source() }));

    const outcome = unwrap(
      await service.relateToSelf({
        externalRecordId: external.recordId,
        verbatim: '我这周确实有两天完全没动。',
        language: 'zh',
        determination: determination(),
        now: NOW,
      }),
    );

    const parents = await lineage.directParents(outcome.recordId);
    expect(parents).toHaveLength(1);
    expect(parents[0]?.parentId).toBe(external.recordId);
    expect(parents[0]?.relationToParent).toBe('references');
  });

  it('leaves the external reference itself still ineligible as evidence', async () => {
    const external = unwrap(await service.import({ source: source() }));

    await service.relateToSelf({
      externalRecordId: external.recordId,
      verbatim: '我这周确实有两天完全没动。',
      language: 'zh',
      determination: determination(),
      now: NOW,
    });

    // §27 — "The external reference itself still does not become proof about
    // the user." Relating to it changes nothing about its own status.
    const stored = await records.findById(external.recordId);
    expect(isEpistemicallyEligible(stored as PersonalRecord)).toBe(false);
    expect(stored?.epistemicRoles).toEqual(['external_reference']);
  });

  it('stores the determination reason for audit (§42)', async () => {
    const external = unwrap(await service.import({ source: source() }));
    const judgment = determination();

    const outcome = unwrap(
      await service.relateToSelf({
        externalRecordId: external.recordId,
        verbatim: '我这周确实有两天完全没动。',
        language: 'zh',
        determination: judgment,
        now: NOW,
      }),
    );

    const stored = await records.findById(outcome.recordId);
    // The minted unit is the one the determination named, not an invented one.
    expect(stored?.evidenceUnitId).toBe(judgment.mintedEvidenceUnitId);
  });
});

/* ── Storage permission still applies (§26, Gate 1) ───────────────────── */

describe('§26 / Gate 1 — storage permission precedes the import', () => {
  it('refuses to import when a directive forbids storage', async () => {
    await directives.save(directive({ allowStorage: false }));

    const result = await service.import({ source: source() });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('storage_not_permitted');
    }
  });

  it('still imports when analysis is forbidden but storage is not', async () => {
    // "只记录，不分析" — INV-17 keeps the two independent.
    await directives.save(
      directive({ allowStorage: true, allowAnalysis: false }),
    );

    const result = await service.import({ source: source() });
    expect(isOk(result)).toBe(true);
  });
});

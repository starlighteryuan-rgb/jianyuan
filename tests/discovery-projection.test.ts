/**
 * Phase 5 tests — the Discovery projection.
 *
 * These tests are organised around the five Phase 5 constraints, because that is
 * what they exist to defend:
 *
 *   1. Discovery must not create new facts.
 *   2. Discovery must not upgrade Hypothesis into truth.
 *   3. Discovery output must be traceable to existing Relation/Hypothesis records.
 *   4. Attention/presentation state must stay separate from epistemic validity.
 *   5. No proactive behaviour beyond the frozen contract.
 *
 * Plus §35 (a projection is a query concept), §12 (no fabricated time spans),
 * and Patch 6 (only identity persists).
 */

import { describe, expect, it } from 'vitest';

import {
  DEEP_DEPTH_DAYS,
  DISCOVERY_HAS_NUMERIC_VALUE,
  MODERATE_DEPTH_DAYS,
  type SubjectProjectionInput,
  deriveNovelty,
  deriveTemporalDepth,
  orderForStream,
  projectSubject,
} from '@/domain/discovery/discovery-projection';
import * as projectionModule from '@/domain/discovery/discovery-projection';
import { deriveStableKey } from '@/domain/discovery/discovery';
import type { CurrentFocusContext } from '@/domain/discovery/focus-context';
import { focusContextId } from '@/domain/shared/ids';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-09-01T00:00:00Z');
const NOW = new Date('2026-09-12T00:00:00Z');
const daysBefore = (n: number): Date => new Date(NOW.getTime() - n * DAY);

const subject = (
  over: Partial<SubjectProjectionInput> = {},
): SubjectProjectionInput => ({
  subjectRef: { type: 'relation_claim', id: 'claim-1' },
  discoveryKind: 'relation_discovery',
  identityExistedBefore: false,
  resolvedTimePoints: [daysBefore(30), daysBefore(1)],
  archived: false,
  suspended: false,
  allowPassivePresentation: true,
  allowProactivePresentation: true,
  ...over,
});

const focus = (
  over: Partial<CurrentFocusContext> = {},
): CurrentFocusContext => ({
  id: focusContextId('fc-1'),
  subjectRef: 'claim-1',
  source: { kind: 'user_stated', ref: 'utterance-1' },
  lastMentionedAt: daysBefore(1),
  expiresAt: null,
  endedAt: null,
  createdAt: T0,
  ...over,
});

const project = (
  over: Partial<SubjectProjectionInput> = {},
  opts: {
    readonly focusContexts?: readonly CurrentFocusContext[];
    readonly l3Enabled?: boolean;
    readonly discoveryId?: string;
  } = {},
) =>
  projectSubject({
    subject: subject(over),
    discoveryId: opts.discoveryId ?? 'disc-1',
    focusContexts: opts.focusContexts ?? [focus()],
    now: NOW,
    ...(opts.l3Enabled === undefined ? {} : { l3Enabled: opts.l3Enabled }),
  });

describe('constraint 1 — Discovery creates no new facts', () => {
  it('asserts nothing about the world', () => {
    const p = project();

    // The projection holds identity plus computed presentation metadata. There
    // is no claim, no assertion, no finding.
    expect(Object.keys(p).sort()).toEqual(
      ['attention', 'currentRelevance', 'discovery', 'presentation'].sort(),
    );
  });

  it('mints only identity, derived from an existing subject', () => {
    const p = project();

    expect(Object.keys(p.discovery).sort()).toEqual(
      ['createdAt', 'discoveryKind', 'id', 'stableKey', 'subjectRef'].sort(),
    );
  });

  it('exports no function producing a record, claim, or evidence', () => {
    const forbidden = Object.keys(projectionModule).filter((n) =>
      /createRecord|buildClaim|mintEvidence|assert|conclude/i.test(n),
    );

    expect(forbidden).toEqual([]);
  });

  it('is a pure read-time view (§35)', () => {
    // Same inputs, same output: nothing accumulates across calls.
    expect(project()).toEqual(project());
  });
});

describe('constraint 2 — Discovery does not upgrade Hypothesis into truth', () => {
  it('projects a hypothesis subject without any truth field', () => {
    const p = project({
      subjectRef: { type: 'hypothesis', id: 'hyp-1' },
      discoveryKind: 'hypothesis_discovery',
    });

    for (const field of [
      'truth',
      'isTrue',
      'confirmed',
      'probability',
      'confidence',
      'supportBasis',
      'supportLevel',
    ]) {
      expect(p.discovery).not.toHaveProperty(field);
      expect(p).not.toHaveProperty(field);
    }
  });

  it('treats a hypothesis exactly as it treats a relation claim', () => {
    // Becoming a Discovery confers nothing: the two differ only in identity.
    const relation = project();
    const hypothesis = project({
      subjectRef: { type: 'hypothesis', id: 'hyp-1' },
      discoveryKind: 'hypothesis_discovery',
    });

    expect(hypothesis.attention.priority).toBe(relation.attention.priority);
    expect(hypothesis.presentation.maxLevel).toBe(
      relation.presentation.maxLevel,
    );
  });

  it('does not rank competing hypotheses', () => {
    // §13 makes rival explanations peers; ordering by plausibility would imply
    // a confidence the contract forbids.
    const a = project(
      { subjectRef: { type: 'hypothesis', id: 'hyp-a' } },
      { discoveryId: 'disc-a' },
    );
    const b = project(
      { subjectRef: { type: 'hypothesis', id: 'hyp-b' } },
      { discoveryId: 'disc-b' },
    );

    expect(a.attention.priority).toBe(b.attention.priority);
    for (const p of [a, b]) expect(p).not.toHaveProperty('rank');
  });
});

describe('constraint 3 — output is traceable to stored records', () => {
  it('carries the subject reference through', () => {
    const p = project();

    expect(p.discovery.subjectRef).toEqual({
      type: 'relation_claim',
      id: 'claim-1',
    });
  });

  it('derives stableKey from the subject, not from the projection', () => {
    const p = project();

    expect(p.discovery.stableKey).toBe(
      deriveStableKey(
        { type: 'relation_claim', id: 'claim-1' },
        'relation_discovery',
      ),
    );
  });

  it('gives the same subject the same stableKey across projections', () => {
    // Patch 6: archive and restore bind to a stable identity, so recomputation
    // must land on the same key.
    const first = project({ identityExistedBefore: false });
    const second = project({ identityExistedBefore: true });

    expect(second.discovery.stableKey).toBe(first.discovery.stableKey);
  });

  it('gives different subjects different stableKeys', () => {
    const a = project({ subjectRef: { type: 'relation_claim', id: 'claim-1' } });
    const b = project({ subjectRef: { type: 'relation_claim', id: 'claim-2' } });

    expect(a.discovery.stableKey).not.toBe(b.discovery.stableKey);
  });

  it('records the relevance actually used, for audit', () => {
    const p = project();

    expect(p.currentRelevance).toBe(p.attention.signals.currentRelevance);
  });
});

describe('constraint 4 — attention is separate from epistemic validity', () => {
  it('accepts no evidence field on the subject input', () => {
    expect(Object.keys(subject())).not.toContain('supportLevel');
    expect(Object.keys(subject())).not.toContain('evidenceScore');
    expect(Object.keys(subject())).not.toContain('assessment');
  });

  it('exposes no numeric discovery value (§17)', () => {
    expect(DISCOVERY_HAS_NUMERIC_VALUE).toBe(false);

    const p = project();
    for (const field of ['value', 'score', 'weight', 'importance']) {
      expect(p).not.toHaveProperty(field);
    }
  });

  it('leaves archive as a presentation decision only', () => {
    // §16.3: archiving changes what is surfaced, never what is true.
    const active = project({ archived: false });
    const archived = project({ archived: true });

    expect(archived.presentation.proactiveEligible).toBe(false);
    // Identity and signals are untouched by the archive decision.
    expect(archived.discovery.stableKey).toBe(active.discovery.stableKey);
    expect(archived.attention.signals).toEqual(active.attention.signals);
  });

  it('leaves suspend as a progression halt only', () => {
    const suspended = project({ suspended: true });

    expect(suspended.presentation.proactiveEligible).toBe(false);
    expect(suspended.presentation.reasons.join(' ')).toContain(
      'evidence remains',
    );
  });
});

describe('constraint 5 — no proactive behaviour beyond the contract', () => {
  it('never reaches l3 by default', () => {
    // Maximal signals, no restrictions, L3 flag omitted.
    const p = project(
      {
        identityExistedBefore: false,
        potential: 'high',
        interpretationRisk: 'low',
        resolvedTimePoints: [daysBefore(200), daysBefore(1)],
      },
      { focusContexts: [focus()] },
    );

    expect(p.attention.priority).toBe('high');
    expect(p.presentation.proactiveEligible).toBe(false);
    expect(p.presentation.maxLevel).toBe('l2');
  });

  it('defaults interpretation risk to the conservative end', () => {
    // With risk defaulted to `high`, MVP cannot self-authorise proactive
    // presentation on signal grounds even were L3 enabled.
    const p = project(
      { potential: 'high', resolvedTimePoints: [daysBefore(200), daysBefore(1)] },
      { l3Enabled: true },
    );

    expect(p.attention.signals.interpretationRisk).toBe('high');
    expect(p.attention.priority).toBe('medium');
    expect(p.presentation.proactiveEligible).toBe(false);
  });

  it('defaults potential to neutral', () => {
    expect(project().attention.signals.potential).toBe('medium');
  });

  it('reaches l3 only with an explicit judgment AND the flag', () => {
    const p = project(
      {
        potential: 'high',
        interpretationRisk: 'low',
        resolvedTimePoints: [daysBefore(200), daysBefore(1)],
      },
      { l3Enabled: true },
    );

    expect(p.presentation.proactiveEligible).toBe(true);
  });
});

describe('§12 — temporal depth is never fabricated', () => {
  it('is unknown with no resolvable points', () => {
    // A record carrying only "这半年" with unresolved bounds contributes nothing.
    expect(deriveTemporalDepth([])).toBe('unknown');
  });

  it('is shallow within the moderate threshold', () => {
    expect(deriveTemporalDepth([daysBefore(2), daysBefore(1)])).toBe('shallow');
  });

  it('is moderate at the threshold', () => {
    expect(
      deriveTemporalDepth([daysBefore(MODERATE_DEPTH_DAYS), NOW]),
    ).toBe('moderate');
  });

  it('is deep at the deep threshold', () => {
    expect(deriveTemporalDepth([daysBefore(DEEP_DEPTH_DAYS), NOW])).toBe('deep');
  });

  it('treats a single point as shallow, not deep', () => {
    expect(deriveTemporalDepth([daysBefore(500)])).toBe('shallow');
  });

  it('propagates unknown depth into the projection', () => {
    const p = project({ resolvedTimePoints: [] });

    expect(p.attention.signals.temporalDepth).toBe('unknown');
  });
});

describe('novelty', () => {
  it('is new when no identity existed', () => {
    expect(deriveNovelty(false)).toBe('new');
  });

  it('is seen when identity already existed', () => {
    expect(deriveNovelty(true)).toBe('seen');
  });

  it('never manufactures novelty on recomputation', () => {
    // The attention-layer analogue of INV-03: re-running the projection must
    // not make an existing Discovery look fresh.
    const p = project({ identityExistedBefore: true });

    expect(p.attention.signals.novelty).toBe('seen');
    expect(p.attention.elevating).not.toContain('novelty:new');
  });
});

describe('relevance from focus context', () => {
  it('is unknown when no focus context applies', () => {
    const p = project({}, { focusContexts: [] });

    expect(p.currentRelevance).toBe('unknown');
  });

  it('caps priority at medium when relevance is unknown', () => {
    const p = project(
      {
        potential: 'high',
        interpretationRisk: 'low',
        resolvedTimePoints: [daysBefore(200), daysBefore(1)],
      },
      { focusContexts: [], l3Enabled: true },
    );

    expect(p.attention.priority).toBe('medium');
  });

  it('reads high relevance from an active context', () => {
    const p = project({}, { focusContexts: [focus()] });

    expect(p.currentRelevance).toBe('high');
  });

  it('ignores a focus context for a different subject', () => {
    const p = project(
      {},
      { focusContexts: [focus({ subjectRef: 'claim-other' })] },
    );

    expect(p.currentRelevance).toBe('unknown');
  });
});

describe('stream ordering', () => {
  const projections = () => [
    project({}, { discoveryId: 'd-old' }),
    project({}, { discoveryId: 'd-new' }),
  ];

  it('excludes items the user cannot passively see', () => {
    const hidden = project({ allowPassivePresentation: false });
    const visible = project();

    const ordered = orderForStream([hidden, visible]);

    expect(ordered).toHaveLength(1);
    expect(ordered[0]?.presentation.passiveEligible).toBe(true);
  });

  it('excludes archived items from the passive stream', () => {
    // §16.3 / §18: archive preserves identity and evidence but suppresses
    // passive and proactive presentation.
    const archived = project({ archived: true });

    expect(archived.presentation.maxLevel).toBe('l1');
    expect(archived.presentation.passiveEligible).toBe(false);
    expect(archived.presentation.proactiveEligible).toBe(false);
    expect(orderForStream([archived])).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = projections();
    const before = input.map((p) => p.discovery.id);

    orderForStream(input);
    expect(input.map((p) => p.discovery.id)).toEqual(before);
  });

  it('orders by recency, never by evidence', () => {
    // There is no evidence input to order by; this pins the behaviour so a
    // future field cannot silently become a sort key.
    const ordered = orderForStream(projections());

    expect(ordered).toHaveLength(2);
    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1];
      const cur = ordered[i];
      if (prev && cur) {
        expect(prev.discovery.createdAt.getTime()).toBeGreaterThanOrEqual(
          cur.discovery.createdAt.getTime(),
        );
      }
    }
  });

  it('returns an empty stream when nothing is passively eligible', () => {
    const hidden = project({ allowPassivePresentation: false });

    expect(orderForStream([hidden, hidden])).toEqual([]);
  });
});

describe('purity', () => {
  it('does not mutate the subject input', () => {
    const input = subject();
    const copy = structuredClone(input);

    projectSubject({
      subject: input,
      discoveryId: 'disc-1',
      focusContexts: [focus()],
      now: NOW,
    });

    expect(structuredClone(input)).toEqual(copy);
  });

  it('uses only the supplied clock', () => {
    // `now` is the sole time source, so a projection is reproducible.
    const p = project();
    expect(p.discovery.createdAt).toEqual(NOW);
  });
});

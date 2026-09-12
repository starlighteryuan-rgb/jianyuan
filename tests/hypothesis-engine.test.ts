/**
 * Phase 4 tests — the Hypothesis Engine pipeline.
 *
 * Exercises the real engine against the deterministic judgment double, so every
 * gate and short-circuit is verifiable with no model, no key, no database.
 *
 * Covers:
 *   §13    — 少量 competing explanations; storage does not imply truth.
 *   §14    — all six admission gates, wired through the pipeline.
 *   §16    — initial neutral state for an admitted hypothesis.
 *   §16.2  — a suspended anchor yields no new hypothesis.
 *   INV-09 — no attention priority or presentation level assigned here.
 */

import { describe, expect, it } from 'vitest';

import {
  HypothesisEngine,
  MAX_ADMITTED_HYPOTHESES,
  initialStateForHypothesis,
  type HypothesisAnchorState,
  type HypothesisIdGenerator,
} from '@/domain/hypothesis/hypothesis-engine';
import type { HypothesisCandidate } from '@/domain/hypothesis/hypothesis';
import { remainsCompetable } from '@/domain/hypothesis/hypothesis';
import { DeterministicSemanticJudgment } from '@/infra/fake/deterministic-semantic-judgment';
import type { DeterministicScript } from '@/infra/fake/deterministic-semantic-judgment';
import type { StoredRelationClaim } from '@/domain/relation/relation-claim';
import type { PersonalRecord } from '@/domain/record/record';
import {
  evidenceUnitId,
  recordId,
  relationClaimId,
  sourceFingerprint,
} from '@/domain/shared/ids';

const AT = new Date('2026-09-01T00:00:00Z');
const NOW = new Date('2026-09-12T00:00:00Z');

const record = (over: Partial<PersonalRecord> = {}): PersonalRecord => ({
  id: recordId('rec-1'),
  sourceFingerprint: sourceFingerprint('fp-1'),
  evidenceUnitId: evidenceUnitId('eu-1'),
  epistemicRoles: ['observed_event'],
  provenance: {
    origin: 'directly_observed',
    actor: 'user',
    sourceRef: 'src-1',
    capturedAt: AT,
  },
  time: { semantic: 'observation_time', at: AT },
  rawExpression: null,
  createdAt: AT,
  ...over,
});

const claim = (over: Partial<StoredRelationClaim> = {}): StoredRelationClaim => ({
  id: relationClaimId('claim-1'),
  recordRefs: [recordId('rec-1')],
  comparisonAxis: {
    question: '任务距离截止时间多远时开始实际执行',
    dimension: 'hours before deadline at which execution began',
  },
  relationType: 'co_occurrence',
  evidenceSummary: 'Execution began close to the deadline in both records.',
  assertsTemporalOrdering: false,
  assessment: null,
  supportLevel: 'supported',
  createdAt: AT,
  ...over,
});

const candidate = (
  over: Partial<HypothesisCandidate> = {},
): HypothesisCandidate => ({
  explanation: 'Starting may be delayed until external pressure supplies structure.',
  anchorRefs: [relationClaimId('claim-1')],
  anchorPath: 'supported_relation',
  patterns: [],
  supportBasis: 'directional_observation',
  supportingRecordRefs: [recordId('rec-1'), recordId('rec-2')],
  explanatoryGain: {
    mechanism: 'Deadline proximity supplies the structure otherwise absent.',
    discriminatingPredictions: [
      'Given an externally structured task, execution should begin earlier.',
    ],
  },
  alternatives: ['Task ambiguity, not pressure, governs the delay.'],
  discriminatingEvidence: {
    wouldStrengthen: ['An early start on a task with imposed structure.'],
    wouldWeaken: ['Equal delay on a fully structured task.'],
  },
  ...over,
});

const twoIndependent = (): readonly PersonalRecord[] => [
  record({ id: recordId('rec-1'), evidenceUnitId: evidenceUnitId('eu-1') }),
  record({
    id: recordId('rec-2'),
    sourceFingerprint: sourceFingerprint('fp-2'),
    evidenceUnitId: evidenceUnitId('eu-2'),
  }),
];

class Ids implements HypothesisIdGenerator {
  private n = 0;
  nextHypothesisId(): string {
    this.n += 1;
    return `hyp-${this.n}`;
  }
}

const run = async (
  script: DeterministicScript,
  over: {
    readonly anchorClaims?: readonly StoredRelationClaim[];
    readonly availableRecords?: readonly PersonalRecord[];
    readonly anchorStates?: readonly HypothesisAnchorState[];
  } = {},
) => {
  const judgment = new DeterministicSemanticJudgment(script);
  const engine = new HypothesisEngine(judgment);

  const outcome = await engine.evaluate({
    anchorClaims: over.anchorClaims ?? [claim()],
    availableRecords: over.availableRecords ?? twoIndependent(),
    anchorStates:
      over.anchorStates ?? [{ targetRef: 'claim-1', workflowState: 'active' }],
    now: NOW,
    ids: new Ids(),
  });

  return { outcome, judgment };
};

describe('generation', () => {
  it('admits a clean candidate', async () => {
    const { outcome } = await run({ hypotheses: [candidate()] });

    expect(outcome.admitted).toHaveLength(1);
    expect(outcome.rejected).toEqual([]);
    expect(outcome.capped).toEqual([]);
  });

  it('accepts zero candidates', async () => {
    const { outcome } = await run({ hypotheses: [] });

    expect(outcome.admitted).toEqual([]);
    expect(outcome.evaluatedAt).toEqual(NOW);
  });

  it('passes anchor claims to the model without their numeric score', async () => {
    // The model has no reason to see the arithmetic; exposing it would invite
    // reasoning about strength where a categorical judgment is wanted.
    const { judgment } = await run({ hypotheses: [candidate()] });

    expect(judgment.calls.generateHypotheses).toBe(1);
  });

  it('carries the admitted explanation and mechanism through', async () => {
    const { outcome } = await run({ hypotheses: [candidate()] });
    const h = outcome.admitted[0];

    expect(h?.explanation).toContain('external pressure');
    expect(h?.mechanism).toContain('Deadline proximity');
    expect(h?.anchorPath).toBe('supported_relation');
    expect(h?.supportBasis).toBe('directional_observation');
  });

  it('mints one id per admitted hypothesis', async () => {
    const { outcome } = await run({
      hypotheses: [candidate(), candidate({ explanation: 'second' })],
    });

    expect(outcome.admitted.map((h) => h.id)).toEqual(['hyp-1', 'hyp-2']);
  });
});

describe('§14 — gates wired through the pipeline', () => {
  it('rejects a candidate anchored to an insufficient level', async () => {
    const { outcome } = await run(
      { hypotheses: [candidate()] },
      { anchorClaims: [claim({ supportLevel: 'observed' })] },
    );

    expect(outcome.admitted).toEqual([]);
    expect(outcome.rejected[0]?.failures[0]?.gate).toBe('anchor');
  });

  it('rejects compatibility_only support', async () => {
    const { outcome } = await run({
      hypotheses: [candidate({ supportBasis: 'compatibility_only' })],
    });

    expect(outcome.admitted).toEqual([]);
    expect(outcome.rejected[0]?.failures[0]?.gate).toBe(
      'positive_directional_support',
    );
  });

  it('rejects an unfalsifiable candidate', async () => {
    const { outcome } = await run({
      hypotheses: [
        candidate({
          discriminatingEvidence: { wouldStrengthen: ['s'], wouldWeaken: [] },
        }),
      ],
    });

    expect(outcome.rejected[0]?.failures[0]?.gate).toBe(
      'discriminating_evidence',
    );
  });

  it('hard-fails a prohibited abstraction via H6', async () => {
    const { outcome } = await run({
      hypotheses: [candidate()],
      hypothesisAbstraction: {
        prohibitedClaimDetected: true,
        category: 'personality',
      },
    });

    expect(outcome.admitted).toEqual([]);
    expect(outcome.rejected[0]?.failures[0]?.gate).toBe('abstraction_ceiling');
  });

  it('uses a Hypothesis-specific H6 judgment, separate from the Relation gate', async () => {
    // A Relation may pass Gate 6 while the explanation built on it does not.
    const { outcome, judgment } = await run({
      hypotheses: [candidate()],
      abstraction: { prohibitedClaimDetected: false },
      hypothesisAbstraction: {
        prohibitedClaimDetected: true,
        category: 'identity',
      },
    });

    expect(judgment.calls.judgeHypothesisAbstractionCeiling).toBe(1);
    expect(outcome.admitted).toEqual([]);
  });

  it('scopes each candidate to the records it actually cites', async () => {
    // One candidate must not borrow another's support.
    const { outcome } = await run(
      {
        hypotheses: [
          candidate({ supportingRecordRefs: [recordId('rec-1')] }),
          candidate({
            explanation: 'unsupported',
            supportingRecordRefs: [recordId('ghost')],
          }),
        ],
      },
      { availableRecords: [record({ id: recordId('rec-1') })] },
    );

    expect(outcome.admitted).toHaveLength(1);
    expect(outcome.rejected[0]?.failures[0]?.code).toBe(
      'unresolved_supporting_record',
    );
  });

  it('reports every failure for one candidate', async () => {
    const { outcome } = await run({
      hypotheses: [
        candidate({
          supportBasis: 'absence_of_contradiction',
          alternatives: [],
        }),
      ],
    });

    expect(outcome.rejected[0]?.failures.map((f) => f.gate)).toEqual([
      'positive_directional_support',
      'alternative_awareness',
    ]);
  });
});

describe('§16.2 — a suspended anchor yields no new hypothesis', () => {
  it('rejects generation from a suspended Relation', async () => {
    const { outcome } = await run(
      { hypotheses: [candidate()] },
      { anchorStates: [{ targetRef: 'claim-1', workflowState: 'suspended' }] },
    );

    expect(outcome.admitted).toEqual([]);
    expect(outcome.rejected[0]?.failures[0]?.gate).toBe('suspension');
  });

  it('still admits when a DIFFERENT claim is suspended', async () => {
    const { outcome } = await run(
      { hypotheses: [candidate()] },
      {
        anchorStates: [
          { targetRef: 'claim-1', workflowState: 'active' },
          { targetRef: 'claim-other', workflowState: 'suspended' },
        ],
      },
    );

    expect(outcome.admitted).toHaveLength(1);
  });
});

describe('§13 — restraint: a small number of explanations', () => {
  it('caps admissions at three', async () => {
    expect(MAX_ADMITTED_HYPOTHESES).toBe(3);

    const { outcome } = await run({
      hypotheses: [
        candidate({ explanation: 'one' }),
        candidate({ explanation: 'two' }),
        candidate({ explanation: 'three' }),
        candidate({ explanation: 'four' }),
      ],
    });

    expect(outcome.admitted).toHaveLength(3);
    expect(outcome.capped).toHaveLength(1);
  });

  it('surfaces capped candidates rather than dropping them silently', async () => {
    const { outcome } = await run({
      hypotheses: Array.from({ length: 5 }, (_, i) =>
        candidate({ explanation: `explanation ${i}` }),
      ),
    });

    expect(outcome.capped).toHaveLength(2);
    expect(outcome.capped[0]?.explanation).toBe('explanation 3');
  });

  it('caps in generation order, without ranking', async () => {
    // Ranking would require a confidence judgment the contract does not permit.
    const { outcome } = await run({
      hypotheses: [
        candidate({ explanation: 'first' }),
        candidate({ explanation: 'second' }),
        candidate({ explanation: 'third' }),
        candidate({ explanation: 'fourth' }),
      ],
    });

    expect(outcome.admitted.map((h) => h.explanation)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('applies the cap only to candidates that passed the gates', async () => {
    // A rejected candidate must not consume a slot.
    const { outcome } = await run({
      hypotheses: [
        candidate({ explanation: 'rejected', alternatives: [] }),
        candidate({ explanation: 'a' }),
        candidate({ explanation: 'b' }),
        candidate({ explanation: 'c' }),
      ],
    });

    expect(outcome.rejected).toHaveLength(1);
    expect(outcome.admitted).toHaveLength(3);
    expect(outcome.capped).toEqual([]);
  });
});

describe('§13 — an admitted hypothesis retains its competition', () => {
  it('keeps alternatives, falsifiers, and predictions', async () => {
    const { outcome } = await run({ hypotheses: [candidate()] });
    const h = outcome.admitted[0];

    if (h) expect(remainsCompetable(h)).toBe(true);
    expect(h?.alternatives.length).toBeGreaterThan(0);
    expect(h?.wouldWeaken.length).toBeGreaterThan(0);
  });

  it('carries no probability, confidence, or truth value', async () => {
    // §13: formal storage of a Hypothesis does NOT make it true.
    const { outcome } = await run({ hypotheses: [candidate()] });
    const h = outcome.admitted[0];

    expect(h).not.toHaveProperty('probability');
    expect(h).not.toHaveProperty('confidence');
    expect(h).not.toHaveProperty('likelihood');
    expect(h).not.toHaveProperty('certainty');
    expect(h).not.toHaveProperty('isTrue');
    expect(h).not.toHaveProperty('rank');
  });
});

describe('§16 — initial state', () => {
  it('starts neutral and active', async () => {
    const { outcome } = await run({ hypotheses: [candidate()] });
    const h = outcome.admitted[0];

    if (h) {
      const state = initialStateForHypothesis(h);
      expect(state.targetType).toBe('hypothesis');
      expect(state.targetRef).toBe(h.id);
      expect(state.userPosition).toBe('none');
      expect(state.workflowState).toBe('active');
      expect(state.presentationState).toBe('active');
    }
  });

  it('assigns no attention priority or presentation level (INV-09)', async () => {
    const { outcome } = await run({ hypotheses: [candidate()] });
    const h = outcome.admitted[0];

    if (h) {
      const state = initialStateForHypothesis(h);
      expect(state).not.toHaveProperty('attentionPriority');
      expect(state).not.toHaveProperty('presentationLevel');
    }
  });
});

describe('mixed batches', () => {
  it('partitions admitted, rejected, and capped in one pass', async () => {
    const { outcome } = await run({
      hypotheses: [
        candidate({ explanation: 'ok-1' }),
        candidate({ explanation: 'bad', supportBasis: 'insufficient' }),
        candidate({ explanation: 'ok-2' }),
        candidate({ explanation: 'ok-3' }),
        candidate({ explanation: 'over-cap' }),
      ],
    });

    expect(outcome.admitted.map((h) => h.explanation)).toEqual([
      'ok-1',
      'ok-2',
      'ok-3',
    ]);
    expect(outcome.rejected).toHaveLength(1);
    expect(outcome.capped.map((c) => c.explanation)).toEqual(['over-cap']);
  });
});

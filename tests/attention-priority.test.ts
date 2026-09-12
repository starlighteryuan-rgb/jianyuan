/**
 * Phase 5 tests — the five Attention signals and the deterministic aggregation.
 *
 * Covers:
 *   §17    — five signals; Discovery carries no score overlapping evidence.
 *   §20    — attention returns the user to themselves; no dependence-seeking.
 *   §36 / INV-09 — evidence support is NOT an attention input, and strong
 *            evidence does not imply high priority.
 *   arch §13 — output scale is low|medium|high, not a percentage.
 */

import { describe, expect, it } from 'vitest';

import {
  ATTENTION_SIGNALS,
  FORBIDDEN_ATTENTION_INPUTS,
  INTERPRETATION_RISK_RULE,
  UNKNOWN_SIGNALS,
  type SignalInputs,
} from '@/domain/discovery/attention-signals';
import {
  AGGREGATION_RULE,
  UNKNOWN_SIGNALS_PRIORITY,
  activeCeilings,
  assessAttention,
  attentionPriorityFor,
  elevatingSignals,
} from '@/domain/discovery/attention-priority';
import * as signalsModule from '@/domain/discovery/attention-signals';
import * as priorityModule from '@/domain/discovery/attention-priority';
import { ATTENTION_PRIORITIES } from '@/domain/shared/enums';

/** All signals neutral: nothing elevating, nothing capping. */
const neutral = (over: Partial<SignalInputs> = {}): SignalInputs => ({
  novelty: 'seen',
  currentRelevance: 'medium',
  temporalDepth: 'moderate',
  potential: 'medium',
  interpretationRisk: 'low',
  ...over,
});

describe('§17 — exactly five signals', () => {
  it('names the five contract signals', () => {
    expect([...ATTENTION_SIGNALS]).toEqual([
      'novelty',
      'currentRelevance',
      'temporalDepth',
      'potential',
      'interpretationRisk',
    ]);
  });

  it('SignalInputs has exactly those five keys', () => {
    expect(Object.keys(neutral()).sort()).toEqual([...ATTENTION_SIGNALS].sort());
  });
});

describe('§36 / INV-09 — evidence is structurally excluded', () => {
  it('accepts no evidence-derived field', () => {
    // A whitelist test: a future evidence field would have to be added to
    // SignalInputs, and this fails the moment it is.
    const keys = Object.keys(neutral());

    for (const forbidden of FORBIDDEN_ATTENTION_INPUTS) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('exports no function taking an evidence level', () => {
    const exported = [
      ...Object.keys(signalsModule),
      ...Object.keys(priorityModule),
    ];

    const forbidden = exported.filter((n) =>
      /evidence|support(Level|Score)|numericScore/i.test(n),
    );

    // Nothing in either module even NAMES an evidence concept.
    expect(forbidden).toEqual([]);
  });

  it('exposes no numeric priority score', () => {
    // §17 forbids a Discovery score overlapping evidence strength, so the
    // internal count must not escape.
    const assessment = assessAttention(neutral());

    expect(assessment).not.toHaveProperty('score');
    expect(assessment).not.toHaveProperty('count');
    expect(assessment).not.toHaveProperty('numericPriority');
    expect(assessment).not.toHaveProperty('weight');
  });

  it('uses a three-value scale, not a percentage', () => {
    expect([...ATTENTION_PRIORITIES]).toEqual(['low', 'medium', 'high']);
    expect(ATTENTION_PRIORITIES).toContain(attentionPriorityFor(neutral()));
  });
});

describe('the counting rule', () => {
  it('documents which rule is implemented', () => {
    expect(AGGREGATION_RULE).toBe(
      'count_elevating_signals_then_apply_most_restrictive_ceiling',
    );
  });

  it('yields low with nothing elevating', () => {
    expect(attentionPriorityFor(neutral())).toBe('low');
    expect(elevatingSignals(neutral())).toEqual([]);
  });

  it('yields medium with one elevating signal', () => {
    expect(attentionPriorityFor(neutral({ novelty: 'new' }))).toBe('medium');
  });

  it('yields medium with two elevating signals', () => {
    expect(
      attentionPriorityFor(neutral({ novelty: 'new', temporalDepth: 'deep' })),
    ).toBe('medium');
  });

  it('yields high with three', () => {
    expect(
      attentionPriorityFor(
        neutral({
          novelty: 'new',
          temporalDepth: 'deep',
          currentRelevance: 'high',
        }),
      ),
    ).toBe('high');
  });

  it('counts each of the four elevating conditions', () => {
    expect(elevatingSignals(neutral({ novelty: 'new' }))).toEqual([
      'novelty:new',
    ]);
    expect(elevatingSignals(neutral({ currentRelevance: 'high' }))).toEqual([
      'currentRelevance:high',
    ]);
    expect(elevatingSignals(neutral({ temporalDepth: 'deep' }))).toEqual([
      'temporalDepth:deep',
    ]);
    expect(elevatingSignals(neutral({ potential: 'high' }))).toEqual([
      'potential:high',
    ]);
  });
});

describe('signals that deliberately do NOT elevate', () => {
  it('resurfaced is not novel', () => {
    // Something already seen is not fresh because it became relevant again;
    // collapsing the two would let repeated surfacing pose as discovery.
    expect(elevatingSignals(neutral({ novelty: 'resurfaced' }))).toEqual([]);
    expect(attentionPriorityFor(neutral({ novelty: 'resurfaced' }))).toBe('low');
  });

  it('low interpretation risk does not elevate', () => {
    // Risk only restrains; safety is not a reason to promote.
    expect(elevatingSignals(neutral({ interpretationRisk: 'low' }))).toEqual([]);
  });

  it('medium relevance and moderate depth do not elevate', () => {
    expect(
      elevatingSignals(
        neutral({ currentRelevance: 'medium', temporalDepth: 'moderate' }),
      ),
    ).toEqual([]);
  });
});

describe('ceilings', () => {
  it('documents the interpretation-risk direction chosen', () => {
    expect(INTERPRETATION_RISK_RULE).toBe(
      'high_interpretation_risk_caps_priority_at_medium',
    );
  });

  it('caps at low when potential is low', () => {
    // §20: an item the user can do nothing with must not consume attention.
    const all = neutral({
      novelty: 'new',
      currentRelevance: 'high',
      temporalDepth: 'deep',
      potential: 'low',
    });

    expect(attentionPriorityFor(all)).toBe('low');
  });

  it('caps at medium when interpretation risk is high', () => {
    const all = neutral({
      novelty: 'new',
      currentRelevance: 'high',
      temporalDepth: 'deep',
      potential: 'high',
      interpretationRisk: 'high',
    });

    // Would otherwise be high on four elevating signals.
    expect(attentionPriorityFor(all)).toBe('medium');
  });

  it('caps at medium when relevance is unknown', () => {
    const all = neutral({
      novelty: 'new',
      temporalDepth: 'deep',
      potential: 'high',
      currentRelevance: 'unknown',
    });

    expect(attentionPriorityFor(all)).toBe('medium');
  });

  it('does not cap on low relevance', () => {
    // §18 distinguishes unknown from low: low is knowledge, not absence of it.
    const all = neutral({
      novelty: 'new',
      temporalDepth: 'deep',
      potential: 'high',
      currentRelevance: 'low',
    });

    expect(attentionPriorityFor(all)).toBe('high');
  });

  it('applies the most restrictive ceiling when several hold', () => {
    const all = neutral({
      novelty: 'new',
      currentRelevance: 'unknown',
      temporalDepth: 'deep',
      potential: 'low',
      interpretationRisk: 'high',
    });

    expect(activeCeilings(all)).toHaveLength(3);
    expect(attentionPriorityFor(all)).toBe('low');
  });

  it('records a reason for each active ceiling', () => {
    const ceilings = activeCeilings(
      neutral({ potential: 'low', interpretationRisk: 'high' }),
    );

    expect(ceilings).toHaveLength(2);
    for (const c of ceilings) expect(c.reason.length).toBeGreaterThan(0);
  });

  it('lets ceilings dominate every elevating signal', () => {
    // The invariant: nothing can push priority above a ceiling.
    const maxElevated = neutral({
      novelty: 'new',
      currentRelevance: 'high',
      temporalDepth: 'deep',
      potential: 'high',
    });

    expect(attentionPriorityFor(maxElevated)).toBe('high');
    expect(
      attentionPriorityFor({ ...maxElevated, interpretationRisk: 'high' }),
    ).toBe('medium');
  });
});

describe('conservative defaults', () => {
  it('yields low for wholly unknown signals', () => {
    expect(UNKNOWN_SIGNALS_PRIORITY).toBe('low');
    expect(attentionPriorityFor(UNKNOWN_SIGNALS)).toBe('low');
  });

  it('treats unknown relevance and depth as unknown, not low', () => {
    expect(UNKNOWN_SIGNALS.currentRelevance).toBe('unknown');
    expect(UNKNOWN_SIGNALS.temporalDepth).toBe('unknown');
  });
});

describe('purity', () => {
  it('is deterministic across repeated calls', () => {
    const signals = neutral({ novelty: 'new', temporalDepth: 'deep' });

    expect(assessAttention(signals)).toEqual(assessAttention(signals));
  });

  it('does not mutate its input', () => {
    const signals = neutral({ novelty: 'new' });
    const copy = { ...signals };

    assessAttention(signals);
    expect(signals).toEqual(copy);
  });

  it('returns the signals it judged, for audit', () => {
    const signals = neutral({ novelty: 'new' });
    expect(assessAttention(signals).signals).toEqual(signals);
  });
});

describe('§20 — no dependence-seeking mechanics', () => {
  it('exports no streak, escalation, or re-engagement concept', () => {
    const exported = [
      ...Object.keys(signalsModule),
      ...Object.keys(priorityModule),
    ];

    const forbidden = exported.filter((n) =>
      /streak|escalat|reengage|reEngage|nag|remind|unread|dwell/i.test(n),
    );

    expect(forbidden).toEqual([]);
  });

  it('assigns no field that grows when the user does not respond', () => {
    const assessment = assessAttention(neutral());

    for (const field of ['attempts', 'timesShown', 'ignoredCount', 'urgency']) {
      expect(assessment).not.toHaveProperty(field);
    }
  });
});

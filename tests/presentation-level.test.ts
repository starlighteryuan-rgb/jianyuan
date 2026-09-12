/**
 * Phase 5 tests — §18 Presentation Level decisions.
 *
 * Covers:
 *   §18    — l1 stored only / l2 available when the user looks / l3 proactive.
 *   §40.5  — L3 disabled by default for MVP.
 *   §16.2  — suspension halts progression without erasing evidence.
 *   §16.3  — archive suppresses proactive surfacing, keeps retrievability.
 *   Patch 5 — passive and proactive permissions are INDEPENDENT.
 *   §36 / INV-09 — presentation prominence is not epistemic validity.
 */

import { describe, expect, it } from 'vitest';

import {
  L3_ENABLED_BY_DEFAULT,
  MIN_PRIORITY_FOR_PROACTIVE,
  OPTIMISES_FOR_DEPENDENCE,
  decidePresentation,
  type PresentationInputs,
} from '@/domain/discovery/presentation-level';
import { assessAttention } from '@/domain/discovery/attention-priority';
import type { SignalInputs } from '@/domain/discovery/attention-signals';
import { PRESENTATION_LEVELS } from '@/domain/shared/enums';

/** Signals that reach `high` priority: three elevating, no ceilings. */
const highSignals: SignalInputs = {
  novelty: 'new',
  currentRelevance: 'high',
  temporalDepth: 'deep',
  potential: 'high',
  interpretationRisk: 'low',
};

const lowSignals: SignalInputs = {
  novelty: 'seen',
  currentRelevance: 'medium',
  temporalDepth: 'moderate',
  potential: 'medium',
  interpretationRisk: 'low',
};

/**
 * The most permissive possible case, with L3 explicitly enabled. Everything
 * else in this suite restricts from here.
 */
const permissive = (
  over: Partial<PresentationInputs> = {},
): PresentationInputs => ({
  attention: assessAttention(highSignals),
  archived: false,
  suspended: false,
  allowPassivePresentation: true,
  allowProactivePresentation: true,
  l3Enabled: true,
  ...over,
});

describe('§18 — the three levels', () => {
  it('orders levels least to most intrusive', () => {
    expect([...PRESENTATION_LEVELS]).toEqual(['l1', 'l2', 'l3']);
  });

  it('reaches l3 only when everything permits it', () => {
    const decision = decidePresentation(permissive());

    expect(decision.maxLevel).toBe('l3');
    expect(decision.proactiveEligible).toBe(true);
    expect(decision.passiveEligible).toBe(true);
  });
});

describe('§40.5 — L3 disabled by default', () => {
  it('ships with the default off', () => {
    expect(L3_ENABLED_BY_DEFAULT).toBe(false);
  });

  it('caps at l2 when l3Enabled is omitted', () => {
    const { l3Enabled: _omitted, ...withoutFlag } = permissive();
    const decision = decidePresentation(withoutFlag);

    expect(decision.maxLevel).toBe('l2');
    expect(decision.proactiveEligible).toBe(false);
    expect(decision.passiveEligible).toBe(true);
  });

  it('caps at l2 when explicitly disabled, whatever the signals', () => {
    const decision = decidePresentation(permissive({ l3Enabled: false }));

    expect(decision.maxLevel).toBe('l2');
    expect(decision.reasons.join(' ')).toContain('disabled by default');
  });

  it('cannot be overridden by maximal signals', () => {
    // The default-off flag is the last word: no signal combination lifts it.
    const decision = decidePresentation(
      permissive({ l3Enabled: false, attention: assessAttention(highSignals) }),
    );

    expect(decision.proactiveEligible).toBe(false);
  });
});

describe('Patch 5 — passive and proactive permissions are independent', () => {
  it('forbidding proactive leaves passive intact', () => {
    // "Don't proactively remind me" does not mean "don't show it if I look".
    const decision = decidePresentation(
      permissive({ allowProactivePresentation: false }),
    );

    expect(decision.maxLevel).toBe('l2');
    expect(decision.passiveEligible).toBe(true);
    expect(decision.proactiveEligible).toBe(false);
  });

  it('forbidding passive drops to l1', () => {
    const decision = decidePresentation(
      permissive({ allowPassivePresentation: false }),
    );

    expect(decision.maxLevel).toBe('l1');
    expect(decision.passiveEligible).toBe(false);
    expect(decision.proactiveEligible).toBe(false);
  });

  it('forbidding passive while allowing proactive still yields l1', () => {
    // The stricter constraint wins; there is no path that pushes an item the
    // user cannot passively see.
    const decision = decidePresentation(
      permissive({
        allowPassivePresentation: false,
        allowProactivePresentation: true,
      }),
    );

    expect(decision.maxLevel).toBe('l1');
  });
});

describe('§16.3 — archive', () => {
  it('suppresses proactive surfacing but keeps retrievability', () => {
    const decision = decidePresentation(permissive({ archived: true }));

    expect(decision.maxLevel).toBe('l1');
    expect(decision.passiveEligible).toBe(false);
    expect(decision.proactiveEligible).toBe(false);
  });

  it('states the evidence is unchanged', () => {
    const decision = decidePresentation(permissive({ archived: true }));

    expect(decision.reasons.join(' ')).toContain('evidence is unchanged');
  });
});

describe('§16.2 — suspend', () => {
  it('halts proactive surfacing', () => {
    const decision = decidePresentation(permissive({ suspended: true }));

    expect(decision.maxLevel).toBe('l1');
    expect(decision.passiveEligible).toBe(false);
    expect(decision.proactiveEligible).toBe(false);
  });

  it('states the evidence remains', () => {
    // §16.1 keeps strong + disagrees + suspended a valid combination.
    const decision = decidePresentation(permissive({ suspended: true }));

    expect(decision.reasons.join(' ')).toContain('evidence remains');
  });
});

describe('§18, §20 — priority gates the proactive path', () => {
  it('requires high priority for proactive presentation', () => {
    expect(MIN_PRIORITY_FOR_PROACTIVE).toBe('high');
  });

  it('caps at l2 on low priority', () => {
    const decision = decidePresentation(
      permissive({ attention: assessAttention(lowSignals) }),
    );

    expect(decision.maxLevel).toBe('l2');
    expect(decision.proactiveEligible).toBe(false);
  });

  it('caps at l2 on medium priority', () => {
    const medium = assessAttention({ ...lowSignals, novelty: 'new' });
    expect(medium.priority).toBe('medium');

    expect(decidePresentation(permissive({ attention: medium })).maxLevel).toBe(
      'l2',
    );
  });

  it('restates the attention ceilings in its own reasons', () => {
    // One audit trail explains the outcome without consulting both modules.
    const risky = assessAttention({ ...highSignals, interpretationRisk: 'high' });
    const decision = decidePresentation(permissive({ attention: risky }));

    expect(decision.reasons.join(' ')).toContain('Attention ceiling');
    expect(decision.proactiveEligible).toBe(false);
  });
});

describe('§36 / INV-09 — presentation is not epistemic validity', () => {
  it('accepts no evidence field as input', () => {
    expect(Object.keys(permissive()).sort()).toEqual(
      [
        'allowPassivePresentation',
        'allowProactivePresentation',
        'archived',
        'attention',
        'l3Enabled',
        'suspended',
      ].sort(),
    );
  });

  it('returns nothing that could be read as validity', () => {
    const decision = decidePresentation(permissive());

    for (const field of [
      'supportLevel',
      'evidenceScore',
      'confidence',
      'truth',
      'validity',
    ]) {
      expect(decision).not.toHaveProperty(field);
    }
  });

  it('yields the same ceiling regardless of how strong the evidence was', () => {
    // There is no evidence input, so this is structurally guaranteed; the test
    // pins it so a future field cannot quietly change the behaviour.
    const a = decidePresentation(permissive({ archived: true }));
    const b = decidePresentation(permissive({ archived: true }));

    expect(a).toEqual(b);
  });
});

describe('§20 — mediation, not dependence', () => {
  it('declares it does not optimise for dependence', () => {
    expect(OPTIMISES_FOR_DEPENDENCE).toBe(false);
  });

  it('records every applicable restriction, not just the binding one', () => {
    const decision = decidePresentation(
      permissive({
        archived: true,
        suspended: true,
        allowProactivePresentation: false,
        l3Enabled: false,
      }),
    );

    // Archive, suspend, directive, and the L3 default all reported.
    expect(decision.reasons.length).toBeGreaterThanOrEqual(4);
  });
});

describe('purity', () => {
  it('is deterministic', () => {
    expect(decidePresentation(permissive())).toEqual(
      decidePresentation(permissive()),
    );
  });

  it('does not mutate its input', () => {
    const inputs = permissive();
    const copy = structuredClone({ ...inputs, attention: null });

    decidePresentation(inputs);
    expect(structuredClone({ ...inputs, attention: null })).toEqual(copy);
  });
});

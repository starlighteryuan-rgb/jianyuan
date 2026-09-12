/**
 * Phase 6 tests — reflection provenance (§22) and preferences (§33).
 *
 * §22 requires an episode record HOW a reflection was elicited:
 *   elicitation_mode:  spontaneous | prompted | unknown
 *   stimulus_type:     none | open_question | evidence_relation | hypothesis |
 *                      external_reference | unknown
 *   system_followup_count
 *
 * and forbids fabricating provenance: `unknown` exists so the system can say it
 * does not know, rather than guessing.
 *
 * Patch 4 / INV-18: an episode owns NO meaning. That separation is asserted
 * structurally here, since it is the whole reason the entity was split.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_AUTOMATIC_FOLLOWUPS,
  isPromptContaminationSusceptible,
} from '@/domain/reflection/reflection-episode';
import type { ReflectionEpisode } from '@/domain/reflection/reflection-episode';
import {
  INFERS_STABLE_IDENTITY,
  SOLE_PREFERENCE_ID,
  defaultPreference,
  permittedFollowups,
  type ReflectionPreference,
} from '@/domain/reflection/reflection-preference';
import * as preferenceModule from '@/domain/reflection/reflection-preference';
import {
  ELICITATION_MODES,
  INTERVENTION_LEVELS,
  STATE_TARGET_TYPES,
  STIMULUS_TYPES,
} from '@/domain/shared/enums';
import { reflectionEpisodeId } from '@/domain/shared/ids';

const AT = new Date('2026-09-01T00:00:00Z');

const episode = (
  over: Partial<ReflectionEpisode> = {},
): ReflectionEpisode => ({
  id: reflectionEpisodeId('ep-1'),
  elicitationMode: 'prompted',
  stimulusType: 'evidence_relation',
  systemFollowupCount: 0,
  stimulusRef: 'claim-1',
  targetRef: 'claim-1',
  occurredAt: AT,
  ...over,
});

describe('§22 — the provenance vocabulary', () => {
  it('declares the three elicitation modes', () => {
    expect([...ELICITATION_MODES]).toEqual([
      'spontaneous',
      'prompted',
      'unknown',
    ]);
  });

  it('declares the six stimulus types', () => {
    expect([...STIMULUS_TYPES]).toEqual([
      'none',
      'open_question',
      'evidence_relation',
      'hypothesis',
      'external_reference',
      'unknown',
    ]);
  });

  it('offers `unknown` so provenance need not be fabricated', () => {
    // §22: the system may say it does not know how a reflection arose.
    const vague = episode({
      elicitationMode: 'unknown',
      stimulusType: 'unknown',
      stimulusRef: null,
    });

    expect(vague.elicitationMode).toBe('unknown');
    expect(vague.stimulusRef).toBeNull();
  });

  it('keeps spontaneous and prompted distinct', () => {
    const spontaneous = episode({
      elicitationMode: 'spontaneous',
      stimulusType: 'none',
      stimulusRef: null,
      systemFollowupCount: 0,
    });

    expect(spontaneous.elicitationMode).not.toBe('prompted');
    expect(spontaneous.stimulusType).toBe('none');
  });
});

describe('Patch 4 / INV-18 — an episode owns no meaning', () => {
  it('carries no meaning commitment', () => {
    // The field moved to UserReflectionRecord precisely so nothing here could be
    // mistaken for what the user concluded.
    for (const field of [
      'meaningCommitment',
      'meaning',
      'interpretation',
      'conclusion',
    ]) {
      expect(episode()).not.toHaveProperty(field);
    }
  });

  it('carries no user position or response', () => {
    for (const field of ['userPosition', 'response', 'agreed', 'accepted']) {
      expect(episode()).not.toHaveProperty(field);
    }
  });

  it('exposes exactly the provenance fields', () => {
    expect(Object.keys(episode()).sort()).toEqual(
      [
        'elicitationMode',
        'id',
        'occurredAt',
        'stimulusRef',
        'stimulusType',
        'systemFollowupCount',
        'targetRef',
      ].sort(),
    );
  });
});

describe('frozen scope — ReflectionEpisode is not a StateAssignment target', () => {
  it('is absent from the target types', () => {
    // User-frozen MVP scope: RelationClaim yes, Hypothesis yes, Discovery yes,
    // ReflectionEpisode no.
    expect([...STATE_TARGET_TYPES]).not.toContain('reflection_episode');
  });

  it('admits exactly the three frozen targets', () => {
    expect([...STATE_TARGET_TYPES]).toEqual([
      'relation_claim',
      'hypothesis',
      'discovery',
    ]);
  });
});

describe('§23 — follow-up provenance is observable', () => {
  it('starts at zero follow-ups', () => {
    expect(episode().systemFollowupCount).toBe(0);
  });

  it('is not contaminated within the budget', () => {
    expect(
      isPromptContaminationSusceptible(
        episode({ systemFollowupCount: MAX_AUTOMATIC_FOLLOWUPS }),
        false,
      ),
    ).toBe(false);
  });

  it('is contaminated past the budget without user continuation', () => {
    expect(
      isPromptContaminationSusceptible(
        episode({ systemFollowupCount: MAX_AUTOMATIC_FOLLOWUPS + 1 }),
        false,
      ),
    ).toBe(true);
  });

  it('is not contaminated when the user drove the exchange', () => {
    expect(
      isPromptContaminationSusceptible(
        episode({ systemFollowupCount: 5 }),
        true,
      ),
    ).toBe(false);
  });
});

describe('§33 — preferences are interaction style, not identity', () => {
  const preference = (
    over: Partial<ReflectionPreference> = {},
  ): ReflectionPreference => ({ ...defaultPreference(AT), ...over });

  it('declares it infers no stable identity', () => {
    expect(INFERS_STABLE_IDENTITY).toBe(false);
  });

  it('stores no trait or disposition field', () => {
    for (const field of [
      'trait',
      'personality',
      'disposition',
      'tendency',
      'style',
      'profile',
      'openness',
    ]) {
      expect(preference()).not.toHaveProperty(field);
    }
  });

  it('stores no history or stability measure', () => {
    // §33 says preferences may change, so consistency over time must not become
    // readable as evidence about the person.
    for (const field of ['since', 'history', 'consistency', 'stability']) {
      expect(preference()).not.toHaveProperty(field);
    }
  });

  it('exposes exactly the three MVP dials plus identity', () => {
    expect(Object.keys(preference()).sort()).toEqual(
      [
        'explanationDensity',
        'hypothesisVisibility',
        'id',
        'interventionLevel',
        'updatedAt',
      ].sort(),
    );
  });

  it('exports no function inferring a preference from behaviour', () => {
    // Functions only: `INFERS_STABLE_IDENTITY` is the documentation constant
    // asserting the absence, not an inference mechanism.
    const forbidden = Object.entries(preferenceModule)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      .filter((n) => /infer|derive|detect|learn|profile/i.test(n));

    expect(forbidden).toEqual([]);
  });
});

describe('§33 — conservative defaults', () => {
  it('withholds hypotheses until asked', () => {
    // A user who has expressed no preference has not asked to be offered
    // explanations of themselves (§20).
    expect(defaultPreference(AT).hypothesisVisibility).toBe('on_request');
  });

  it('uses the contract default for intervention', () => {
    expect(defaultPreference(AT).interventionLevel).toBe('standard');
  });

  it('defaults to brief explanations', () => {
    expect(defaultPreference(AT).explanationDensity).toBe('brief');
  });

  it('uses a single named preference row', () => {
    expect(defaultPreference(AT).id).toBe(SOLE_PREFERENCE_ID);
  });
});

describe('§23, §33 — a preference may only lower the follow-up cap', () => {
  it('offers exactly two intervention levels', () => {
    // No third value exists, so a preference cannot buy a chat loop.
    expect([...INTERVENTION_LEVELS]).toEqual(['minimal', 'standard']);
  });

  it('permits none under `minimal`', () => {
    expect(
      permittedFollowups({ ...defaultPreference(AT), interventionLevel: 'minimal' }),
    ).toBe(0);
  });

  it('permits one under `standard`', () => {
    expect(
      permittedFollowups({
        ...defaultPreference(AT),
        interventionLevel: 'standard',
      }),
    ).toBe(1);
  });

  it('never exceeds the §23 cap', () => {
    for (const level of INTERVENTION_LEVELS) {
      const permitted = permittedFollowups({
        ...defaultPreference(AT),
        interventionLevel: level,
      });

      expect(permitted).toBeLessThanOrEqual(MAX_AUTOMATIC_FOLLOWUPS);
    }
  });
});

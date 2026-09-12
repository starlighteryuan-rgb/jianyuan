/**
 * Phase 6 tests — reflection response routing.
 *
 * This is the file that defends requirement 6: WHAT ENTERS CAPTURE, AND WHAT IS
 * ONLY AN ATTITUDE. It is also where a plausible convenience would silently
 * break §15, so most assertions here are structural.
 *
 * Covers:
 *   §21 — "I'd like to say something" is an ACTION, not an epistemic stance.
 *         "leave it for now" is a workflow action, not a factual judgment.
 *   §15 — user agreement is not automatically evidence.
 *   §16 — user_position stays the frozen four-value vocabulary.
 *   §23 — at most one automatic follow-up; no chat loop.
 *   §24 — `confirmed` is not an MVP state.
 *   Patch 7 — a new reflection Record does not thereby become independent
 *         support.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_AUTOMATIC_FOLLOWUPS,
  ROUTING_TOUCHES_EVIDENCE,
  isPromptShaped,
  mayFollowUp,
  routeFeedback,
  toUserPosition,
  type ReflectionFeedback,
} from '@/domain/reflection/response-routing';
import * as routingModule from '@/domain/reflection/response-routing';
import {
  REFLECTION_RESPONSES,
  USER_POSITIONS,
  type ReflectionResponse,
} from '@/domain/shared/enums';

const feedback = (
  over: Partial<ReflectionFeedback> = {},
): ReflectionFeedback => ({
  response: null,
  freeText: null,
  leaveForNow: false,
  userInitiatedContinuation: false,
  ...over,
});

describe('the frozen response vocabulary', () => {
  it('is exactly the four MVP values', () => {
    expect([...REFLECTION_RESPONSES]).toEqual([
      'accepted',
      'questioned',
      'rejected',
      'uncertain',
    ]);
  });

  it('does not include confirmed', () => {
    // Frozen by user decision: `confirmed` is not an MVP state.
    expect([...REFLECTION_RESPONSES]).not.toContain('confirmed');
  });
});

describe('§16 — projection onto the frozen user_position', () => {
  it('leaves §16 untouched', () => {
    // Widening user_position would be a contract change, so the richer
    // reflection vocabulary is projected onto it instead.
    expect([...USER_POSITIONS]).toEqual([
      'none',
      'agrees',
      'disagrees',
      'uncertain',
    ]);
  });

  it('maps accepted to agrees', () => {
    expect(toUserPosition('accepted')).toBe('agrees');
  });

  it('maps rejected to disagrees', () => {
    expect(toUserPosition('rejected')).toBe('disagrees');
  });

  it('maps both questioned and uncertain to uncertain', () => {
    // The lossy step. §16 has no value for "engaged but not settled", and
    // inventing one would modify the contract.
    expect(toUserPosition('questioned')).toBe('uncertain');
    expect(toUserPosition('uncertain')).toBe('uncertain');
  });

  it('maps no response to none', () => {
    expect(toUserPosition(null)).toBe('none');
  });

  it('projects every response to a legal position', () => {
    for (const response of REFLECTION_RESPONSES) {
      expect(USER_POSITIONS).toContain(toUserPosition(response));
    }
  });
});

describe('§21 — button presses never enter Capture', () => {
  it.each(REFLECTION_RESPONSES)('captures nothing for %s alone', (response) => {
    const decision = routeFeedback(feedback({ response }));

    expect(decision.captureText).toBeNull();
    expect(decision.createsReflectionRecord).toBe(false);
  });

  it('captures nothing for "leave it for now"', () => {
    // §21 classifies deferral as a workflow action, not a factual judgment.
    const decision = routeFeedback(feedback({ leaveForNow: true }));

    expect(decision.captureText).toBeNull();
    expect(decision.createsReflectionRecord).toBe(false);
    expect(decision.deferred).toBe(true);
  });

  it('captures nothing when the user does nothing at all', () => {
    const decision = routeFeedback(feedback());

    expect(decision.captureText).toBeNull();
    expect(decision.userPosition).toBe('none');
  });

  it('still records the position for a button-only response', () => {
    // The stance is kept; only the Record is withheld.
    const decision = routeFeedback(feedback({ response: 'accepted' }));

    expect(decision.userPosition).toBe('agrees');
    expect(decision.createsReflectionRecord).toBe(false);
  });

  it('explains why nothing was captured', () => {
    const decision = routeFeedback(feedback({ response: 'accepted' }));

    expect(decision.reasons.join(' ')).toContain('carries no factual content');
  });
});

describe('§21 — free text is the only thing that enters Capture', () => {
  it('captures written text', () => {
    const decision = routeFeedback(
      feedback({ freeText: '我其实是怕做不好，不是不想做。' }),
    );

    expect(decision.captureText).toBe('我其实是怕做不好，不是不想做。');
    expect(decision.createsReflectionRecord).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    const decision = routeFeedback(feedback({ freeText: '  写了一点  ' }));

    expect(decision.captureText).toBe('写了一点');
  });

  it('treats whitespace-only text as nothing written', () => {
    // A user who focused the box and typed nothing has written nothing.
    const decision = routeFeedback(feedback({ freeText: '   \n\t ' }));

    expect(decision.captureText).toBeNull();
    expect(decision.createsReflectionRecord).toBe(false);
  });

  it('treats an empty string as nothing written', () => {
    expect(routeFeedback(feedback({ freeText: '' })).captureText).toBeNull();
  });

  it('captures text alongside a stance', () => {
    const decision = routeFeedback(
      feedback({ response: 'questioned', freeText: '这个说法我不太确定' }),
    );

    expect(decision.captureText).toBe('这个说法我不太确定');
    expect(decision.userPosition).toBe('uncertain');
  });

  it('captures text even when the user also deferred', () => {
    const decision = routeFeedback(
      feedback({ leaveForNow: true, freeText: '先记一句' }),
    );

    expect(decision.captureText).toBe('先记一句');
    expect(decision.deferred).toBe(true);
  });

  it('states that capture does not confer independent support', () => {
    // Patch 7: creating the Record does not by itself grant a new
    // evidence_unit_id or independent-support status.
    const decision = routeFeedback(feedback({ freeText: '写了' }));

    expect(decision.reasons.join(' ')).toContain('evidence_unit_id');
  });
});

describe('§15 / §36 — no path from a response to evidence', () => {
  it('declares it touches no evidence field', () => {
    expect(ROUTING_TOUCHES_EVIDENCE).toBe(false);
  });

  it('returns no evidence, support, or hypothesis field', () => {
    const decision = routeFeedback(feedback({ response: 'accepted' }));

    for (const field of [
      'supportLevel',
      'evidenceScore',
      'evidenceUnitId',
      'supportBasis',
      'hypothesisId',
      'confidence',
    ]) {
      expect(decision).not.toHaveProperty(field);
    }
  });

  it('exports no function that strengthens or confirms anything', () => {
    const forbidden = Object.keys(routingModule).filter((n) =>
      /strengthen|raiseSupport|confirmHypothesis|applyAgreement|upgrade/i.test(n),
    );

    expect(forbidden).toEqual([]);
  });

  it('accepts no evidence field as input', () => {
    // A caller cannot smuggle a support level in, because the type has nowhere
    // to put one.
    expect(Object.keys(feedback()).sort()).toEqual(
      [
        'freeText',
        'leaveForNow',
        'response',
        'userInitiatedContinuation',
      ].sort(),
    );
  });

  it('gives agreement no more capture power than rejection', () => {
    // §15: "对。" must not do more work than "不对。"
    const agreed = routeFeedback(feedback({ response: 'accepted' }));
    const rejected = routeFeedback(feedback({ response: 'rejected' }));

    expect(agreed.createsReflectionRecord).toBe(
      rejected.createsReflectionRecord,
    );
    expect(agreed.captureText).toBe(rejected.captureText);
  });
});

describe('§24 — meaning commitment stays tentative', () => {
  it('is tentative for captured text', () => {
    const decision = routeFeedback(feedback({ freeText: '写了' }));

    expect(decision.meaningCommitment).toBe('tentative');
  });

  it('is tentative regardless of how emphatic the response', () => {
    // §24: spontaneity is not certainty, and acceptance is not confirmation.
    for (const response of REFLECTION_RESPONSES) {
      const decision = routeFeedback(feedback({ response, freeText: '写了' }));
      expect(decision.meaningCommitment).toBe('tentative');
    }
  });

  it('never yields confirmed', () => {
    const inputs: readonly ReflectionFeedback[] = [
      feedback({ response: 'accepted', freeText: '完全同意' }),
      feedback({ response: 'accepted', userInitiatedContinuation: true }),
      feedback({ freeText: '我确定就是这样' }),
    ];

    for (const input of inputs) {
      expect(routeFeedback(input).meaningCommitment).not.toBe('confirmed');
    }
  });
});

describe('§23 — at most one automatic follow-up', () => {
  it('caps at one', () => {
    expect(MAX_AUTOMATIC_FOLLOWUPS).toBe(1);
  });

  it('permits the first follow-up', () => {
    expect(
      mayFollowUp({ systemFollowupCount: 0, userInitiatedContinuation: false }),
    ).toBe(true);
  });

  it('refuses the second', () => {
    expect(
      mayFollowUp({ systemFollowupCount: 1, userInitiatedContinuation: false }),
    ).toBe(false);
  });

  it('permits continuation the user drives', () => {
    // A user-driven exchange is not a system-driven interrogation.
    expect(
      mayFollowUp({ systemFollowupCount: 5, userInitiatedContinuation: true }),
    ).toBe(true);
  });

  it('is not a chat loop', () => {
    // Without the user actively continuing, the budget is exhausted after one.
    const counts = [0, 1, 2, 3];
    const permitted = counts.map((c) =>
      mayFollowUp({ systemFollowupCount: c, userInitiatedContinuation: false }),
    );

    expect(permitted).toEqual([true, false, false, false]);
  });
});

describe('§23 — prompt-shaped responses', () => {
  it('is not prompt-shaped within the budget', () => {
    expect(
      isPromptShaped({
        systemFollowupCount: 1,
        userInitiatedContinuation: false,
      }),
    ).toBe(false);
  });

  it('is prompt-shaped past the budget', () => {
    expect(
      isPromptShaped({
        systemFollowupCount: 2,
        userInitiatedContinuation: false,
      }),
    ).toBe(true);
  });

  it('is not prompt-shaped when the user drove the exchange', () => {
    expect(
      isPromptShaped({
        systemFollowupCount: 5,
        userInitiatedContinuation: true,
      }),
    ).toBe(false);
  });

  it('delegates to the Phase 1 rule rather than duplicating it', () => {
    // Two declarations of a contract cap could drift; this pins that they agree.
    expect(
      isPromptShaped({
        systemFollowupCount: MAX_AUTOMATIC_FOLLOWUPS + 1,
        userInitiatedContinuation: false,
      }),
    ).toBe(true);
  });
});

describe('purity', () => {
  it('is deterministic', () => {
    const input = feedback({ response: 'questioned', freeText: '写了' });

    expect(routeFeedback(input)).toEqual(routeFeedback(input));
  });

  it('does not mutate its input', () => {
    const input = feedback({ freeText: '  写了  ' });
    const copy = { ...input };

    routeFeedback(input);
    expect(input).toEqual(copy);
  });
});

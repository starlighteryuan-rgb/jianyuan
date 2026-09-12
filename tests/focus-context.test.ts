/**
 * Phase 5 tests — §19 CurrentFocusContext.
 *
 * §19 requires the context be lightweight and:
 *   traceable · removable · overrideable · temporary · non-personality-based
 *
 * and governs its decay:
 *   > If the user provides an explicit duration, honor it.
 *   > Otherwise use elastic fading rather than fabricating a precise expiry.
 *   > Expiry reduces current relevance. It does NOT delete historical records.
 *
 * Also covers §18's distinction between `unknown` and `low` relevance.
 */

import { describe, expect, it } from 'vitest';

import {
  FADE_AFTER_DAYS,
  FOCUS_LIFECYCLE_STATES,
  INACTIVE_AFTER_DAYS,
  INFERS_PERSONALITY,
  type CurrentFocusContext,
  deriveLifecycle,
  deriveRelevance,
  endContext,
  relevanceFromLifecycle,
  touchContext,
} from '@/domain/discovery/focus-context';
import { RELEVANCE_STATES } from '@/domain/shared/enums';
import { focusContextId } from '@/domain/shared/ids';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-09-01T00:00:00Z');
const daysAfter = (n: number): Date => new Date(T0.getTime() + n * DAY);

const context = (
  over: Partial<CurrentFocusContext> = {},
): CurrentFocusContext => ({
  id: focusContextId('fc-1'),
  subjectRef: 'claim-1',
  source: { kind: 'record_derived', ref: 'rec-1' },
  lastMentionedAt: T0,
  expiresAt: null,
  endedAt: null,
  createdAt: T0,
  ...over,
});

describe('§19 — lifecycle', () => {
  it('declares the contract lifecycle states', () => {
    expect([...FOCUS_LIFECYCLE_STATES]).toEqual([
      'active',
      'fading',
      'inactive',
    ]);
  });

  it('is active immediately after mention', () => {
    expect(deriveLifecycle(context(), T0)).toBe('active');
  });

  it('is active just before the fade threshold', () => {
    expect(deriveLifecycle(context(), daysAfter(FADE_AFTER_DAYS - 0.1))).toBe(
      'active',
    );
  });

  it('fades at the threshold', () => {
    expect(deriveLifecycle(context(), daysAfter(FADE_AFTER_DAYS))).toBe('fading');
  });

  it('stays fading up to the inactive threshold', () => {
    expect(
      deriveLifecycle(context(), daysAfter(INACTIVE_AFTER_DAYS - 0.1)),
    ).toBe('fading');
  });

  it('becomes inactive at the inactive threshold', () => {
    expect(deriveLifecycle(context(), daysAfter(INACTIVE_AFTER_DAYS))).toBe(
      'inactive',
    );
  });

  it('uses conservative default thresholds', () => {
    expect(FADE_AFTER_DAYS).toBe(7);
    expect(INACTIVE_AFTER_DAYS).toBe(30);
  });
});

describe('§19 — an explicit duration is honored, not decayed', () => {
  it('stays active until the stated expiry', () => {
    const stated = context({ expiresAt: daysAfter(60) });

    // Well past the elastic fade threshold, but the user named an end.
    expect(deriveLifecycle(stated, daysAfter(45))).toBe('active');
  });

  it('becomes inactive once the stated expiry elapses', () => {
    const stated = context({ expiresAt: daysAfter(3) });

    expect(deriveLifecycle(stated, daysAfter(4))).toBe('inactive');
  });

  it('never passes through fading when a duration was stated', () => {
    // The user named an end, so the system does not invent a decay curve.
    const stated = context({ expiresAt: daysAfter(10) });

    const states = [0, 5, 9.9, 10, 20].map((d) =>
      deriveLifecycle(stated, daysAfter(d)),
    );

    expect(states).toEqual([
      'active',
      'active',
      'active',
      'inactive',
      'inactive',
    ]);
    expect(states).not.toContain('fading');
  });

  it('fabricates no expiry when none was stated', () => {
    // §19: "use elastic fading rather than fabricating a precise expiry."
    expect(context().expiresAt).toBeNull();
  });
});

describe('§19 — removable', () => {
  it('ends a context without deleting it', () => {
    const ended = endContext(context(), daysAfter(2));

    expect(ended.endedAt).toEqual(daysAfter(2));
    expect(deriveLifecycle(ended, daysAfter(3))).toBe('inactive');
  });

  it('preserves every other field when ending', () => {
    const original = context({ expiresAt: daysAfter(30) });
    const ended = endContext(original, daysAfter(2));

    expect({ ...ended, endedAt: null }).toEqual(original);
  });

  it('does not mutate the original', () => {
    const original = context();
    endContext(original, daysAfter(2));

    expect(original.endedAt).toBeNull();
  });

  it('is still active before the end takes effect', () => {
    const ended = endContext(context(), daysAfter(5));

    expect(deriveLifecycle(ended, daysAfter(1))).toBe('active');
  });
});

describe('§19 — temporary via re-mention', () => {
  it('moves the fading curve when re-mentioned', () => {
    const stale = context({ lastMentionedAt: T0 });
    expect(deriveLifecycle(stale, daysAfter(10))).toBe('fading');

    const touched = touchContext(stale, daysAfter(10));
    expect(deriveLifecycle(touched, daysAfter(10))).toBe('active');
  });

  it('does not clear a stated duration on re-mention', () => {
    // A passing mention must not silently extend past what the user said.
    const stated = context({ expiresAt: daysAfter(5) });
    const touched = touchContext(stated, daysAfter(4));

    expect(touched.expiresAt).toEqual(daysAfter(5));
    expect(deriveLifecycle(touched, daysAfter(6))).toBe('inactive');
  });

  it('does not mutate the original', () => {
    const original = context();
    touchContext(original, daysAfter(5));

    expect(original.lastMentionedAt).toEqual(T0);
  });
});

describe('§18, §19 — relevance derivation', () => {
  it('maps lifecycle onto relevance', () => {
    expect(relevanceFromLifecycle('active')).toBe('high');
    expect(relevanceFromLifecycle('fading')).toBe('medium');
    expect(relevanceFromLifecycle('inactive')).toBe('low');
  });

  it('never maps a lifecycle state to unknown', () => {
    // Unknown means "no information", which no live context represents.
    for (const state of FOCUS_LIFECYCLE_STATES) {
      expect(relevanceFromLifecycle(state)).not.toBe('unknown');
    }
  });

  it('yields unknown when no context exists for the subject', () => {
    expect(deriveRelevance([], 'claim-1', T0)).toBe('unknown');
  });

  it('yields unknown when contexts exist for OTHER subjects only', () => {
    expect(
      deriveRelevance([context({ subjectRef: 'claim-other' })], 'claim-1', T0),
    ).toBe('unknown');
  });

  it('distinguishes unknown from low', () => {
    // §18 treats them differently: unknown blocks proactive presentation but
    // not passive availability, and defaulting to low would assert a decay the
    // system never observed.
    const inactive = context({ lastMentionedAt: T0 });

    expect(deriveRelevance([], 'claim-1', T0)).toBe('unknown');
    expect(
      deriveRelevance([inactive], 'claim-1', daysAfter(INACTIVE_AFTER_DAYS)),
    ).toBe('low');
  });

  it('declares all four relevance states', () => {
    expect([...RELEVANCE_STATES]).toEqual(['unknown', 'low', 'medium', 'high']);
  });
});

describe('§19 — overrideable', () => {
  it('prefers a user-stated context over a derived one', () => {
    // INV-18: the user owns their own meaning, so their statement wins even
    // when a derived context was mentioned more recently.
    const derived = context({
      id: focusContextId('fc-derived'),
      source: { kind: 'record_derived', ref: 'rec-1' },
      lastMentionedAt: daysAfter(20),
    });
    const stated = context({
      id: focusContextId('fc-stated'),
      source: { kind: 'user_stated', ref: 'utterance-1' },
      lastMentionedAt: T0,
      expiresAt: daysAfter(60),
    });

    // The derived one would be `fading` at day 20; the stated one is `active`.
    expect(deriveRelevance([derived, stated], 'claim-1', daysAfter(20))).toBe(
      'high',
    );
  });

  it('uses the most recent when several derived contexts apply', () => {
    const old = context({
      id: focusContextId('fc-old'),
      lastMentionedAt: T0,
    });
    const recent = context({
      id: focusContextId('fc-recent'),
      lastMentionedAt: daysAfter(20),
    });

    expect(deriveRelevance([old, recent], 'claim-1', daysAfter(21))).toBe('high');
  });

  it('favours the higher relevance on an exact tie', () => {
    // Suppressing a subject the user just raised is the worse error.
    const a = context({
      id: focusContextId('fc-a'),
      lastMentionedAt: T0,
      expiresAt: daysAfter(1),
    });
    const b = context({ id: focusContextId('fc-b'), lastMentionedAt: T0 });

    // At day 0.5: `a` honors its duration (active), `b` is also active.
    expect(deriveRelevance([a, b], 'claim-1', daysAfter(0.5))).toBe('high');
  });

  it('ignores an ended context in favour of a live one', () => {
    const ended = endContext(
      context({ id: focusContextId('fc-ended'), lastMentionedAt: daysAfter(20) }),
      daysAfter(21),
    );
    const live = context({
      id: focusContextId('fc-live'),
      lastMentionedAt: daysAfter(22),
    });

    expect(deriveRelevance([ended, live], 'claim-1', daysAfter(22))).toBe('high');
  });
});

describe('§19 — traceable and non-personality-based', () => {
  it('carries a source for every context', () => {
    const c = context();

    expect(c.source.kind).toBeDefined();
    expect(c.source.ref.length).toBeGreaterThan(0);
  });

  it('declares it infers no personality', () => {
    expect(INFERS_PERSONALITY).toBe(false);
  });

  it('stores no trait, disposition, or standing characteristic', () => {
    const c = context();

    for (const field of [
      'trait',
      'disposition',
      'personality',
      'tendency',
      'preferenceProfile',
      'characteristic',
    ]) {
      expect(c).not.toHaveProperty(field);
    }
  });

  it('stores no lifecycle or relevance column', () => {
    // Both are derived on read; persisting them would fabricate the precise
    // expiry §19 forbids and would need a background job MVP excludes (§40).
    const c = context();

    expect(c).not.toHaveProperty('lifecycle');
    expect(c).not.toHaveProperty('relevance');
    expect(c).not.toHaveProperty('fadedAt');
  });
});

describe('purity and determinism', () => {
  it('derives the same lifecycle for the same inputs', () => {
    const c = context();

    expect(deriveLifecycle(c, daysAfter(10))).toBe(deriveLifecycle(c, daysAfter(10)));
  });

  it('derives relevance without mutating the context list', () => {
    const contexts = [context(), context({ id: focusContextId('fc-2') })];
    const copy = structuredClone(contexts);

    deriveRelevance(contexts, 'claim-1', daysAfter(5));
    expect(structuredClone(contexts)).toEqual(copy);
  });
});

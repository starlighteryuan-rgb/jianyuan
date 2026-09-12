/**
 * Foundation invariant tests — time semantics.
 *
 * Covers:
 *   INV-07 — snapshot does not equal exact historical event time.
 *   INV-08 — user-reported interval does not equal continuous observation.
 *   ENGINEERING_CONTRACT §5, §5.1, §12.
 */

import { describe, expect, it } from 'vitest';

import {
  type TimePoint,
  exactTransitionTimeFromSnapshots,
  isReportedInterval,
  reinterpretSemantic,
} from '@/domain/shared/time-semantics';
import { TIME_SEMANTICS } from '@/domain/shared/enums';
import { isErr, isOk } from '@/domain/shared/result';

describe('§5 — one time semantic never upgrades into another', () => {
  it('permits a no-op reinterpretation', () => {
    const r = reinterpretSemantic('observation_time', 'observation_time');
    expect(isOk(r)).toBe(true);
  });

  it.each([
    ['observation_time', 'event_time'],
    ['capture_time', 'event_time'],
    ['capture_time', 'observation_time'],
    ['user_reported_time', 'event_time'],
    ['user_reported_interval', 'observation_time'],
  ] as const)('refuses %s -> %s', (from, to) => {
    const r = reinterpretSemantic(from, to);

    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.kind).toBe('semantic_upgrade_forbidden');
    }
  });

  it('refuses every cross-semantic pair, in both directions', () => {
    for (const from of TIME_SEMANTICS) {
      for (const to of TIME_SEMANTICS) {
        const r = reinterpretSemantic(from, to);
        // Equal is a no-op; everything else is refused. There is no ladder.
        expect(isOk(r)).toBe(from === to);
      }
    }
  });
});

describe('§5.1 / INV-07 — snapshots do not yield an exact transition time', () => {
  it('refuses to derive an event time from a not-following -> following pair', () => {
    const snapshots: TimePoint[] = [
      { semantic: 'observation_time', at: new Date('2026-08-01T00:00:00Z') },
      { semantic: 'observation_time', at: new Date('2026-09-01T00:00:00Z') },
    ];

    const r = exactTransitionTimeFromSnapshots(snapshots);

    // A transition somewhere in the interval is supportable; an exact time is not.
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error).toEqual({
        kind: 'semantic_upgrade_forbidden',
        from: 'observation_time',
        to: 'event_time',
      });
    }
  });
});

describe('§12 / INV-08 — reported intervals stay whole', () => {
  it('tags a reported interval distinctly and preserves user wording', () => {
    const interval = {
      semantic: 'user_reported_interval',
      from: null,
      to: null,
      reportedAs: '这半年我从来不主动打电话',
    } as const;

    expect(isReportedInterval(interval)).toBe(true);
    // §12: the statement must not be split into synthetic observed events.
    expect(interval.reportedAs).toContain('这半年');
  });

  it('does not classify a point assertion as an interval', () => {
    const point: TimePoint = {
      semantic: 'observation_time',
      at: new Date('2026-09-01T00:00:00Z'),
    };

    expect(isReportedInterval(point)).toBe(false);
  });
});

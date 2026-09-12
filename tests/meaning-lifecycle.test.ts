/**
 * Phase 6 tests — meaning lifecycle (§24, §25, INV-18).
 *
 * §25's two load-bearing rules:
 *   > The earlier meaning is RETAINED: historically, the user did understand it
 *     that way.
 *   > Revising a meaning must NOT set workflow_state = suspended or
 *     presentation_state = archived.
 *
 * The second is the one most easily broken by a convenient implementation, so
 * it is asserted structurally as well as behaviourally.
 */

import { describe, expect, it } from 'vitest';

import {
  REVISION_CHANGES_PRESENTATION,
  isSettled,
  meaningInForceAt,
  planRevision,
} from '@/domain/reflection/meaning-lifecycle';
import * as lifecycleModule from '@/domain/reflection/meaning-lifecycle';
import type { UserReflectionRecord } from '@/domain/reflection/user-reflection-record';
import { MEANING_COMMITMENTS } from '@/domain/shared/enums';
import {
  recordId,
  reflectionEpisodeId,
  userReflectionRecordId,
} from '@/domain/shared/ids';

const T0 = new Date('2026-09-01T00:00:00Z');
const T1 = new Date('2026-09-10T00:00:00Z');
const T2 = new Date('2026-09-20T00:00:00Z');

const meaning = (
  over: Partial<UserReflectionRecord> = {},
): UserReflectionRecord => ({
  id: userReflectionRecordId('urr-1'),
  recordId: recordId('rec-1'),
  meaningCommitment: 'tentative',
  validAtTime: { semantic: 'observation_time', at: T0 },
  currentEffect: 'current',
  supersededByRef: null,
  supersededAt: null,
  episodeRef: reflectionEpisodeId('ep-1'),
  createdAt: T0,
  ...over,
});

const revise = () =>
  planRevision({
    earlier: meaning(),
    laterId: userReflectionRecordId('urr-2'),
    laterRecordId: recordId('rec-2'),
    validAtTime: { semantic: 'observation_time', at: T1 },
    episodeRef: reflectionEpisodeId('ep-2'),
    at: T1,
  });

describe('§25 — supersession retains the earlier meaning', () => {
  it('marks the earlier meaning superseded rather than deleting it', () => {
    const { superseded } = revise();

    expect(superseded.currentEffect).toBe('superseded');
    expect(superseded.id).toBe('urr-1');
  });

  it('points the earlier meaning at its replacement', () => {
    const { superseded } = revise();

    expect(superseded.supersededByRef).toBe('urr-2');
    expect(superseded.supersededAt).toEqual(T1);
  });

  it('makes the later meaning current', () => {
    const { current } = revise();

    expect(current.currentEffect).toBe('current');
    expect(current.supersededByRef).toBeNull();
    expect(current.supersededAt).toBeNull();
  });

  it('preserves the earlier meaning content unchanged', () => {
    // The user did historically understand it that way; the content is history,
    // not a mistake to correct.
    const earlier = meaning();
    const { superseded } = revise();

    expect(superseded.recordId).toBe(earlier.recordId);
    expect(superseded.validAtTime).toEqual(earlier.validAtTime);
    expect(superseded.createdAt).toEqual(earlier.createdAt);
  });

  it('does not mutate the input record', () => {
    const earlier = meaning();
    planRevision({
      earlier,
      laterId: userReflectionRecordId('urr-2'),
      laterRecordId: recordId('rec-2'),
      validAtTime: { semantic: 'observation_time', at: T1 },
      episodeRef: reflectionEpisodeId('ep-2'),
      at: T1,
    });

    expect(earlier.currentEffect).toBe('current');
    expect(earlier.supersededByRef).toBeNull();
  });

  it('returns both records for the caller to persist', () => {
    const revision = revise();

    expect(Object.keys(revision).sort()).toEqual(
      ['current', 'reasons', 'superseded'].sort(),
    );
  });
});

describe('§25 — a revision must not suspend or archive', () => {
  it('declares it changes no presentation state', () => {
    expect(REVISION_CHANGES_PRESENTATION).toBe(false);
  });

  it('returns no workflow or presentation field at all', () => {
    // Structural: a caller cannot apply a suspension from a revision, because
    // the type has no field carrying one.
    const revision = revise();

    for (const field of [
      'workflowState',
      'presentationState',
      'suspended',
      'archived',
    ]) {
      expect(revision).not.toHaveProperty(field);
      expect(revision.current).not.toHaveProperty(field);
      expect(revision.superseded).not.toHaveProperty(field);
    }
  });

  it('says so in its reasons', () => {
    expect(revise().reasons.join(' ')).toContain(
      'not suspending or archiving',
    );
  });

  it('exports no function that suspends or archives', () => {
    const forbidden = Object.keys(lifecycleModule).filter((n) =>
      /suspend|archive|hide|suppress/i.test(n),
    );

    expect(forbidden).toEqual([]);
  });
});

describe('§24 — commitment stays tentative in MVP', () => {
  it('creates the revision as tentative', () => {
    expect(revise().current.meaningCommitment).toBe('tentative');
  });

  it('does not treat changing one’s mind as greater certainty', () => {
    const { current, superseded } = revise();

    expect(current.meaningCommitment).toBe(superseded.meaningCommitment);
  });

  it('reports nothing as settled in MVP', () => {
    // `confirmed` is frozen out, so every stored meaning is tentative.
    expect(isSettled('tentative')).toBe(false);
  });

  it('retains confirmed in the enum without producing it', () => {
    // The contract names it (§24), so the value stays; MVP never writes it.
    expect([...MEANING_COMMITMENTS]).toContain('confirmed');
    expect(isSettled('confirmed')).toBe(true);
  });
});

describe('§25 — meaning is time-indexed', () => {
  const history = (): readonly UserReflectionRecord[] => [
    meaning({ id: userReflectionRecordId('urr-1'), createdAt: T0 }),
    meaning({ id: userReflectionRecordId('urr-2'), createdAt: T1 }),
    meaning({ id: userReflectionRecordId('urr-3'), createdAt: T2 }),
  ];

  it('returns null before any meaning was expressed', () => {
    expect(
      meaningInForceAt(history(), new Date('2026-08-01T00:00:00Z')),
    ).toBeNull();
  });

  it('returns the only meaning when one exists', () => {
    expect(meaningInForceAt(history(), T0)?.id).toBe('urr-1');
  });

  it('returns the newest meaning at or before the asked time', () => {
    expect(meaningInForceAt(history(), T1)?.id).toBe('urr-2');
    expect(meaningInForceAt(history(), T2)?.id).toBe('urr-3');
  });

  it('does not return a meaning from the future', () => {
    const between = new Date('2026-09-15T00:00:00Z');

    expect(meaningInForceAt(history(), between)?.id).toBe('urr-2');
  });

  it('includes a meaning expressed exactly at the asked time', () => {
    expect(meaningInForceAt(history(), T1)?.id).toBe('urr-2');
  });

  it('returns null for an empty history', () => {
    expect(meaningInForceAt([], T1)).toBeNull();
  });

  it('does not mutate the history', () => {
    const h = history();
    const order = h.map((r) => r.id);

    meaningInForceAt(h, T2);
    expect(h.map((r) => r.id)).toEqual(order);
  });

  it('reads expression order, not the period the meaning is about', () => {
    // A user may today revise their understanding of last year, so "which
    // meaning was in force" is a question about when it was expressed.
    const revisedToday = meaning({
      id: userReflectionRecordId('urr-late'),
      createdAt: T2,
      validAtTime: { semantic: 'observation_time', at: T0 },
    });

    expect(meaningInForceAt([revisedToday], T2)?.id).toBe('urr-late');
    expect(meaningInForceAt([revisedToday], T1)).toBeNull();
  });
});

describe('purity', () => {
  it('is deterministic', () => {
    expect(revise()).toEqual(revise());
  });
});

/**
 * Foundation invariant tests — meaning ownership separation.
 *
 * Covers:
 *   INV-18 — the user owns personal meaning.
 *   INV-13 — tentative self-interpretation stays tentative even when spontaneous.
 *   INV-12 — meaning revision preserves historical meaning.
 *   ENGINEERING_CONTRACT §22, §23, §24, §25; docs/architecture.md §4 (Patch 3, Patch 4).
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_AUTOMATIC_FOLLOWUPS,
  type ReflectionEpisode,
  isPromptContaminationSusceptible,
  unknownProvenance,
} from '@/domain/reflection/reflection-episode';
import {
  type UserReflectionRecord,
  isCurrent,
  isUserConfirmedMeaning,
  supersede,
} from '@/domain/reflection/user-reflection-record';
import { MEANING_COMMITMENTS } from '@/domain/shared/enums';
import {
  recordId,
  reflectionEpisodeId,
  userReflectionRecordId,
} from '@/domain/shared/ids';

const episode = (over: Partial<ReflectionEpisode> = {}): ReflectionEpisode => ({
  id: reflectionEpisodeId('ep-1'),
  elicitationMode: 'prompted',
  stimulusType: 'hypothesis',
  systemFollowupCount: 0,
  stimulusRef: null,
  targetRef: null,
  occurredAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

const reflection = (
  over: Partial<UserReflectionRecord> = {},
): UserReflectionRecord => ({
  id: userReflectionRecordId('urr-1'),
  recordId: recordId('r-1'),
  meaningCommitment: 'tentative',
  validAtTime: { semantic: 'event_time', at: new Date('2026-01-01T00:00:00Z') },
  currentEffect: 'current',
  supersededByRef: null,
  supersededAt: null,
  episodeRef: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('INV-18 / Patch 4 — ReflectionEpisode owns no meaning', () => {
  it('exposes no meaning-commitment field on an episode', () => {
    const e = episode();

    // Structural assertion: the episode carries elicitation mechanics only.
    expect(Object.keys(e).sort()).toEqual(
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
    expect('meaningCommitment' in e).toBe(false);
  });

  it('keeps meaning exclusively on UserReflectionRecord', () => {
    const r = reflection();

    expect('meaningCommitment' in r).toBe(true);
    expect(MEANING_COMMITMENTS).toContain(r.meaningCommitment);
  });
});

describe('INV-13 / §24 — spontaneity and certainty are orthogonal', () => {
  it('lets a spontaneous reflection remain tentative', () => {
    // "我可能只是害怕开始以后发现自己做不好。" (§24 worked example)
    const e = episode({ elicitationMode: 'spontaneous', stimulusType: 'none' });
    const r = reflection({ meaningCommitment: 'tentative', episodeRef: e.id });

    expect(e.elicitationMode).toBe('spontaneous');
    // Spontaneous, yet NOT confirmed.
    expect(r.meaningCommitment).toBe('tentative');
    expect(isUserConfirmedMeaning(r)).toBe(false);
  });

  it('admits all four mode x commitment combinations', () => {
    const combos = (['spontaneous', 'prompted'] as const).flatMap((mode) =>
      MEANING_COMMITMENTS.map((commitment) => {
        const e = episode({ elicitationMode: mode });
        const r = reflection({ meaningCommitment: commitment });
        return `${e.elicitationMode}|${r.meaningCommitment}`;
      }),
    );

    expect(new Set(combos).size).toBe(4);
  });

  it('treats elicitationMode and stimulusType as independent axes', () => {
    const e = episode({ elicitationMode: 'spontaneous', stimulusType: 'none' });
    expect(e.elicitationMode).toBe('spontaneous');
    expect(e.stimulusType).toBe('none');
  });

  it('records unknown provenance rather than fabricating it', () => {
    // §22: do NOT fabricate provenance when it is unknown.
    expect(unknownProvenance()).toEqual({
      elicitationMode: 'unknown',
      stimulusType: 'unknown',
    });
  });
});

describe('INV-12 / §25 — revision preserves history', () => {
  it('marks the earlier meaning superseded without deleting it', () => {
    const earlier = reflection({ id: userReflectionRecordId('urr-1') });
    const laterId = userReflectionRecordId('urr-2');
    const at = new Date('2026-06-01T00:00:00Z');

    const updated = supersede(earlier, laterId, at);

    // Still present, still carrying its original commitment and time.
    expect(updated.id).toBe(earlier.id);
    expect(updated.meaningCommitment).toBe(earlier.meaningCommitment);
    expect(updated.validAtTime).toEqual(earlier.validAtTime);

    // Now flagged as superseded, with a traceable pointer.
    expect(updated.currentEffect).toBe('superseded');
    expect(updated.supersededByRef).toBe(laterId);
    expect(updated.supersededAt).toBe(at);
    expect(isCurrent(updated)).toBe(false);
  });

  it('does not express revision through workflow or presentation state', () => {
    const updated = supersede(
      reflection(),
      userReflectionRecordId('urr-2'),
      new Date('2026-06-01T00:00:00Z'),
    );

    // §25 forbids abusing suspended/archived for meaning revision. Neither
    // field exists on this entity at all.
    expect('workflowState' in updated).toBe(false);
    expect('presentationState' in updated).toBe(false);
  });
});

describe('§23 / INV-03 — follow-up cap and prompt contamination', () => {
  it('caps automatic follow-ups at one', () => {
    expect(MAX_AUTOMATIC_FOLLOWUPS).toBe(1);
  });

  it('flags susceptibility past the cap without user continuation', () => {
    expect(isPromptContaminationSusceptible({ systemFollowupCount: 2 }, false)).toBe(true);
    expect(isPromptContaminationSusceptible({ systemFollowupCount: 1 }, false)).toBe(false);
  });

  it('does not flag when the user actively continued', () => {
    // §23: user-initiated continuation does not count as automatic follow-up.
    expect(isPromptContaminationSusceptible({ systemFollowupCount: 5 }, true)).toBe(false);
  });
});

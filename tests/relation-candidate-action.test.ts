import { beforeEach, describe, expect, it, vi } from 'vitest';

const { revalidatePath, respondToRelationCandidate, submitAIObservationReflection } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  respondToRelationCandidate: vi.fn(),
  submitAIObservationReflection: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/server/capture-composition-root', () => ({
  getCoreComposition: async () => ({ mode: 'core-memory' }),
}));
vi.mock('@/server/ai-core-experience', () => ({ respondToRelationCandidate, submitAIObservationReflection }));

import {
  submitAIObservationMeaning,
  submitRelationCandidateDecision,
} from '../src/app/actions/relation-candidates';

const form = (decision: string): FormData => {
  const data = new FormData();
  data.set('candidateId', 'candidate_1');
  data.set('decision', decision);
  return data;
};

const meaningForm = (meaning: string, reflectionText = ''): FormData => {
  const data = new FormData();
  data.set('candidateId', 'candidate_1');
  data.set('meaning', meaning);
  data.set('reflectionText', reflectionText);
  return data;
};

describe('Relation candidate Server Action', () => {
  beforeEach(() => {
    revalidatePath.mockReset();
    respondToRelationCandidate.mockReset();
    submitAIObservationReflection.mockReset();
  });

  it('routes a user decision through the application orchestrator', async () => {
    respondToRelationCandidate.mockResolvedValue({
      status: 'discovery',
      message: 'ready',
      targetRef: 'rc_1',
      discoveryId: 'disc_1',
    });

    const result = await submitRelationCandidateDecision(
      { status: 'idle' },
      form('worth_reviewing'),
    );

    expect(result).toMatchObject({ status: 'discovery', targetRef: 'rc_1' });
    expect(respondToRelationCandidate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        candidateId: 'candidate_1',
        decision: 'worth_reviewing',
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/reflection');
  });

  it('rejects unknown decisions before Core is called', async () => {
    const result = await submitRelationCandidateDecision(
      { status: 'idle' },
      form('accept_as_fact'),
    );

    expect(result.status).toBe('unavailable');
    expect(respondToRelationCandidate).not.toHaveBeenCalled();
  });

  it.each(['uncertain', 'not_applicable', 'later'])(
    'accepts the transient user decision %s',
    async (decision) => {
      respondToRelationCandidate.mockResolvedValue({
        status: decision === 'later' ? 'later' : decision === 'not_applicable' ? 'not_applicable' : 'uncertain',
        message: 'no persistence',
      });

      const result = await submitRelationCandidateDecision(
        { status: 'idle' },
        form(decision),
      );

      expect(result.status).toBe(decision);
      expect(respondToRelationCandidate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ decision }),
      );
    },
  );

  it('does not invoke Core for a quick choice without user words', async () => {
    const result = await submitAIObservationMeaning(
      { status: 'idle' },
      meaningForm('connected'),
    );

    expect(result.status).toBe('reflection_required');
    expect(submitAIObservationReflection).not.toHaveBeenCalled();
  });

  it('discards an observation when it is not the user experience', async () => {
    submitAIObservationReflection.mockResolvedValue({
      status: 'discarded',
      message: 'discarded',
    });

    const result = await submitAIObservationMeaning(
      { status: 'idle' },
      meaningForm('not_my_experience'),
    );

    expect(result.status).toBe('discarded');
    expect(submitAIObservationReflection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ candidateId: 'candidate_1', meaning: 'not_my_experience' }),
    );
  });

  it('passes free-text meaning to the existing reflection flow', async () => {
    submitAIObservationReflection.mockResolvedValue({
      status: 'discovery',
      message: 'saved',
      targetRef: 'rc_1',
      discoveryId: 'disc_1',
    });

    const result = await submitAIObservationMeaning(
      { status: 'idle' },
      meaningForm('different_understanding', '我的理解与观察不同。'),
    );

    expect(result).toMatchObject({ status: 'discovery', targetRef: 'rc_1' });
    expect(submitAIObservationReflection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        candidateId: 'candidate_1',
        meaning: 'different_understanding',
        reflectionText: '我的理解与观察不同。',
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/reflection');
  });
});

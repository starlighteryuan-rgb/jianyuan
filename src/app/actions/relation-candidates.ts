'use server';

import { revalidatePath } from 'next/cache';

import {
  respondToRelationCandidate,
  submitAIObservationReflection,
  type CandidateDecision,
  type CandidateDecisionResult,
  type ObservationMeaning,
} from '@/server/ai-core-experience';
import { getCoreComposition } from '@/server/capture-composition-root';

const DECISIONS: readonly CandidateDecision[] = [
  'worth_reviewing',
  'uncertain',
  'not_applicable',
  'later',
  'ignore',
];

const isDecision = (value: unknown): value is CandidateDecision =>
  typeof value === 'string' && DECISIONS.includes(value as CandidateDecision);

const MEANINGS: readonly ObservationMeaning[] = [
  'connected',
  'different_understanding',
  'not_my_experience',
];

const isMeaning = (value: unknown): value is ObservationMeaning =>
  typeof value === 'string' && MEANINGS.includes(value as ObservationMeaning);

export async function submitRelationCandidateDecision(
  _previousState: CandidateDecisionResult,
  formData: FormData,
): Promise<CandidateDecisionResult> {
  const candidateId = formData.get('candidateId');
  const decision = formData.get('decision');

  if (
    typeof candidateId !== 'string' ||
    candidateId.length === 0 ||
    !isDecision(decision)
  ) {
    return {
      status: 'unavailable',
      message: '无法识别这次回看操作；没有写入任何长期联系。',
    };
  }

  try {
    const result = await respondToRelationCandidate(
      await getCoreComposition(),
      { candidateId, decision, now: new Date() },
    );

    if (result.status === 'discovery') {
      revalidatePath('/');
      revalidatePath('/records');
      revalidatePath('/awareness');
      revalidatePath('/understanding');
      revalidatePath('/exploration');
      revalidatePath('/reflection');
      revalidatePath(`/reflect/${encodeURIComponent(result.targetRef)}`);
    }

    return result;
  } catch {
    return {
      status: 'unavailable',
      message: '这次观察暂时无法处理；已保存的记录不受影响。',
    };
  }
}

/**
 * User meaning-making action. The quick choice is not an approval; only the
 * user's free text can move the transient Observation to Core evaluation.
 */
export async function submitAIObservationMeaning(
  _previousState: CandidateDecisionResult,
  formData: FormData,
): Promise<CandidateDecisionResult> {
  const candidateId = formData.get('candidateId');
  const meaning = formData.get('meaning');
  const reflectionText = formData.get('reflectionText');

  if (
    typeof candidateId !== 'string' ||
    candidateId.length === 0 ||
    !isMeaning(meaning)
  ) {
    return {
      status: 'unavailable',
      message: '无法识别这次理解；临时观察没有写入任何长期联系。',
    };
  }

  // The "not my experience" path intentionally allows empty text: it is a
  // disposable dismissal, not a reflection or a Core request.
  if (
    meaning !== 'not_my_experience' &&
    (typeof reflectionText !== 'string' || reflectionText.trim().length === 0)
  ) {
    return {
      status: 'reflection_required',
      message: '请先写下你的理解；快捷选择本身不会形成长期联系。',
    };
  }

  try {
    const result = await submitAIObservationReflection(
      await getCoreComposition(),
      {
        candidateId,
        meaning,
        ...(typeof reflectionText === 'string' ? { reflectionText } : {}),
        now: new Date(),
      },
    );

    if (result.status === 'discovery') {
      revalidatePath('/');
      revalidatePath('/records');
      revalidatePath('/awareness');
      revalidatePath('/understanding');
      revalidatePath('/exploration');
      revalidatePath('/reflection');
      revalidatePath(`/reflect/${encodeURIComponent(result.targetRef)}`);
    }
    return result;
  } catch {
    return {
      status: 'unavailable',
      message: '这次理解没有完成；临时观察没有被当作关系保存。',
    };
  }
}

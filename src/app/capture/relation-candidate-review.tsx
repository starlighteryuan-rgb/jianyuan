'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import {
  submitAIObservationMeaning,
} from '../actions/relation-candidates';
import type {
  CandidateDecisionResult,
  RelationCandidateView,
} from '@/server/ai-core-experience';

const INITIAL_STATE: CandidateDecisionResult = { status: 'idle' };

const recordTime = (createdAt: string): string =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createdAt));

export function RelationCandidateReview({
  candidate,
}: {
  readonly candidate: RelationCandidateView;
}) {
  const [state, action, isPending] = useActionState(
    submitAIObservationMeaning,
    INITIAL_STATE,
  );
  const handled =
    state.status !== 'idle' &&
    state.status !== 'unavailable' &&
    state.status !== 'reflection_required';

  return (
    <article className="ai-candidate" aria-busy={isPending}>
      <div className="ai-candidate-head">
        <span>AI 观察到的一种可能联系</span>
        <span>{candidate.dimension}</span>
      </div>
      <p className="hint">这只是一次临时观察；是否对你有意义，由你的理解决定。</p>

      <section className="ai-observation-copy">
        <h3>AI 注意到</h3>
        <p>{candidate.observation}</p>
      </section>

      <section className="ai-observation-copy">
        <h3>相关记录</h3>
        <div className="ai-candidate-records">
          {candidate.referencedRecords.map((record) => (
            <blockquote key={record.id}>
              <span>
                {record.id === candidate.currentRecord.id ? '刚刚保存' : '相关记录'}{' '}
                · {recordTime(record.createdAt)}
              </span>
              <p>{record.verbatim}</p>
            </blockquote>
          ))}
        </div>
        <p className="hint">
          这些记录只是 AI 观察时参考的信息，不代表已经形成事实关系。
        </p>
      </section>

      <section className="ai-observation-copy">
        <h3>一种可能解释</h3>
        <p>{candidate.possibleExplanation}</p>
        <p className="hint">但也可能存在其他解释。</p>
      </section>

      <section className="ai-observation-copy">
        <h3>AI 也不确定</h3>
        <p>{candidate.uncertainty}</p>
      </section>

      <section className="ai-observation-copy">
        <h3>一个可以继续思考的问题</h3>
        <blockquote>{candidate.reflectionQuestion}</blockquote>
      </section>

      {handled ? null : (
        <form action={action}>
          <input type="hidden" name="candidateId" value={candidate.candidateId} />
          <fieldset className="user-reflection-input" disabled={isPending}>
            <legend>你的理解</legend>
            <p>这个观察与你的体验接近吗？快捷选择不是对 AI 的批准。</p>
            <label>
              <input type="radio" name="meaning" value="connected" required />
              这和我的经历有联系
            </label>
            <label>
              <input type="radio" name="meaning" value="different_understanding" />
              有一点关联，但我的理解不同
            </label>
            <label>
              <input type="radio" name="meaning" value="not_my_experience" />
              这不是我的体验
            </label>
            <label htmlFor={`reflection-${candidate.candidateId}`}>
              写下你自己的理解
            </label>
            <textarea
              id={`reflection-${candidate.candidateId}`}
              name="reflectionText"
              placeholder="只有你的话会成为我的理解。"
            />
            <p className="hint">
              选择“这不是我的体验”可以直接结束；其它选择需要先写下一句话，才会交给 Core 继续评估。
            </p>
            <button className="primary" type="submit">
              {isPending ? '正在保存你的理解……' : '提交我的理解'}
            </button>
          </fieldset>
        </form>
      )}

      {state.status === 'idle' ? null : (
        <div className="notice" role="status">
          <p>{state.message}</p>
          {state.status === 'discovery' ? (
            <Link href={`/reflect/${encodeURIComponent(state.targetRef)}`}>
              继续查看这条联系
            </Link>
          ) : null}
        </div>
      )}
    </article>
  );
}

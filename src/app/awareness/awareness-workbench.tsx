'use client';

import { useState } from 'react';

import { loadRelationCandidates } from '../actions/capture';
import type { RelationSuggestionExperience } from '@/server/ai-core-experience';
import { RelationCandidateReview } from '../capture/relation-candidate-review';

export interface AwarenessRecordOption {
  readonly id: string;
  readonly verbatim: string;
  readonly createdAt: string;
}

export function AwarenessWorkbench({
  records,
}: {
  readonly records: readonly AwarenessRecordOption[];
}) {
  const [selectedRecordId, setSelectedRecordId] = useState(records[0]?.id ?? '');
  const [experience, setExperience] = useState<RelationSuggestionExperience | null>(null);
  const [isPending, setIsPending] = useState(false);

  const requestObservation = async () => {
    if (selectedRecordId.length === 0 || isPending) return;
    setIsPending(true);
    setExperience(null);
    try {
      setExperience(await loadRelationCandidates(selectedRecordId));
    } catch {
      setExperience({
        status: 'unavailable',
        message: 'AI 回看暂时不可用；你的记录不受影响。',
        candidates: [],
      });
    } finally {
      setIsPending(false);
    }
  };

  if (records.length === 0) {
    return (
      <div className="notice home-empty-state">
        <strong>还没有记录可以回看。</strong>
        <p>先在记录空间留下至少两条经历，再主动回来看看有没有值得观察的联系。</p>
        <a className="action-link" href="/records">
          去记录 <span aria-hidden="true">→</span>
        </a>
      </div>
    );
  }

  return (
    <div className="awareness-workspace">
      <div className="awareness-request">
        <label htmlFor="awareness-record">从哪条记录开始回看？</label>
        <select
          id="awareness-record"
          value={selectedRecordId}
          onChange={(event) => {
            setSelectedRecordId(event.target.value);
            setExperience(null);
          }}
        >
          {records.map((record) => (
            <option key={record.id} value={record.id}>
              {record.verbatim.slice(0, 80)}
            </option>
          ))}
        </select>
        <p className="hint">只有在你主动请求后，AI 才会参考这条记录和少量历史上下文。</p>
        <button
          className="primary"
          type="button"
          onClick={() => void requestObservation()}
          disabled={isPending}
        >
          {isPending ? '正在回看……' : '开始一次觉察'}
        </button>
      </div>

      {experience === null ? null : (
        <div className="awareness-result">
          <p className="notice-copy" role="status" aria-live="polite">{experience.message}</p>
          {experience.status === 'candidates'
            ? experience.candidates.map((candidate) => (
                <RelationCandidateReview
                  key={candidate.candidateId}
                  candidate={candidate}
                />
              ))
            : null}
        </div>
      )}
    </div>
  );
}

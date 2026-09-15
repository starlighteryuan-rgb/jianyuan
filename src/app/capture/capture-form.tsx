'use client';

import {
  startTransition,
  type FormEvent,
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  submitCapture,
  type CaptureActionState,
} from '../actions/capture';

const INITIAL_STATE: CaptureActionState = { status: 'idle' };

interface SubmissionEnvelope {
  readonly submissionId: string;
  readonly submittedAt: string;
}

const createSubmissionEnvelope = (): SubmissionEnvelope => ({
  submissionId: globalThis.crypto.randomUUID(),
  submittedAt: new Date().toISOString(),
});

const resultMessage = (state: CaptureActionState): string | null => {
  if (state.status === 'idle') return null;

  if (state.status === 'success') {
    return state.deduplicated
      ? `这条内容已经保存，沿用原记录 ${state.recordId}。`
      : `已保存记录 ${state.recordId}。`;
  }

  switch (state.code) {
    case 'empty_input':
    case 'invalid_input':
      return `输入有误：${state.message}`;
    case 'directive_refused':
      return `未保存：${state.message}`;
    case 'storage_failed':
      return `存储失败：${state.message}`;
    case 'ingestion_refused':
      return `未保存：${state.message}`;
  }
};

/**
 * Capture input bound to the existing Server Action.
 *
 * This form owns presentation state only. It sends the user's verbatim text to
 * `submitCapture`; the action and IngestionService own every validation,
 * permission, identity, and persistence decision.
 *
 * AI observation is intentionally not part of this form. A saved Record stays
 * in the Record space; users explicitly enter Awareness when they want a
 * separate observation request.
 */
export function CaptureForm() {
  const [verbatim, setVerbatim] = useState('');
  const [showResult, setShowResult] = useState(false);
  const envelopeRef = useRef<SubmissionEnvelope | null>(null);
  const submittedVerbatimRef = useRef<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    submitCapture,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === 'idle') return;

    setShowResult(true);
    if (state.status === 'success') {
      setVerbatim('');
      envelopeRef.current = null;
      submittedVerbatimRef.current = null;
    }
  }, [state]);

  const message = showResult ? resultMessage(state) : null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isPending || verbatim.trim().length === 0) return;

    let envelope = envelopeRef.current;

    // A retry with unchanged text reuses the same envelope. Editing the text
    // starts a new logical submission and therefore receives a new identity.
    if (envelope === null || submittedVerbatimRef.current !== verbatim) {
      envelope = createSubmissionEnvelope();
      envelopeRef.current = envelope;
      submittedVerbatimRef.current = verbatim;
    }

    const formData = new FormData(event.currentTarget);
    formData.set('submissionId', envelope.submissionId);
    formData.set('submittedAt', envelope.submittedAt);

    startTransition(() => formAction(formData));
  };

  return (
    <>
      <form onSubmit={handleSubmit} aria-busy={isPending}>
        <fieldset disabled={isPending}>
          <legend>你的原话</legend>

          <label htmlFor="capture-verbatim">
            你想为以后留下什么？
          </label>
          <textarea
            id="capture-verbatim"
            name="verbatim"
            value={verbatim}
            onChange={(event) => {
              setVerbatim(event.target.value);
              setShowResult(false);
            }}
            placeholder="写下你想保留的原话……"
          />

          {isPending ? (
            <p className="hint" role="status">
              正在保存……
            </p>
          ) : message === null ? (
            <p className="hint">
              {verbatim.trim().length === 0
                ? '还没有输入内容。'
                : '提交后会按原样保存这条记录。'}
            </p>
          ) : (
            <div
              className="notice"
              role={state.status === 'error' ? 'alert' : 'status'}
            >
              {message}
            </div>
          )}

          <div className="button-row">
            <button
              className="primary"
              type="submit"
              disabled={isPending || verbatim.trim().length === 0}
            >
              {isPending ? '正在保存……' : '保存记录'}
            </button>
          </div>
        </fieldset>
      </form>

    </>
  );
}

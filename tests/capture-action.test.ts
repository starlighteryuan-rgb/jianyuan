import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ingest, revalidatePath, suggestRelationsAfterCapture } = vi.hoisted(() => ({
  ingest: vi.fn(),
  revalidatePath: vi.fn(),
  suggestRelationsAfterCapture: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));

vi.mock('@/server/capture-composition-root', () => ({
  getCoreComposition: async () => ({
    mode: 'core-memory',
    ingestion: { ingest },
  }),
}));

vi.mock('@/server/ai-core-experience', () => ({
  suggestRelationsAfterCapture,
}));

import {
  submitCapture,
  loadRelationCandidates,
  type CaptureActionState,
} from '../src/app/actions/capture';

const IDLE: CaptureActionState = { status: 'idle' };
const SUBMISSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const SUBMITTED_AT = '2026-09-13T00:00:00.000Z';

const captureForm = (
  verbatim = '我可能只是还没准备好。',
): FormData => {
  const form = new FormData();
  form.set('verbatim', verbatim);
  form.set('submissionId', SUBMISSION_ID);
  form.set('submittedAt', SUBMITTED_AT);
  return form;
};

describe('Capture Server Action submission identity', () => {
  beforeEach(() => {
    ingest.mockReset();
    revalidatePath.mockReset();
    ingest.mockResolvedValue({
      ok: true,
      value: {
        recordId: 'rec_capture',
        deduplicated: false,
        rolesAdded: ['user_expression'],
      },
    });
    suggestRelationsAfterCapture.mockResolvedValue({
      status: 'not_enough_context',
      message: 'Record 已保存。至少有两条可用记录后，AI 才会提出联系候选。',
      candidates: [],
    });
  });

  it('returns the created Record result after successful ingestion', async () => {
    const result = await submitCapture(IDLE, captureForm());

    expect(result).toEqual({
      status: 'success',
      recordId: 'rec_capture',
      created: true,
      deduplicated: false,
      rolesAdded: ['user_expression'],
    });
    expect(revalidatePath.mock.calls).toEqual([["/"], ["/records"], ["/history"]]);
  });

  it('confirms the Record without waiting on the AI suggestion', async () => {
    // The save action returns as soon as persistence is confirmed. Awaiting
    // the provider here would lock the form for the whole round trip, so a
    // slow provider would block the user's basic recording ability.
    const result = await submitCapture(IDLE, captureForm());

    expect(result.status).toBe('success');
    expect(result).not.toHaveProperty('aiRelation');
    expect(suggestRelationsAfterCapture).not.toHaveBeenCalled();
  });

  it('returns the existing Record when the same envelope is retried', async () => {
    ingest
      .mockResolvedValueOnce({
        ok: true,
        value: {
          recordId: 'rec_capture',
          deduplicated: false,
          rolesAdded: ['user_expression'],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          recordId: 'rec_capture',
          deduplicated: true,
          rolesAdded: [],
        },
      });

    const created = await submitCapture(IDLE, captureForm());
    const retried = await submitCapture(IDLE, captureForm());

    expect(created).toMatchObject({
      status: 'success',
      recordId: 'rec_capture',
      created: true,
      deduplicated: false,
    });
    expect(retried).toEqual({
      status: 'success',
      recordId: 'rec_capture',
      created: false,
      deduplicated: true,
      rolesAdded: [],
    });
  });

  it('passes the same source identity and capture time on a retry', async () => {
    await submitCapture(IDLE, captureForm());
    await submitCapture(IDLE, captureForm());

    const first = ingest.mock.calls[0]?.[0];
    const retry = ingest.mock.calls[1]?.[0];

    expect(first.sourceRef).toBe(`capture-ui:${SUBMISSION_ID}`);
    expect(retry.sourceRef).toBe(first.sourceRef);
    expect(first.time).toEqual({
      semantic: 'capture_time',
      at: new Date(SUBMITTED_AT),
    });
    expect(retry.time).toEqual(first.time);
    expect(retry.verbatim).toBe(first.verbatim);
  });

  it('rejects a missing submission envelope before ingestion', async () => {
    const form = new FormData();
    form.set('verbatim', '有内容，但没有提交身份。');

    const result = await submitCapture(IDLE, form);

    expect(result).toEqual({
      status: 'error',
      code: 'invalid_input',
      message: '记录提交身份无效。',
    });
    expect(ingest).not.toHaveBeenCalled();
  });

  it('rejects empty input before ingestion', async () => {
    const result = await submitCapture(IDLE, captureForm('   \n\t'));

    expect(result).toEqual({
      status: 'error',
      code: 'empty_input',
      message: '请先写下一点内容。',
    });
    expect(ingest).not.toHaveBeenCalled();
  });

  it('reports a Directive storage refusal without claiming success', async () => {
    ingest.mockResolvedValueOnce({
      ok: false,
      error: {
        kind: 'storage_not_permitted',
        appliedDirectiveIds: ['dir_no_storage'],
      },
    });

    const result = await submitCapture(IDLE, captureForm());

    expect(result).toEqual({
      status: 'error',
      code: 'directive_refused',
      message: '当前使用规则不允许保存这条记录。',
    });
  });

  it('reports a storage failure without claiming that a Record was saved', async () => {
    ingest.mockRejectedValueOnce(new Error('database unavailable'));

    const result = await submitCapture(IDLE, captureForm());

    expect(result).toEqual({
      status: 'error',
      code: 'storage_failed',
      message: '本地数据暂时不可用，尚未确认保存成功。',
    });
  });
});

describe('post-save AI relation suggestion action', () => {
  beforeEach(() => {
    ingest.mockReset();
    revalidatePath.mockReset();
    suggestRelationsAfterCapture.mockReset();
    suggestRelationsAfterCapture.mockResolvedValue({
      status: 'not_enough_context',
      message: 'Record 已保存。至少有两条可用记录后，AI 才会提出联系候选。',
      candidates: [],
    });
  });

  it('forwards the confirmed Record id to the orchestrator', async () => {
    const result = await loadRelationCandidates('rec_capture');

    expect(result).toMatchObject({
      status: 'not_enough_context',
      candidates: [],
    });
    expect(suggestRelationsAfterCapture).toHaveBeenCalledWith(
      expect.anything(),
      'rec_capture',
    );
  });

  it('degrades to an explanation instead of throwing when the provider fails', async () => {
    // A provider failure must reach the user as degraded mode, never as an
    // exception that would make an already-saved Record look unsaved.
    suggestRelationsAfterCapture.mockRejectedValueOnce(
      new Error('provider unavailable'),
    );

    await expect(loadRelationCandidates('rec_capture')).resolves.toEqual({
      status: 'unavailable',
      message: '记录已保存，但 AI 回看暂时不可用。',
      candidates: [],
    });
  });

  it('refuses an unusable Record id without calling the provider', async () => {
    const result = await loadRelationCandidates('');

    expect(result.status).toBe('unavailable');
    expect(suggestRelationsAfterCapture).not.toHaveBeenCalled();
  });
});

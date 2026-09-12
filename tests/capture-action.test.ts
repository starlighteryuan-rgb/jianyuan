import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ingest } = vi.hoisted(() => ({ ingest: vi.fn() }));

vi.mock('@/server/container', () => ({
  getServices: () => ({ ingestion: { ingest } }),
}));

import {
  submitCapture,
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
    ingest.mockResolvedValue({
      ok: true,
      value: {
        recordId: 'rec_capture',
        deduplicated: false,
        rolesAdded: ['user_expression'],
      },
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
      message: 'Capture submission identity is invalid.',
    });
    expect(ingest).not.toHaveBeenCalled();
  });

  it('rejects empty input before ingestion', async () => {
    const result = await submitCapture(IDLE, captureForm('   \n\t'));

    expect(result).toEqual({
      status: 'error',
      code: 'empty_input',
      message: 'Enter something before capturing it.',
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
      message: 'An active directive does not permit this capture to be stored.',
    });
  });

  it('reports a storage failure without claiming that a Record was saved', async () => {
    ingest.mockRejectedValueOnce(new Error('database unavailable'));

    const result = await submitCapture(IDLE, captureForm());

    expect(result).toEqual({
      status: 'error',
      code: 'storage_failed',
      message: 'Storage is unavailable. Nothing was confirmed as saved.',
    });
  });
});

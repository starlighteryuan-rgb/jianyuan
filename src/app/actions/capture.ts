'use server';

import { revalidatePath } from 'next/cache';

import {
  suggestRelationsAfterCapture,
  type RelationSuggestionExperience,
} from '@/server/ai-core-experience';
import { getCoreComposition } from '@/server/capture-composition-root';
import { executeCapture } from '@/server/capture-use-case';

const SUBMISSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBMITTED_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type CaptureActionState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'error';
      readonly code:
        | 'empty_input'
        | 'invalid_input'
        | 'directive_refused'
        | 'ingestion_refused'
        | 'storage_failed';
      readonly message: string;
    }
  | {
      readonly status: 'success';
      readonly recordId: string;
      readonly created: boolean;
      readonly deduplicated: boolean;
      readonly rolesAdded: readonly string[];
    };

/**
 * Capture transport adapter.
 *
 * The form contributes only the user's verbatim text. Provenance, time
 * semantics, epistemic role, directive subject, and root-source status are
 * fixed here so untrusted form fields cannot choose domain meaning. Every
 * storage and evidence-identity decision remains behind IngestionService.
 *
 * This action returns as soon as persistence is confirmed. The AI relation
 * suggestion is a separate action because awaiting it here would keep the
 * form locked for the whole provider round trip, and a slow or unreachable
 * provider must not block the user's ability to keep recording.
 */
export async function submitCapture(
  _previousState: CaptureActionState,
  formData: FormData,
): Promise<CaptureActionState> {
  const verbatim = formData.get('verbatim');
  const submissionId = formData.get('submissionId');
  const submittedAt = formData.get('submittedAt');

  if (typeof verbatim !== 'string') {
    return {
      status: 'error',
      code: 'invalid_input',
      message: '记录内容必须是文字。',
    };
  }

  // Whitespace is used only to decide whether content exists. The value sent
  // to ingestion stays untouched so the user's wording is preserved verbatim.
  if (verbatim.trim().length === 0) {
    return {
      status: 'error',
      code: 'empty_input',
      message: '请先写下一点内容。',
    };
  }

  if (
    typeof submissionId !== 'string' ||
    !SUBMISSION_ID_PATTERN.test(submissionId) ||
    typeof submittedAt !== 'string' ||
    !SUBMITTED_AT_PATTERN.test(submittedAt)
  ) {
    return {
      status: 'error',
      code: 'invalid_input',
      message: '记录提交身份无效。',
    };
  }

  const submittedAtTime = new Date(submittedAt);

  if (Number.isNaN(submittedAtTime.getTime())) {
    return {
      status: 'error',
      code: 'invalid_input',
      message: '记录提交时间无效。',
    };
  }

  const now = new Date();

  let composition: Awaited<ReturnType<typeof getCoreComposition>>;
  let confirmed: Extract<
    Awaited<ReturnType<typeof executeCapture>>,
    { readonly ok: true }
  >;

  try {
    composition = await getCoreComposition();
    const result = await executeCapture(composition.ingestion, {
      verbatim,
      submissionId,
      submittedAt: submittedAtTime,
      capturedAt: now,
    });

    if (!result.ok) {
      if (result.error.kind === 'storage_not_permitted') {
        return {
          status: 'error',
          code: 'directive_refused',
          message: '当前使用规则不允许保存这条记录。',
        };
      }

      return {
        status: 'error',
        code: 'ingestion_refused',
        message: '这条记录未被保存。',
      };
    }

    confirmed = result;
  } catch {
    return {
      status: 'error',
      code: 'storage_failed',
      message: '本地数据暂时不可用，尚未确认保存成功。',
    };
  }

  // Everything below happens only after persistence is confirmed. A cache or
  // Provider failure must never turn a successful Capture into a failed write.
  try {
    revalidatePath('/');
    revalidatePath('/records');
    revalidatePath('/history');
  } catch {
    // A stale view can recover on navigation; the confirmed Record must not be
    // misreported as missing.
  }

  return {
    status: 'success',
    recordId: confirmed.value.recordId,
    created: !confirmed.value.deduplicated,
    deduplicated: confirmed.value.deduplicated,
    rolesAdded: confirmed.value.rolesAdded,
  };
}

/**
 * Post-save AI relation suggestion, requested separately from the write above.
 *
 * Keeping this out of `submitCapture` means the confirmed Record reaches the
 * user immediately and the form unlocks, whatever the provider then does. Every
 * failure mode resolves to a degraded explanation rather than an exception, so a
 * provider problem can never surface as a Capture failure.
 */
export async function loadRelationCandidates(
  recordId: string,
): Promise<RelationSuggestionExperience> {
  if (typeof recordId !== 'string' || recordId.length === 0) {
    return {
      status: 'unavailable',
      message: '记录已保存，但这次无法为它查询值得回看的联系。',
      candidates: [],
    };
  }

  try {
    return await suggestRelationsAfterCapture(
      await getCoreComposition(),
      recordId,
    );
  } catch {
    return {
      status: 'unavailable',
      message: '记录已保存，但 AI 回看暂时不可用。',
      candidates: [],
    };
  }
}

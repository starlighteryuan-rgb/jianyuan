'use server';

import { getServices } from '@/server/container';

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
      message: 'Capture input must be text.',
    };
  }

  // Whitespace is used only to decide whether content exists. The value sent
  // to ingestion stays untouched so the user's wording is preserved verbatim.
  if (verbatim.trim().length === 0) {
    return {
      status: 'error',
      code: 'empty_input',
      message: 'Enter something before capturing it.',
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
      message: 'Capture submission identity is invalid.',
    };
  }

  const submittedAtTime = new Date(submittedAt);

  if (Number.isNaN(submittedAtTime.getTime())) {
    return {
      status: 'error',
      code: 'invalid_input',
      message: 'Capture submission time is invalid.',
    };
  }

  const now = new Date();

  try {
    const result = await getServices().ingestion.ingest({
      origin: 'user_reported',
      actor: 'user',
      // The form creates this identity once per logical submission. Retrying
      // the same submission therefore reaches ingestion with the same source.
      sourceRef: `capture-ui:${submissionId}`,
      verbatim,
      // The input surface does not infer a language from the text.
      language: null,
      // This is when the system captured the expression, not a claim about
      // when anything described by the expression happened.
      time: { semantic: 'capture_time', at: submittedAtTime },
      epistemicRoles: ['user_expression'],
      capturedAt: now,
      // A direct Capture submission is a root source. It does not invent a
      // parent or lineage relation.
      derivation: null,
      // Directive scope attributes stay explicit. Capture infers no topic or
      // relation axis from the user's words.
      subject: {
        topicTags: [],
        source: 'capture_ui',
        relationAxes: [],
        userSelectedRefs: [],
      },
    });

    if (!result.ok) {
      if (result.error.kind === 'storage_not_permitted') {
        return {
          status: 'error',
          code: 'directive_refused',
          message: 'An active directive does not permit this capture to be stored.',
        };
      }

      // A root Capture has no parent and requires no derived-evidence judgment,
      // so the remaining refusals are fail-closed safeguards, not states the UI
      // should reinterpret.
      return {
        status: 'error',
        code: 'ingestion_refused',
        message: 'The capture was refused and nothing was stored.',
      };
    }

    return {
      status: 'success',
      recordId: result.value.recordId,
      created: !result.value.deduplicated,
      deduplicated: result.value.deduplicated,
      rolesAdded: result.value.rolesAdded,
    };
  } catch {
    // Configuration, connection, and repository failures are reported as an
    // unavailable write. Never claim success when persistence is uncertain.
    return {
      status: 'error',
      code: 'storage_failed',
      message: 'Storage is unavailable. Nothing was confirmed as saved.',
    };
  }
}

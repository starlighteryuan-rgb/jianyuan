'use server';

/**
 * Reflection write actions (ENGINEERING_CONTRACT §15, §21, §22, §23).
 *
 * No authentication — see the note in `directives.ts`. Same single-user
 * local-only posture.
 *
 * THE DISTINCTION THIS FILE EXISTS TO KEEP: a button press and free text are
 * DIFFERENT ACTS (§21).
 *
 *   - A button press is a position. It updates state and creates no Record.
 *   - Free text is the user's own expression. It may become a Record.
 *
 * They are therefore SEPARATE SERVER ACTIONS reached by separate forms, not one
 * handler that inspects which field arrived. A single endpoint taking both would
 * make it possible — eventually likely — for a click to be forwarded as
 * `freeText`, and §15 is explicit that user agreement is not evidence. Keeping the
 * entry points apart means that mistake has nowhere to happen.
 *
 * Each action builds a `ReflectionFeedback` where the field it does NOT own is
 * hard-coded `null`. `submitPosition` cannot populate `freeText`; `submitProse`
 * cannot populate `response`. `routeFeedback` in the domain then decides what the
 * response becomes — these actions decide nothing epistemic.
 *
 * ELICITATION PROVENANCE (§22). Every episode here is tagged `prompted` with
 * `stimulusType: 'evidence_relation'`, because the user is answering something the
 * system put in front of them on the stream. Tagging it `spontaneous` would be a
 * false provenance claim, and §23's prompt-contamination reasoning depends on this
 * being recorded honestly.
 *
 * KNOWN SIMPLIFICATION: each response opens a fresh episode with
 * `systemFollowupCount: 0` rather than continuing one across a conversation. That
 * is accurate for these surfaces — nothing here asks follow-up questions, so
 * there is no follow-up count to accumulate and no §23 cap being evaded. A
 * follow-up UI would need the episode threaded through the form instead.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  REFLECTION_RESPONSES,
  type ReflectionFeedback,
  type ReflectionResponse,
} from '../../../packages/core/index';
import { getCoreComposition } from '@/server/capture-composition-root';
import type { ReflectionSubmitCode } from './reflection-submit-code';

const isResponse = (value: unknown): value is ReflectionResponse =>
  typeof value === 'string' &&
  (REFLECTION_RESPONSES as readonly string[]).includes(value);

/**
 * What one of the three forms actually did.
 *
 * Deliberately carries NO reflection text. The user's words live in one
 * persisted place, and the page re-reads them through Core; echoing them
 * back through the action would create a second copy that could drift from
 * what was stored. What reaches the browser is only a status code: the page
 * turns it into one sentence, then reads the real content back from Core.
 */
/**
 * End one submission by sending the browser back to the same Discovery with
 * an outcome code.
 *
 * Same mechanism Settings already uses for Restore: the page owns the wording
 * and re-reads stored content through Core, so the action never becomes a
 * second source of the user's text. Call it outside any try/catch, because
 * `redirect` signals by throwing.
 *
 * A function declaration rather than a `const` arrow: only the declaration
 * form lets TypeScript see that a `never` return ends the branch, which is
 * what narrows `response` and `freeText` after the guards below.
 */
function finishSubmit(
  targetRef: string,
  code: ReflectionSubmitCode,
): never {
  const path = `/reflect/${encodeURIComponent(targetRef)}`;

  revalidatePath(path);
  revalidatePath('/reflection');
  revalidatePath('/');

  redirect(`${path}?submitted=${code}`);
}

/**
 * Run one response through the Core Reflection flow and classify the outcome.
 *
 * `respondToRelation` throws when the user's text could not be captured, and
 * returns null when the Discovery no longer exists. Neither may be presented
 * as success: a storage failure that looks like a save is how a user loses
 * words they already wrote.
 */
const respond = async (
  targetRef: string,
  feedback: ReflectionFeedback,
  now: Date,
): Promise<
  | { readonly ok: true; readonly recordId: string | null }
  | { readonly ok: false; readonly code: 'target-missing' | 'unavailable' }
> => {
  try {
    const result = await (
      await getCoreComposition()
    ).reflectionFlow.respondToRelation({ targetRef, feedback, now });

    if (result === null) return { ok: false, code: 'target-missing' };
    return { ok: true, recordId: result.recordId };
  } catch {
    return { ok: false, code: 'unavailable' };
  }
};

/**
 * The user took a position by clicking (§21).
 *
 * Creates no Record and mints no evidence. `freeText` is `null` by construction.
 */
export async function submitPosition(form: FormData): Promise<void> {
  const targetRef = form.get('targetRef');
  const response = form.get('response');

  if (typeof targetRef !== 'string' || targetRef.length === 0) return;

  // Validated against the domain's own set, never cast — a form field is
  // untrusted input. An unrecognised value is refused rather than recorded as
  // a position the domain does not have, and said out loud instead of silently
  // doing nothing.
  if (!isResponse(response)) finishSubmit(targetRef, 'rejected');

  const now = new Date();

  const feedback: ReflectionFeedback = {
    response,
    // Structural, not incidental: a click has no prose to carry (§15).
    freeText: null,
    leaveForNow: false,
    userInitiatedContinuation: false,
  };

  const result = await respond(targetRef, feedback, now);

  if (!result.ok) finishSubmit(targetRef, result.code);

  // A click creates no Record (§21), so the honest outcome is a remembered
  // position, never a saved reflection.
  finishSubmit(targetRef, 'position-recorded');
}

/**
 * The user stepped away without judging the content (§21).
 *
 * A neutral exit. §21 requires deferral not look like a verdict, so this carries
 * no `response` at all rather than a "neutral" one — there is no such position.
 */
export async function submitLeaveForNow(form: FormData): Promise<void> {
  const targetRef = form.get('targetRef');

  if (typeof targetRef !== 'string' || targetRef.length === 0) return;

  const now = new Date();

  const feedback: ReflectionFeedback = {
    response: null,
    freeText: null,
    leaveForNow: true,
    userInitiatedContinuation: false,
  };

  const result = await respond(targetRef, feedback, now);

  if (!result.ok) finishSubmit(targetRef, result.code);

  // Deferral carries no position and creates no Record (§21).
  finishSubmit(targetRef, 'left-for-now');
}

/**
 * The user wrote something in their own words (§4.2, §21).
 *
 * Preserved verbatim — not trimmed into a tidier form, not normalized. What
 * becomes of it evidentially is the domain's call, not this action's.
 */
export async function submitProse(form: FormData): Promise<void> {
  const targetRef = form.get('targetRef');
  const freeText = form.get('freeText');

  if (typeof targetRef !== 'string' || targetRef.length === 0) return;

  // Whitespace decides whether anything was written; the stored value keeps
  // the user's exact wording either way.
  if (typeof freeText !== 'string' || freeText.trim().length === 0) {
    finishSubmit(targetRef, 'not-stored');
  }

  const now = new Date();

  const feedback: ReflectionFeedback = {
    // Structural: prose is not a position (§21).
    response: null,
    // Verbatim. Whitespace is checked above but the stored value is untouched.
    freeText,
    leaveForNow: false,
    userInitiatedContinuation: false,
  };

  const result = await respond(targetRef, feedback, now);

  if (!result.ok) finishSubmit(targetRef, result.code);

  // Free text is the only input that can become a Record (§21). If Core says
  // none was created, that is reported as not stored rather than as a save.
  finishSubmit(
    targetRef,
    result.recordId === null ? 'not-stored' : 'reflection-saved',
  );
}

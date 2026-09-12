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

import type { ReflectionEpisode } from '@/domain/reflection/reflection-episode';
import type { ReflectionFeedback } from '@/domain/reflection/response-routing';
import {
  REFLECTION_RESPONSES,
  type ReflectionResponse,
} from '@/domain/shared/enums';
import { reflectionEpisodeId } from '@/domain/shared/ids';
import { CryptoIdGenerator } from '@/infra/ids/crypto-id-generator';
import { getServices } from '@/server/container';

const ids = new CryptoIdGenerator();

/** Explicit-only directive scope. Nothing is inferred (§13). */
const NO_SCOPE = {
  topicTags: [] as readonly string[],
  source: null,
  relationAxes: [] as readonly string[],
  userSelectedRefs: [] as readonly string[],
};

const openEpisode = (targetRef: string, now: Date): ReflectionEpisode => ({
  id: reflectionEpisodeId(ids.nextReflectionEpisodeId()),
  // The system showed the claim; the user is replying to it (§22).
  elicitationMode: 'prompted',
  stimulusType: 'evidence_relation',
  systemFollowupCount: 0,
  stimulusRef: targetRef,
  targetRef,
  occurredAt: now,
});

const isResponse = (value: unknown): value is ReflectionResponse =>
  typeof value === 'string' &&
  (REFLECTION_RESPONSES as readonly string[]).includes(value);

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
  // untrusted input.
  if (!isResponse(response)) return;

  const now = new Date();

  const feedback: ReflectionFeedback = {
    response,
    // Structural, not incidental: a click has no prose to carry (§15).
    freeText: null,
    leaveForNow: false,
    userInitiatedContinuation: false,
  };

  await getServices().reflection.respond({
    episode: openEpisode(targetRef, now),
    feedback,
    subject: NO_SCOPE,
    targetType: 'relation_claim',
    targetRef,
    now,
  });

  revalidatePath(`/reflect/${encodeURIComponent(targetRef)}`);
  revalidatePath('/');
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

  await getServices().reflection.respond({
    episode: openEpisode(targetRef, now),
    feedback,
    subject: NO_SCOPE,
    targetType: 'relation_claim',
    targetRef,
    now,
  });

  revalidatePath(`/reflect/${encodeURIComponent(targetRef)}`);
  revalidatePath('/');
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
  if (typeof freeText !== 'string' || freeText.trim().length === 0) return;

  const now = new Date();

  const feedback: ReflectionFeedback = {
    // Structural: prose is not a position (§21).
    response: null,
    // Verbatim. Whitespace is checked above but the stored value is untouched.
    freeText,
    leaveForNow: false,
    userInitiatedContinuation: false,
  };

  await getServices().reflection.respond({
    episode: openEpisode(targetRef, now),
    feedback,
    subject: NO_SCOPE,
    targetType: 'relation_claim',
    targetRef,
    now,
  });

  revalidatePath(`/reflect/${encodeURIComponent(targetRef)}`);
  revalidatePath('/');
}

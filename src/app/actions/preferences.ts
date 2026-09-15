'use server';

/**
 * ReflectionPreference write action (ENGINEERING_CONTRACT §33).
 *
 * No authentication — see the note in `directives.ts`. Same single-user
 * local-only posture.
 *
 * §33 stores preference as CURRENT STATE with no history: this overwrites in
 * place rather than appending a version. That is deliberate and is the one place
 * in this system where overwriting is correct — a preference is not a claim about
 * the user's past, so there is nothing to preserve a lineage of.
 */

import { revalidatePath } from 'next/cache';

import {
  defaultPreference,
  ExplanationDensity,
  HypothesisVisibility,
  InterventionLevel,
} from '../../../packages/core/index';
import { getCoreComposition } from '@/server/capture-composition-root';

const HYPOTHESIS_VISIBILITY: readonly HypothesisVisibility[] = [
  'hidden',
  'on_request',
  'shown',
];
const INTERVENTION_LEVEL: readonly InterventionLevel[] = [
  'minimal',
  'standard',
];
const EXPLANATION_DENSITY: readonly ExplanationDensity[] = ['brief', 'full'];

/**
 * Validate against the allowed set rather than casting.
 *
 * A form field is untrusted input; casting it into a domain enum would let an
 * arbitrary string reach a `satisfies Record<...>` lookup and resolve to
 * undefined at runtime. An unrecognised value falls back to the current setting.
 */
const pick = <T extends string>(
  form: FormData,
  field: string,
  allowed: readonly T[],
  fallback: T,
): T => {
  const raw = form.get(field);
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
};

export async function updatePreference(form: FormData): Promise<void> {
  const services = await getCoreComposition();
  const now = new Date();

  const current = await services.reflection.preference(now);

  await services.reflection.updatePreference({
    hypothesisVisibility: pick(
      form,
      'hypothesisVisibility',
      HYPOTHESIS_VISIBILITY,
      current.hypothesisVisibility,
    ),
    interventionLevel: pick(
      form,
      'interventionLevel',
      INTERVENTION_LEVEL,
      current.interventionLevel,
    ),
    explanationDensity: pick(
      form,
      'explanationDensity',
      EXPLANATION_DENSITY,
      current.explanationDensity,
    ),
    now,
  });

  revalidatePath('/settings');
  revalidatePath('/');
}

/** AI invitation toggle projected onto the existing ReflectionPreference. */
export async function updateReflectionInvitationPermission(
  form: FormData,
): Promise<void> {
  const services = await getCoreComposition();
  const now = new Date();
  const current = await services.reflection.preference(now);

  await services.reflection.updatePreference({
    ...current,
    interventionLevel:
      form.get('allowReflectionInvitation') === 'on'
        ? 'standard'
        : 'minimal',
    now,
  });

  revalidatePath('/settings');
  revalidatePath('/');
}

/** Exported so the page can render the shipped defaults as labels. */
export const shippedDefaults = defaultPreference;

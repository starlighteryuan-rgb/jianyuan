'use server';

/**
 * Directive write actions (ENGINEERING_CONTRACT §26, INV-17).
 *
 * SECURITY POSTURE: these are network-exposed endpoints with NO authentication.
 * The agreed posture is single-user local-only, and that assumption is the only
 * thing protecting them. Exposing this app to a network without adding auth would
 * let any caller read and rewrite the user's directives.
 *
 * THE ONE RULE THIS FILE MUST NOT BREAK: the four permissions are INDEPENDENT
 * (§26, INV-17). "只记录，不分析" — store but do not analyse — has to be
 * expressible, so `allowStorage` and `allowAnalysis` are read from the form
 * separately and never derived from one another. No permission implies another.
 *
 * These actions PERSIST a directive. They resolve nothing: whether a directive
 * applies to a given subject is computed on read by
 * `resolveEffectivePermissions`, every read, so a revocation takes effect
 * immediately (§26 revocability).
 */

import { revalidatePath } from 'next/cache';

import {
  DIRECTIVE_SCOPE_KINDS,
  directiveId,
  type DirectiveScope,
} from '../../../packages/core/index';
import { getCoreComposition } from '@/server/capture-composition-root';

const isChecked = (form: FormData, field: string): boolean =>
  form.get(field) === 'on';

const explicitScope = (form: FormData): DirectiveScope | null => {
  const kind = form.get('scopeKind');
  const value = form.get('scopeValue');
  if (
    typeof kind !== 'string' ||
    !DIRECTIVE_SCOPE_KINDS.includes(
      kind as (typeof DIRECTIVE_SCOPE_KINDS)[number],
    ) ||
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    return null;
  }
  return {
    kind: kind as (typeof DIRECTIVE_SCOPE_KINDS)[number],
    value: value.trim(),
  };
};

export async function createDirective(form: FormData): Promise<void> {
  const services = await getCoreComposition();

  const result = await services.directives.create({
    // Four independent reads. Never `allowAnalysis: storage && ...`.
    allowStorage: isChecked(form, 'allowStorage'),
    allowAnalysis: isChecked(form, 'allowAnalysis'),
    allowPassivePresentation: isChecked(form, 'allowPassivePresentation'),
    allowProactivePresentation: isChecked(form, 'allowProactivePresentation'),
    appliesToFutureSimilar: isChecked(form, 'appliesToFutureSimilar'),
    // Scope is accepted only when the user names both its kind and value.
    // Nothing in this action infers what "similar" means.
    scope: explicitScope(form),
    now: new Date(),
  });

  // Domain refusal means no repository write and no success-like refresh.
  if (!result.ok) return;

  revalidatePath('/settings');
  revalidatePath('/');
}

export async function revokeDirective(form: FormData): Promise<void> {
  const id = form.get('id');

  if (typeof id !== 'string' || id.length === 0) return;

  // Revocation is a timestamp, not a delete: §42 wants the state to explain
  // itself, and a vanished directive cannot explain why it stopped applying.
  await (await getCoreComposition()).directives.revoke(
    directiveId(id),
    new Date(),
  );

  revalidatePath('/settings');
  revalidatePath('/');
}

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

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { directiveId } from '@/domain/shared/ids';
import { getServices } from '@/server/container';

const isChecked = (form: FormData, field: string): boolean =>
  form.get(field) === 'on';

export async function createDirective(form: FormData): Promise<void> {
  const services = getServices();

  await services.repositories.directives.save({
    id: directiveId(`dir_${randomUUID()}`),
    // Four independent reads. Never `allowAnalysis: storage && ...`.
    allowStorage: isChecked(form, 'allowStorage'),
    allowAnalysis: isChecked(form, 'allowAnalysis'),
    allowPassivePresentation: isChecked(form, 'allowPassivePresentation'),
    allowProactivePresentation: isChecked(form, 'allowProactivePresentation'),
    appliesToFutureSimilar: isChecked(form, 'appliesToFutureSimilar'),
    // Scope stays null here: §13 forbids inferring what "similar" means, and a
    // scoped directive needs explicit user-selected attributes rather than a
    // guess made in a form handler.
    scope: null,
    revokedAt: null,
    createdAt: new Date(),
  });

  revalidatePath('/settings');
  revalidatePath('/');
}

export async function revokeDirective(form: FormData): Promise<void> {
  const id = form.get('id');

  if (typeof id !== 'string' || id.length === 0) return;

  const services = getServices();

  // Revocation is a timestamp, not a delete: §42 wants the state to explain
  // itself, and a vanished directive cannot explain why it stopped applying.
  await services.repositories.directives.revoke(directiveId(id), new Date());

  revalidatePath('/settings');
  revalidatePath('/');
}

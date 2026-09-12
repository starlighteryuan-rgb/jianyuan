/**
 * Directive / User Sovereignty (ENGINEERING_CONTRACT §26, INV-17;
 * docs/architecture.md §4, Patch 5).
 *
 * The four permission dimensions are INDEPENDENT BOOLEAN FIELDS. They are not
 * a level, not a ranked enum, and not derivable from one another:
 *
 *   allowAnalysis              — may the system analyze this?
 *   allowStorage               — may the system store this?
 *   allowPassivePresentation   — may it appear when the user looks?
 *   allowProactivePresentation — may it be pushed at the user?
 *
 * Contract §26 requires distinguishing analysis / storage / presentation /
 * proactive-reminder / future-similar policy. INV-17 requires that directive
 * scope distinguish analysis from presentation. Collapsing any pair of these
 * for convenience is exactly what §42 forbids.
 *
 * Concretely expressible cases:
 *   "以后类似的也别主动提醒我" → allowProactivePresentation=false while
 *                                allowAnalysis=true, allowPassivePresentation=true
 *   "只记录，不分析"          → allowStorage=true, allowAnalysis=false
 */

import type { DirectiveId } from '../shared/ids';
import type { DirectiveScopeKind } from '../shared/enums';

/**
 * Explicit-only scope (docs/architecture.md §13).
 *
 * `appliesToFutureSimilar` may never be broadened by AI inference. Similarity
 * must be anchored to an explicit topic/tag, source, relation axis, or a scope
 * the user selected — hence the required `kind` + `value` pair.
 */
export interface DirectiveScope {
  readonly kind: DirectiveScopeKind;
  readonly value: string;
}

export interface Directive {
  readonly id: DirectiveId;

  readonly allowAnalysis: boolean;
  readonly allowStorage: boolean;
  readonly allowPassivePresentation: boolean;
  readonly allowProactivePresentation: boolean;

  readonly appliesToFutureSimilar: boolean;

  /**
   * Required whenever `appliesToFutureSimilar` is true — enforced by
   * `validateDirectiveScope` below rather than by a loose optional field.
   */
  readonly scope: DirectiveScope | null;

  /** Directives must be revocable (ENGINEERING_CONTRACT §26). */
  readonly revokedAt: Date | null;

  readonly createdAt: Date;
}

export type DirectiveScopeError = {
  readonly kind: 'future_similar_requires_explicit_scope';
  readonly detail: string;
};

/**
 * A future-similar directive with no explicit scope is rejected. Accepting it
 * would force the system to guess what "similar" means, which docs/architecture.md
 * §13 resolved as prohibited for MVP.
 */
export const validateDirectiveScope = (
  d: Pick<Directive, 'appliesToFutureSimilar' | 'scope'>,
): DirectiveScopeError | null =>
  d.appliesToFutureSimilar && d.scope === null
    ? {
        kind: 'future_similar_requires_explicit_scope',
        detail:
          'appliesToFutureSimilar=true requires an explicit DirectiveScope ' +
          '(topic_tag | source | relation_axis | user_selected). AI-driven ' +
          'broadening of "similar" is prohibited for MVP.',
      }
    : null;

export const isActive = (d: Pick<Directive, 'revokedAt'>): boolean =>
  d.revokedAt === null;

/**
 * Presentation permissions are read INDEPENDENTLY.
 *
 * These two accessors exist so that no call site can reach for a single
 * conflated "may present" boolean.
 */
export const mayPresentPassively = (d: Directive): boolean =>
  isActive(d) && d.allowPassivePresentation;

export const mayPresentProactively = (d: Directive): boolean =>
  isActive(d) && d.allowProactivePresentation;

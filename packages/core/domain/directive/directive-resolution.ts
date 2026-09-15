/**
 * Effective permission resolution (ENGINEERING_CONTRACT §8 Gate 1, §18, §26,
 * §40.5, INV-17; docs/architecture.md §4 Patch 5, §13).
 *
 * Answers: "given the active directives, what may the system do with THIS
 * subject right now?"
 *
 * Four properties this module is built to preserve:
 *
 *   1. DIMENSION INDEPENDENCE. Each of the four permissions is resolved
 *      separately. There is no ranked "permission level" anywhere, because
 *      INV-17 requires analysis to remain distinguishable from presentation.
 *
 *   2. PROACTIVE PRESENTATION IS OFF BY DEFAULT. §18 and §40.5 both state that
 *      Level 3 is disabled by default for MVP, so the SYSTEM BASELINE cannot be
 *      permissive on that dimension.
 *
 *   3. AN EXPLICIT DIRECTIVE REPLACES THE BASELINE; it is not ANDed with it.
 *      Gate 1 states "user directives override system preference". If a matching
 *      directive were ANDed with the default-off baseline, a user's explicit
 *      grant of proactive reminders could never take effect, which would inverse
 *      §26's "user directives override presentation logic".
 *
 *   4. AMONG MATCHING DIRECTIVES, THE MOST RESTRICTIVE WINS (per dimension).
 *      Two user statements that disagree resolve conservatively; the system
 *      never picks the more permissive reading of a user's own instructions.
 *
 * Resolution is computed ON READ and never frozen onto a Record, because
 * directives must remain revocable (§26): a revoked directive must stop having
 * effect immediately, which is impossible if its verdict was baked in at
 * ingestion time.
 */

import {
  type Directive,
  isActive,
} from './directive';
import type { DirectiveId } from '../shared/ids';

/**
 * The attributes a directive scope can be matched against. Mirrors
 * `DirectiveScopeKind` one-for-one, so matching stays explicit and never
 * requires inferring what "similar" means (docs/architecture.md §13).
 */
export interface DirectiveSubject {
  readonly topicTags: readonly string[];
  readonly source: string | null;
  readonly relationAxes: readonly string[];
  /** Refs the user selected by hand. */
  readonly userSelectedRefs: readonly string[];
  /** When the subject came into existence; compared against directive age. */
  readonly createdAt: Date;
}

export interface EffectivePermissions {
  readonly allowAnalysis: boolean;
  readonly allowStorage: boolean;
  readonly allowPassivePresentation: boolean;
  readonly allowProactivePresentation: boolean;
  /** Directives that actually contributed, for auditability (§42). */
  readonly appliedDirectiveIds: readonly DirectiveId[];
}

/**
 * System baseline, used only when NO directive matches the subject.
 *
 * `allowProactivePresentation` is false because §18/§40.5 disable Level 3 by
 * default. The other three are permissive: the contract's restrictions on
 * analysis, storage, and passive presentation come from user directives and
 * from the Relation gates, not from a restrictive default that would make the
 * product inert.
 */
export const SYSTEM_BASELINE: Omit<EffectivePermissions, 'appliedDirectiveIds'> =
  {
    allowAnalysis: true,
    allowStorage: true,
    allowPassivePresentation: true,
    allowProactivePresentation: false,
  };

/**
 * Does this directive's scope cover the subject?
 *
 * A directive with `scope === null` is GLOBAL — it expresses a stance with no
 * narrowing attribute, e.g. §26's "只记录，不分析". A directive with a scope
 * matches only subjects carrying that explicit attribute; similarity is never
 * inferred.
 */
export const scopeMatches = (
  directive: Directive,
  subject: DirectiveSubject,
): boolean => {
  const { scope } = directive;

  if (scope === null) return true;

  switch (scope.kind) {
    case 'topic_tag':
      return subject.topicTags.includes(scope.value);
    case 'source':
      return subject.source === scope.value;
    case 'relation_axis':
      return subject.relationAxes.includes(scope.value);
    case 'user_selected':
      return subject.userSelectedRefs.includes(scope.value);
  }
};

/**
 * Temporal applicability.
 *
 * `appliesToFutureSimilar === true` extends a directive to subjects created
 * after it. When false, the directive governs only what already existed when
 * the user spoke — it does not silently capture future material.
 */
export const appliesTemporally = (
  directive: Directive,
  subject: DirectiveSubject,
): boolean =>
  directive.appliesToFutureSimilar ||
  subject.createdAt.getTime() <= directive.createdAt.getTime();

export const directiveApplies = (
  directive: Directive,
  subject: DirectiveSubject,
): boolean =>
  isActive(directive) &&
  scopeMatches(directive, subject) &&
  appliesTemporally(directive, subject);

/**
 * Resolve effective permissions for a subject.
 *
 * Per dimension: if any directive applies, AND together the applying
 * directives (most restrictive wins). If none applies, fall back to
 * SYSTEM_BASELINE for that dimension.
 *
 * Note the fallback is per-dimension-set rather than per-dimension-field: a
 * matching directive states an opinion on all four fields by construction
 * (Patch 5 keeps them as four required booleans), so "some directive matched"
 * is decided once and each field is then ANDed across that same matching set.
 */
export const resolveEffectivePermissions = (
  directives: readonly Directive[],
  subject: DirectiveSubject,
): EffectivePermissions => {
  const applying = directives.filter((d) => directiveApplies(d, subject));

  if (applying.length === 0) {
    return { ...SYSTEM_BASELINE, appliedDirectiveIds: [] };
  }

  return {
    allowAnalysis: applying.every((d) => d.allowAnalysis),
    allowStorage: applying.every((d) => d.allowStorage),
    allowPassivePresentation: applying.every(
      (d) => d.allowPassivePresentation,
    ),
    allowProactivePresentation: applying.every(
      (d) => d.allowProactivePresentation,
    ),
    appliedDirectiveIds: applying.map((d) => d.id),
  };
};

/**
 * Gate 1 — Usage Permission (ENGINEERING_CONTRACT §8).
 *
 * "The underlying records must permit the intended analysis."
 *
 * Exposed as its own predicate so later phases consult permission explicitly
 * rather than reading a general-purpose boolean.
 */
export const permitsAnalysis = (p: EffectivePermissions): boolean =>
  p.allowAnalysis;

export const permitsStorage = (p: EffectivePermissions): boolean =>
  p.allowStorage;

/**
 * §18 presentation eligibility.
 *
 * Deliberately two separate functions. Level 2 (available when the user looks)
 * and Level 3 (proactive push) are governed by different permissions, and
 * conflating them would let a passive grant authorize a push.
 */
export const permitsPassivePresentation = (p: EffectivePermissions): boolean =>
  p.allowPassivePresentation;

export const permitsProactivePresentation = (
  p: EffectivePermissions,
): boolean => p.allowProactivePresentation;

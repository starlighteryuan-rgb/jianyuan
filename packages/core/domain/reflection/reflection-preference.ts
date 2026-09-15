/**
 * ReflectionPreference (ENGINEERING_CONTRACT §33).
 *
 * §33 is unusually blunt about what this is NOT:
 *
 *   > Onboarding preferences describe interaction style.
 *   > They are NOT personality traits.
 *   > Preferences may change over time.
 *   > Do not infer stable identity from these preferences.
 *
 * FROZEN BY USER DECISION: minimum interaction preferences only, with no
 * expansion into a personality model.
 *
 * So this module is deliberately thin, and three things are absent by design:
 *
 *   1. NO TRAIT VOCABULARY. Every field names a system behaviour ("show
 *      hypotheses", "how much text"), never a property of the person. There is
 *      no `reflective`, `analytical`, `openness`, or `style` field.
 *
 *   2. NO INFERENCE. Nothing here derives a preference from user behaviour.
 *      Preferences are set by the user and read by the system. §33's "do not
 *      infer stable identity" is enforced by there being no inference function
 *      at all.
 *
 *   3. NO HISTORY OR STABILITY MEASURE. §33 says preferences may change, so
 *      there is no `since`, no `consistency`, and no confidence that a
 *      preference reflects something enduring. The current value is the whole
 *      of it, and it is overwritten in place.
 *
 * MVP SCOPE (mine, within the user's freeze): §33 lists five candidate
 * preferences; MVP implements the three that change concrete system behaviour.
 * `early_surface_tolerance` and `archive_reopen_policy` are omitted because both
 * govern proactive surfacing, which L3-off makes unreachable (§18, §40.5) — a
 * dial with no effect would be a false promise to the user.
 */

import type {
  ExplanationDensity,
  HypothesisVisibility,
  InterventionLevel,
} from '../shared/enums';

export interface ReflectionPreference {
  /**
   * Single-user MVP, so one row. Named rather than numbered to make it obvious
   * this is not a per-person profile table.
   */
  readonly id: string;

  /** §33 — whether explanations are offered, on request, or withheld. */
  readonly hypothesisVisibility: HypothesisVisibility;

  /**
   * §33 — how much the system may follow up.
   *
   * `minimal` suppresses the automatic follow-up entirely. `standard` permits
   * the single follow-up §23 allows. Neither value can exceed the contract cap:
   * the enum has no third value, so a preference cannot buy a chat loop.
   */
  readonly interventionLevel: InterventionLevel;

  /** §33 — how much explanatory text to render. */
  readonly explanationDensity: ExplanationDensity;

  readonly updatedAt: Date;
}

/** The single preference row's id, in a single-user MVP. */
export const SOLE_PREFERENCE_ID = 'default';

/**
 * Conservative defaults for a user who has set nothing.
 *
 * `on_request` rather than `shown`: §21 permits presenting hypotheses but does
 * not require it, and a user who has expressed no preference has not asked to be
 * offered explanations of themselves. Withholding until asked is the restrained
 * default (§20).
 *
 * `standard` intervention because §23 already caps follow-ups at one, so the
 * default is the contract default rather than an additional restriction.
 */
export const defaultPreference = (at: Date): ReflectionPreference => ({
  id: SOLE_PREFERENCE_ID,
  hypothesisVisibility: 'on_request',
  interventionLevel: 'standard',
  explanationDensity: 'brief',
  updatedAt: at,
});

/**
 * How many automatic follow-ups this preference permits.
 *
 * Returns 0 for `minimal` and 1 for `standard`. Never more: the ceiling is
 * §23's, and a preference may only lower it.
 */
export const permittedFollowups = (
  preference: ReflectionPreference,
): number => (preference.interventionLevel === 'minimal' ? 0 : 1);

/**
 * §33 — preferences are interaction style, not identity.
 *
 * Executable statement. This module exports no function inferring a preference
 * from behaviour, and `ReflectionPreference` carries no trait field.
 */
export const INFERS_STABLE_IDENTITY = false as const;

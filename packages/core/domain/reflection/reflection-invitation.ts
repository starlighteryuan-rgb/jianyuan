/**
 * Reflection invitation (ENGINEERING_CONTRACT §21, §13, §18, §20, §33).
 *
 * What the system may put in front of the user, and what it may never do.
 *
 * §21 permits presenting:  evidence → relation → 2–3 competing hypotheses
 * §21 requires always permitting:
 *       "none of these" · "I have my own explanation" · "I don't know yet"
 * §21 forbids:  leading the user toward a conclusion.
 *
 * Three structural consequences:
 *
 *   1. THE EXITS ARE NOT OPTIONAL AND NOT A FALLBACK. They are built by
 *      `standardExits()` and included unconditionally. There is no code path
 *      producing an invitation without them, so an invitation that forecloses
 *      the user's own account cannot be represented.
 *
 *   2. HYPOTHESES ARE UNORDERED PEERS. §13 makes competing explanations peers,
 *      so this module neither ranks them nor marks one as likeliest. The cap of
 *      three comes from §21's "2–3", and excess candidates are dropped in
 *      generation order rather than by preference.
 *
 *   3. NO RECOMMENDATION FIELD EXISTS. There is no `suggested`, `mostLikely`, or
 *      `recommended` on the invitation type. A conclusion cannot be smuggled in
 *      as data, because there is nowhere to put one.
 */

import type { StoredHypothesis } from '../hypothesis/hypothesis';
import type { StoredRelationClaim } from '../relation/relation-claim';
import type {
  ExplanationDensity,
  HypothesisVisibility,
  ReflectionResponse,
  StimulusType,
} from '../shared/enums';

/** §21's "2–3 competing hypotheses" — the upper bound. */
export const MAX_PRESENTED_HYPOTHESES = 3;

/* ── Exits (§21) ──────────────────────────────────────────────────────── */

/**
 * The exits the user must always be offered.
 *
 * `own_explanation` and `dont_know` are deliberately distinct from the
 * `rejected` / `uncertain` responses: rejecting the system's account is not the
 * same act as having one's own, and §21 lists them separately. Collapsing them
 * would quietly reduce three options to two.
 */
export const EXIT_KINDS = [
  'none_of_these',
  'own_explanation',
  'dont_know',
] as const;

export type ExitKind = (typeof EXIT_KINDS)[number];

export interface ExitOption {
  readonly kind: ExitKind;
  readonly label: string;
  /**
   * Whether choosing this opens a free-text field.
   *
   * Only `own_explanation` does: it is the one exit whose meaning lives in the
   * user's own words. The other two are complete as choices, and prompting for
   * justification would press the user to explain a refusal (§20, §21).
   */
  readonly invitesText: boolean;
}

/**
 * The three exits, always present.
 *
 * A function rather than a constant so callers cannot mutate a shared array and
 * remove one.
 */
export const standardExits = (): readonly ExitOption[] => [
  { kind: 'none_of_these', label: '都不是', invitesText: false },
  { kind: 'own_explanation', label: '我有自己的解释', invitesText: true },
  { kind: 'dont_know', label: '还不知道', invitesText: false },
];

/* ── Presented content ────────────────────────────────────────────────── */

/**
 * A relation shown descriptively.
 *
 * Carries `supportLevel` for honest labelling — §42 wants the user to see how
 * well-supported something is — but NOT the numeric score or dimension
 * breakdown. A number invites comparison and ranking; the categorical level
 * states what is known without implying arithmetic precision.
 */
export interface PresentedRelation {
  readonly claimId: string;
  readonly axisQuestion: string;
  readonly relationType: string;
  readonly evidenceSummary: string;
  readonly supportLevel: string | null;
}

/**
 * A hypothesis shown as one possibility among others.
 *
 * Includes `alternatives` and `wouldWeaken` deliberately: showing what would
 * undermine an explanation is what keeps it a hypothesis rather than a verdict
 * (§13, §14 H5).
 */
export interface PresentedHypothesis {
  readonly hypothesisId: string;
  readonly explanation: string;
  readonly mechanism: string;
  readonly alternatives: readonly string[];
  readonly wouldWeaken: readonly string[];
}

/**
 * A complete invitation.
 *
 * Note the absent fields: no recommendation, no ranking, no confidence, no
 * "most likely". §21 forbids leading the user to a conclusion, and the type
 * makes that unrepresentable rather than merely discouraged.
 */
export interface ReflectionInvitation {
  /** What the invitation is about. */
  readonly targetRef: string;

  /** §22 — what stimulus the user is reacting to. */
  readonly stimulusType: StimulusType;

  /** The descriptive layer. */
  readonly relation: PresentedRelation | null;

  /** 0–3 competing explanations, unordered peers (§13). */
  readonly hypotheses: readonly PresentedHypothesis[];

  /** Always all three (§21). */
  readonly exits: readonly ExitOption[];

  /** The stances the user may take. */
  readonly responses: readonly ReflectionResponse[];

  /** §33 — how much explanatory text to render. Style only, not a trait. */
  readonly density: ExplanationDensity;
}

const presentRelation = (claim: StoredRelationClaim): PresentedRelation => ({
  claimId: claim.id,
  axisQuestion: claim.comparisonAxis.question,
  relationType: claim.relationType,
  evidenceSummary: claim.evidenceSummary,
  supportLevel: claim.supportLevel,
});

const presentHypothesis = (h: StoredHypothesis): PresentedHypothesis => ({
  hypothesisId: h.id,
  explanation: h.explanation,
  mechanism: h.mechanism,
  alternatives: h.alternatives,
  wouldWeaken: h.wouldWeaken,
});

/**
 * Build an invitation.
 *
 * Pure. `visibility` and `density` come from ReflectionPreference (§33) and
 * affect only what is rendered, never what is true.
 *
 * `stimulusType` is derived from what is actually shown rather than passed in,
 * so provenance cannot disagree with content (§22). Note it can never be
 * `external_reference`: no external content reaches this module, and MVP ships
 * no plugin.
 */
export const buildInvitation = (input: {
  readonly targetRef: string;
  readonly relation: StoredRelationClaim | null;
  readonly hypotheses: readonly StoredHypothesis[];
  readonly visibility: HypothesisVisibility;
  readonly density: ExplanationDensity;
}): ReflectionInvitation => {
  // §33 — `hidden` withholds hypotheses entirely; `on_request` means the caller
  // fetches them in a second step. Both present zero here.
  const showHypotheses = input.visibility === 'shown';

  const hypotheses = showHypotheses
    ? input.hypotheses.slice(0, MAX_PRESENTED_HYPOTHESES).map(presentHypothesis)
    : [];

  const relation = input.relation === null ? null : presentRelation(input.relation);

  return {
    targetRef: input.targetRef,
    stimulusType: deriveStimulusType(relation !== null, hypotheses.length > 0),
    relation,
    hypotheses,
    // Unconditional (§21).
    exits: standardExits(),
    responses: ['accepted', 'questioned', 'rejected', 'uncertain'],
    density: input.density,
  };
};

/**
 * Derive the stimulus the user is reacting to (§22).
 *
 * Hypotheses dominate when both are shown: the explanatory content is the more
 * suggestive stimulus, and provenance should record the stronger influence.
 *
 * `external_reference` is unreachable here by construction — it remains in the
 * frozen enum but MVP never produces it, since no external content enters this
 * module and no plugin ships.
 */
export const deriveStimulusType = (
  hasRelation: boolean,
  hasHypotheses: boolean,
): StimulusType => {
  if (hasHypotheses) return 'hypothesis';
  if (hasRelation) return 'evidence_relation';
  return 'open_question';
};

/**
 * §21 — an invitation always leaves the user's own account available.
 *
 * Executable check used by tests and by the service before presenting.
 */
export const preservesUserAuthority = (
  invitation: ReflectionInvitation,
): boolean => {
  const kinds = new Set(invitation.exits.map((e) => e.kind));
  return EXIT_KINDS.every((kind) => kinds.has(kind));
};

/**
 * §21 — the system presents possibilities, never a conclusion.
 *
 * Executable statement: this module exports no function producing a
 * recommendation, and `ReflectionInvitation` has no field for one.
 */
export const LEADS_TO_CONCLUSION = false as const;

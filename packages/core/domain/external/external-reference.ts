/**
 * External Reference (ENGINEERING_CONTRACT §27, §28, §38, INV-06;
 * docs/architecture.md §8).
 *
 * THE ONE THING THIS LAYER EXISTS TO GUARANTEE: external material can widen
 * interpretation, and can never define the user.
 *
 *   §38 > External articles, Zhihu answers, expert explanations, or peer
 *        experiences must not become proof that "the user is that way."
 *        External material may widen interpretation. It cannot define the user.
 *
 * §27 states the quarantine as four prohibitions. By default an External
 * Reference MUST NOT:
 *
 *   - prove a personal hypothesis;
 *   - define the user;
 *   - become a personal behavioral baseline;
 *   - become independent personal evidence.
 *
 * HOW THE QUARANTINE IS ENFORCED — and deliberately NOT re-enforced here:
 *
 * The load-bearing mechanism already exists and is already tested. Gate 2
 * (`src/domain/relation/gates.ts`) lists `external_reference` in
 * `EPISTEMICALLY_INELIGIBLE_ROLES`, and `gateEpistemicEligibility` fails ANY
 * candidate claim touching a record that carries the role. docs/architecture.md
 * §8 calls this "a hard filter that stays closed" and states the boundary is
 * "unchanged in placement".
 *
 * So this module's job is NOT to invent a second enforcement path — a parallel
 * mechanism would be a divergence risk rather than extra safety, the same
 * reasoning that made §14 H6 reuse the Relation-stage judgment shape. Its job is
 * to make sure every external reference enters the system already carrying the
 * role that closes that filter, with provenance that cannot be talked out of.
 *
 * Accordingly `externalReferenceRoles()` is a FIXED role set, not a caller
 * parameter. A caller cannot import an external reference under a friendlier
 * role, and cannot add one: §4/INV-16 make roles additive rather than
 * substitutive, and Gate 2 checks for the presence of an ineligible role rather
 * than the absence of an eligible one ("any", not "only" — gates.ts:117), so an
 * extra benign role cannot rescue the record.
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It performs no I/O and no retrieval. Fetching is the adapter's concern.
 *   - It stores nothing new. An external reference IS a Record; there is no
 *     parallel table, so there is no second storage path to keep in sync and no
 *     way for one to drift from the other's rules.
 *   - It never decides evidence independence. That is `resolveEvidenceUnit`'s,
 *     and for the relate-to-self path it deliberately FAILS CLOSED (see
 *     `RELATE_TO_SELF_RELATION` below).
 */

import type { EffectivePermissions } from '../directive/directive-resolution';
import { permitsPassivePresentation } from '../directive/directive-resolution';
import type {
  EpistemicRole,
  LineageRelation,
  ProvenanceActor,
  ProvenanceOrigin,
} from '../shared/enums';
import type { TimeAssertion } from '../shared/time-semantics';
import { type Result, err, ok } from '../shared/result';

/* ── What kind of outside material this is (§27) ───────────────────────── */

/**
 * The four kinds §27 names as what External Reference "may provide":
 *
 *   Experience / Practical / Perspectives / Professional
 *
 * Transcribed rather than collapsed. `experience` and `perspectives` are
 * genuinely different offers — how someone lived it versus how someone frames
 * it — and §27's retrieval priority distinguishes them, so merging them would
 * destroy the ordering rule below.
 */
export const EXTERNAL_REFERENCE_KINDS = [
  'experience',
  'practical',
  'perspectives',
  'professional',
] as const;

export type ExternalReferenceKind = (typeof EXTERNAL_REFERENCE_KINDS)[number];

/**
 * §27 default retrieval priority:
 *
 *   > 先找"人怎么经历它"，再找"学科怎么解释它"。
 *
 * Lived experience first; disciplinary explanation last. This is an ORDERING
 * over already-retrieved candidates, never a filter — a professional source is
 * not less admissible, it is simply not what the user meets first.
 *
 * Note this is the one place the kind matters. The kind is deliberately NOT
 * persisted on the Record: it governs presentation order at read time, and
 * storing it would add a column whose only consumer is this comparison while
 * inviting the misreading that some kinds are epistemically stronger. §27 ranks
 * retrieval, not credibility.
 */
export const RETRIEVAL_PRIORITY: readonly ExternalReferenceKind[] = [
  'experience',
  'practical',
  'perspectives',
  'professional',
] as const;

const priorityIndex = (kind: ExternalReferenceKind): number =>
  RETRIEVAL_PRIORITY.indexOf(kind);

/* ── The retrieved material ───────────────────────────────────────────── */

/**
 * One retrieved external reference, before it becomes a Record.
 *
 * `excerpt` is the material's own wording and is carried through verbatim. §4.2
 * forbids normalizing raw expression, and while §4.2 is written about the user's
 * words, summarizing an external source on the way in would be worse than
 * untidy: a generated summary carries a DIFFERENT epistemic role
 * (`ai_hypothesis` territory) than the thing it summarizes, and §8 Gate 2 exists
 * precisely because generated summaries must not masquerade as observed fact.
 * Store what was said; summarize only at presentation time, never at rest.
 */
export interface RetrievedExternalReference {
  /** Canonical URL. Becomes `sourceRef` — the §4.1 traceable pointer. */
  readonly url: string;

  /** Platform this came from, e.g. `zhihu`. Used for directive scoping (§26). */
  readonly provider: string;

  readonly kind: ExternalReferenceKind;

  /** The source's own words, preserved. Never summarized on the way in. */
  readonly excerpt: string;

  /** BCP-47, or null when undetermined. Never guessed. */
  readonly language: string | null;

  /** Title, when the platform supplies one. Null rather than fabricated. */
  readonly title: string | null;

  /** When WE fetched it. See `externalReferenceTime` for why this matters. */
  readonly retrievedAt: Date;
}

/* ── Fixed provenance (§4.1, §28) ─────────────────────────────────────── */

/**
 * `imported` — not `directly_observed`, and not `user_reported`.
 *
 * §28 is explicit that Zhihu is "primarily External Reference Layer, not a
 * complete historical Personal Trace source". Importing someone else's answer is
 * not the system observing the user, so `directly_observed` would be a false
 * provenance claim.
 */
export const EXTERNAL_REFERENCE_ORIGIN: ProvenanceOrigin = 'imported';

/**
 * `platform` — not `user`.
 *
 * The user did not produce this content. §28 does note that user-owned content
 * can be a strong personal-trace candidate "when body and timestamps are
 * available and traceable" — but that is a DIFFERENT import path with a
 * different actor and different roles, and it is not this one. Conflating the
 * two here would be the exact masquerade Gate 2 forbids.
 */
export const EXTERNAL_REFERENCE_ACTOR: ProvenanceActor = 'platform';

/**
 * The fixed role set. Not a parameter.
 *
 * Returns a fresh array so no caller can mutate a shared constant into
 * something Gate 2 would let through.
 */
export const externalReferenceRoles = (): readonly EpistemicRole[] => [
  'external_reference',
];

/**
 * Time semantics for an import: `capture_time`, always.
 *
 * We know when we fetched it. We do NOT know when its claims apply, when its
 * author experienced what they describe, or when the events in it occurred —
 * and §5/INV-07 forbid upgrading one semantic into another to paper over that.
 *
 * A platform-supplied publication date is deliberately NOT promoted to
 * `event_time`: publication is when text appeared, not when anything happened.
 * The honest tag is the one we can defend.
 */
export const externalReferenceTime = (retrievedAt: Date): TimeAssertion => ({
  semantic: 'capture_time',
  at: retrievedAt,
});

/* ── The capture plan ─────────────────────────────────────────────────── */

/**
 * A domain-level description of the Record to create.
 *
 * Deliberately NOT the application layer's `CaptureRequest`: the domain must not
 * import from `src/application` (docs/architecture.md §5 — adapters and
 * orchestration depend inward, never the reverse). The application service adds
 * the two fields that are its concern — directive `subject` and `derivation` —
 * and hands the whole thing to the existing ingestion path.
 */
export interface ExternalReferenceCapturePlan {
  readonly origin: ProvenanceOrigin;
  readonly actor: ProvenanceActor;
  readonly sourceRef: string;
  readonly verbatim: string;
  readonly language: string | null;
  readonly time: TimeAssertion;
  readonly epistemicRoles: readonly EpistemicRole[];
  readonly capturedAt: Date;
}

export type ExternalReferenceRefusal = {
  readonly kind: 'empty_excerpt';
  readonly url: string;
  readonly detail: string;
};

/**
 * Plan the Record for a retrieved external reference.
 *
 * Every epistemically load-bearing field is fixed here rather than accepted from
 * the caller: origin, actor, role set, and time semantic. The caller supplies
 * only the material itself. This is the same discipline as
 * `ReflectionService.invite` / `recordSpontaneous` being separate entry points —
 * provenance is not a parameter a caller can get subtly wrong
 * (reflection-service.ts:150).
 *
 * Fails closed on an empty excerpt. A Record whose `rawExpression` is blank
 * would assert that we imported something while preserving nothing of it, and
 * §42 requires a stored state be able to explain itself.
 */
export const planExternalReferenceCapture = (
  source: RetrievedExternalReference,
): Result<ExternalReferenceCapturePlan, ExternalReferenceRefusal> => {
  if (source.excerpt.trim().length === 0) {
    return err({
      kind: 'empty_excerpt',
      url: source.url,
      detail:
        'An external reference must preserve the source\'s own words. Storing ' +
        'an empty excerpt would record that material was imported while ' +
        'keeping nothing that could be inspected later (§4.2, §42).',
    });
  }

  return ok({
    origin: EXTERNAL_REFERENCE_ORIGIN,
    actor: EXTERNAL_REFERENCE_ACTOR,
    sourceRef: source.url,
    // Verbatim. Not trimmed into a "cleaner" form, not summarized.
    verbatim: source.excerpt,
    language: source.language,
    time: externalReferenceTime(source.retrievedAt),
    epistemicRoles: externalReferenceRoles(),
    capturedAt: source.retrievedAt,
  });
};

/* ── Presentation (§27 exception, §18) ────────────────────────────────── */

/**
 * §27 permits showing outside perspective on ONE condition:
 *
 *   > Exception: If the user explicitly requests outside perspective, it may be
 *   > shown.
 *
 * So external references are PULL, never PUSH. Read against §27's default
 * prohibitions, the exception is what lifts them, and it is keyed on an explicit
 * user request — which means there is no state of the world in which the system
 * proactively surfaces outside material on its own initiative. That holds
 * independently of whether L3 is enabled: L3 governs whether the system may push
 * ITS OWN discoveries, and lifting it would still not manufacture the explicit
 * request §27 requires.
 */
export interface ExternalReferencePresentationRequest {
  /**
   * Did the user actually ask for outside perspective?
   *
   * A caller must state this; it is never inferred from context, from a topic
   * match, or from the user having looked at something nearby.
   */
  readonly userExplicitlyRequestedOutsidePerspective: boolean;

  /** Resolved on read, so a revoked directive stops applying at once (§26). */
  readonly permissions: EffectivePermissions;
}

export type PresentationRefusal =
  | {
      readonly kind: 'not_explicitly_requested';
      readonly detail: string;
    }
  | {
      readonly kind: 'passive_presentation_forbidden';
      readonly appliedDirectiveIds: readonly string[];
      readonly detail: string;
    };

/**
 * May external references be shown right now?
 *
 * Two independent conditions, both required. §27's explicit-request exception
 * does NOT override a user directive: a directive is the user's own instruction
 * (§26 "user directives override system preference"), and reading the exception
 * as a directive override would let the product argue its way past the user's
 * stated preference using a rule that exists to serve them.
 *
 * Checks `allowPassivePresentation` and never `allowProactivePresentation`,
 * because per the note above this path is structurally passive.
 */
export const decideExternalReferencePresentation = (
  request: ExternalReferencePresentationRequest,
): Result<{ readonly mayShow: true }, PresentationRefusal> => {
  if (!request.userExplicitlyRequestedOutsidePerspective) {
    return err({
      kind: 'not_explicitly_requested',
      detail:
        'External references are shown only when the user explicitly asks for ' +
        'outside perspective (§27). They are never surfaced on the system\'s ' +
        'own initiative.',
    });
  }

  if (!permitsPassivePresentation(request.permissions)) {
    return err({
      kind: 'passive_presentation_forbidden',
      appliedDirectiveIds: request.permissions.appliedDirectiveIds.map(String),
      detail:
        'An active directive forbids presenting this material. A user ' +
        'directive overrides presentation logic (§26), including §27\'s ' +
        'explicit-request exception.',
    });
  }

  return ok({ mayShow: true });
};

/**
 * Order candidates for presentation: lived experience first (§27).
 *
 * Stable within a kind — `Array.prototype.sort` is stable in ES2019+, so
 * retrieval order is preserved among equals. Nothing here ranks by quality,
 * authority, or fit: §27 orders KINDS, and inventing a relevance score would be
 * exactly the "widening becomes defining" move §38 forbids.
 */
export const orderByRetrievalPriority = <T extends { readonly kind: ExternalReferenceKind }>(
  candidates: readonly T[],
): readonly T[] =>
  [...candidates].sort((a, b) => priorityIndex(a.kind) - priorityIndex(b.kind));

/* ── Relating a reference back to oneself (§27, arch §8) ───────────────── */

/**
 * §27:
 *
 *   > If the user relates an external reference back to themselves, create a
 *   > NEW UserReflectionRecord. The external reference itself still does not
 *   > become proof about the user.
 *
 * The lineage relation for that act is `references` — the user's new expression
 * REFERENCES the outside material. It is deliberately not `derived_from`,
 * `summarizes`, or `reformats`: the user's own sentence is not a restatement of
 * the article, and calling it one would misdescribe the lineage.
 *
 * THAT CHOICE IS THE ENFORCEMENT, and it is worth being explicit about why.
 * `references` is an INHERITING relation (record/evidence-unit.ts), so
 * `resolveEvidenceUnit` resolves the child onto the PARENT'S evidence unit. Two
 * Records, one Evidence Unit — which is exactly the statement "this reaction adds
 * no independent support" (INV-03).
 *
 * That satisfies docs/architecture.md §8:
 *
 *   > whether that record constitutes a new independent `evidence_unit_id` is a
 *   > separate, explicit determination, not automatic.
 *
 * Read precisely, §8 forbids a NEW unit arising automatically. Inheritance is the
 * opposite of that: it is the automatic denial of a new unit. Minting one still
 * requires an explicit, audited `NewIndependentContentDetermination`, so the
 * "separate, explicit determination" gate remains exactly where §8 put it.
 *
 * WHY NOT FAIL CLOSED HERE. An earlier version of this module did, and it was the
 * wrong instrument. Refusing to resolve an evidence unit blocks the whole Record,
 * and with it the `UserReflectionRecord` that §27 explicitly says to create — so
 * it withheld the user's MEANING (which INV-18 grants them) in order to withhold
 * an evidentiary claim the contract already denies. Inheritance separates the two
 * concerns cleanly: the meaning is recorded and is theirs; only the claim to
 * independent support is refused.
 *
 * Gate 5 needs no change to make this stick. It counts DISTINCT units
 * (`gateLineageIntegrity`), so a reference and every reaction to it collapse to
 * one unit and the gate closes on its own — no special case, no new check.
 */
export const RELATE_TO_SELF_RELATION: LineageRelation = 'references';

/**
 * Roles for the user's OWN words when they relate a reference to themselves.
 *
 * `user_expression` — the user speaking, which is eligible material in general.
 * The external reference's own role does NOT travel to this new Record: roles
 * describe a record's own nature, and the user's sentence is their expression
 * even though it was prompted by outside material. What keeps this honest is the
 * lineage edge plus the withheld evidence unit above, not a borrowed role.
 */
export const relateToSelfRoles = (): readonly EpistemicRole[] => [
  'user_expression',
];

/* ── Executable invariants (§42) ──────────────────────────────────────── */

/**
 * INV-06 / §38, as a statement code can check rather than a comment.
 *
 * There is no field on `ExternalReferenceCapturePlan` that could carry an
 * evidence support level, a baseline, or a hypothesis reference — so there is no
 * path from this module to the evidence layer, and none of the four §27
 * prohibitions has anywhere to fail.
 */
export const EXTERNAL_REFERENCE_DEFINES_THE_USER = false as const;

/** §27 — an external reference is never itself independent personal evidence. */
export const EXTERNAL_REFERENCE_IS_INDEPENDENT_EVIDENCE = false as const;

/** §27 — nor a personal behavioral baseline (INV-15 forbids inventing one). */
export const EXTERNAL_REFERENCE_IS_PERSONAL_BASELINE = false as const;

/** §27 — presentation is pull-only; the system never pushes outside material. */
export const EXTERNAL_REFERENCE_IS_EVER_PROACTIVE = false as const;

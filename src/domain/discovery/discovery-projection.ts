/**
 * Discovery projection (ENGINEERING_CONTRACT §17, §18, §19, §20, §35, §36;
 * docs/architecture.md §4 Patch 6, §13).
 *
 * PURE. No I/O, no clock beyond the `now` passed in, no model call. The
 * application service resolves inputs and executes; every rule lives here.
 *
 * What a projection IS: a read-time view over records that already exist. §35
 * makes this explicit for the Supported Relation Pool — it is "a QUERY concept"
 * that "need not become an entity". So this module creates no fact, asserts no
 * new claim, and writes nothing but Discovery IDENTITY.
 *
 * Four structural guarantees, each corresponding to a Phase 5 constraint:
 *
 *   1. NO NEW FACTS. The only value this module mints is a Discovery identity
 *      derived from an existing subject. `DiscoveryProjection` holds references
 *      and computed presentation metadata — no assertion about the world.
 *
 *   2. NO HYPOTHESIS UPGRADE. Nothing here reads or writes a hypothesis's
 *      `supportBasis`, and `DiscoveryProjection` carries no truth, probability,
 *      or confidence field. A hypothesis that becomes a Discovery is exactly as
 *      provisional as it was before (§13).
 *
 *   3. TRACEABILITY. Every projection carries `subjectRef` back to the claim or
 *      hypothesis it came from, and `stableKey` is derived from that reference.
 *      Nothing is surfaced that cannot be traced to a stored record.
 *
 *   4. ATTENTION IS NOT VALIDITY. `SignalInputs` structurally excludes evidence
 *      support (INV-09, §36), and this module never reads `supportLevel` — not
 *      for signals, not for ordering, not for filtering.
 */

import {
  type AttentionAssessment,
  assessAttention,
} from './attention-priority';
import {
  type InterpretationRiskState,
  type NoveltyState,
  type PotentialState,
  type SignalInputs,
  type TemporalDepthState,
} from './attention-signals';
import {
  type Discovery,
  type DiscoverySubjectRef,
  deriveStableKey,
} from './discovery';
import { type CurrentFocusContext, deriveRelevance } from './focus-context';
import {
  type PresentationDecision,
  decidePresentation,
} from './presentation-level';
import type { DiscoveryKind, RelevanceState } from '../shared/enums';
import { discoveryId } from '../shared/ids';

/* ── Temporal depth (§12, §17) ────────────────────────────────────────── */

/**
 * MVP IMPLEMENTATION RULE — temporal depth thresholds.
 *
 * Mine, not the contract's. §17 names Temporal Depth as a signal; the intervals
 * are an implementation choice:
 *
 *   span under 7 days     → shallow
 *   7 to 90 days          → moderate
 *   over 90 days          → deep
 *   no resolvable bounds  → unknown
 *
 * `unknown` is not `shallow`. §12 forbids splitting a user-reported interval
 * into synthetic points, so a subject whose records carry only "这半年" with
 * unresolved bounds has UNKNOWN depth — the system may not manufacture a span it
 * was never given.
 */
export const MODERATE_DEPTH_DAYS = 7;
export const DEEP_DEPTH_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolved time points for a subject's underlying records.
 *
 * The caller supplies only points it could legitimately resolve. A record whose
 * time is an unresolved reported interval contributes NOTHING here rather than a
 * guessed midpoint.
 */
export const deriveTemporalDepth = (
  resolvedPoints: readonly Date[],
): TemporalDepthState => {
  if (resolvedPoints.length === 0) return 'unknown';

  const times = resolvedPoints.map((d) => d.getTime());
  const span = (Math.max(...times) - Math.min(...times)) / DAY_MS;

  if (span >= DEEP_DEPTH_DAYS) return 'deep';
  if (span >= MODERATE_DEPTH_DAYS) return 'moderate';
  return 'shallow';
};

/* ── Novelty (§17) ────────────────────────────────────────────────────── */

/**
 * MVP IMPLEMENTATION RULE — novelty derivation.
 *
 * Mine, not the contract's.
 *
 *   Discovery identity did not exist before this pass → `new`
 *   identity already existed                          → `seen`
 *
 * `resurfaced` is RESERVED and not yet derivable: distinguishing it from `seen`
 * requires presentation history, which MVP does not track (§40 excludes
 * background infrastructure). The enum value is retained because §17 treats
 * resurfacing as distinct from novelty, and collapsing it into `new` would let
 * repeated surfacing masquerade as fresh discovery.
 *
 * Behaviourally the reservation is harmless: neither `resurfaced` nor `seen`
 * elevates priority, so the conservative outcome is identical either way.
 */
export const deriveNovelty = (identityExistedBefore: boolean): NoveltyState =>
  identityExistedBefore ? 'seen' : 'new';

/* ── Projection request and result ────────────────────────────────────── */

/**
 * Everything the projection needs about one subject, already resolved.
 *
 * Note the absence of any evidence field. A caller CANNOT pass a support level
 * in, because there is nowhere to put it (INV-09, §36).
 */
export interface SubjectProjectionInput {
  readonly subjectRef: DiscoverySubjectRef;
  readonly discoveryKind: DiscoveryKind;

  /** True when a Discovery row already existed for this subject's stableKey. */
  readonly identityExistedBefore: boolean;

  /**
   * Resolved time points from the subject's underlying records. Records with
   * unresolvable time contribute nothing (§12).
   */
  readonly resolvedTimePoints: readonly Date[];

  /** §16.3 — the user archived this Discovery. */
  readonly archived: boolean;
  /** §16.2 — the user suspended this line of analysis. */
  readonly suspended: boolean;

  /** Patch 5 — independent Directive permissions. */
  readonly allowPassivePresentation: boolean;
  readonly allowProactivePresentation: boolean;

  /**
   * Reflection / Action Potential (§17).
   *
   * MVP IMPLEMENTATION RULE: optional, defaulting to `medium`. Whether a subject
   * offers the user real purchase is a semantic judgment, and MVP has no
   * deterministic basis for it. `medium` neither elevates nor caps.
   */
  readonly potential?: PotentialState;

  /**
   * Interpretation Risk (§17).
   *
   * MVP IMPLEMENTATION RULE: optional, defaulting to `high` — the conservative
   * end. Since high risk caps priority at `medium`, the default means MVP never
   * self-authorises proactive presentation on signal grounds alone, even if
   * Level 3 were enabled. Lowering it requires an explicit judgment.
   */
  readonly interpretationRisk?: InterpretationRiskState;
}

/**
 * A projected Discovery, ready to present.
 *
 * Everything except `discovery` is COMPUTED ON READ and must not be persisted
 * (Patch 6). The Discovery row holds identity alone.
 */
export interface DiscoveryProjection {
  /** Persisted identity. */
  readonly discovery: Discovery;
  /** Computed, not stored. */
  readonly attention: AttentionAssessment;
  /** Computed, not stored. */
  readonly presentation: PresentationDecision;
  /** The relevance signal actually used, for audit (§42). */
  readonly currentRelevance: RelevanceState;
}

/**
 * Project one subject.
 *
 * `discoveryId` is supplied by the caller rather than minted here, keeping this
 * function pure. The caller persists identity via `DiscoveryRepository.ensure`,
 * which is idempotent on `stableKey`.
 */
export const projectSubject = (input: {
  readonly subject: SubjectProjectionInput;
  readonly discoveryId: string;
  readonly focusContexts: readonly CurrentFocusContext[];
  readonly now: Date;
  readonly l3Enabled?: boolean;
}): DiscoveryProjection => {
  const { subject, focusContexts, now } = input;

  const currentRelevance = deriveRelevance(
    focusContexts,
    subject.subjectRef.id,
    now,
  );

  const signals: SignalInputs = {
    novelty: deriveNovelty(subject.identityExistedBefore),
    currentRelevance,
    temporalDepth: deriveTemporalDepth(subject.resolvedTimePoints),
    potential: subject.potential ?? 'medium',
    interpretationRisk: subject.interpretationRisk ?? 'high',
  };

  const attention = assessAttention(signals);

  const presentation = decidePresentation({
    attention,
    archived: subject.archived,
    suspended: subject.suspended,
    allowPassivePresentation: subject.allowPassivePresentation,
    allowProactivePresentation: subject.allowProactivePresentation,
    ...(input.l3Enabled === undefined ? {} : { l3Enabled: input.l3Enabled }),
  });

  const discovery: Discovery = {
    id: discoveryId(input.discoveryId),
    subjectRef: subject.subjectRef,
    discoveryKind: subject.discoveryKind,
    stableKey: deriveStableKey(subject.subjectRef, subject.discoveryKind),
    createdAt: now,
  };

  return { discovery, attention, presentation, currentRelevance };
};

/**
 * Order projections for the Awareness Stream.
 *
 * Ordered by presentation eligibility then recency — NEVER by evidence support
 * (INV-09, §36) and never by any score. Items the user cannot passively see are
 * excluded from the stream entirely rather than shown greyed out, because §18's
 * Level 1 means stored-only.
 *
 * Note this does not rank hypotheses against one another: §13 makes competing
 * explanations peers, and ordering them by plausibility would imply a confidence
 * the contract forbids.
 */
export const orderForStream = (
  projections: readonly DiscoveryProjection[],
): readonly DiscoveryProjection[] =>
  projections
    .filter((p) => p.presentation.passiveEligible)
    .slice()
    .sort(
      (a, b) =>
        b.discovery.createdAt.getTime() - a.discovery.createdAt.getTime(),
    );

/**
 * §17 — a Discovery carries no score overlapping evidence strength.
 *
 * Executable statement: this module exports no function producing a numeric
 * discovery value, and `DiscoveryProjection` has no such field.
 */
export const DISCOVERY_HAS_NUMERIC_VALUE = false as const;

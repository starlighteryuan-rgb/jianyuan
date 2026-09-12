/**
 * External Reference orchestration (ENGINEERING_CONTRACT §27, §28, §38, INV-06;
 * docs/architecture.md §8).
 *
 * Follows the established split: lookups and execution here, all rules in the
 * pure module (`src/domain/external/external-reference.ts`). This layer decides
 * nothing epistemic.
 *
 * WHY THIS SERVICE OWNS NO STORAGE OF ITS OWN:
 *
 * An external reference IS a Record — one carrying the `external_reference`
 * epistemic role — so it enters through `IngestionService.ingest` like anything
 * else and inherits every guarantee that path already provides: source
 * fingerprinting and dedup (§4, INV-16), Gate 1 storage permission (§26),
 * evidence-unit resolution (Patch 2/Patch 7), and lineage.
 *
 * The alternative — a dedicated ExternalReference table — was rejected. It would
 * create a second storage path for something the Record model already expresses,
 * and the quarantine that matters (Gate 2's hard filter on the role) keys on
 * being a Record. Material stored outside that path would be material Gate 2
 * never sees.
 *
 * THE ONE THING THIS SERVICE MUST NOT DO: let outside material reach the
 * evidence layer. §38 — external material may widen interpretation, it cannot
 * define the user. The defence is that `planExternalReferenceCapture` fixes the
 * role set, and Gate 2 refuses any claim touching that role. This service simply
 * obeys it and never re-decides it.
 */

import {
  type ExternalReferenceCapturePlan,
  type ExternalReferenceKind,
  type ExternalReferenceRefusal,
  type PresentationRefusal,
  type RetrievedExternalReference,
  RELATE_TO_SELF_RELATION,
  decideExternalReferencePresentation,
  orderByRetrievalPriority,
  planExternalReferenceCapture,
  relateToSelfRoles,
} from '../domain/external/external-reference';
import {
  type DirectiveSubject,
  type EffectivePermissions,
  resolveEffectivePermissions,
} from '../domain/directive/directive-resolution';
import type {
  DirectiveRepository,
  ReflectionEpisodeRepository,
  UserReflectionRecordRepository,
} from '../domain/ports/repositories';
import type { ReflectionEpisode } from '../domain/reflection/reflection-episode';
import type { UserReflectionRecord } from '../domain/reflection/user-reflection-record';
import type { NewIndependentContentDetermination } from '../domain/record/evidence-unit';
import {
  reflectionEpisodeId,
  userReflectionRecordId,
  type RecordId,
} from '../domain/shared/ids';
import { type Result, err, ok } from '../domain/shared/result';
import type {
  CaptureRequest,
  IngestionError,
  IngestionService,
} from './ingestion-service';

/**
 * Ids minted for the relate-to-self path.
 *
 * Deliberately a narrow interface rather than a reuse of
 * `ReflectionIdGenerator`: this path creates no StateAssignment (§16/Patch B
 * admits only relation_claim, hypothesis, and discovery as state targets), so
 * asking a caller for a state-assignment minter would imply a write that never
 * happens.
 */
export interface ExternalReferenceIdGenerator {
  nextReflectionEpisodeId(): string;
  nextUserReflectionRecordId(): string;
}

export interface ExternalReferenceDeps {
  readonly ingestion: IngestionService;
  readonly directives: DirectiveRepository;
  readonly episodes: ReflectionEpisodeRepository;
  readonly reflectionRecords: UserReflectionRecordRepository;
  readonly ids: ExternalReferenceIdGenerator;
}

/** Topic tags for directive scoping. Explicit only — never inferred (§13). */
export interface ExternalReferenceScope {
  readonly topicTags: readonly string[];
  readonly userSelectedRefs: readonly string[];
}

const EMPTY_SCOPE: ExternalReferenceScope = {
  topicTags: [],
  userSelectedRefs: [],
};

export type ImportOutcome = {
  readonly recordId: RecordId;
  /** True when this URL+excerpt was already stored (INV-16). */
  readonly deduplicated: boolean;
  readonly plan: ExternalReferenceCapturePlan;
};

export type ImportError =
  | ExternalReferenceRefusal
  | IngestionError;

export type RelateToSelfOutcome = {
  readonly recordId: RecordId;
  readonly episode: ReflectionEpisode;
  readonly reflectionRecord: UserReflectionRecord;
};

export class ExternalReferenceService {
  constructor(private readonly deps: ExternalReferenceDeps) {}

  /**
   * Import a retrieved external reference as a quarantined Record.
   *
   * The directive subject's `source` is set to the provider, so a directive
   * scoped to a platform ("别再给我看知乎的东西") matches without anyone having to
   * infer what "similar" means (§13, explicit-only scope).
   */
  async import(input: {
    readonly source: RetrievedExternalReference;
    readonly scope?: ExternalReferenceScope;
  }): Promise<Result<ImportOutcome, ImportError>> {
    const planned = planExternalReferenceCapture(input.source);

    if (!planned.ok) return err(planned.error);

    const plan = planned.value;
    const scope = input.scope ?? EMPTY_SCOPE;

    const capture: CaptureRequest = {
      origin: plan.origin,
      actor: plan.actor,
      sourceRef: plan.sourceRef,
      verbatim: plan.verbatim,
      language: plan.language,
      time: plan.time,
      epistemicRoles: plan.epistemicRoles,
      capturedAt: plan.capturedAt,
      // A retrieved article derives from nothing we hold. It is a root source in
      // the lineage sense — which says nothing about it being usable evidence,
      // because Gate 2 excludes the role outright regardless of lineage.
      derivation: null,
      subject: {
        topicTags: scope.topicTags,
        source: input.source.provider,
        // Outside material defines no personal comparison axis (§27, INV-06).
        relationAxes: [],
        userSelectedRefs: scope.userSelectedRefs,
      },
    };

    const ingested = await this.deps.ingestion.ingest(capture);

    if (!ingested.ok) return err(ingested.error);

    return ok({
      recordId: ingested.value.recordId,
      deduplicated: ingested.value.deduplicated,
      plan,
    });
  }

  /**
   * The user relates an external reference back to themselves (§27).
   *
   *   > If the user relates an external reference back to themselves, create a
   *   > NEW UserReflectionRecord. The external reference itself still does not
   *   > become proof about the user.
   *
   * Two things happen, and the second is the interesting one:
   *
   *   1. The user's own words become a Record with `user_expression`, linked to
   *      the external reference by a `references` lineage edge.
   *
   *   2. Because `references` is an INHERITING relation, `resolveEvidenceUnit`
   *      resolves the new Record onto the REFERENCE'S OWN evidence unit. Two
   *      Records, one Evidence Unit — so the user's reaction adds no independent
   *      support, and Gate 5 (which counts distinct units) closes on the pair by
   *      itself (INV-03, §27).
   *
   * The two concerns stay separate, which is the whole point:
   *
   *   MEANING          — recorded, and the user's own (§27 requires the
   *                      UserReflectionRecord; INV-18 makes the meaning theirs).
   *   EVIDENTIARY CLAIM — withheld. Inheriting IS the denial of new independent
   *                      support.
   *
   * docs/architecture.md §8 says whether such a record constitutes a new
   * independent `evidence_unit_id` is "a separate, explicit determination, not
   * automatic". Inheritance honours that: it is the automatic DENIAL of a new
   * unit, never an automatic grant. Minting one still requires the caller to
   * supply an explicit, audited determination, whose reason is stored for audit
   * (§42).
   *
   * So `determination` is optional and rarely appropriate: omit it and the user's
   * meaning is recorded while their reaction is correctly counted as no new
   * source. Supply it only on a real, defensible judgment that the user stated
   * new independent factual content of their own.
   */
  async relateToSelf(input: {
    readonly externalRecordId: RecordId;
    /** The user's own words. Preserved verbatim (§4.2). */
    readonly verbatim: string;
    readonly language: string | null;
    readonly scope?: ExternalReferenceScope;
    /** Supply ONLY on an explicit, audited independence judgment (arch §8). */
    readonly determination?: NewIndependentContentDetermination;
    readonly now: Date;
  }): Promise<Result<RelateToSelfOutcome, ImportError>> {
    const scope = input.scope ?? EMPTY_SCOPE;

    const capture: CaptureRequest = {
      origin: 'user_reported',
      actor: 'user',
      sourceRef: `external-reference:${input.externalRecordId}`,
      verbatim: input.verbatim,
      language: input.language,
      // The user is speaking now about what they just read.
      time: { semantic: 'observation_time', at: input.now },
      epistemicRoles: relateToSelfRoles(),
      capturedAt: input.now,
      derivation: {
        parentRecordId: input.externalRecordId,
        // `references`, not `derived_from`: this is the enforcement point. See
        // RELATE_TO_SELF_RELATION for the full reasoning.
        relationToParent: RELATE_TO_SELF_RELATION,
        ...(input.determination ? { determination: input.determination } : {}),
      },
      subject: {
        topicTags: scope.topicTags,
        source: null,
        relationAxes: [],
        userSelectedRefs: scope.userSelectedRefs,
      },
    };

    const ingested = await this.deps.ingestion.ingest(capture);

    // Fails closed when no determination was supplied. Nothing has been written.
    if (!ingested.ok) return err(ingested.error);

    // §22 — the stimulus was outside material, and the system did the inviting.
    // `external_reference` exists in StimulusType for exactly this case, so the
    // provenance is recorded rather than flattened into `unknown`.
    const episode: ReflectionEpisode = {
      id: reflectionEpisodeId(this.deps.ids.nextReflectionEpisodeId()),
      elicitationMode: 'prompted',
      stimulusType: 'external_reference',
      systemFollowupCount: 0,
      stimulusRef: input.externalRecordId,
      targetRef: input.externalRecordId,
      occurredAt: input.now,
    };

    await this.deps.episodes.save(episode);

    const reflectionRecord: UserReflectionRecord = {
      id: userReflectionRecordId(this.deps.ids.nextUserReflectionRecordId()),
      recordId: ingested.value.recordId,
      // Always tentative: `confirmed` is frozen out of MVP, and §24 keeps
      // spontaneity and certainty orthogonal — reading something and reacting to
      // it is not a commitment to an interpretation.
      meaningCommitment: 'tentative',
      validAtTime: { semantic: 'observation_time', at: input.now },
      currentEffect: 'current',
      supersededByRef: null,
      supersededAt: null,
      episodeRef: episode.id,
      createdAt: input.now,
    };

    await this.deps.reflectionRecords.save(reflectionRecord);

    return ok({
      recordId: ingested.value.recordId,
      episode,
      reflectionRecord,
    });
  }

  /**
   * May outside material be shown right now?
   *
   * Permissions are resolved on read so a revoked directive stops applying
   * immediately (§26) — the same discipline as `IngestionService` and
   * `DiscoveryService`.
   */
  async mayShow(input: {
    readonly userExplicitlyRequestedOutsidePerspective: boolean;
    readonly subject: Omit<DirectiveSubject, 'createdAt'>;
    readonly subjectCreatedAt: Date;
  }): Promise<Result<{ readonly mayShow: true }, PresentationRefusal>> {
    const permissions = await this.effectivePermissions(
      input.subject,
      input.subjectCreatedAt,
    );

    return decideExternalReferencePresentation({
      userExplicitlyRequestedOutsidePerspective:
        input.userExplicitlyRequestedOutsidePerspective,
      permissions,
    });
  }

  /**
   * Order candidates lived-experience-first (§27).
   *
   * Exposed here so a caller never has to know the ordering rule; it stays a
   * single decision in the domain.
   */
  orderForPresentation<T extends { readonly kind: ExternalReferenceKind }>(
    candidates: readonly T[],
  ): readonly T[] {
    return orderByRetrievalPriority(candidates);
  }

  private async effectivePermissions(
    subject: Omit<DirectiveSubject, 'createdAt'>,
    createdAt: Date,
  ): Promise<EffectivePermissions> {
    const active = await this.deps.directives.listActive();
    return resolveEffectivePermissions(active, { ...subject, createdAt });
  }
}

import type {
  HypothesisRepository,
  ReflectionEpisodeRepository,
  RelationClaimRepository,
  StateAssignmentRepository,
  UserReflectionRecordRepository,
} from '../domain/ports/repositories';
import type { ReflectionFeedback } from '../domain/reflection/response-routing';
import type { ReflectionPreference } from '../domain/reflection/reflection-preference';
import type { EvidenceSupportLevel } from '../domain/relation/evidence-dimensions';
import { relationClaimId } from '../domain/shared/ids';
import type {
  MeaningCommitment,
  MeaningEffect,
  UserPosition,
} from '../domain/shared/enums';
import type { TimeAssertion } from '../domain/shared/time-semantics';
import type { RecordQueries } from '../contracts/records';
import {
  ReflectionService,
  type RespondResult,
} from './reflection-service';

/** Presentation-safe view of a Relation that can be reflected on. */
export interface RelationReflectionTargetReadModel {
  readonly id: string;
  readonly recordRefs: readonly string[];
  readonly relationType: string;
  readonly question: string;
  readonly dimension: string;
  readonly evidenceSummary: string;
  readonly supportLevel: EvidenceSupportLevel | null;
  readonly createdAt: Date;
}

/**
 * One Reflection the user wrote themselves, projected for display.
 *
 * Every field comes from an already-persisted entity: `verbatim` from the
 * Record, the rest from the UserReflectionRecord that owns the meaning
 * lifecycle (§24, §25). Nothing is copied into a second state model, so this
 * page and History cannot disagree about what the user said.
 */
export interface UserReflectionReadModel {
  readonly id: string;
  /**
   * The user's words, exactly as stored. Never rewritten by AI or by this
   * layer. Null only when the underlying Record carries no displayable text,
   * which is reported rather than replaced with invented wording (§12).
   */
  readonly verbatim: string | null;
  readonly recordId: string;
  readonly meaningCommitment: MeaningCommitment;
  readonly currentEffect: MeaningEffect;
  readonly validAtTime: TimeAssertion;
  readonly createdAt: Date;
}

export interface ReflectionTargetReadModel {
  readonly relation: RelationReflectionTargetReadModel;
  readonly preference: ReflectionPreference;
  /**
   * What the user has already written about this Discovery, newest first.
   *
   * Read back from the same persisted facts History shows. It contains ONLY
   * user-authored text: an AI invitation is a question, never a reflection,
   * so nothing here can come from the provider (§21, §22).
   */
  readonly reflections: readonly UserReflectionReadModel[];
  /**
   * The user's recorded stance (§16). `none` until they take one.
   * A position is never evidence and never moves the support level (§15, §36).
   */
  readonly userPosition: UserPosition;
}

export interface ReflectionFlowDeps {
  readonly claims: RelationClaimRepository;
  readonly hypotheses: HypothesisRepository;
  readonly reflection: ReflectionService;
  readonly episodes: ReflectionEpisodeRepository;
  readonly reflectionRecords: UserReflectionRecordRepository;
  readonly states: StateAssignmentRepository;
  /** Record read side, so verbatim has one persisted source (no copying). */
  readonly records: RecordQueries;
}

/**
 * Complete Relation -> Reflection use case.
 *
 * Callers supply a target id and feedback only. Target resolution, invitation
 * provenance, episode persistence, and response capture stay behind this
 * application interface instead of leaking repositories into Presentation.
 */
export class ReflectionFlowService {
  constructor(private readonly deps: ReflectionFlowDeps) {}

  async getRelationTarget(
    targetRef: string,
    now: Date,
  ): Promise<ReflectionTargetReadModel | null> {
    const target = await this.loadRelationTarget(targetRef);
    if (target === null) return null;

    return {
      relation: {
        id: target.relation.id,
        recordRefs: target.relation.recordRefs,
        relationType: target.relation.relationType,
        question: target.relation.comparisonAxis.question,
        dimension: target.relation.comparisonAxis.dimension,
        evidenceSummary: target.relation.evidenceSummary,
        supportLevel: target.relation.supportLevel,
        createdAt: target.relation.createdAt,
      },
      preference: await this.deps.reflection.preference(now),
      reflections: await this.loadUserReflections(target.relation.id),
      userPosition: await this.loadUserPosition(target.relation.id),
    };
  }

  async respondToRelation(input: {
    readonly targetRef: string;
    readonly feedback: ReflectionFeedback;
    readonly now: Date;
  }): Promise<RespondResult | null> {
    const target = await this.loadRelationTarget(input.targetRef);
    if (target === null) return null;

    const invitation = await this.deps.reflection.invite({
      target: {
        targetType: 'relation_claim',
        targetRef: target.relation.id,
        relation: target.relation,
        hypotheses: target.hypotheses,
      },
      now: input.now,
    });

    return this.deps.reflection.respond({
      episode: invitation.episode,
      feedback: input.feedback,
      subject: {
        topicTags: [],
        source: null,
        relationAxes: [target.relation.comparisonAxis.dimension],
        userSelectedRefs: [target.relation.id],
      },
      targetType: 'relation_claim',
      targetRef: target.relation.id,
      now: input.now,
    });
  }

  private async loadRelationTarget(targetRef: string) {
    const relation = await this.deps.claims.findById(relationClaimId(targetRef));
    if (relation === null) return null;

    return {
      relation,
      hypotheses: await this.deps.hypotheses.findByAnchorRef(relation.id),
    };
  }

  /**
   * The user's own Reflections about one Discovery, newest first.
   *
   * The chain is the only one the persisted data supports: a Discovery's id is
   * an episode's `targetRef`, an episode's id is a reflection record's
   * `episodeRef`, and that record's `recordId` owns the verbatim text. Reading
   * verbatim through `RecordQueries` is what keeps this page and History on one
   * persisted fact instead of two copies that could drift.
   *
   * Superseded entries are kept (INV-12): it remains true that the user held
   * that meaning then, so `currentEffect` is exposed and nothing is filtered.
   */
  private async loadUserReflections(
    targetRef: string,
  ): Promise<readonly UserReflectionReadModel[]> {
    const episodes = await this.deps.episodes.listByTarget(targetRef);
    if (episodes.length === 0) return [];

    const grouped = await Promise.all(
      episodes.map((episode) =>
        this.deps.reflectionRecords.listByEpisode(episode.id),
      ),
    );

    const resolved = await Promise.all(
      grouped.flat().map(async (reflection) => {
        const record = await this.deps.records.getById(reflection.recordId);

        return {
          id: reflection.id,
          verbatim: record?.verbatim ?? null,
          recordId: reflection.recordId,
          meaningCommitment: reflection.meaningCommitment,
          currentEffect: reflection.currentEffect,
          validAtTime: reflection.validAtTime,
          createdAt: reflection.createdAt,
        } satisfies UserReflectionReadModel;
      }),
    );

    return resolved.sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
  }

  /**
   * The stance the user last recorded here (§16).
   *
   * Shown so a click is visibly remembered, which is the only feedback a
   * position can honestly give: it creates no Record and adds no evidence
   * (§15, §21, §36).
   */
  private async loadUserPosition(targetRef: string): Promise<UserPosition> {
    const state = await this.deps.states.findByTarget(
      'relation_claim',
      targetRef,
    );
    return state?.userPosition ?? 'none';
  }
}

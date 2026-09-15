/**
 * Reflection orchestration (ENGINEERING_CONTRACT §21–§25, §33).
 *
 * Follows the established split: lookups and execution here, all rules in the
 * pure planners (`reflection-invitation`, `response-routing`,
 * `meaning-lifecycle`). This layer decides nothing epistemic.
 *
 * THE ONE THING THIS SERVICE MUST NOT DO: create a Record from a button press.
 * §21 classifies "I'd like to say something" as an action and "leave it for now"
 * as a workflow action, neither being a factual claim. §15 then makes the stakes
 * concrete — if a click became a Record, and that Record became directional
 * support, agreement would silently raise evidence support.
 *
 * The defence is that `routeFeedback` is the only thing that decides, and it
 * captures nothing without free text. This service simply obeys it.
 */

import {
  buildInvitation,
  type ReflectionInvitation,
} from '../domain/reflection/reflection-invitation';
import {
  isPromptShaped,
  mayFollowUp,
  routeFeedback,
  type ReflectionFeedback,
  type RoutingDecision,
} from '../domain/reflection/response-routing';
import {
  defaultPreference,
  permittedFollowups,
  type ReflectionPreference,
} from '../domain/reflection/reflection-preference';
import type { ReflectionEpisode } from '../domain/reflection/reflection-episode';
import type { UserReflectionRecord } from '../domain/reflection/user-reflection-record';
import type { StoredHypothesis } from '../domain/hypothesis/hypothesis';
import type { StoredRelationClaim } from '../domain/relation/relation-claim';
import type {
  ReflectionEpisodeRepository,
  ReflectionPreferenceRepository,
  StateAssignmentRepository,
  UserReflectionRecordRepository,
} from '../domain/ports/repositories';
import type { StateTargetType } from '../domain/shared/enums';
import {
  reflectionEpisodeId,
  stateAssignmentId,
  userReflectionRecordId,
  type RecordId,
} from '../domain/shared/ids';
import type { CaptureRequest, IngestionService } from './ingestion-service';
import type { DirectiveSubject } from '../domain/directive/directive-resolution';

export interface ReflectionIdGenerator {
  nextReflectionEpisodeId(): string;
  nextUserReflectionRecordId(): string;
  nextStateAssignmentId(): string;
}

export interface ReflectionDeps {
  readonly episodes: ReflectionEpisodeRepository;
  readonly reflectionRecords: UserReflectionRecordRepository;
  readonly preferences: ReflectionPreferenceRepository;
  readonly states: StateAssignmentRepository;
  readonly ingestion: IngestionService;
  readonly ids: ReflectionIdGenerator;
}

export interface UpdateReflectionPreferenceInput {
  readonly hypothesisVisibility: ReflectionPreference['hypothesisVisibility'];
  readonly interventionLevel: ReflectionPreference['interventionLevel'];
  readonly explanationDensity: ReflectionPreference['explanationDensity'];
  readonly now: Date;
}

/** What the user is reflecting on. */
export interface ReflectionTarget {
  readonly targetType: StateTargetType;
  readonly targetRef: string;
  readonly relation: StoredRelationClaim | null;
  readonly hypotheses: readonly StoredHypothesis[];
}

export interface InviteResult {
  readonly invitation: ReflectionInvitation;
  readonly episode: ReflectionEpisode;
  readonly preference: ReflectionPreference;
}

export interface RespondResult {
  readonly decision: RoutingDecision;
  /** Present only when the user wrote something. */
  readonly recordId: RecordId | null;
  /** Present only when a Record was created. */
  readonly reflectionRecord: UserReflectionRecord | null;
  /**
   * Whether this response was shaped by system prompting past the §23 budget.
   *
   * Surfaced rather than acted on: §23 says such a response is still stored as
   * genuine user history, but must not strengthen hypothesis evidence. See the
   * note on `promptShaped` in the class doc below.
   */
  readonly promptShaped: boolean;
  readonly episode: ReflectionEpisode;
}

export class ReflectionService {
  constructor(private readonly deps: ReflectionDeps) {}

  /** The user's preference, or the conservative default if unset (§33). */
  async preference(now: Date): Promise<ReflectionPreference> {
    const stored = await this.deps.preferences.find();
    return stored ?? defaultPreference(now);
  }

  /** Replace the user's current interaction preference without keeping history. */
  async updatePreference(
    input: UpdateReflectionPreferenceInput,
  ): Promise<ReflectionPreference> {
    const current = await this.preference(input.now);
    const updated: ReflectionPreference = {
      ...current,
      hypothesisVisibility: input.hypothesisVisibility,
      interventionLevel: input.interventionLevel,
      explanationDensity: input.explanationDensity,
      updatedAt: input.now,
    };

    await this.deps.preferences.save(updated);
    return updated;
  }

  /**
   * Open a reflection on a target.
   *
   * Creates the episode with `prompted` elicitation, because the system is doing
   * the inviting. A spontaneous reflection uses `recordSpontaneous` instead —
   * the two are never conflated, since §22 makes provenance load-bearing.
   */
  async invite(input: {
    readonly target: ReflectionTarget;
    readonly now: Date;
  }): Promise<InviteResult> {
    const preference = await this.preference(input.now);

    const invitation = buildInvitation({
      targetRef: input.target.targetRef,
      relation: input.target.relation,
      hypotheses: input.target.hypotheses,
      visibility: preference.hypothesisVisibility,
      density: preference.explanationDensity,
    });

    const episode: ReflectionEpisode = {
      id: reflectionEpisodeId(this.deps.ids.nextReflectionEpisodeId()),
      elicitationMode: 'prompted',
      stimulusType: invitation.stimulusType,
      // No follow-up has happened yet; the invitation itself is not one.
      systemFollowupCount: 0,
      stimulusRef: input.target.targetRef,
      targetRef: input.target.targetRef,
      occurredAt: input.now,
    };

    await this.deps.episodes.save(episode);

    return { invitation, episode, preference };
  }

  /**
   * Record a reflection the user began unprompted.
   *
   * §22: `spontaneous` + `none`, with zero follow-ups. Kept as a separate entry
   * point so a spontaneous reflection can never be recorded as prompted, and
   * vice versa — provenance is not a parameter the caller can get subtly wrong.
   */
  async recordSpontaneous(input: {
    readonly targetRef: string | null;
    readonly now: Date;
  }): Promise<ReflectionEpisode> {
    const episode: ReflectionEpisode = {
      id: reflectionEpisodeId(this.deps.ids.nextReflectionEpisodeId()),
      elicitationMode: 'spontaneous',
      stimulusType: 'none',
      systemFollowupCount: 0,
      stimulusRef: null,
      targetRef: input.targetRef,
      occurredAt: input.now,
    };

    await this.deps.episodes.save(episode);
    return episode;
  }

  /**
   * Handle the user's feedback.
   *
   * Order matters: route first (pure), then execute. Nothing is written before
   * the decision is made, so there is no partial state if routing declines to
   * capture.
   */
  async respond(input: {
    readonly episode: ReflectionEpisode;
    readonly feedback: ReflectionFeedback;
    readonly subject: Omit<DirectiveSubject, 'createdAt'>;
    readonly targetType: StateTargetType;
    readonly targetRef: string;
    readonly now: Date;
  }): Promise<RespondResult> {
    const decision = routeFeedback(input.feedback);

    const promptShaped = isPromptShaped({
      systemFollowupCount: input.episode.systemFollowupCount,
      userInitiatedContinuation: input.feedback.userInitiatedContinuation,
    });

    // ── Position always recorded; evidence never touched (§15, §36) ────────
    await this.savePosition({
      targetType: input.targetType,
      targetRef: input.targetRef,
      decision,
      now: input.now,
    });

    // ── Capture ONLY if the user wrote something (§21) ─────────────────────
    if (decision.captureText === null) {
      return {
        decision,
        recordId: null,
        reflectionRecord: null,
        promptShaped,
        episode: input.episode,
      };
    }

    const capture: CaptureRequest = {
      origin: 'user_reported',
      actor: 'user',
      sourceRef: `reflection:${input.episode.id}`,
      verbatim: decision.captureText,
      language: null,
      time: { semantic: 'observation_time', at: input.now },
      // §22 — a reflection is the user's own expression.
      epistemicRoles: ['user_expression'],
      capturedAt: input.now,
      // No parent Record: the stimulus was a claim or hypothesis, not a Record.
      // Per Patch 7 this does NOT by itself confer independent-support status;
      // that remains a separate determination at Gate 5 / H2 time.
      derivation: null,
      subject: input.subject,
    };

    const ingested = await this.deps.ingestion.ingest(capture);

    if (!ingested.ok) {
      throw new Error(
        `Failed to capture the user's reflection: ${ingested.error.kind}. The ` +
          'text was not stored, and no reflection record was created.',
      );
    }

    const reflectionRecord: UserReflectionRecord = {
      id: userReflectionRecordId(this.deps.ids.nextUserReflectionRecordId()),
      recordId: ingested.value.recordId,
      // Always tentative: `confirmed` is frozen out of MVP, and §24 warns
      // spontaneity is not certainty.
      meaningCommitment: decision.meaningCommitment,
      // The meaning is asserted as of now. A meaning ABOUT another period is a
      // separate act the MVP does not offer.
      validAtTime: { semantic: 'observation_time', at: input.now },
      currentEffect: 'current',
      supersededByRef: null,
      supersededAt: null,
      episodeRef: input.episode.id,
      createdAt: input.now,
    };

    await this.deps.reflectionRecords.save(reflectionRecord);

    return {
      decision,
      recordId: ingested.value.recordId,
      reflectionRecord,
      promptShaped,
      episode: input.episode,
    };
  }

  /**
   * Whether the system may ask one more question.
   *
   * Two limits, both binding: §23's hard cap of one, and the user's
   * `interventionLevel`, which may only LOWER it. `minimal` permits none.
   */
  async mayAskFollowUp(input: {
    readonly episode: ReflectionEpisode;
    readonly userInitiatedContinuation: boolean;
    readonly now: Date;
  }): Promise<boolean> {
    const preference = await this.preference(input.now);

    if (permittedFollowups(preference) === 0) {
      // The user asked for no automatic follow-ups. A user-driven continuation
      // is still their own choice, so it remains permitted.
      return input.userInitiatedContinuation;
    }

    return mayFollowUp({
      systemFollowupCount: input.episode.systemFollowupCount,
      userInitiatedContinuation: input.userInitiatedContinuation,
    });
  }

  /**
   * Record that one follow-up occurred.
   *
   * Increments the count on the episode, which is what makes §23's cap
   * observable after the fact.
   */
  async noteFollowUp(
    episode: ReflectionEpisode,
  ): Promise<ReflectionEpisode> {
    const updated: ReflectionEpisode = {
      ...episode,
      systemFollowupCount: episode.systemFollowupCount + 1,
    };

    await this.deps.episodes.save(updated);
    return updated;
  }

  /**
   * Persist the user's position.
   *
   * Preserves any existing workflow and presentation state: a position is a
   * stance, and §16.1 keeps stance orthogonal to workflow. Only `deferred`
   * touches presentation, and §21 classifies that as a workflow action rather
   * than a judgment.
   */
  private async savePosition(input: {
    readonly targetType: StateTargetType;
    readonly targetRef: string;
    readonly decision: RoutingDecision;
    readonly now: Date;
  }): Promise<void> {
    const existing = await this.deps.states.findByTarget(
      input.targetType,
      input.targetRef,
    );

    await this.deps.states.save({
      id:
        existing?.id ??
        stateAssignmentId(this.deps.ids.nextStateAssignmentId()),
      targetType: input.targetType,
      targetRef: input.targetRef,
      userPosition: input.decision.userPosition,
      workflowState: existing?.workflowState ?? 'active',
      presentationState: existing?.presentationState ?? 'active',
      updatedAt: input.now,
    });
  }
}

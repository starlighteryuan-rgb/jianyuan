/**
 * Mobile runtime — the single entry point UI code is allowed to call.
 *
 * Components talk to `MobileRuntime`, never to Core services or to the storage
 * adapter. That keeps one place where a capture is shaped, where a Record list
 * is read, where Awareness runs, and where runtime status is reported, so
 * semantics cannot drift between screens.
 *
 * CAPTURE SHAPE
 * Deliberately the same shape Desktop sends to IngestionService, with the
 * source tag changed to `mobile_ui`:
 *   origin   user_reported — the user is reporting their own experience
 *   actor    user
 *   roles    ['user_expression'] — exactly one role, never inferred
 *   time     capture_time — no event time is asserted, because the user did not
 *            state when it happened; asserting one would invent chronology
 *   derivation null — M1 has no derived capture
 *   subject  empty directive attributes — nothing is inferred for scoping
 *
 * NO AI ON SAVE
 * `capture` touches only ingestion. There is no provider call anywhere in this
 * method or below it in the Mobile path, which is the invariant the Record
 * screen depends on and that tests/record-does-not-call-ai.test.ts asserts.
 */

import {
  recordId,
  type Directive,
  type IngestionOutcome,
  type RecordReadModel,
  type ReflectionResponse,
} from '../../../../packages/core/index';

import type { MobileComposition } from './composition-root';
import { mobileAnalysisPermissionFor } from './composition-root';
import { AI_API_KEY_SECRET_NAME } from './secret-store';
import {
  NOOP_AWARENESS_HISTORY_STORAGE,
  countUnreadAwarenessItems,
  readAwarenessHistory,
  upsertAwarenessHistoryItem,
  updateAwarenessHistoryItem,
  writeAwarenessHistory,
  type AwarenessHistoryStorage,
} from './awareness-history-store';
import {
  NOOP_AWARENESS_AUTOMATION_STORAGE,
  beginAutomaticAwarenessJob,
  enqueueAutomaticAwarenessRecord,
  finishAutomaticAwarenessJob,
  markAutomaticAwarenessJobRunning,
  readAwarenessAutomationState,
  recoverInterruptedAutomaticAwarenessJob,
  writeAwarenessAutomationState,
  type AwarenessAutomationJob,
  type AwarenessAutomationState,
  type AwarenessAutomationStorage,
} from './awareness-automation-store';
import {
  DEFAULT_AUTOMATIC_AWARENESS_POLICY,
  NOOP_AWARENESS_PREFERENCE_STORAGE,
  readAutomaticAwarenessPolicy,
  writeAutomaticAwarenessPolicy,
  type AutomaticAwarenessPolicy,
  type AwarenessPreferenceStorage,
} from './awareness-preference-store';
import {
  MobileAIInsightAuditLog,
  RelationCandidateRegistry,
  submitObservationReflection,
  suggestRelations,
  type AwarenessHistoryItem,
  type CandidateDecisionResult,
  type MobileAIInsightAuditEntry,
  type ObservationMeaning,
  type RelationCandidateView,
  type RelationSuggestionExperience,
} from './awareness-session';

/** Default size for the recent-records timeline. */
export const DEFAULT_TIMELINE_LIMIT = 50;

/** Maximum the UI will ask for; Core caps reads at 100 regardless. */
export const MAX_TIMELINE_LIMIT = 100;

export type CaptureFailureKind =
  | 'empty_input'
  | 'storage_not_permitted'
  | 'core_refusal';

export interface CaptureFailure {
  readonly kind: CaptureFailureKind;
  readonly message: string;
}

export type CaptureResult =
  | { readonly ok: true; readonly outcome: IngestionOutcome }
  | { readonly ok: false; readonly failure: CaptureFailure };

/**
 * The user-facing acknowledgement after a Record is saved.
 *
 * Stated once, here, so every save path shows the same words.
 */
export const RECORD_SAVED_MESSAGE = '已经记下来了。';

export interface CreateDirectiveInput {
  readonly allowAnalysis: boolean;
  readonly allowStorage: boolean;
  readonly allowPassivePresentation: boolean;
  readonly allowProactivePresentation: boolean;
  readonly appliesToFutureSimilar: boolean;
  readonly scopeKind: 'topic_tag' | 'source' | 'relation_axis' | 'user_selected' | null;
  readonly scopeValue: string;
}

const DEFAULT_AUTOMATIC_AWARENESS_QUIET_WINDOW_MS = 8_000;

const canonicalCandidateRecordRefs = (candidate: RelationCandidateView): string =>
  [...candidate.suggestion.recordRefs].sort().join('\u0000');

export class MobileRuntime {
  private readonly candidates = new RelationCandidateRegistry();
  private readonly insightAudit = new MobileAIInsightAuditLog();
  private readonly awarenessHistoryStorage: AwarenessHistoryStorage;
  private readonly awarenessPreferenceStorage: AwarenessPreferenceStorage;
  private readonly awarenessAutomationStorage: AwarenessAutomationStorage;
  private awarenessPolicy = DEFAULT_AUTOMATIC_AWARENESS_POLICY;
  private quietWindowTimer: ReturnType<typeof setTimeout> | null = null;
  private automaticDrainTail: Promise<void> = Promise.resolve();
  private automaticDrainRequested = false;
  private readonly awarenessListeners = new Set<() => void>();

  constructor(
    readonly composition: MobileComposition,
    awarenessHistoryStorage: AwarenessHistoryStorage = NOOP_AWARENESS_HISTORY_STORAGE,
    awarenessPreferenceStorage: AwarenessPreferenceStorage = NOOP_AWARENESS_PREFERENCE_STORAGE,
    awarenessAutomationStorage: AwarenessAutomationStorage = NOOP_AWARENESS_AUTOMATION_STORAGE,
  ) {
    this.awarenessHistoryStorage = awarenessHistoryStorage;
    this.awarenessPreferenceStorage = awarenessPreferenceStorage;
    this.awarenessAutomationStorage = awarenessAutomationStorage;
  }

  /** Restore policy and recover an interrupted job without calling AI. */
  async hydrateAwarenessAutomation(): Promise<void> {
    this.awarenessPolicy = await readAutomaticAwarenessPolicy(
      this.awarenessPreferenceStorage,
    );
    if (!this.awarenessPolicy.afterRecordCapture) return;
    const current = await readAwarenessAutomationState(this.awarenessAutomationStorage);
    const recovered = recoverInterruptedAutomaticAwarenessJob(current, new Date());
    if (recovered !== current) {
      await writeAwarenessAutomationState(this.awarenessAutomationStorage, recovered);
    }
    if (recovered.pendingRecordIds.length > 0) {
      this.scheduleAutomaticAwareness();
    }
  }
  /**
   * Save one Record from the user's own wording.
   *
   * The verbatim text is trimmed for the empty check ONLY. What is stored is
   * the user's original string, unmodified: Core preserves modal markers such as
   * 可能 / 好像 / 我觉得, and normalising them here would violate §4.2.
   */
  async capture(rawVerbatim: string, now: Date = new Date()): Promise<CaptureResult> {
    if (rawVerbatim.trim().length === 0) {
      return {
        ok: false,
        failure: { kind: 'empty_input', message: '请先写下一句你自己的话。' },
      };
    }

    const result = await this.composition.ingestion.ingest({
      origin: 'user_reported',
      actor: 'user',
      // A fresh source ref per capture. Identity is still content-derived:
      // computeSourceFingerprint hashes the canonical source string, so two
      // captures of the same wording with different refs are two sources. This
      // matches Desktop, whose ref is also a fresh UUID per capture.
      sourceRef: `mobile:capture:${now.getTime()}-${Math.random().toString(36).slice(2)}`,
      verbatim: rawVerbatim,
      language: null,
      time: { semantic: 'capture_time', at: now },
      epistemicRoles: ['user_expression'],
      capturedAt: now,
      derivation: null,
      subject: {
        topicTags: [],
        source: MOBILE_SOURCE,
        relationAxes: [],
        userSelectedRefs: [],
      },
    });

    if (!result.ok) {
      const kind = result.error.kind === 'storage_not_permitted'
        ? 'storage_not_permitted'
        : 'core_refusal';
      return {
        ok: false,
        failure: {
          kind,
          message:
            kind === 'storage_not_permitted'
              ? '你已经设置过不允许保存这类内容。'
              : '这条记录没有被保存。',
        },
      };
    }

    if (this.awarenessPolicy.afterRecordCapture) {
      await this.enqueueAutomaticAwareness(result.value.recordId);
    }

    return { ok: true, outcome: result.value };
  }

  /** Whether the user has opted into automatic checks after a Record save. */
  automaticAwarenessPolicy(): AutomaticAwarenessPolicy {
    return this.awarenessPolicy;
  }

  /** Persist the runtime preference. OFF is immediate: no queued check runs. */
  async setAutomaticAwarenessEnabled(enabled: boolean): Promise<void> {
    this.awarenessPolicy = { afterRecordCapture: enabled };
    await writeAutomaticAwarenessPolicy(this.awarenessPreferenceStorage, this.awarenessPolicy);
    if (!enabled) this.cancelAutomaticAwarenessWindow();
  }

  /** Number of pending inbox items. This is the real Tab badge source. */
  /** Mark one concrete bubble as viewed. Entering the Tab never calls this. */
  async markAwarenessViewed(candidateId: string): Promise<readonly AwarenessHistoryItem[]> {
    const current = await this.awarenessHistory();
    const next = updateAwarenessHistoryItem(current, candidateId, {
      status: 'viewed',
      updatedAt: new Date().toISOString(),
    });
    await writeAwarenessHistory(this.awarenessHistoryStorage, next);
    this.notifyAwarenessChanged();
    return next;
  }

  async unreadAwarenessCount(): Promise<number> {
    return countUnreadAwarenessItems(await this.awarenessHistory());
  }

  /** Pending automatic state is exposed for tests and diagnostics, never as Core. */
  async automaticAwarenessState(): Promise<AwarenessAutomationState> {
    return readAwarenessAutomationState(this.awarenessAutomationStorage);
  }

  private cancelAutomaticAwarenessWindow(): void {
    if (this.quietWindowTimer !== null) {
      clearTimeout(this.quietWindowTimer);
      this.quietWindowTimer = null;
    }
  }

  private scheduleAutomaticAwareness(delayMs = DEFAULT_AUTOMATIC_AWARENESS_QUIET_WINDOW_MS): void {
    this.cancelAutomaticAwarenessWindow();
    this.quietWindowTimer = setTimeout(() => {
      this.quietWindowTimer = null;
      void this.requestAutomaticAwareness();
    }, delayMs);
  }

  private async enqueueAutomaticAwareness(recordId: string): Promise<void> {
    const current = await readAwarenessAutomationState(this.awarenessAutomationStorage);
    const next = enqueueAutomaticAwarenessRecord(current, recordId);
    if (next !== current) {
      await writeAwarenessAutomationState(this.awarenessAutomationStorage, next);
    }
    this.scheduleAutomaticAwareness();
  }

  /** Flush the scheduled work in tests and explicit foreground drains. */
  async runScheduledAutomaticAwareness(): Promise<void> {
    this.cancelAutomaticAwarenessWindow();
    return this.requestAutomaticAwareness();
  }

  /** Stop timers and wait for an in-flight automatic check before storage closes. */
  async close(): Promise<void> {
    this.cancelAutomaticAwarenessWindow();
    await this.automaticDrainTail;
  }

  /** Serialize drains and coalesce requests made while one is already running. */
  private requestAutomaticAwareness(): Promise<void> {
    if (!this.awarenessPolicy.afterRecordCapture) return Promise.resolve();
    this.automaticDrainRequested = true;
    const request = this.automaticDrainTail.then(async () => {
      if (!this.automaticDrainRequested) return;
      this.automaticDrainRequested = false;
      await this.performAutomaticAwareness();
    });
    this.automaticDrainTail = request.catch(() => undefined);
    return request;
  }

  private async performAutomaticAwareness(): Promise<void> {
    const current = await readAwarenessAutomationState(this.awarenessAutomationStorage);
    if (current.pendingRecordIds.length === 0) return;

    const started = beginAutomaticAwarenessJob(current, new Date());
    if (started.job === null) return;
    const job = started.job;
    if (started.state !== current) {
      await writeAwarenessAutomationState(this.awarenessAutomationStorage, started.state);
    }

    const running = markAutomaticAwarenessJobRunning(started.state, job.id, new Date());
    await writeAwarenessAutomationState(this.awarenessAutomationStorage, running);

    const latestRecordId = job.recordIds.at(-1);
    if (latestRecordId === undefined) return;

    // A crash can happen after candidates were written but before the job was
    // marked complete. Recover from that durable result instead of calling the
    // Provider again and risking a duplicate Bubble.
    const alreadyCovered = await this.awarenessHistory();
    if (alreadyCovered.some((item) => item.automationJobId === job.id)) {
      await writeAwarenessAutomationState(
        this.awarenessAutomationStorage,
        finishAutomaticAwarenessJob(running, {
          jobId: job.id,
          status: 'completed',
          coveredRecordIds: job.recordIds,
          at: new Date(),
        }),
      );
      return;
    }

    const experience = await suggestRelations(
      this.composition,
      latestRecordId,
      this.candidates,
      this.insightAudit,
      { batchRecordIds: job.recordIds },
    );

    if (experience.status === 'candidates') {
      await this.recordAutomaticCandidates(started.job, experience.candidates);
      const afterCandidates = await readAwarenessAutomationState(this.awarenessAutomationStorage);
      await writeAwarenessAutomationState(
        this.awarenessAutomationStorage,
        finishAutomaticAwarenessJob(afterCandidates, {
          jobId: started.job.id,
          status: 'completed',
          coveredRecordIds: started.job.recordIds,
          at: new Date(),
        }),
      );
      return;
    }

    const afterRun = await readAwarenessAutomationState(this.awarenessAutomationStorage);
    await writeAwarenessAutomationState(
      this.awarenessAutomationStorage,
      finishAutomaticAwarenessJob(afterRun, {
        jobId: started.job.id,
        status:
          experience.status === 'no_candidate' ||
          experience.status === 'not_enough_context'
            ? 'no_observation'
            : 'failed',
        ...(experience.status === 'no_candidate' ||
        experience.status === 'not_enough_context'
          ? { coveredRecordIds: started.job.recordIds }
          : { failureReason: experience.status }),
        at: new Date(),
      }),
    );
  }

  private async recordAutomaticCandidates(
    job: AwarenessAutomationJob,
    candidates: readonly RelationCandidateView[],
  ): Promise<void> {
    const current = await this.awarenessHistory();
    const now = new Date().toISOString();
    let next = current;
    for (const candidate of candidates) {
      const idempotentMatch = next.find(
        (item) =>
          item.automationJobId === job.id &&
          canonicalCandidateRecordRefs(item.candidate) ===
            canonicalCandidateRecordRefs(candidate),
      );
      if (idempotentMatch !== undefined) continue;
      next = upsertAwarenessHistoryItem(next, {
        candidateId: candidate.candidateId,
        status: 'pending',
        automationJobId: job.id,
        createdAt: now,
        updatedAt: now,
        currentRecordId: candidate.currentRecord.id,
        suggestion: candidate.suggestion,
        candidate,
        meaning: null,
        reflectionText: null,
        targetRef: null,
        reflectionRecordId: null,
      });
    }
    await writeAwarenessHistory(this.awarenessHistoryStorage, next);
    this.notifyAwarenessChanged();
  }
  /** Recent Records, newest first, for the timeline. */
  /** Durable Awareness history, newest first. */
  async awarenessHistory(): Promise<readonly AwarenessHistoryItem[]> {
    return readAwarenessHistory(this.awarenessHistoryStorage);
  }

  /** Subscribe to inbox changes so the Bottom Tab badge uses real state. */
  subscribeAwareness(listener: () => void): () => void {
    this.awarenessListeners.add(listener);
    return () => this.awarenessListeners.delete(listener);
  }

  private notifyAwarenessChanged(): void {
    for (const listener of this.awarenessListeners) listener();
  }

  async listRecent(limit: number = DEFAULT_TIMELINE_LIMIT): Promise<readonly RecordReadModel[]> {
    const capped = Math.min(Math.max(limit, 1), MAX_TIMELINE_LIMIT);
    return this.composition.records.listRecent({ limit: capped });
  }

  async getRecord(id: string): Promise<RecordReadModel | null> {
    return this.composition.records.getById(id);
  }

  /** Search over preserved Record wording. */
  async search(query: string, limit: number = DEFAULT_TIMELINE_LIMIT): Promise<readonly RecordReadModel[]> {
    return this.composition.records.search({ query, limit });
  }

  /**
   * Explicit Awareness request.
   *
   * Called only from the user's "开始一次觉察" action. The page-open path never
   * calls this method, so opening Awareness performs no AI request.
   */
  suggestRelations(currentRecordId: string): Promise<RelationSuggestionExperience> {
    return suggestRelations(
      this.composition,
      currentRecordId,
      this.candidates,
      this.insightAudit,
    ).then(async (experience) => {
      if (experience.status !== 'candidates') return experience;
      const current = await this.awarenessHistory();
      const now = new Date().toISOString();
      let next = current;
      for (const candidate of experience.candidates) {
        // Re-requesting one Record replaces its prior pending card rather than
        // leaving stale duplicates in the durable history.
        const withoutStaleCard = next.filter(
          (item) =>
            !(
              item.currentRecordId === candidate.currentRecord.id &&
              item.status === 'pending' &&
              item.candidateId !== candidate.candidateId
            ),
        );
        next = upsertAwarenessHistoryItem(withoutStaleCard, {
          candidateId: candidate.candidateId,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          currentRecordId: candidate.currentRecord.id,
          suggestion: candidate.suggestion,
          candidate,
          meaning: null,
          reflectionText: null,
          targetRef: null,
          reflectionRecordId: null,
        });
      }
      await writeAwarenessHistory(this.awarenessHistoryStorage, next);
      this.notifyAwarenessChanged();
      return experience;
    });
  }

  /** Respond to one transient Observation. Only free text may reach Core. */
  submitObservationReflection(input: {
    readonly candidateId: string;
    readonly meaning: ObservationMeaning;
    readonly reflectionText?: string;
    readonly now?: Date;
  }): Promise<CandidateDecisionResult> {
    return submitObservationReflection(
      this.composition,
      {
        candidateId: input.candidateId,
        meaning: input.meaning,
        ...(input.reflectionText === undefined
          ? {}
          : { reflectionText: input.reflectionText }),
        now: input.now ?? new Date(),
      },
      this.candidates,
    ).then(async (result) => {
      const current = await this.awarenessHistory();
      // Only terminal outcomes update durable history. A validation error
      // (`reflection_required`) or a transient failure (`unavailable`) must
      // leave the item pending, and a rejection must not retain text the user
      // typed before switching to `not_my_experience`.
      if (
        result.status !== 'discovery' &&
        result.status !== 'reflection_saved' &&
        result.status !== 'discarded'
      ) {
        return result;
      }
      const persistedUserText =
        result.status === 'discovery' || result.status === 'reflection_saved'
          ? input.reflectionText ?? null
          : null;
      const next = updateAwarenessHistoryItem(current, input.candidateId, {
        status: result.status === 'discarded' ? 'dismissed' : 'reflected',
        updatedAt: new Date().toISOString(),
        meaning: input.meaning,
        reflectionText: persistedUserText,
        targetRef:
          result.status === 'discovery' || result.status === 'reflection_saved'
            ? result.targetRef
            : null,
        reflectionRecordId:
          result.status === 'discovery' || result.status === 'reflection_saved'
            ? result.reflectionRecordId ?? null
            : null,
      });
      await writeAwarenessHistory(this.awarenessHistoryStorage, next);
      this.notifyAwarenessChanged();
      return result;
    });
  }


  /** Understanding: persisted Reflections attached to a relation target. */
  getReflectionTarget(targetRef: string, now: Date = new Date()) {
    return this.composition.reflectionFlow.getRelationTarget(targetRef, now);
  }

  /**
   * Understanding read model for the user's own persisted Reflections.
   *
   * This deliberately does not start from Relations: a Reflection is saved
   * before the Core Gate, and remains readable when no Relation was admitted.
   */
  async listUnderstandingReflections(): Promise<
    readonly {
      readonly reflectionRecordId: string;
      readonly recordId: string;
      readonly verbatim: string;
      readonly createdAt: Date;
      readonly targetRef: string | null;
      readonly relatedToRelation: boolean;
    }[]
  > {
    const reflections = await this.composition.storage.userReflectionRecords.listRecent(100);
    const discoveries = await this.listDiscoveries();
    const relationTargetByRecordId = new Map<string, string>();
    for (const item of discoveries) {
      if (item.kind !== 'relation') continue;
      const target = await this.composition.reflectionFlow.getRelationTarget(
        item.subject.id,
        new Date(),
      );
      if (target === null) continue;
      for (const reflection of target.reflections) {
        relationTargetByRecordId.set(reflection.recordId, item.subject.id);
      }
    }
    const resolved = await Promise.all(
      reflections.map(async (reflection) => {
        const record = await this.composition.records.getById(reflection.recordId);
        if (record === null) return null;
        const targetRef =
          relationTargetByRecordId.get(reflection.recordId) ?? null;
        return {
          reflectionRecordId: reflection.id,
          recordId: reflection.recordId,
          verbatim: record.verbatim ?? '',
          createdAt: reflection.createdAt,
          targetRef,
          relatedToRelation: targetRef !== null,
        };
      }),
    );
    return resolved.filter((item) => item !== null);
  }

  /** Understanding / Exploration source: every passively-eligible Discovery. */
  listDiscoveries(now: Date = new Date()) {
    return this.composition.discovery.listStream({ now, relationLimit: 100 });
  }

  /** Reflection detail: record a position or free text against a target. */
  respondToReflection(input: {
    readonly targetRef: string;
    readonly response?: ReflectionResponse;
    readonly freeText?: string;
    readonly leaveForNow?: boolean;
    readonly now?: Date;
  }) {
    return this.composition.reflectionFlow.respondToRelation({
      targetRef: input.targetRef,
      feedback: {
        response: input.response ?? null,
        freeText: input.freeText ?? null,
        leaveForNow: input.leaveForNow ?? false,
        userInitiatedContinuation: false,
      },
      now: input.now ?? new Date(),
    });
  }

  /** Reflection interaction preference (intervention level, density, visibility). */
  reflectionPreference(now: Date = new Date()) {
    return this.composition.reflection.preference(now);
  }

  updateReflectionPreference(input: {
    readonly hypothesisVisibility: 'hidden' | 'on_request' | 'shown';
    readonly interventionLevel: 'minimal' | 'standard';
    readonly explanationDensity: 'brief' | 'full';
    readonly now?: Date;
  }) {
    return this.composition.reflection.updatePreference({
      hypothesisVisibility: input.hypothesisVisibility,
      interventionLevel: input.interventionLevel,
      explanationDensity: input.explanationDensity,
      now: input.now ?? new Date(),
    });
  }

  /** Directive / usage rules: active directives as resolved on read. */
  async listDirectives(): Promise<readonly Directive[]> {
    return this.composition.directives.listActive();
  }

  async createDirective(input: CreateDirectiveInput, now: Date = new Date()) {
    const scope =
      input.appliesToFutureSimilar && input.scopeKind !== null && input.scopeValue.trim().length > 0
        ? { kind: input.scopeKind, value: input.scopeValue.trim() }
        : null;
    return this.composition.directives.create({
      allowAnalysis: input.allowAnalysis,
      allowStorage: input.allowStorage,
      allowPassivePresentation: input.allowPassivePresentation,
      allowProactivePresentation: input.allowProactivePresentation,
      appliesToFutureSimilar: input.appliesToFutureSimilar,
      scope,
      now,
    });
  }

  async revokeDirective(id: string, now: Date = new Date()): Promise<void> {
    await this.composition.directives.revoke(id as never, now);
  }

  /** AI configuration and connection state, without exposing the key. */
  aiSnapshot() {
    return this.composition.ai.snapshot();
  }

  configureAI(input: {
    readonly providerId: string;
    readonly baseUrl: string;
    readonly model: string;
    readonly apiKey?: string;
  }) {
    return this.composition.ai.configure(input);
  }

  discoverModels(refresh = false) {
    return this.composition.ai.discoverModels(refresh);
  }

  testAIConnection() {
    return this.composition.ai.testConnection();
  }

  selectModel(model: string) {
    return this.composition.ai.selectModel(model);
  }

  /** Export the whole local database as a portable logical backup. */
  exportData(): Promise<string> {
    return this.composition.storage.exportData();
  }

  /** Restore a previously exported backup, replacing current local data. */
  restoreData(serialized: string): Promise<void> {
    return this.composition.storage.restoreData(serialized);
  }

  listAIInsightAudit(): readonly MobileAIInsightAuditEntry[] {
    return this.insightAudit.list();
  }

  /**
   * Runtime status for the Settings screen.
   *
   * Reports where the database lives, which schema version it is on, and whether
   * the Keychain is usable. It never reports a key value — only availability.
   */
  status() {
    const ai = this.composition.ai.snapshot();
    return {
      product: '见渊',
      platform: 'mobile',
      databaseLocation: this.composition.storage.location,
      schemaVersion: this.composition.storage.schemaVersion,
      ai: {
        providerId: ai.providerId,
        enabled: this.composition.ai.enabled,
        status: ai.status,
        connectionStatus: ai.connectionStatus,
        baseUrl: ai.baseUrl,
        model: ai.model,
        apiKeyConfigured: ai.apiKeyConfigured,
        message: ai.message,
        modelDiscoverySupported: ai.modelDiscoverySupported,
        modelCount: ai.models.length,
        models: ai.models.map((item) => ({
          id: item.id,
          ...(item.displayName === undefined ? {} : { displayName: item.displayName }),
          provider: item.provider,
        })),
      },
      secretStore: this.composition.secretStore.status(),
      // Legacy M1 field: whether a Provider key is currently present. Derived
      // from the AI service so the value cannot drift from the live backend.
      secretStoreKeyPresent: ai.apiKeyConfigured,
    };
  }

  /** Directive permissions for a Mobile subject, resolved on read. */
  async analysisPermissionFor(input: {
    readonly source: string | null;
    readonly relationAxes: readonly string[];
    readonly userSelectedRefs: readonly string[];
    readonly createdAt: Date;
  }) {
    return mobileAnalysisPermissionFor(this.composition, input);
  }

  /**
   * Whether a Provider key is currently stored.
   *
   * Returns a boolean, never the key.
   */
  async hasStoredApiKey(): Promise<boolean> {
    const value = await this.composition.secretStore.read(AI_API_KEY_SECRET_NAME);
    return value !== null && value.length > 0;
  }

  /** Convenience branding for ids held by the UI. */
  toRecordId(id: string) {
    return recordId(id);
  }
}

const MOBILE_SOURCE = 'mobile_ui';

export { createPlatformServices, type MobilePlatformServices } from './platform-services';
export {
  createMobileComposition,
  type MobileComposition,
  type MobileCompositionOptions,
} from './composition-root';

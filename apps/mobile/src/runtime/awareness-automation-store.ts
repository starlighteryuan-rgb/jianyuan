/**
 * Durable orchestration state for automatic Awareness.
 *
 * This state is operational only. It records which captured Records are waiting
 * for a quiet-window check and which checks have already been covered, but it
 * never becomes a Core Relation, Evidence, Reflection, or user fact.
 */

export interface AwarenessAutomationStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export type AwarenessAutomationJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'no_observation'
  | 'failed';

export interface AwarenessAutomationJob {
  readonly id: string;
  readonly recordIds: readonly string[];
  readonly status: AwarenessAutomationJobStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly failureReason?: string;
  /** Deterministic identity for one pending record set. */
  readonly recordSetFingerprint?: string;
}

export interface AwarenessAutomationState {
  readonly pendingRecordIds: readonly string[];
  readonly coveredRecordIds: readonly string[];
  readonly jobs: readonly AwarenessAutomationJob[];
}

export const AWARENESS_AUTOMATION_STORAGE_KEY = 'jianyuan.awareness.automation.v1';
export const MAX_AWARENESS_AUTOMATION_JOBS = 100;
export const MAX_AWARENESS_COVERED_RECORDS = 500;

export const EMPTY_AWARENESS_AUTOMATION_STATE: AwarenessAutomationState = {
  pendingRecordIds: [],
  coveredRecordIds: [],
  jobs: [],
};

export const NOOP_AWARENESS_AUTOMATION_STORAGE: AwarenessAutomationStorage = {
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
};

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isJobStatus = (value: unknown): value is AwarenessAutomationJobStatus =>
  value === 'queued' ||
  value === 'running' ||
  value === 'completed' ||
  value === 'no_observation' ||
  value === 'failed';

const isAutomationJob = (value: unknown): value is AwarenessAutomationJob => {
  if (value === null || typeof value !== 'object') return false;
  const job = value as Record<string, unknown>;
  return (
    typeof job.id === 'string' &&
    isStringArray(job.recordIds) &&
    isJobStatus(job.status) &&
    typeof job.createdAt === 'string' &&
    typeof job.updatedAt === 'string' &&
    (job.failureReason === undefined || typeof job.failureReason === 'string') &&
    (job.recordSetFingerprint === undefined || typeof job.recordSetFingerprint === 'string')
  );
};

export const parseAwarenessAutomationState = (
  raw: string | null | undefined,
): AwarenessAutomationState => {
  if (typeof raw !== 'string' || raw.length === 0) {
    return EMPTY_AWARENESS_AUTOMATION_STATE;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') {
      return EMPTY_AWARENESS_AUTOMATION_STATE;
    }
    const value = parsed as Record<string, unknown>;
    const pendingRecordIds = isStringArray(value.pendingRecordIds)
      ? [...new Set(value.pendingRecordIds)]
      : [];
    const coveredRecordIds = isStringArray(value.coveredRecordIds)
      ? [...new Set(value.coveredRecordIds)].slice(-MAX_AWARENESS_COVERED_RECORDS)
      : [];
    const jobs = Array.isArray(value.jobs)
      ? value.jobs.filter(isAutomationJob).slice(0, MAX_AWARENESS_AUTOMATION_JOBS)
      : [];
    return { pendingRecordIds, coveredRecordIds, jobs };
  } catch {
    return EMPTY_AWARENESS_AUTOMATION_STATE;
  }
};

export const serializeAwarenessAutomationState = (
  state: AwarenessAutomationState,
): string =>
  JSON.stringify({
    pendingRecordIds: state.pendingRecordIds,
    coveredRecordIds: state.coveredRecordIds.slice(-MAX_AWARENESS_COVERED_RECORDS),
    jobs: state.jobs.slice(0, MAX_AWARENESS_AUTOMATION_JOBS),
  });

export const readAwarenessAutomationState = async (
  storage: AwarenessAutomationStorage,
): Promise<AwarenessAutomationState> => {
  try {
    return parseAwarenessAutomationState(
      await storage.getItemAsync(AWARENESS_AUTOMATION_STORAGE_KEY),
    );
  } catch {
    return EMPTY_AWARENESS_AUTOMATION_STATE;
  }
};

export const writeAwarenessAutomationState = async (
  storage: AwarenessAutomationStorage,
  state: AwarenessAutomationState,
): Promise<boolean> => {
  try {
    await storage.setItemAsync(
      AWARENESS_AUTOMATION_STORAGE_KEY,
      serializeAwarenessAutomationState(state),
    );
    return true;
  } catch {
    return false;
  }
};

export const enqueueAutomaticAwarenessRecord = (
  state: AwarenessAutomationState,
  recordId: string,
): AwarenessAutomationState => {
  if (
    state.coveredRecordIds.includes(recordId) ||
    state.pendingRecordIds.includes(recordId)
  ) {
    return state;
  }
  return {
    ...state,
    pendingRecordIds: [...state.pendingRecordIds, recordId],
  };
};

const sameRecordSet = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const beginAutomaticAwarenessJob = (
  state: AwarenessAutomationState,
  at: Date,
): { readonly state: AwarenessAutomationState; readonly job: AwarenessAutomationJob | null } => {
  if (state.pendingRecordIds.length === 0) {
    return { state, job: null };
  }

  const existingRunning = state.jobs.find(
    (job) =>
      (job.status === 'running' || job.status === 'queued') &&
      sameRecordSet(job.recordIds, state.pendingRecordIds),
  );
  if (existingRunning !== undefined) {
    return { state, job: existingRunning };
  }

  const timestamp = at.toISOString();
  const pendingFingerprint = [...state.pendingRecordIds].sort().join('|');
  const alreadyCompleted = state.jobs.some(
    (job) =>
      (job.status === 'completed' || job.status === 'no_observation') &&
      (job.recordSetFingerprint ?? [...job.recordIds].sort().join('|')) === pendingFingerprint,
  );
  if (alreadyCompleted) return { state, job: null };
  const recordSetFingerprint = [...state.pendingRecordIds].sort().join('|');
  const job: AwarenessAutomationJob = {
    id: `auto_${at.getTime()}_${Math.random().toString(36).slice(2, 10)}`,
    recordIds: [...state.pendingRecordIds],
    recordSetFingerprint,
    status: 'queued',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    state: {
      ...state,
      jobs: [job, ...state.jobs].slice(0, MAX_AWARENESS_AUTOMATION_JOBS),
    },
    job,
  };
};

export const markAutomaticAwarenessJobRunning = (
  state: AwarenessAutomationState,
  jobId: string,
  at: Date,
): AwarenessAutomationState => ({
  ...state,
  jobs: state.jobs.map((job) =>
    job.id === jobId
      ? { ...job, status: 'running', updatedAt: at.toISOString() }
      : job,
  ),
});

export const finishAutomaticAwarenessJob = (
  state: AwarenessAutomationState,
  input: {
    readonly jobId: string;
    readonly status: 'completed' | 'no_observation' | 'failed';
    readonly coveredRecordIds?: readonly string[];
    readonly failureReason?: string;
    readonly at: Date;
  },
): AwarenessAutomationState => {
  const job = state.jobs.find((item) => item.id === input.jobId);
  const covered = new Set([...state.coveredRecordIds, ...(input.coveredRecordIds ?? [])]);
  const pending = new Set(state.pendingRecordIds);
  if (input.status !== 'failed') {
    for (const recordId of input.coveredRecordIds ?? []) pending.delete(recordId);
  }

  return {
    ...state,
    pendingRecordIds: [...pending],
    coveredRecordIds: [...covered].slice(-MAX_AWARENESS_COVERED_RECORDS),
    jobs: state.jobs.map((item) =>
      item.id === input.jobId
        ? {
            ...item,
            status: input.status,
            updatedAt: input.at.toISOString(),
            ...(input.failureReason === undefined
              ? {}
              : { failureReason: input.failureReason }),
          }
        : item,
    ).slice(0, MAX_AWARENESS_AUTOMATION_JOBS),
  };
};

/** A running job from a killed process is safe to retry; it has no partial fact. */
export const recoverInterruptedAutomaticAwarenessJob = (
  state: AwarenessAutomationState,
  at: Date,
): AwarenessAutomationState => ({
  ...state,
  jobs: state.jobs.map((job) =>
    job.status === 'running'
      ? { ...job, status: 'queued', updatedAt: at.toISOString() }
      : job,
  ),
});

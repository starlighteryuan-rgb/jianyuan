import {
  closeSync,
  existsSync,
  fsyncSync,
  readFileSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { randomUUID } from 'node:crypto';

import type { DesktopRuntime } from './desktop-runtime';

export type NativeValidationPhase = 'prepare' | 'verify';

const CHECKPOINT_FILE = 'native-validation-checkpoint.json';
const RESULT_FILE = 'native-validation-result.json';
const CREDENTIAL_STATE_FILE = 'native-validation-credential-state.json';
const RECORD_MARKER = '[jianyuan-native-validation:record]';
const REFLECTION_MARKER = '[jianyuan-native-validation:reflection]';

interface NativeValidationCheckpoint {
  readonly version: 1;
  readonly targetRef: string;
  readonly recordId: string;
  readonly episodeId: string;
  readonly reflectionRecordId: string;
  readonly reflectionRecordRecordId: string;
}

interface CredentialState {
  readonly credentialWrite: boolean;
  readonly credentialRead: boolean;
  readonly credentialRestartRead: boolean;
  readonly credentialDelete: boolean;
  readonly credentialMissingAfterDelete: boolean;
  readonly errors: readonly string[];
}

export interface NativeValidationResult {
  readonly phase: NativeValidationPhase;
  readonly timestamp: string;
  readonly appDataPath: string;
  readonly sqliteOpened: boolean;
  readonly recordWritten: boolean;
  readonly recordRecoveredAfterRestart: boolean;
  readonly reflectionWritten: boolean;
  readonly reflectionRecoveredAfterRestart: boolean;
  readonly credentialWrite: boolean;
  readonly credentialRead: boolean;
  readonly credentialRestartRead: boolean;
  readonly credentialDelete: boolean;
  readonly credentialMissingAfterDelete: boolean;
  readonly sidecarStarted: boolean;
  readonly cleanupCompleted: boolean;
  readonly errors: readonly string[];
}

const resultPath = (appDataDir: string): string => join(appDataDir, RESULT_FILE);

const fallbackResultPath = (): string => join(tmpdir(), RESULT_FILE);

const checkpointPath = (appDataDir: string): string => join(appDataDir, CHECKPOINT_FILE);

const credentialStatePath = (appDataDir: string): string =>
  join(appDataDir, CREDENTIAL_STATE_FILE);

const sanitizeError = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : 'native_validation_failed';
  return raw
    .replaceAll(RECORD_MARKER, '[redacted]')
    .replaceAll(REFLECTION_MARKER, '[redacted]')
    .replaceAll('jianyuan-native-validation-secret', '[redacted]')
    .slice(0, 240);
};

const emptyResult = (
  phase: NativeValidationPhase,
  appDataDir: string,
): NativeValidationResult => ({
  phase,
  timestamp: new Date().toISOString(),
  appDataPath: appDataDir,
  sqliteOpened: false,
  recordWritten: false,
  recordRecoveredAfterRestart: false,
  reflectionWritten: false,
  reflectionRecoveredAfterRestart: false,
  credentialWrite: false,
  credentialRead: false,
  credentialRestartRead: false,
  credentialDelete: false,
  credentialMissingAfterDelete: false,
  sidecarStarted: false,
  cleanupCompleted: false,
  errors: [],
});

const writeResult = (appDataDir: string, result: NativeValidationResult): string => {
  const serialized = JSON.stringify(result, null, 2);
  try {
    writeDurableJson(resultPath(appDataDir), serialized);
    return resultPath(appDataDir);
  } catch {
    const fallback = fallbackResultPath();
    writeDurableJson(fallback, serialized);
    return fallback;
  }
};

/**
 * Persist a small validation artifact atomically and flush it before returning.
 * This makes the prepare/verify hand-off a real on-disk checkpoint rather than
 * relying on process shutdown timing or a buffered write.
 */
const writeDurableJson = (path: string, serialized: string): void => {
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporaryPath, 'wx');
    writeSync(descriptor, serialized, 0, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporaryPath, path);
  } catch (error) {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original write failure.
      }
    }
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The temporary file may not have been created.
    }
    throw error;
  }
};

const readCredentialState = (appDataDir: string): CredentialState => {
  const path = credentialStatePath(appDataDir);
  if (!existsSync(path)) {
    return {
      credentialWrite: false,
      credentialRead: false,
      credentialRestartRead: false,
      credentialDelete: false,
      credentialMissingAfterDelete: false,
      errors: ['credential_state_missing'],
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<CredentialState>;
    return {
      credentialWrite: parsed.credentialWrite === true,
      credentialRead: parsed.credentialRead === true,
      credentialRestartRead: parsed.credentialRestartRead === true,
      credentialDelete: parsed.credentialDelete === true,
      credentialMissingAfterDelete: parsed.credentialMissingAfterDelete === true,
      errors: Array.isArray(parsed.errors)
        ? parsed.errors
            .filter((item): item is string => typeof item === 'string')
            .map(sanitizeError)
            .slice(0, 8)
        : [],
    };
  } catch {
    return {
      credentialWrite: false,
      credentialRead: false,
      credentialRestartRead: false,
      credentialDelete: false,
      credentialMissingAfterDelete: false,
      errors: ['credential_state_invalid'],
    };
  }
};

const readCheckpoint = (appDataDir: string): NativeValidationCheckpoint => {
  const path = checkpointPath(appDataDir);
  if (!existsSync(path)) {
    throw new Error('native_validation_checkpoint_missing');
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<NativeValidationCheckpoint>;
  if (
    parsed.version !== 1 ||
    typeof parsed.targetRef !== 'string' ||
    typeof parsed.recordId !== 'string' ||
    typeof parsed.episodeId !== 'string' ||
    typeof parsed.reflectionRecordId !== 'string' ||
    typeof parsed.reflectionRecordRecordId !== 'string'
  ) {
    throw new Error('native_validation_checkpoint_invalid');
  }
  return parsed as NativeValidationCheckpoint;
};

const writeCheckpoint = (appDataDir: string, checkpoint: NativeValidationCheckpoint): void => {
  const path = checkpointPath(appDataDir);
  if (existsSync(path)) {
    throw new Error('native_validation_checkpoint_exists');
  }
  writeDurableJson(path, JSON.stringify(checkpoint, null, 2));
  if (!existsSync(path)) {
    throw new Error('native_validation_checkpoint_write_failed');
  }
};

const prepare = async (
  runtime: DesktopRuntime,
  appDataDir: string,
): Promise<NativeValidationResult> => {
  let result = { ...emptyResult('prepare', appDataDir), sidecarStarted: true, sqliteOpened: true };
  let createdRecordId: string | null = null;
  let createdEpisodeId: string | null = null;
  let createdReflectionRecordId: string | null = null;
  let createdReflectionRecordRecordId: string | null = null;
  let targetRef: string | null = null;
  try {
    const captured = await runtime.capture(RECORD_MARKER);
    if (!captured.ok) throw new Error(`record_write_failed:${captured.error.kind}`);
    createdRecordId = captured.value.recordId;

    targetRef = `native-validation-target:${randomUUID()}`;
    const now = new Date();
    const episode = await runtime.composition.reflection.recordSpontaneous({
      targetRef,
      now,
    });
    createdEpisodeId = episode.id;
    const response = await runtime.composition.reflection.respond({
      episode,
      feedback: {
        response: null,
        freeText: REFLECTION_MARKER,
        leaveForNow: false,
        userInitiatedContinuation: false,
      },
      subject: {
        topicTags: [],
        source: 'native_validation',
        relationAxes: [],
        userSelectedRefs: [],
      },
      targetType: 'relation_claim',
      targetRef,
      now,
    });
    if (response.recordId === null || response.reflectionRecord === null) {
      throw new Error('reflection_write_failed');
    }
    createdReflectionRecordId = response.reflectionRecord.id;
    createdReflectionRecordRecordId = response.recordId;

    writeCheckpoint(appDataDir, {
      version: 1,
      targetRef,
      recordId: createdRecordId,
      episodeId: createdEpisodeId,
      reflectionRecordId: createdReflectionRecordId,
      reflectionRecordRecordId: createdReflectionRecordRecordId,
    });
    const credentials = readCredentialState(appDataDir);
    result = {
      ...result,
      recordWritten: true,
      reflectionWritten: true,
      credentialWrite: credentials.credentialWrite,
      credentialRead: credentials.credentialRead,
      errors: credentials.errors,
    };
  } catch (error) {
    const cleanupIds = [createdRecordId, createdReflectionRecordRecordId].filter(
      (id): id is string => id !== null,
    );
    if (cleanupIds.length > 0 && targetRef !== null) {
      try {
        runtime.composition.storage.removeNativeValidationArtifacts({
          recordIds: cleanupIds,
          episodeIds: [createdEpisodeId].filter((id): id is string => id !== null),
          targetRef,
        });
      } catch {
        // Preserve the original validation failure; no broad cleanup is attempted.
      }
    }
    result = { ...result, errors: [sanitizeError(error)] };
  }
  return result;
};

const verify = async (
  runtime: DesktopRuntime,
  appDataDir: string,
): Promise<NativeValidationResult> => {
  let result = { ...emptyResult('verify', appDataDir), sidecarStarted: true, sqliteOpened: true };
  try {
    const checkpoint = readCheckpoint(appDataDir);
    const record = await runtime.composition.records.getById(checkpoint.recordId);
    const recordRecoveredAfterRestart = record?.verbatim === RECORD_MARKER;
    const episodes = await runtime.composition.storage.reflectionEpisodes.listByTarget(
      checkpoint.targetRef,
    );
    const episode = episodes.find((item) => item.id === checkpoint.episodeId);
    const reflections = episode
      ? await runtime.composition.storage.userReflectionRecords.listByEpisode(episode.id)
      : [];
    const reflection = reflections.find((item) => item.id === checkpoint.reflectionRecordId);
    const reflectionRecord = reflection
      ? await runtime.composition.records.getById(reflection.recordId)
      : null;
    const reflectionRecoveredAfterRestart =
      episode !== undefined &&
      reflection !== undefined &&
      reflection.recordId === checkpoint.reflectionRecordRecordId &&
      reflectionRecord?.verbatim === REFLECTION_MARKER;
    const credentials = readCredentialState(appDataDir);
    runtime.composition.storage.removeNativeValidationArtifacts({
      recordIds: [checkpoint.recordId, checkpoint.reflectionRecordRecordId],
      episodeIds: [checkpoint.episodeId],
      targetRef: checkpoint.targetRef,
    });
    unlinkSync(checkpointPath(appDataDir));
    try {
      unlinkSync(credentialStatePath(appDataDir));
    } catch {
      // The credential state file is diagnostic-only and may already be absent.
    }
    result = {
      ...result,
      recordRecoveredAfterRestart,
      reflectionRecoveredAfterRestart,
      credentialWrite: credentials.credentialWrite,
      credentialRead: credentials.credentialRead,
      credentialRestartRead: credentials.credentialRestartRead,
      credentialDelete: credentials.credentialDelete,
      credentialMissingAfterDelete: credentials.credentialMissingAfterDelete,
      cleanupCompleted: true,
      errors: [
        ...credentials.errors,
        ...(recordRecoveredAfterRestart ? [] : ['record_recovery_failed']),
        ...(reflectionRecoveredAfterRestart ? [] : ['reflection_recovery_failed']),
      ],
    };
  } catch (error) {
    result = { ...result, errors: [sanitizeError(error)] };
  }
  return result;
};

export const writeNativeValidationFailure = (
  phase: NativeValidationPhase,
  appDataDir: string,
  error: unknown,
): string =>
  writeResult(appDataDir, {
    ...emptyResult(phase, appDataDir),
    errors: [sanitizeError(error)],
  });

export const runNativeValidation = async (
  runtime: DesktopRuntime,
  phase: NativeValidationPhase,
  appDataDir: string,
): Promise<string> => {
  const result = phase === 'prepare'
    ? await prepare(runtime, appDataDir)
    : await verify(runtime, appDataDir);
  return writeResult(appDataDir, result);
};

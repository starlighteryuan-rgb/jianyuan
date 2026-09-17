/**
 * Durable dedupe state for user-initiated Awareness.
 *
 * This is operational state only. It records that one deterministic source-set
 * has already completed a successful manual check, but it never becomes a Core
 * Relation, Evidence, Reflection, or user fact. Old Records remain valid
 * context: a new ordinary Record changes the source-set and enables a new
 * manual check.
 */

export interface AwarenessManualStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export interface AwarenessManualState {
  /** Sorted Record-ID source-set fingerprints that completed successfully. */
  readonly coveredSourceSets: readonly string[];
}

export const EMPTY_AWARENESS_MANUAL_STATE: AwarenessManualState = {
  coveredSourceSets: [],
};

export const NOOP_AWARENESS_MANUAL_STORAGE: AwarenessManualStorage = {
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
};

export const AWARENESS_MANUAL_STORAGE_KEY = 'jianyuan.awareness.manual.v1';
export const MAX_AWARENESS_MANUAL_SOURCE_SETS = 200;

export const awarenessManualSourceSetFingerprint = (
  recordIds: readonly string[],
): string => [...new Set(recordIds)].sort().join('|');

const isState = (value: unknown): value is AwarenessManualState => {
  if (value === null || typeof value !== 'object') return false;
  const coveredSourceSets = (value as { coveredSourceSets?: unknown }).coveredSourceSets;
  return (
    Array.isArray(coveredSourceSets) &&
    coveredSourceSets.every((item) => typeof item === 'string')
  );
};

export const parseAwarenessManualState = (
  raw: string | null | undefined,
): AwarenessManualState => {
  if (typeof raw !== 'string' || raw.length === 0) {
    return EMPTY_AWARENESS_MANUAL_STATE;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isState(parsed)) return EMPTY_AWARENESS_MANUAL_STATE;
    return {
      coveredSourceSets: [...new Set(parsed.coveredSourceSets)].slice(
        -MAX_AWARENESS_MANUAL_SOURCE_SETS,
      ),
    };
  } catch {
    return EMPTY_AWARENESS_MANUAL_STATE;
  }
};

export const readAwarenessManualState = async (
  storage: AwarenessManualStorage,
): Promise<AwarenessManualState> => {
  try {
    return parseAwarenessManualState(
      await storage.getItemAsync(AWARENESS_MANUAL_STORAGE_KEY),
    );
  } catch {
    return EMPTY_AWARENESS_MANUAL_STATE;
  }
};

export const markAwarenessManualSourceSet = (
  state: AwarenessManualState,
  sourceSetFingerprint: string,
): AwarenessManualState => {
  if (state.coveredSourceSets.includes(sourceSetFingerprint)) return state;
  return {
    coveredSourceSets: [...state.coveredSourceSets, sourceSetFingerprint].slice(
      -MAX_AWARENESS_MANUAL_SOURCE_SETS,
    ),
  };
};

export const writeAwarenessManualState = async (
  storage: AwarenessManualStorage,
  state: AwarenessManualState,
): Promise<boolean> => {
  try {
    await storage.setItemAsync(
      AWARENESS_MANUAL_STORAGE_KEY,
      JSON.stringify({
        coveredSourceSets: state.coveredSourceSets.slice(
          -MAX_AWARENESS_MANUAL_SOURCE_SETS,
        ),
      }),
    );
    return true;
  } catch {
    return false;
  }
};

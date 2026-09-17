/**
 * Mobile-local user content visibility.
 *
 * WHY THIS EXISTS
 * Records and Understanding reflections are Core-backed entities. Their rows
 * participate in Relation, Evidence, Lineage, and Discovery semantics, so this
 * app must not physically delete them through a Mobile-only path: SQLite uses
 * ON DELETE RESTRICT for relation refs and lineage parents, and a hard delete
 * would either fail or leave dangling semantic references.
 *
 * This store is therefore a presentation hide-list, not a replacement for Core
 * deletion semantics. It is local-first, lives outside the Core schema and Core
 * export, and only controls what the Mobile UI chooses to show. The underlying
 * Core data remains intact so existing relations and evidence stay coherent.
 */

export interface UserContentVisibilityStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export interface UserContentVisibilityState {
  readonly hiddenRecordIds: readonly string[];
  readonly hiddenReflectionRecordIds: readonly string[];
}

export const USER_CONTENT_VISIBILITY_STORAGE_KEY =
  'jianyuan.user-content.visibility.v1';
export const MAX_HIDDEN_RECORD_IDS = 500;
export const MAX_HIDDEN_REFLECTION_IDS = 500;

export const EMPTY_USER_CONTENT_VISIBILITY_STATE: UserContentVisibilityState = {
  hiddenRecordIds: [],
  hiddenReflectionRecordIds: [],
};

export const NOOP_USER_CONTENT_VISIBILITY_STORAGE: UserContentVisibilityStorage = {
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
};

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const uniqueCapped = (values: readonly string[], cap: number): readonly string[] =>
  [...new Set(values.filter((value) => value.trim().length > 0))].slice(0, cap);

export const parseUserContentVisibilityState = (
  raw: string | null | undefined,
): UserContentVisibilityState => {
  if (typeof raw !== 'string' || raw.length === 0) {
    return EMPTY_USER_CONTENT_VISIBILITY_STATE;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') {
      return EMPTY_USER_CONTENT_VISIBILITY_STATE;
    }
    const value = parsed as {
      readonly hiddenRecordIds?: unknown;
      readonly hiddenReflectionRecordIds?: unknown;
    };
    return {
      hiddenRecordIds: isStringArray(value.hiddenRecordIds)
        ? uniqueCapped(value.hiddenRecordIds, MAX_HIDDEN_RECORD_IDS)
        : [],
      hiddenReflectionRecordIds: isStringArray(value.hiddenReflectionRecordIds)
        ? uniqueCapped(value.hiddenReflectionRecordIds, MAX_HIDDEN_REFLECTION_IDS)
        : [],
    };
  } catch {
    return EMPTY_USER_CONTENT_VISIBILITY_STATE;
  }
};

export const serializeUserContentVisibilityState = (
  state: UserContentVisibilityState,
): string =>
  JSON.stringify({
    hiddenRecordIds: uniqueCapped(state.hiddenRecordIds, MAX_HIDDEN_RECORD_IDS),
    hiddenReflectionRecordIds: uniqueCapped(
      state.hiddenReflectionRecordIds,
      MAX_HIDDEN_REFLECTION_IDS,
    ),
  });

export const readUserContentVisibilityState = async (
  storage: UserContentVisibilityStorage,
): Promise<UserContentVisibilityState> => {
  try {
    return parseUserContentVisibilityState(
      await storage.getItemAsync(USER_CONTENT_VISIBILITY_STORAGE_KEY),
    );
  } catch {
    return EMPTY_USER_CONTENT_VISIBILITY_STATE;
  }
};

export const writeUserContentVisibilityState = async (
  storage: UserContentVisibilityStorage,
  state: UserContentVisibilityState,
): Promise<boolean> => {
  try {
    await storage.setItemAsync(
      USER_CONTENT_VISIBILITY_STORAGE_KEY,
      serializeUserContentVisibilityState(state),
    );
    return true;
  } catch {
    return false;
  }
};

export const hideRecord = (
  state: UserContentVisibilityState,
  recordId: string,
): UserContentVisibilityState => ({
  ...state,
  hiddenRecordIds: uniqueCapped([recordId, ...state.hiddenRecordIds], MAX_HIDDEN_RECORD_IDS),
});

export const hideReflectionRecord = (
  state: UserContentVisibilityState,
  reflectionRecordId: string,
): UserContentVisibilityState => ({
  ...state,
  hiddenReflectionRecordIds: uniqueCapped(
    [reflectionRecordId, ...state.hiddenReflectionRecordIds],
    MAX_HIDDEN_REFLECTION_IDS,
  ),
});

export const isRecordHidden = (
  state: UserContentVisibilityState,
  recordId: string,
): boolean => state.hiddenRecordIds.includes(recordId);

export const isReflectionHidden = (
  state: UserContentVisibilityState,
  reflectionRecordId: string,
): boolean => state.hiddenReflectionRecordIds.includes(reflectionRecordId);

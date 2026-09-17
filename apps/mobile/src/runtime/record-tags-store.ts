/**
 * User-defined Tags for Records.
 *
 * WHAT THIS IS
 * Record metadata authored by the user. A Tag is an index the user creates for
 * their own Record — it is never an AI classification, never a fact about the
 * person, and never inferred. Nothing here reaches Core, the Provider, or the
 * Relation / Evidence pipeline.
 *
 * WHY THIS IS NOT A SQLITE TABLE
 * `tests/mobile-schema-parity.test.ts` asserts that the Mobile SQLite schema is
 * structurally identical to the Desktop schema (same tables, columns, indexes,
 * version). Adding a table here would break that parity, and Tags are
 * Mobile-presentation metadata, not shared Core storage. They therefore live in
 * the same key/value channel already used for Awareness history, which is
 * durable, local-first, and excluded from Core export semantics.
 *
 * The Record's own text is never touched. Tags are a separate mapping from a
 * Record id to a list of user-created names.
 */

export interface RecordTagStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export interface RecordTagState {
  /** User vocabulary, most-recently-used first. Order is meaningful. */
  readonly tags: readonly string[];
  /** Record id → the tag names assigned to that Record. */
  readonly byRecord: Readonly<Record<string, readonly string[]>>;
}

export const RECORD_TAGS_STORAGE_KEY = 'jianyuan.record.tags.v1';
export const MAX_RECORD_TAGS = 200;
export const MAX_TAG_NAME_LENGTH = 24;

export const EMPTY_RECORD_TAG_STATE: RecordTagState = {
  tags: [],
  byRecord: {},
};

export const NOOP_RECORD_TAG_STORAGE: RecordTagStorage = {
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
};

/**
 * Normalise a user-typed tag name.
 *
 * Chinese-first product, so no case folding is exposed to the user; the only
 * normalisation is whitespace and length. Returns null for a name that should
 * not become a tag (empty after trimming).
 */
export const normalizeTagName = (raw: string): string | null => {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (collapsed.length === 0) return null;
  return collapsed.slice(0, MAX_TAG_NAME_LENGTH);
};

/** Case-insensitive identity so `关系` / `REL` style duplicates fold together. */
const tagKey = (name: string): string => name.toLocaleLowerCase();

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export const parseRecordTagState = (raw: string | null | undefined): RecordTagState => {
  if (typeof raw !== 'string' || raw.length === 0) return EMPTY_RECORD_TAG_STATE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return EMPTY_RECORD_TAG_STATE;
    const value = parsed as { tags?: unknown; byRecord?: unknown };
    const tags = isStringArray(value.tags)
      ? [...new Set(value.tags)].slice(0, MAX_RECORD_TAGS)
      : [];
    const byRecord: Record<string, readonly string[]> = {};
    if (value.byRecord !== null && typeof value.byRecord === 'object') {
      for (const [recordId, names] of Object.entries(
        value.byRecord as Record<string, unknown>,
      )) {
        if (typeof recordId !== 'string' || !isStringArray(names)) continue;
        const cleaned = [...new Set(names.filter((name) => normalizeTagName(name) !== null))];
        if (cleaned.length > 0) byRecord[recordId] = cleaned;
      }
    }
    return { tags, byRecord };
  } catch {
    return EMPTY_RECORD_TAG_STATE;
  }
};

export const serializeRecordTagState = (state: RecordTagState): string =>
  JSON.stringify({
    tags: state.tags.slice(0, MAX_RECORD_TAGS),
    byRecord: state.byRecord,
  });

export const readRecordTagState = async (
  storage: RecordTagStorage,
): Promise<RecordTagState> => {
  try {
    return parseRecordTagState(await storage.getItemAsync(RECORD_TAGS_STORAGE_KEY));
  } catch {
    return EMPTY_RECORD_TAG_STATE;
  }
};

export const writeRecordTagState = async (
  storage: RecordTagStorage,
  state: RecordTagState,
): Promise<boolean> => {
  try {
    await storage.setItemAsync(RECORD_TAGS_STORAGE_KEY, serializeRecordTagState(state));
    return true;
  } catch {
    return false;
  }
};

export const tagsOfRecord = (
  state: RecordTagState,
  recordId: string,
): readonly string[] => state.byRecord[recordId] ?? [];

/** Vocabulary, most-recently-used first. */
export const allTagNames = (state: RecordTagState): readonly string[] => state.tags;

/**
 * Create-or-reuse a tag and attach it to one Record.
 *
 * - an empty / whitespace-only name is rejected (returns the same state);
 * - an existing tag is reused rather than duplicated, and is moved to the front
 *   of the vocabulary so "recently used" stays true;
 * - adding a tag already on the Record is a no-op.
 */
export const addTagToRecord = (
  state: RecordTagState,
  recordId: string,
  rawName: string,
): RecordTagState => {
  const name = normalizeTagName(rawName);
  if (name === null) return state;

  const key = tagKey(name);
  const existing = state.tags.find((tag) => tagKey(tag) === key);
  const canonical = existing ?? name;
  const withoutCanonical = state.tags.filter((tag) => tagKey(tag) !== key);
  const tags = [canonical, ...withoutCanonical].slice(0, MAX_RECORD_TAGS);

  const current = state.byRecord[recordId] ?? [];
  const alreadyAssigned = current.some((tag) => tagKey(tag) === key);
  const assigned = alreadyAssigned ? current : [...current, canonical];

  return {
    tags,
    byRecord: { ...state.byRecord, [recordId]: assigned },
  };
};

/** Detach one tag from one Record. The vocabulary entry is kept for reuse. */
export const removeTagFromRecord = (
  state: RecordTagState,
  recordId: string,
  name: string,
): RecordTagState => {
  const key = tagKey(name);
  const current = state.byRecord[recordId];
  if (current === undefined) return state;
  const assigned = current.filter((tag) => tagKey(tag) !== key);
  if (assigned.length === current.length) return state;

  const byRecord = { ...state.byRecord };
  if (assigned.length === 0) {
    delete byRecord[recordId];
  } else {
    byRecord[recordId] = assigned;
  }
  return { tags: state.tags, byRecord };
};

/** Whether a Record carries a given tag. Used by the tag filter. */
export const recordHasTag = (
  state: RecordTagState,
  recordId: string,
  name: string,
): boolean => tagsOfRecord(state, recordId).some((tag) => tagKey(tag) === tagKey(name));

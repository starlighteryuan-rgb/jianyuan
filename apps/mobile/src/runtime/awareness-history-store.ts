/**
 * Durable Awareness history.
 *
 * This is presentation history, not a Core Relation and not an Observation
 * registry. The transient registry still decides what can be responded to in
 * the current process; this store exists only so the user can leave the
 * Awareness page, reopen it, or restart the app and still see what was already
 * surfaced.
 *
 * The value is intentionally outside the Core SQLite schema. Awareness history
 * has no Record, Relation, Evidence, Reflection, or Discovery semantics, so it
 * must not become a fifteenth table or be exported as Core data.
 */

import type {
  AwarenessHistoryItem,
  AwarenessHistoryStatus,
  RelationCandidateView,
} from './awareness-session';

/** Minimal async key/value seam; satisfied by expo-sqlite/kv-store or a double. */
export interface AwarenessHistoryStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export const AWARENESS_HISTORY_STORAGE_KEY = 'jianyuan.awareness.history.v1';
export const MAX_AWARENESS_HISTORY_ITEMS = 50;

/** Store used when nothing is wired: history is not persisted. */
export const NOOP_AWARENESS_HISTORY_STORAGE: AwarenessHistoryStorage = {
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isRelationSuggestion = (value: unknown): boolean => {
  if (!isObject(value)) return false;
  if (value.kind !== 'relation_candidate') return false;
  if (!isStringArray(value.recordRefs)) return false;
  if (!isObject(value.comparisonAxis)) return false;
  if (
    typeof value.comparisonAxis.question !== 'string' ||
    typeof value.comparisonAxis.dimension !== 'string'
  ) {
    return false;
  }
  return (
    typeof value.relationType === 'string' &&
    typeof value.observation === 'string' &&
    (value.question === undefined || typeof value.question === 'string') &&
    (value.explanation === undefined || typeof value.explanation === 'string') &&
    (value.uncertainty === undefined || typeof value.uncertainty === 'string') &&
    typeof value.assertsTemporalOrdering === 'boolean'
  );
};

const isCandidateView = (value: unknown): value is RelationCandidateView => {
  if (!isObject(value)) return false;
  return (
    typeof value.candidateId === 'string' &&
    typeof value.observation === 'string' &&
    (value.possibleExplanation === undefined || typeof value.possibleExplanation === 'string') &&
    (value.uncertainty === undefined || typeof value.uncertainty === 'string') &&
    (value.reflectionQuestion === undefined || typeof value.reflectionQuestion === 'string') &&
    typeof value.question === 'string' &&
    typeof value.dimension === 'string' &&
    typeof value.explanation === 'string' &&
    Array.isArray(value.referencedRecords) &&
    isObject(value.currentRecord) &&
    typeof value.currentRecord.id === 'string' &&
    typeof value.currentRecord.verbatim === 'string' &&
    typeof value.currentRecord.createdAt === 'string' &&
    Array.isArray(value.relatedRecords)
  );
};

const parseStoredStatus = (value: unknown): AwarenessHistoryStatus | null => {
  switch (value) {
    case 'new':
    case 'pending':
      return 'pending';
    case 'responded':
    case 'reflected':
      return 'reflected';
    case 'viewed':
    case 'dismissed':
      return value;
    default:
      return null;
  }
};

const parseStoredHistoryItem = (value: unknown): AwarenessHistoryItem | null => {
  if (!isObject(value)) return null;
  const status = parseStoredStatus(value.status);
  if (status === null) return null;
  const meaning = value.meaning;
  if (
    meaning !== null &&
    meaning !== 'connected' &&
    meaning !== 'different_understanding' &&
    meaning !== 'not_my_experience'
  ) {
    return null;
  }
  if (
    typeof value.candidateId !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.currentRecordId !== 'string' ||
    !isRelationSuggestion(value.suggestion) ||
    !isCandidateView(value.candidate) ||
    !(value.reflectionText === null || typeof value.reflectionText === 'string') ||
    !(value.targetRef === null || typeof value.targetRef === 'string') ||
    !(value.reflectionRecordId === null || typeof value.reflectionRecordId === 'string') ||
    !(value.automationJobId === undefined || typeof value.automationJobId === 'string')
  ) {
    return null;
  }
  return {
    candidateId: value.candidateId,
    status,
    ...(value.automationJobId === undefined
      ? {}
      : { automationJobId: value.automationJobId }),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    currentRecordId: value.currentRecordId,
    suggestion: value.suggestion as AwarenessHistoryItem['suggestion'],
    candidate: value.candidate as AwarenessHistoryItem['candidate'],
    meaning,
    reflectionText: value.reflectionText,
    targetRef: value.targetRef,
    reflectionRecordId: value.reflectionRecordId,
  };
};
/** Parse defensively: a corrupt or partial value degrades to no history. */
export const parseAwarenessHistory = (
  raw: string | null | undefined,
): readonly AwarenessHistoryItem[] => {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseStoredHistoryItem)
      .filter((item): item is AwarenessHistoryItem => item !== null)
      .slice(0, MAX_AWARENESS_HISTORY_ITEMS);
  } catch {
    return [];
  }
};

export const serializeAwarenessHistory = (
  items: readonly AwarenessHistoryItem[],
): string => JSON.stringify(items.slice(0, MAX_AWARENESS_HISTORY_ITEMS));

export const readAwarenessHistory = async (
  storage: AwarenessHistoryStorage,
): Promise<readonly AwarenessHistoryItem[]> => {
  try {
    return parseAwarenessHistory(
      await storage.getItemAsync(AWARENESS_HISTORY_STORAGE_KEY),
    );
  } catch {
    return [];
  }
};

export const writeAwarenessHistory = async (
  storage: AwarenessHistoryStorage,
  items: readonly AwarenessHistoryItem[],
): Promise<boolean> => {
  try {
    await storage.setItemAsync(
      AWARENESS_HISTORY_STORAGE_KEY,
      serializeAwarenessHistory(items),
    );
    return true;
  } catch {
    return false;
  }
};

export const countUnreadAwarenessItems = (
  items: readonly AwarenessHistoryItem[],
): number => items.filter((item) => item.status === 'pending').length;

const newerFirst = (
  left: AwarenessHistoryItem,
  right: AwarenessHistoryItem,
): number => right.createdAt.localeCompare(left.createdAt);

export const upsertAwarenessHistoryItem = (
  current: readonly AwarenessHistoryItem[],
  item: AwarenessHistoryItem,
): readonly AwarenessHistoryItem[] => {
  const withoutSameCandidate = current.filter(
    (entry) => entry.candidateId !== item.candidateId,
  );
  return [item, ...withoutSameCandidate].sort(newerFirst).slice(
    0,
    MAX_AWARENESS_HISTORY_ITEMS,
  );
};

export const updateAwarenessHistoryItem = (
  current: readonly AwarenessHistoryItem[],
  candidateId: string,
  update: Partial<AwarenessHistoryItem>,
): readonly AwarenessHistoryItem[] =>
  current.map((entry) =>
    entry.candidateId === candidateId ? { ...entry, ...update } : entry,
  );

export const removeAwarenessHistoryItem = (
  current: readonly AwarenessHistoryItem[],
  candidateId: string,
): readonly AwarenessHistoryItem[] =>
  current.filter((entry) => entry.candidateId !== candidateId);

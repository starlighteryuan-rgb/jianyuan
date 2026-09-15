/**
 * Mobile runtime preferences for Awareness automation.
 *
 * This is deliberately separate from Core. The setting controls whether the
 * application asks the existing Provider pipeline to prepare observations; it
 * is not a Directive, Record, Reflection, Relation, or Evidence fact.
 */

export interface AwarenessPreferenceStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export interface AutomaticAwarenessPolicy {
  readonly afterRecordCapture: boolean;
}

export const DEFAULT_AUTOMATIC_AWARENESS_POLICY: AutomaticAwarenessPolicy = {
  afterRecordCapture: false,
};

export const AWARENESS_PREFERENCE_STORAGE_KEY = 'jianyuan.awareness.preferences.v1';

export const NOOP_AWARENESS_PREFERENCE_STORAGE: AwarenessPreferenceStorage = {
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
};

export const parseAutomaticAwarenessPolicy = (
  raw: string | null | undefined,
): AutomaticAwarenessPolicy => {
  if (typeof raw !== 'string' || raw.length === 0) {
    return DEFAULT_AUTOMATIC_AWARENESS_POLICY;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') {
      return DEFAULT_AUTOMATIC_AWARENESS_POLICY;
    }
    const value = (parsed as { readonly afterRecordCapture?: unknown }).afterRecordCapture;
    return {
      afterRecordCapture: value === true,
    };
  } catch {
    return DEFAULT_AUTOMATIC_AWARENESS_POLICY;
  }
};

export const serializeAutomaticAwarenessPolicy = (
  policy: AutomaticAwarenessPolicy,
): string => JSON.stringify({ afterRecordCapture: policy.afterRecordCapture });

export const readAutomaticAwarenessPolicy = async (
  storage: AwarenessPreferenceStorage,
): Promise<AutomaticAwarenessPolicy> => {
  try {
    return parseAutomaticAwarenessPolicy(
      await storage.getItemAsync(AWARENESS_PREFERENCE_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_AUTOMATIC_AWARENESS_POLICY;
  }
};

export const writeAutomaticAwarenessPolicy = async (
  storage: AwarenessPreferenceStorage,
  policy: AutomaticAwarenessPolicy,
): Promise<boolean> => {
  try {
    await storage.setItemAsync(
      AWARENESS_PREFERENCE_STORAGE_KEY,
      serializeAutomaticAwarenessPolicy(policy),
    );
    return true;
  } catch {
    return false;
  }
};

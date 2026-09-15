/**
 * Non-secret AI configuration storage for Mobile.
 *
 * WHAT LIVES HERE
 * Provider id, Base URL and Model. These are ordinary settings, not
 * credentials, so they may be persisted in the app sandbox.
 *
 * WHAT MUST NOT LIVE HERE
 * The API key. It is written only through MobileSecretStore, which maps to the
 * iOS Keychain. A key in this file would be readable by anything that can read
 * the app container, and it would be carried by any future export of the
 * database.
 *
 * DEGRADED, NEVER FATAL
 * A storage failure must not stop the app. If the configuration cannot be read
 * the provider simply stays unconfigured, and Record / Understanding /
 * Exploration keep working because none of them depend on AI.
 */

export interface MobileAIConfig {
  readonly providerId: string;
  readonly baseUrl: string;
  readonly model: string;
}

export const DEFAULT_MOBILE_AI_CONFIG: MobileAIConfig = {
  providerId: 'openai-compatible',
  baseUrl: '',
  model: '',
};

/** Minimal async key/value seam; satisfied by expo-sqlite/kv-store or a double. */
export interface AIConfigStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export const AI_CONFIG_STORAGE_KEY = 'jianyuan.ai.config';

/** Store used when nothing is wired: the configuration simply is not persisted. */
export const NOOP_AI_CONFIG_STORAGE: AIConfigStorage = {
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
};

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value.trim() : fallback;

/** Parse defensively: a corrupt or partial file degrades to defaults. */
export const parseAIConfig = (raw: string | null | undefined): MobileAIConfig => {
  if (typeof raw !== 'string' || raw.length === 0) {
    return DEFAULT_MOBILE_AI_CONFIG;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') {
      return DEFAULT_MOBILE_AI_CONFIG;
    }
    const candidate = parsed as Partial<MobileAIConfig>;
    return {
      providerId:
        text(candidate.providerId, '').length > 0
          ? text(candidate.providerId, '')
          : DEFAULT_MOBILE_AI_CONFIG.providerId,
      baseUrl: text(candidate.baseUrl, ''),
      model: text(candidate.model, ''),
    };
  } catch {
    return DEFAULT_MOBILE_AI_CONFIG;
  }
};

export const serializeAIConfig = (config: MobileAIConfig): string =>
  JSON.stringify(config);

export const readAIConfig = async (
  storage: AIConfigStorage,
): Promise<MobileAIConfig> => {
  try {
    return parseAIConfig(await storage.getItemAsync(AI_CONFIG_STORAGE_KEY));
  } catch {
    return DEFAULT_MOBILE_AI_CONFIG;
  }
};

export const writeAIConfig = async (
  storage: AIConfigStorage,
  config: MobileAIConfig,
): Promise<boolean> => {
  try {
    await storage.setItemAsync(AI_CONFIG_STORAGE_KEY, serializeAIConfig(config));
    return true;
  } catch {
    return false;
  }
};

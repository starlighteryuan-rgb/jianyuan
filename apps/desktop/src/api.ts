import { invoke } from '@tauri-apps/api/core';

interface RuntimeConnection {
  readonly endpoint: string;
  readonly token: string;
}

export interface SecretStatus {
  readonly configured: boolean;
  readonly backend: string;
}

let connection: Promise<RuntimeConnection> | null = null;

const runtimeConnection = (): Promise<RuntimeConnection> => {
  connection ??= invoke<RuntimeConnection>('runtime_connection');
  return connection;
};

export const runtimeRequest = async <T>(
  path: string,
  init: { readonly method?: 'GET' | 'POST'; readonly body?: unknown } = {},
): Promise<T> => {
  const target = await runtimeConnection();
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${target.endpoint}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          authorization: `Bearer ${target.token}`,
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      const parsed = (await response.json()) as unknown;
      if (!response.ok) {
        const message =
          typeof parsed === 'object' &&
          parsed !== null &&
          'error' in parsed &&
          typeof parsed.error === 'string'
            ? parsed.error
            : `Runtime returned ${response.status}.`;
        throw new Error(message);
      }
      return parsed as T;
    } catch (error) {
      lastError = error;
      if (attempt === 39) break;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Desktop runtime is unavailable.');
};

export const getSecretStatus = (): Promise<SecretStatus> =>
  invoke<SecretStatus>('secret_status');

export const storeAPIKey = (apiKey: string): Promise<void> =>
  invoke('store_api_key', { apiKey });

export const deleteAPIKey = (): Promise<void> => invoke('delete_api_key');

export const getAppDataPath = (): Promise<string> => invoke<string>('app_data_path');

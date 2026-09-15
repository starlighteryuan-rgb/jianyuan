/**
 * Mobile-owned runtime wrapper around the existing AI Provider V1.
 *
 * WHY A WRAPPER EXISTS
 * `OpenAICompatibleProvider` owns HTTP paths, auth headers, timeouts and
 * response parsing. What it does not own is where configuration comes from:
 * Desktop reads a JSON file and takes the key from the Tauri keychain. Mobile
 * must read non-secret settings from sandbox key/value storage and the API key
 * from `expo-secure-store`. This class is that adapter, and nothing more.
 *
 * WHAT IT MUST NOT DO
 * It must not re-implement the provider contract, change the request shape, or
 * relax the authorization check. When no key or Base URL is configured it
 * exposes a disabled backend, which is the supported local-first mode: Record,
 * Understanding and Exploration never depend on AI.
 */

import type { SemanticJudgmentPort } from '../../../../packages/core/index';
import {
  DisabledAIProvider,
  OpenAICompatibleProvider,
  connectionStatusForDiscovery,
  connectionStatusForError,
  type AIConnectionStatus,
  type AIProviderResult,
  type AwarenessAIProvider,
  type ModelDiscovery,
  type OpenAICompatibleConfig,
  type ProviderModel,
} from '../../../../packages/providers/ai/index';

import {
  DEFAULT_MOBILE_AI_CONFIG,
  type AIConfigStorage,
  type MobileAIConfig,
  readAIConfig,
  writeAIConfig,
} from './ai-config-store';
import { AI_API_KEY_SECRET_NAME, type MobileSecretStore } from './secret-store';

type AIBackend = AwarenessAIProvider & SemanticJudgmentPort;
type FetchLike = typeof fetch;

export type MobileAIStatus = 'unconfigured' | 'connected' | 'unavailable';

export interface MobileAISettingsSnapshot {
  readonly status: MobileAIStatus;
  readonly message: string;
  readonly connectionStatus: AIConnectionStatus;
  readonly providerId: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKeyConfigured: boolean;
  readonly models: readonly ProviderModel[];
  readonly modelDiscoverySupported: boolean | null;
  readonly discoverySource: ModelDiscovery['source'] | null;
}

export interface ConfigureMobileAIInput {
  readonly providerId: string;
  readonly baseUrl: string;
  readonly model: string;
  /** Omit to keep the stored key; pass an empty string to clear it. */
  readonly apiKey?: string;
}

/**
 * Runtime AI service.
 *
 * Construction is asynchronous because both the non-secret configuration and
 * the Keychain key are read asynchronously. A failure in either degrades to a
 * disabled provider rather than throwing, so a Keychain problem cannot stop the
 * app from starting.
 */
export class MobileAIService implements AwarenessAIProvider, SemanticJudgmentPort {
  private config: MobileAIConfig = DEFAULT_MOBILE_AI_CONFIG;
  private apiKey = '';
  private backend: AIBackend = new DisabledAIProvider();
  private discovery: ModelDiscovery | null = null;
  private status: MobileAIStatus = 'unconfigured';
  private message = '请配置 Base URL 和 API Key。';
  private connectionStatus: AIConnectionStatus = 'not_configured';

  private constructor(
    private readonly configStorage: AIConfigStorage,
    private readonly secretStore: MobileSecretStore,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  /** Load persisted configuration and the Keychain key, then build the backend. */
  static async create(
    configStorage: AIConfigStorage,
    secretStore: MobileSecretStore,
    fetcher: FetchLike = fetch,
  ): Promise<MobileAIService> {
    const service = new MobileAIService(configStorage, secretStore, fetcher);
    await service.reload();
    return service;
  }

  get providerId(): string {
    return this.backend.providerId;
  }

  get enabled(): boolean {
    return this.backend.enabled;
  }

  snapshot(): MobileAISettingsSnapshot {
    return {
      status: this.status,
      message: this.message,
      connectionStatus: this.connectionStatus,
      providerId: this.config.providerId,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      apiKeyConfigured: this.apiKey.length > 0,
      models: this.discovery?.models ?? [],
      modelDiscoverySupported: this.discovery?.modelDiscoverySupported ?? null,
      discoverySource: this.discovery?.source ?? null,
    };
  }

  /**
   * Persist non-secret settings and, when supplied, the key.
   *
   * The key is written to the Keychain only. If the Keychain is unavailable the
   * method reports that honestly instead of storing the credential somewhere
   * weaker.
   */
  async configure(input: ConfigureMobileAIInput): Promise<MobileAISettingsSnapshot> {
    const previousIdentity = this.identity();
    this.config = {
      providerId: input.providerId.trim() || DEFAULT_MOBILE_AI_CONFIG.providerId,
      baseUrl: input.baseUrl.trim(),
      model: input.model.trim(),
    };
    await writeAIConfig(this.configStorage, this.config);

    if (input.apiKey !== undefined) {
      const nextKey = input.apiKey.trim();
      if (nextKey.length === 0) {
        await this.secretStore.remove(AI_API_KEY_SECRET_NAME);
        this.apiKey = '';
      } else {
        const saved = await this.secretStore.write(AI_API_KEY_SECRET_NAME, nextKey);
        if (!saved) {
          // Do not pretend the key was stored. The in-memory copy is left
          // untouched so the user can retry after the Keychain is available.
          this.status = 'unavailable';
          this.message = '系统钥匙串当前不可用，AI 密钥没有保存。';
          this.connectionStatus = 'not_configured';
          return this.snapshot();
        }
        this.apiKey = nextKey;
      }
    }

    this.backend = this.createBackend();
    if (previousIdentity !== this.identity()) this.discovery = null;
    this.status = this.isConfigured() ? 'unavailable' : 'unconfigured';
    this.message = this.isConfigured()
      ? 'AI 配置已保存，连接尚未验证。'
      : '请配置 Base URL 和 API Key。';
    this.connectionStatus = this.computeConnectionStatus();
    return this.snapshot();
  }

  async selectModel(model: string): Promise<MobileAISettingsSnapshot> {
    this.config = { ...this.config, model: model.trim() };
    await writeAIConfig(this.configStorage, this.config);
    if (this.backend instanceof OpenAICompatibleProvider) {
      this.backend.updateConfig(this.providerConfig());
    } else {
      this.backend = this.createBackend();
    }
    this.connectionStatus = this.computeConnectionStatus();
    return this.snapshot();
  }

  async discoverModels(refresh = false): Promise<MobileAISettingsSnapshot> {
    const result = await this.backend.listModels({ refresh });
    this.applyDiscoveryResult(result);
    return this.snapshot();
  }

  async testConnection(): Promise<MobileAISettingsSnapshot> {
    const result = await this.backend.listModels({ refresh: true });
    this.applyDiscoveryResult(result);
    return this.snapshot();
  }

  /** Re-read configuration and key; used by tests to model an app restart. */
  async reload(): Promise<void> {
    this.config = await readAIConfig(this.configStorage);
    try {
      this.apiKey = (await this.secretStore.read(AI_API_KEY_SECRET_NAME)) ?? '';
    } catch {
      this.apiKey = '';
    }
    this.backend = this.createBackend();
    this.discovery = null;
    this.status = this.isConfigured() ? 'unavailable' : 'unconfigured';
    this.message = this.isConfigured()
      ? 'AI 配置已载入，连接尚未验证。'
      : '请配置 Base URL 和 API Key。';
    this.connectionStatus = this.computeConnectionStatus();
  }

  listModels: AwarenessAIProvider['listModels'] = (request) =>
    this.backend.listModels(request);
  suggestRelations: AwarenessAIProvider['suggestRelations'] = (request) =>
    this.backend.suggestRelations(request);
  createReflectionPrompt: AwarenessAIProvider['createReflectionPrompt'] = (request) =>
    this.backend.createReflectionPrompt(request);
  getManualModelId = (): string | null => this.backend.getManualModelId();

  generateCandidates: SemanticJudgmentPort['generateCandidates'] = (request) =>
    this.backend.generateCandidates(request);
  judgeComparability: SemanticJudgmentPort['judgeComparability'] = (request) =>
    this.backend.judgeComparability(request);
  judgeAbstractionCeiling: SemanticJudgmentPort['judgeAbstractionCeiling'] = (request) =>
    this.backend.judgeAbstractionCeiling(request);
  judgeEvidenceDimensions: SemanticJudgmentPort['judgeEvidenceDimensions'] = (request) =>
    this.backend.judgeEvidenceDimensions(request);
  generateHypotheses: SemanticJudgmentPort['generateHypotheses'] = (request) =>
    this.backend.generateHypotheses(request);
  judgeHypothesisAbstractionCeiling: SemanticJudgmentPort['judgeHypothesisAbstractionCeiling'] =
    (request) => this.backend.judgeHypothesisAbstractionCeiling(request);

  private identity(): string {
    return `${this.config.providerId}\u0000${this.config.baseUrl}\u0000${this.apiKey}`;
  }

  private isConfigured(): boolean {
    return this.config.baseUrl.length > 0 && this.apiKey.length > 0;
  }

  private createBackend(): AIBackend {
    if (!this.isConfigured()) return new DisabledAIProvider();
    return new OpenAICompatibleProvider(this.providerConfig(), this.fetcher);
  }

  private providerConfig(): OpenAICompatibleConfig {
    return {
      providerId: this.config.providerId,
      baseUrl: this.config.baseUrl,
      apiKey: this.apiKey,
      model: this.config.model,
      timeoutMs: 30_000,
    };
  }

  private applyDiscoveryResult(result: AIProviderResult<ModelDiscovery>): void {
    if (!result.ok) {
      this.status = this.isConfigured() ? 'unavailable' : 'unconfigured';
      this.message = result.error.message;
      this.connectionStatus = connectionStatusForError(result.error.kind);
      return;
    }
    this.discovery = result.value;
    this.status = 'connected';
    this.connectionStatus = connectionStatusForDiscovery(this.config.model, result.value);
    this.message = result.value.modelDiscoverySupported
      ? `AI 服务已连接，发现 ${result.value.models.length} 个模型。`
      : 'AI 服务已连接；该服务不提供模型列表，请手动填写模型标识。';
  }

  private computeConnectionStatus(): AIConnectionStatus {
    if (!this.isConfigured()) return 'not_configured';
    return this.discovery === null
      ? 'not_configured'
      : connectionStatusForDiscovery(this.config.model, this.discovery);
  }
}

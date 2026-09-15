import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type { SemanticJudgmentPort } from '../../../packages/core/index';
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
} from '../../../packages/providers/ai/index';

type AIBackend = AwarenessAIProvider & SemanticJudgmentPort;
type FetchLike = typeof fetch;

export type DesktopAIStatus = 'unconfigured' | 'connected' | 'unavailable';

export interface DesktopAISettingsSnapshot {
  readonly status: DesktopAIStatus;
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

interface StoredAIConfig {
  readonly providerId: string;
  readonly baseUrl: string;
  readonly model: string;
}

const DEFAULT_CONFIG: StoredAIConfig = {
  providerId: 'openai-compatible',
  baseUrl: '',
  model: '',
};

const readConfig = (path: string): StoredAIConfig => {
  if (!existsSync(path)) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<StoredAIConfig>;
    return {
      providerId:
        typeof parsed.providerId === 'string' && parsed.providerId.trim().length > 0
          ? parsed.providerId.trim()
          : DEFAULT_CONFIG.providerId,
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl.trim() : '',
      model: typeof parsed.model === 'string' ? parsed.model.trim() : '',
    };
  } catch {
    return DEFAULT_CONFIG;
  }
};

/**
 * Desktop-owned runtime wrapper around the existing AI Provider V1.
 *
 * Only non-secret settings are written to disk. The API key is supplied by the
 * Tauri keychain bridge at process start and is held in memory only.
 */
export class DesktopAIService implements AwarenessAIProvider, SemanticJudgmentPort {
  private config: StoredAIConfig;
  private apiKey: string;
  private backend: AIBackend;
  private discovery: ModelDiscovery | null = null;
  private status: DesktopAIStatus;
  private message: string;
  private connectionStatus: AIConnectionStatus;

  constructor(
    private readonly configPath: string,
    apiKey = '',
    private readonly fetcher: FetchLike = fetch,
  ) {
    this.config = readConfig(configPath);
    this.apiKey = apiKey;
    this.backend = this.createBackend();
    this.status = this.isConfigured() ? 'unavailable' : 'unconfigured';
    this.message = this.isConfigured()
      ? 'AI 配置已载入，连接尚未验证。'
      : '请配置 Base URL 和 API Key。';
    this.connectionStatus = this.computeConnectionStatus();
  }

  get providerId(): string {
    return this.backend.providerId;
  }

  get enabled(): boolean {
    return this.backend.enabled;
  }

  snapshot(): DesktopAISettingsSnapshot {
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

  configure(input: {
    readonly providerId: string;
    readonly baseUrl: string;
    readonly model: string;
    readonly apiKey?: string;
  }): DesktopAISettingsSnapshot {
    const previousIdentity = `${this.config.providerId}\u0000${this.config.baseUrl}\u0000${this.apiKey}`;
    this.config = {
      providerId: input.providerId.trim() || 'openai-compatible',
      baseUrl: input.baseUrl.trim(),
      model: input.model.trim(),
    };
    if (input.apiKey !== undefined) this.apiKey = input.apiKey.trim();
    const nextIdentity = `${this.config.providerId}\u0000${this.config.baseUrl}\u0000${this.apiKey}`;
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
    this.backend = this.createBackend();
    if (previousIdentity !== nextIdentity) this.discovery = null;
    this.status = this.isConfigured() ? 'unavailable' : 'unconfigured';
    this.message = this.isConfigured()
      ? 'AI 配置已保存，连接尚未验证。'
      : '请配置 Base URL 和 API Key。';
    this.connectionStatus = this.computeConnectionStatus();
    return this.snapshot();
  }

  selectModel(model: string): DesktopAISettingsSnapshot {
    this.config = { ...this.config, model: model.trim() };
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
    if (this.backend instanceof OpenAICompatibleProvider) {
      this.backend.updateConfig(this.providerConfig());
    } else {
      this.backend = this.createBackend();
    }
    this.connectionStatus = this.computeConnectionStatus();
    return this.snapshot();
  }

  async discoverModels(refresh: boolean): Promise<DesktopAISettingsSnapshot> {
    const result = await this.backend.listModels({ refresh });
    this.applyDiscoveryResult(result);
    return this.snapshot();
  }

  async testConnection(): Promise<DesktopAISettingsSnapshot> {
    const result = await this.backend.listModels({ refresh: true });
    this.applyDiscoveryResult(result);
    return this.snapshot();
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

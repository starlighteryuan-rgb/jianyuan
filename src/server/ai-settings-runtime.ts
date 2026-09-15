import type { SemanticJudgmentPort } from '../../packages/core/index';
import {
  DisabledAIProvider,
  OpenAICompatibleProvider,
  connectionStatusForDiscovery,
  connectionStatusForError,
  type AIConnectionStatus,
  type AwarenessAIProvider,
  type ModelDiscovery,
  type ProviderModel,
} from '../../packages/providers/ai/index';

type AIBackend = AwarenessAIProvider & SemanticJudgmentPort;
type FetchLike = typeof fetch;

export type AISettingsStatus =
  | 'disabled'
  | 'needs_configuration'
  | 'ready'
  | 'connected'
  | 'error';

export interface AISettingsSnapshot {
  readonly enabled: boolean;
  readonly providerId: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKeyConfigured: boolean;
  readonly status: AISettingsStatus;
  readonly statusMessage: string;
  readonly connectionStatus: AIConnectionStatus;
  readonly modelDiscoverySupported: boolean | null;
  readonly models: readonly ProviderModel[];
  readonly discoverySource: ModelDiscovery['source'] | null;
}

export interface AISettingsInput {
  readonly enabled: boolean;
  readonly providerId: string;
  readonly baseUrl: string;
  /** Blank keeps the current in-process key. */
  readonly apiKey: string;
  readonly model: string;
}

interface MutableAIConfig {
  enabled: boolean;
  providerId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

const timeoutFrom = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
};

const initialConfig = (
  environment: Readonly<Record<string, string | undefined>>,
): MutableAIConfig => ({
  enabled: environment.JIANYUAN_AI_ENABLED === 'true',
  providerId: environment.JIANYUAN_AI_PROVIDER?.trim() || 'openai-compatible',
  baseUrl: environment.JIANYUAN_AI_BASE_URL?.trim() || '',
  apiKey: environment.JIANYUAN_AI_API_KEY?.trim() || '',
  model: environment.JIANYUAN_AI_MODEL?.trim() || '',
  timeoutMs: timeoutFrom(environment.JIANYUAN_AI_TIMEOUT_MS),
});

/**
 * Product-layer runtime settings around the existing provider contracts.
 *
 * The object identity is stable so the Core composition graph can keep the
 * same provider/semantic-port references while Settings swaps the delegate.
 * Secrets remain process-local and are never included in snapshots.
 */
export class AISettingsRuntime implements AwarenessAIProvider, SemanticJudgmentPort {
  private config: MutableAIConfig;
  private backend: AIBackend;
  private discovery: ModelDiscovery | null = null;
  private status: AISettingsStatus;
  private statusMessage: string;
  private connectionStatus: AIConnectionStatus;

  constructor(
    environment: Readonly<Record<string, string | undefined>> = process.env,
    private readonly fetcher: FetchLike = fetch,
  ) {
    this.config = initialConfig(environment);
    this.backend = this.createBackend();
    this.status = this.computeStatus();
    this.statusMessage = this.defaultStatusMessage();
    this.connectionStatus = this.computeConnectionStatus();
  }

  get providerId(): string {
    return this.backend.providerId;
  }

  get enabled(): boolean {
    return this.backend.enabled;
  }

  snapshot(): AISettingsSnapshot {
    return {
      enabled: this.config.enabled,
      providerId: this.config.providerId,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      apiKeyConfigured: this.config.apiKey.length > 0,
      status: this.status,
      statusMessage: this.statusMessage,
      connectionStatus: this.connectionStatus,
      modelDiscoverySupported:
        this.discovery?.modelDiscoverySupported ?? null,
      models: this.discovery?.models ?? [],
      discoverySource: this.discovery?.source ?? null,
    };
  }

  configure(input: AISettingsInput): void {
    const identityChanged =
      input.providerId.trim() !== this.config.providerId ||
      input.baseUrl.trim() !== this.config.baseUrl ||
      (input.apiKey.trim().length > 0 &&
        input.apiKey.trim() !== this.config.apiKey);

    this.config = {
      ...this.config,
      enabled: input.enabled,
      providerId: input.providerId.trim() || 'openai-compatible',
      baseUrl: input.baseUrl.trim(),
      apiKey:
        input.apiKey.trim().length > 0
          ? input.apiKey.trim()
          : this.config.apiKey,
      model: input.model.trim(),
    };
    this.backend = this.createBackend();
    if (identityChanged) this.discovery = null;
    this.status = this.computeStatus();
    this.statusMessage = this.defaultStatusMessage();
    this.connectionStatus = this.computeConnectionStatus();
  }

  selectModel(model: string): void {
    const wasConnected = this.status === 'connected';
    this.config.model = model.trim();
    this.backend = this.createBackend();
    this.status = wasConnected ? 'connected' : this.computeStatus();
    this.statusMessage =
      this.config.model.length > 0
        ? `当前进程已选择模型：${this.config.model}`
        : '尚未选择模型。';
    this.connectionStatus = this.computeConnectionStatus();
  }

  async refreshModels(): Promise<void> {
    if (!this.config.enabled) {
      this.status = 'disabled';
      this.statusMessage = '请先配置 AI 服务，再获取模型列表。';
      this.connectionStatus = 'not_configured';
      return;
    }
    const result = await this.backend.listModels({ refresh: true });
    if (!result.ok) {
      this.status = 'error';
      this.statusMessage = result.error.message;
      this.connectionStatus = connectionStatusForError(result.error.kind);
      return;
    }
    this.discovery = result.value;
    this.status = 'connected';
    this.connectionStatus = connectionStatusForDiscovery(this.config.model, result.value);
    this.statusMessage = result.value.modelDiscoverySupported
      ? `已连接，获取到 ${result.value.models.length} 个模型。`
      : '已连接；该服务不提供模型列表，请手动填写模型标识。';
  }

  async testConnection(): Promise<void> {
    if (!this.config.enabled) {
      this.status = 'disabled';
      this.statusMessage = '请先配置 AI 服务，再测试连接。';
      this.connectionStatus = 'not_configured';
      return;
    }
    const result = await this.backend.listModels({ refresh: true });
    if (!result.ok) {
      this.status = 'error';
      this.statusMessage = result.error.message;
      this.connectionStatus = connectionStatusForError(result.error.kind);
      return;
    }
    this.discovery = result.value;
    this.status = 'connected';
    this.connectionStatus = connectionStatusForDiscovery(this.config.model, result.value);
    this.statusMessage = result.value.modelDiscoverySupported
      ? '连接成功，模型列表可用。'
      : '连接成功；该服务不提供模型列表。';
  }

  listModels: AwarenessAIProvider['listModels'] = (request) =>
    this.backend.listModels(request);

  suggestRelations: AwarenessAIProvider['suggestRelations'] = (request) =>
    this.backend.suggestRelations(request);

  createReflectionPrompt: AwarenessAIProvider['createReflectionPrompt'] = (
    request,
  ) => this.backend.createReflectionPrompt(request);

  getManualModelId(): string | null {
    return this.backend.getManualModelId();
  }

  generateCandidates: SemanticJudgmentPort['generateCandidates'] = (request) =>
    this.backend.generateCandidates(request);

  judgeComparability: SemanticJudgmentPort['judgeComparability'] = (request) =>
    this.backend.judgeComparability(request);

  judgeAbstractionCeiling: SemanticJudgmentPort['judgeAbstractionCeiling'] = (
    request,
  ) => this.backend.judgeAbstractionCeiling(request);

  judgeEvidenceDimensions: SemanticJudgmentPort['judgeEvidenceDimensions'] = (
    request,
  ) => this.backend.judgeEvidenceDimensions(request);

  generateHypotheses: SemanticJudgmentPort['generateHypotheses'] = (request) =>
    this.backend.generateHypotheses(request);

  judgeHypothesisAbstractionCeiling: SemanticJudgmentPort['judgeHypothesisAbstractionCeiling'] = (
    request,
  ) => this.backend.judgeHypothesisAbstractionCeiling(request);

  private createBackend(): AIBackend {
    if (!this.config.enabled) return new DisabledAIProvider();
    return new OpenAICompatibleProvider(
      {
        providerId: this.config.providerId,
        baseUrl: this.config.baseUrl,
        apiKey: this.config.apiKey,
        model: this.config.model,
        timeoutMs: this.config.timeoutMs,
      },
      this.fetcher,
    );
  }

  private computeStatus(): AISettingsStatus {
    if (!this.config.enabled) return 'disabled';
    if (this.config.baseUrl.length === 0 || this.config.apiKey.length === 0) {
      return 'needs_configuration';
    }
    return 'ready';
  }

  private computeConnectionStatus(): AIConnectionStatus {
    if (!this.config.enabled || this.config.baseUrl.length === 0 || this.config.apiKey.length === 0) {
      return 'not_configured';
    }
    return this.status === 'connected' && this.discovery !== null
      ? connectionStatusForDiscovery(this.config.model, this.discovery)
      : 'not_configured';
  }

  private defaultStatusMessage(): string {
    if (!this.config.enabled) return 'AI is off. No personal data is sent.';
    if (this.status === 'needs_configuration') {
      return 'Add a Base URL and API key before testing the connection.';
    }
    return 'Configuration is ready. Run a connection test to verify it.';
  }
}

export const createAISettingsRuntime = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
  fetcher: FetchLike = fetch,
): AISettingsRuntime => new AISettingsRuntime(environment, fetcher);

const globalForAISettings = globalThis as unknown as {
  jianyuanAISettingsRuntime: AISettingsRuntime | undefined;
};

export const getAISettingsRuntime = (): AISettingsRuntime => {
  const current = globalForAISettings.jianyuanAISettingsRuntime;
  if (current !== undefined) return current;
  const created = createAISettingsRuntime();
  globalForAISettings.jianyuanAISettingsRuntime = created;
  return created;
};

export const getSharedAIProviderRuntime = () => {
  const runtime = getAISettingsRuntime();
  return { provider: runtime, judgment: runtime };
};

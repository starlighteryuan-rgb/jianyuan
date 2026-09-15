import type { SemanticJudgmentPort } from '../../packages/core/index';
import {
  DisabledAIProvider,
  OpenAICompatibleProvider,
  type AwarenessAIProvider,
} from '../../packages/providers/ai/index';

export interface AIProviderRuntime {
  readonly provider: AwarenessAIProvider;
  readonly judgment: SemanticJudgmentPort;
}

const timeoutFrom = (value: string | undefined): number => {
  if (value === undefined) return 30_000;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
};

/**
 * AI is opt-in. Missing or incomplete enabled configuration remains visible
 * through provider errors, but never prevents the non-AI Core graph starting.
 */
export const createAIProviderRuntime = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AIProviderRuntime => {
  if (environment.JIANYUAN_AI_ENABLED !== 'true') {
    const disabled = new DisabledAIProvider();
    return { provider: disabled, judgment: disabled };
  }

  const configured = new OpenAICompatibleProvider({
    providerId: environment.JIANYUAN_AI_PROVIDER ?? 'openai-compatible',
    baseUrl: environment.JIANYUAN_AI_BASE_URL ?? '',
    apiKey: environment.JIANYUAN_AI_API_KEY ?? '',
    model: environment.JIANYUAN_AI_MODEL ?? '',
    timeoutMs: timeoutFrom(environment.JIANYUAN_AI_TIMEOUT_MS),
  });
  return { provider: configured, judgment: configured };
};

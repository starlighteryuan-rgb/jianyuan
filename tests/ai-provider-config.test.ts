import { describe, expect, it } from 'vitest';

import { createAIProviderRuntime } from '@/server/ai-provider-config';

describe('AI provider runtime configuration', () => {
  it('defaults to the supported disabled mode', async () => {
    const runtime = createAIProviderRuntime({});

    expect(runtime.provider.enabled).toBe(false);
    expect(runtime.provider.providerId).toBe('disabled');
    expect(await runtime.provider.listModels()).toMatchObject({
      ok: true,
      value: { modelDiscoverySupported: false, reason: 'ai_disabled' },
    });
  });

  it('requires explicit enablement and keeps manual model configuration', () => {
    const runtime = createAIProviderRuntime({
      JIANYUAN_AI_ENABLED: 'true',
      JIANYUAN_AI_PROVIDER: 'compatible-gateway',
      JIANYUAN_AI_BASE_URL: 'https://gateway.example.test/v1',
      JIANYUAN_AI_API_KEY: 'runtime-secret',
      JIANYUAN_AI_MODEL: 'manual-id',
      JIANYUAN_AI_TIMEOUT_MS: '2500',
    });

    expect(runtime.provider.enabled).toBe(true);
    expect(runtime.provider.providerId).toBe('compatible-gateway');
    expect(runtime.provider.getManualModelId()).toBe('manual-id');
    expect(runtime.judgment).toBe(runtime.provider);
  });
});

import { describe, expect, it, vi } from 'vitest';

import { AISettingsRuntime } from '../src/server/ai-settings-runtime';

describe('AI Settings runtime facade', () => {
  it('starts disabled and exposes no secret in its product snapshot', () => {
    const runtime = new AISettingsRuntime({
      JIANYUAN_AI_API_KEY: 'never-render-this',
    });

    const snapshot = runtime.snapshot();
    expect(snapshot.enabled).toBe(false);
    expect(snapshot.status).toBe('disabled');
    expect(snapshot.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('never-render-this');
  });

  it('does not attempt a connection while AI is disabled', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const runtime = new AISettingsRuntime({}, fetcher);

    await runtime.testConnection();

    expect(fetcher).not.toHaveBeenCalled();
    expect(runtime.snapshot()).toMatchObject({
      status: 'disabled',
      statusMessage: '请先配置 AI 服务，再测试连接。',
    });
  });

  it('uses the existing provider model-discovery contract after configuration', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: [
          {
            id: 'model-a',
            display_name: 'Model A',
            owned_by: 'local',
          },
        ],
      }),
    ) as unknown as typeof fetch;
    const runtime = new AISettingsRuntime({}, fetcher);

    runtime.configure({
      enabled: true,
      providerId: 'compatible-local',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'secret',
      model: '',
    });
    await runtime.refreshModels();
    runtime.selectModel('model-a');

    expect(fetcher).toHaveBeenCalledWith(
      'https://provider.example/v1/models',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(runtime.snapshot()).toMatchObject({
      enabled: true,
      status: 'connected',
      model: 'model-a',
      modelDiscoverySupported: true,
    });
    expect(runtime.getManualModelId()).toBe('model-a');
  });

  it('keeps the stable facade identity while swapping enabled state', () => {
    const runtime = new AISettingsRuntime({});
    const facade = runtime;

    runtime.configure({
      enabled: true,
      providerId: 'provider',
      baseUrl: 'https://provider.example',
      apiKey: 'secret',
      model: 'model-a',
    });

    expect(runtime).toBe(facade);
    expect(runtime.enabled).toBe(true);
    expect(runtime.providerId).toBe('provider');
  });

  it('reports authentication failure without sending user Record data', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
      return new Response('{}', { status: 401 });
    }) as unknown as typeof fetch;
    const runtime = new AISettingsRuntime({}, fetcher);
    runtime.configure({
      enabled: true,
      providerId: 'provider',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'secret',
      model: 'model-a',
    });

    await runtime.testConnection();

    expect(runtime.snapshot()).toMatchObject({
      status: 'error',
      connectionStatus: 'authentication_failed',
    });
  });

  it('distinguishes a missing selected model after discovery', async () => {
    const runtime = new AISettingsRuntime(
      {},
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ id: 'available-model' }] }), {
          status: 200,
        }),
      ) as unknown as typeof fetch,
    );
    runtime.configure({
      enabled: true,
      providerId: 'provider',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'secret',
      model: 'missing-model',
    });

    await runtime.testConnection();

    expect(runtime.snapshot()).toMatchObject({
      status: 'connected',
      connectionStatus: 'model_unavailable',
    });
  });
});

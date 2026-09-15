import { describe, expect, it, vi } from 'vitest';

import {
  DisabledAIProvider,
  OpenAICompatibleProvider,
  type AIInvocationAuthorization,
  type OpenAICompatibleConfig,
} from '../index';

const config = (
  overrides: Partial<OpenAICompatibleConfig> = {},
): OpenAICompatibleConfig => ({
  providerId: 'test-provider',
  baseUrl: 'https://models.example.test/v1',
  apiKey: 'secret-test-key',
  model: 'manual-model-id',
  timeoutMs: 100,
  ...overrides,
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const completion = (body: unknown, status = 200): Response =>
  jsonResponse(
    {
      choices: [{ message: { content: JSON.stringify(body) } }],
    },
    status,
  );

const authorization: AIInvocationAuthorization = {
  userEnabledAI: true,
  directiveAllowsAI: true,
  selectedRecordIds: ['record-1', 'record-2'],
  reason: 'user_requested_relation_review',
};

const records = [
  { recordId: 'record-1', verbatim: '第一条记录' },
  { recordId: 'record-2', verbatim: '第二条记录' },
] as const;

describe('DisabledAIProvider', () => {
  it('is an explicit supported mode and never invokes a network', async () => {
    const provider = new DisabledAIProvider();

    expect(await provider.listModels()).toEqual({
      ok: true,
      value: {
        modelDiscoverySupported: false,
        models: [],
        reason: 'ai_disabled',
        source: 'disabled',
      },
    });
    expect(
      await provider.suggestRelations({ authorization, records }),
    ).toMatchObject({ ok: false, error: { kind: 'disabled' } });
    expect(provider.getManualModelId()).toBeNull();
  });
});

describe('OpenAICompatibleProvider model discovery', () => {
  it('fetches provider-neutral models from the real upstream response shape', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            id: 'model-live',
            display_name: 'Live Model',
            owned_by: 'upstream-owner',
            created: 123,
          },
        ],
      }),
    );
    const provider = new OpenAICompatibleProvider(
      config(),
      fetcher as unknown as typeof fetch,
    );

    const result = await provider.listModels();

    expect(result).toEqual({
      ok: true,
      value: {
        modelDiscoverySupported: true,
        source: 'upstream',
        models: [
          {
            id: 'model-live',
            displayName: 'Live Model',
            provider: 'test-provider',
            ownedBy: 'upstream-owner',
            metadata: { created: 123 },
          },
        ],
      },
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://models.example.test/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer secret-test-key',
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('secret-test-key');
    expect(JSON.stringify(result)).not.toContain('capabilities');
  });

  it('distinguishes credential errors, unsupported discovery, and empty lists', async () => {
    const unauthorized = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch,
    );
    expect(await unauthorized.listModels()).toMatchObject({
      ok: false,
      error: { kind: 'unauthorized', statusCode: 401 },
    });

    const unsupported = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () => jsonResponse({}, 404)) as unknown as typeof fetch,
    );
    expect(await unsupported.listModels()).toEqual({
      ok: true,
      value: {
        modelDiscoverySupported: false,
        models: [],
        reason: 'upstream_unsupported',
        source: 'upstream',
      },
    });

    const methodUnsupported = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () => jsonResponse({}, 405)) as unknown as typeof fetch,
    );
    expect(await methodUnsupported.listModels()).toMatchObject({
      ok: true,
      value: {
        modelDiscoverySupported: false,
        reason: 'upstream_unsupported',
      },
    });

    const empty = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () => jsonResponse({ data: [] })) as unknown as typeof fetch,
    );
    expect(await empty.listModels()).toEqual({
      ok: true,
      value: {
        modelDiscoverySupported: true,
        models: [],
        source: 'upstream',
      },
    });
  });

  it('reports endpoint/network and malformed model response errors safely', async () => {
    const unreachable = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () => {
        throw new TypeError('connect failed with secret-test-key');
      }) as unknown as typeof fetch,
    );
    const endpointResult = await unreachable.listModels();
    expect(endpointResult).toMatchObject({
      ok: false,
      error: { kind: 'upstream_error' },
    });
    expect(JSON.stringify(endpointResult)).not.toContain('secret-test-key');

    const malformed = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () => jsonResponse({ data: [{ name: 'missing id' }] })) as unknown as typeof fetch,
    );
    expect(await malformed.listModels()).toMatchObject({
      ok: false,
      error: { kind: 'malformed_response' },
    });
  });

  it('uses cache, supports refresh, and invalidates on provider identity changes', async () => {
    let sequence = 0;
    const fetcher = vi.fn(async () =>
      jsonResponse({ data: [{ id: 'model-' + ++sequence }] }),
    );
    const provider = new OpenAICompatibleProvider(
      config(),
      fetcher as unknown as typeof fetch,
    );

    expect((await provider.listModels()).ok).toBe(true);
    const cached = await provider.listModels();
    expect(cached).toMatchObject({
      ok: true,
      value: { source: 'cache', models: [{ id: 'model-1' }] },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const refreshed = await provider.listModels({ refresh: true });
    expect(refreshed).toMatchObject({
      ok: true,
      value: { source: 'upstream', models: [{ id: 'model-2' }] },
    });

    provider.updateConfig(config({ apiKey: 'changed-key' }));
    expect(await provider.listModels()).toMatchObject({
      ok: true,
      value: { source: 'upstream', models: [{ id: 'model-3' }] },
    });
    provider.updateConfig(
      config({
        apiKey: 'changed-key',
        baseUrl: 'https://another.example.test',
        providerId: 'another-provider',
      }),
    );
    expect(await provider.listModels()).toMatchObject({
      ok: true,
      value: {
        source: 'upstream',
        models: [{ id: 'model-4', provider: 'another-provider' }],
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});

describe('OpenAICompatibleProvider awareness capabilities', () => {
  it('keeps manual model fallback usable when discovery is unsupported', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(
        completion({
          suggestions: [
            {
              recordRefs: ['record-1', 'record-2'],
              comparisonAxis: { question: '有什么共同变化？', dimension: '变化' },
              relationType: 'possible_change',
              evidenceSummary: '两条记录可能呈现变化。',
              assertsTemporalOrdering: false,
            },
          ],
        }),
      );
    const provider = new OpenAICompatibleProvider(
      config({ model: 'manually-entered-model' }),
      fetcher as unknown as typeof fetch,
    );

    expect(await provider.listModels()).toMatchObject({
      ok: true,
      value: { modelDiscoverySupported: false },
    });
    expect(provider.getManualModelId()).toBe('manually-entered-model');
    expect(
      await provider.suggestRelations({ authorization, records }),
    ).toMatchObject({
      ok: true,
      value: {
        status: 'SURFACE',
        suggestions: [{ kind: 'relation_candidate', relationType: 'possible_change' }],
      },
    });
  });

  it('accepts an explicit no-observation result without inventing a candidate', async () => {
    const provider = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () =>
        completion({ status: 'NO_OBSERVATION', language: 'zh-CN', suggestions: [] }),
      ) as unknown as typeof fetch,
    );

    const result = await provider.suggestRelations({ authorization, records });
    expect(result).toEqual({
      ok: true,
      value: { status: 'NO_OBSERVATION', language: 'zh-CN', suggestions: [] },
    });
  });

  it('filters a candidate that only cites a same-day or close-time signal', async () => {
    const provider = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () =>
        completion({
          status: 'SURFACE',
          language: 'zh-CN',
          suggestions: [
            {
              recordRefs: ['record-1', 'record-2'],
              comparisonAxis: { question: '两条记录是否在同一天？', dimension: '时间接近' },
              relationType: 'temporal_proximity',
              evidenceSummary: '两条记录在同一天写下，时间也接近。',
              assertsTemporalOrdering: false,
            },
          ],
        }),
      ) as unknown as typeof fetch,
    );

    expect(await provider.suggestRelations({ authorization, records })).toEqual({
      ok: true,
      value: { status: 'NO_OBSERVATION', language: 'zh-CN', suggestions: [] },
    });
  });

  it('rejects a non-Chinese or mixed-language observation instead of passing it through', async () => {
    const fetcher = vi.fn(async () =>
      completion({
        status: 'SURFACE',
        language: 'zh-CN',
        suggestions: [
          {
            recordRefs: ['record-1', 'record-2'],
            comparisonAxis: {
              question: 'What did these records share?',
              dimension: 'shared pattern',
            },
            relationType: 'shared_pattern',
            evidenceSummary: 'Both records describe the same start.',
            assertsTemporalOrdering: false,
          },
        ],
      }),
    );
    const provider = new OpenAICompatibleProvider(
      config(),
      fetcher as unknown as typeof fetch,
    );

    expect(await provider.suggestRelations({ authorization, records })).toMatchObject({
      ok: false,
      error: { kind: 'malformed_response' },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('returns relation candidates without evidence, identity, or conclusion fields', async () => {
    const provider = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () =>
        completion({
          suggestions: [
            {
              recordRefs: ['record-1', 'record-2'],
              comparisonAxis: {
                question: '两次开始行动前发生了什么？',
                dimension: '行动触发条件',
              },
              relationType: 'possible_pattern',
              evidenceSummary: '可能存在值得回看的共同点。',
              assertsTemporalOrdering: false,
              assessment: { total: 100 },
              identity: 'should be discarded',
            },
          ],
        }),
      ) as unknown as typeof fetch,
    );

    const result = await provider.suggestRelations({ authorization, records });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected relation suggestion');
    expect(result.value.status).toBe('SURFACE');
    expect(result.value.suggestions[0]).toEqual({
      kind: 'relation_candidate',
      recordRefs: ['record-1', 'record-2'],
      comparisonAxis: {
        question: '两次开始行动前发生了什么？',
        dimension: '行动触发条件',
      },
      relationType: 'possible_pattern',
      evidenceSummary: '可能存在值得回看的共同点。',
      assertsTemporalOrdering: false,
    });
    expect(result.value.suggestions[0]).not.toHaveProperty('assessment');
    expect(result.value.suggestions[0]).not.toHaveProperty('supportLevel');
    expect(result.value.suggestions[0]).not.toHaveProperty('identity');
  });

  it('returns a reflection invitation and never a user answer', async () => {
    const provider = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () =>
        completion({ question: '这个理解对你来说值得继续观察吗？' }),
      ) as unknown as typeof fetch,
    );

    const result = await provider.createReflectionPrompt({
      authorization,
      records,
      focus: '行动开始',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'reflection_invitation',
        question: '这个理解对你来说值得继续观察吗？',
      },
    });
    expect(JSON.stringify(result)).not.toContain('userAnswer');
  });

  it('rejects duplicate references and identity/diagnosis claims from candidates', async () => {
    const duplicate = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () =>
        completion({
          suggestions: [
            {
              recordRefs: ['record-1', 'record-1'],
              comparisonAxis: { question: '可能的联系？', dimension: '变化' },
              relationType: 'possible_change',
              evidenceSummary: '仅供回看。',
              assertsTemporalOrdering: false,
            },
          ],
        }),
      ) as unknown as typeof fetch,
    );
    expect(
      await duplicate.suggestRelations({ authorization, records }),
    ).toMatchObject({ ok: false, error: { kind: 'malformed_response' } });

    const prohibited = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () =>
        completion({
          suggestions: [
            {
              recordRefs: ['record-1', 'record-2'],
              comparisonAxis: { question: '你就是一个拖延的人。', dimension: '人格' },
              relationType: 'possible_identity',
              evidenceSummary: '你的人格已经被证明。',
              assertsTemporalOrdering: false,
            },
          ],
        }),
      ) as unknown as typeof fetch,
    );
    expect(
      await prohibited.suggestRelations({ authorization, records }),
    ).toMatchObject({ ok: false, error: { kind: 'malformed_response' } });
  });

  it('blocks unselected context before any network request', async () => {
    const fetcher = vi.fn();
    const provider = new OpenAICompatibleProvider(
      config(),
      fetcher as unknown as typeof fetch,
    );

    const result = await provider.suggestRelations({
      authorization: {
        ...authorization,
        selectedRecordIds: ['record-1', 'record-other'],
      },
      records,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'privacy_boundary' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('handles timeout, API errors, malformed JSON and malformed structured output', async () => {
    const timeoutFetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const timedOut = new OpenAICompatibleProvider(
      config({ timeoutMs: 5 }),
      timeoutFetcher as unknown as typeof fetch,
    );
    expect(
      await timedOut.createReflectionPrompt({ authorization, records }),
    ).toMatchObject({ ok: false, error: { kind: 'timeout' } });

    const rateLimited = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () => jsonResponse({}, 429)) as unknown as typeof fetch,
    );
    expect(
      await rateLimited.createReflectionPrompt({ authorization, records }),
    ).toMatchObject({ ok: false, error: { kind: 'rate_limited' } });

    const malformedJson = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch,
    );
    expect(
      await malformedJson.createReflectionPrompt({ authorization, records }),
    ).toMatchObject({ ok: false, error: { kind: 'malformed_response' } });

    const malformedOutput = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () => completion({ answerForUser: 'yes' })) as unknown as typeof fetch,
    );
    expect(
      await malformedOutput.createReflectionPrompt({ authorization, records }),
    ).toMatchObject({ ok: false, error: { kind: 'malformed_response' } });
  });

  it.each([
    [403, 'unauthorized'],
    [404, 'endpoint_not_found'],
    [503, 'upstream_error'],
  ] as const)('maps chat HTTP %i to %s without exposing response bodies', async (status, kind) => {
    const provider = new OpenAICompatibleProvider(
      config(),
      vi.fn(async () =>
        new Response('secret upstream diagnostics', { status }),
      ) as unknown as typeof fetch,
    );

    const result = await provider.createReflectionPrompt({ authorization, records });
    expect(result).toMatchObject({ ok: false, error: { kind, statusCode: status } });
    expect(JSON.stringify(result)).not.toContain('secret upstream diagnostics');
  });
});

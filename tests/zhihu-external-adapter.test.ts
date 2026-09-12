import { describe, expect, it, vi } from 'vitest';

import { computeSourceFingerprint } from '@/domain/ingestion/source-fingerprint';
import { sha256 } from '@/infra/hash';
import {
  ZhihuExternalAdapter,
  type ZhihuFetch,
} from '@/infra/external/zhihu-external-adapter';
import { createMemoryServices } from '@/server/container';

const NOW = new Date('2026-09-13T04:00:00.000Z');

const successPayload = (items: readonly unknown[]) => ({
  Code: 0,
  Message: 'success',
  Data: {
    HasMore: false,
    SearchHashId: 'search-hash-001',
    Items: items,
  },
});

const item = (over: Record<string, unknown> = {}) => ({
  Title: '为什么开始复杂任务前会先整理？',
  ContentType: 'Answer',
  ContentID: '123456',
  ContentText: '我会先<em>整理</em>桌面，再开始处理复杂任务。',
  Url: 'https://www.zhihu.com/answer/123456?utm_medium=openapi_platform&utm_source=test',
  EditTime: 1_777_777_777,
  AuthorName: '外部作者',
  AuthorityLevel: '2',
  RankingScore: 0.9,
  ...over,
});

const jsonFetch = (payload: unknown): ZhihuFetch =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  }));

describe('ZhihuExternalAdapter', () => {
  it('calls the official search endpoint and maps results into the existing external boundary', async () => {
    const fetcher = jsonFetch(successPayload([item()]));
    const adapter = new ZhihuExternalAdapter({
      accessSecret: 'test-secret',
      fetch: fetcher,
      now: () => NOW,
    });

    const result = await adapter.search({
      query: '复杂任务 启动',
      count: 3,
      kind: 'experience',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = vi.mocked(fetcher).mock.calls[0] ?? [];
    const url = new URL(String(calledUrl));
    expect(url.origin + url.pathname).toBe(
      'https://developer.zhihu.com/api/v1/content/zhihu_search',
    );
    expect(url.searchParams.get('Query')).toBe('复杂任务 启动');
    expect(url.searchParams.get('Count')).toBe('3');

    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-secret');
    expect(headers.get('X-Request-Timestamp')).toBe('1789272000');

    expect(result.value.searchHashId).toBe('search-hash-001');
    expect(result.value.hasMore).toBe(false);
    expect(result.value.references).toEqual([
      {
        url: 'https://www.zhihu.com/answer/123456',
        provider: 'zhihu',
        kind: 'experience',
        excerpt: '我会先整理桌面，再开始处理复杂任务。',
        language: null,
        title: '为什么开始复杂任务前会先整理？',
        retrievedAt: NOW,
      },
    ]);
  });

  it('does not promote author, authority, ranking, or EditTime into Domain meaning', async () => {
    const adapter = new ZhihuExternalAdapter({
      accessSecret: 'test-secret',
      fetch: jsonFetch(successPayload([item()])),
      now: () => NOW,
    });

    const result = await adapter.search({
      query: '任务启动',
      kind: 'perspectives',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [reference] = result.value.references;
    expect(reference?.language).toBeNull();
    expect(reference?.retrievedAt).toBe(NOW);
    expect(reference).not.toHaveProperty('author');
    expect(reference).not.toHaveProperty('authorityLevel');
    expect(reference).not.toHaveProperty('rankingScore');
    expect(reference).not.toHaveProperty('editTime');
    expect(reference).not.toHaveProperty('eventTime');
  });

  it('enters storage only through ExternalReferenceService and leaves sourceFingerprint unchanged', async () => {
    const adapter = new ZhihuExternalAdapter({
      accessSecret: 'test-secret',
      fetch: jsonFetch(successPayload([item()])),
      now: () => NOW,
    });
    const retrieved = await adapter.search({
      query: '任务启动',
      kind: 'experience',
    });
    expect(retrieved.ok).toBe(true);
    if (!retrieved.ok) return;

    const source = retrieved.value.references[0];
    expect(source).toBeDefined();
    if (source === undefined) return;

    const services = createMemoryServices();
    const imported = await services.externalReferences.import({ source });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const stored = await services.repositories.records.findById(
      imported.value.recordId,
    );
    expect(stored?.epistemicRoles).toEqual(['external_reference']);
    expect(stored?.provenance.origin).toBe('imported');
    expect(stored?.provenance.actor).toBe('platform');
    expect(stored?.time).toEqual({ semantic: 'capture_time', at: NOW });
    expect(stored?.sourceFingerprint).toBe(
      computeSourceFingerprint(
        {
          origin: 'imported',
          actor: 'platform',
          sourceRef: source.url,
          verbatim: source.excerpt,
          time: { semantic: 'capture_time', at: NOW },
        },
        sha256,
      ),
    );
  });

  it.each([
    [{ query: '   ', count: 1, kind: 'experience' as const }, 'query'],
    [{ query: '有效', count: 0, kind: 'experience' as const }, 'count'],
    [{ query: '有效', count: 11, kind: 'experience' as const }, 'count'],
  ])('refuses invalid input before making a request', async (request, field) => {
    const fetcher = jsonFetch(successPayload([]));
    const adapter = new ZhihuExternalAdapter({
      accessSecret: 'test-secret',
      fetch: fetcher,
      now: () => NOW,
    });

    const result = await adapter.search(request);

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ kind: 'invalid_request', field }),
      }),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('surfaces API errors without treating them as an empty result', async () => {
    const adapter = new ZhihuExternalAdapter({
      accessSecret: 'test-secret',
      fetch: jsonFetch({ Code: 30001, Message: 'rate limit exceeded' }),
      now: () => NOW,
    });

    const result = await adapter.search({
      query: '任务启动',
      kind: 'practical',
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'api_error',
        code: 30001,
        message: 'rate limit exceeded',
      },
    });
  });

  it('fails closed when a result points outside Zhihu', async () => {
    const adapter = new ZhihuExternalAdapter({
      accessSecret: 'test-secret',
      fetch: jsonFetch(
        successPayload([item({ Url: 'https://example.com/answer/123456' })]),
      ),
      now: () => NOW,
    });

    const result = await adapter.search({
      query: '任务启动',
      kind: 'professional',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ kind: 'invalid_response' }),
      }),
    );
  });
});

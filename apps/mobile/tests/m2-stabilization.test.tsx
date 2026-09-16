/**
 * M2 stabilization regression coverage.
 *
 * These tests exercise production runtime/storage/components. The provider and
 * timers are the only substitutes, so the assertions cover the same paths the
 * iOS app uses.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../src/shell/app-shell';
import { RuntimeProvider } from '../src/shell/runtime-context';
import { ThemeProvider } from '../src/theme/theme-context';
import { ExpoSecureStoreSecretStore } from '../src/runtime/secret-store';
import type { SecureStoreBinding } from '../src/runtime/secret-store';
import { openMobileTestRuntime, type MobileTestRuntime } from './support/mobile-test-runtime';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const directories: string[] = [];
const runtimes: MobileTestRuntime[] = [];
const renderers: ReactTestRenderer[] = [];

const scratchDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-m2-stabilization-'));
  directories.push(directory);
  return join(directory, 'jianyuan.sqlite');
};

const keychain = (): SecureStoreBinding & { readonly entries: Map<string, string> } => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItemAsync: async (key) => entries.get(key) ?? null,
    setItemAsync: async (key, value) => {
      entries.set(key, value);
    },
    deleteItemAsync: async (key) => entries.delete(key),
    isAvailableAsync: async () => true,
  };
};

const completion = (value: unknown): Response =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const provider = (options?: { readonly fail?: boolean }) => {
  let requests = 0;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/v1/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'test-model' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    requests += 1;
    if (options?.fail === true) return new Response('{}', { status: 401 });
    const body = JSON.parse(String(init?.body)) as {
      readonly messages: readonly { readonly content: string }[];
    };
    const payload = JSON.parse(body.messages[1]?.content ?? '{}') as {
      readonly selectedRecords?: readonly { readonly recordId?: unknown }[];
    };
    const refs = (payload.selectedRecords ?? []).flatMap((record) =>
      typeof record.recordId === 'string' ? [record.recordId] : [],
    );
    return completion({
      status: 'SURFACE',
      language: 'zh-CN',
      suggestions: [
        {
          recordRefs: refs,
          comparisonAxis: {
            question: '这些记录在什么条件下出现了共同结构？',
            dimension: '开始前的停顿',
          },
          relationType: 'descriptive_similarity',
          observation: '这些记录都描述了开始前先停一下的共同结构。',
          assertsTemporalOrdering: false,
        },
      ],
    });
  }) as typeof fetch;
  return { fetcher, requests: () => requests };
};

const open = async (options: {
  readonly location?: string;
  readonly fetch?: typeof fetch;
  readonly secretStore?: SecureStoreBinding & { readonly entries: Map<string, string> };
} = {}): Promise<MobileTestRuntime> => {
  const runtime = await openMobileTestRuntime({
    location: options.location ?? scratchDatabasePath(),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.secretStore === undefined
      ? {}
      : { secretStore: new ExpoSecureStoreSecretStore(options.secretStore) }),
  });
  runtimes.push(runtime);
  return runtime;
};

const configure = async (
  runtime: MobileTestRuntime,
  store: SecureStoreBinding & { readonly entries: Map<string, string> },
): Promise<void> => {
  await runtime.runtime.configureAI({
    providerId: 'openai-compatible',
    baseUrl: 'https://provider.example/v1',
    model: 'test-model',
    apiKey: 'sk-stabilization',
  });
};

const renderShell = (runtime: MobileTestRuntime): ReactTestRenderer => {
  let created!: ReactTestRenderer;
  act(() => {
    created = create(
      <ThemeProvider systemScheme="light">
        <RuntimeProvider runtime={runtime.runtime}>
          <AppShell />
        </RuntimeProvider>
      </ThemeProvider>,
    );
  });
  renderers.push(created);
  return created;
};

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const press = async (tree: ReactTestRenderer, testID: string): Promise<void> => {
  const node = tree.root.findByProps({ testID });
  await act(async () => {
    await node.props.onPress?.();
    await Promise.resolve();
  });
  await flush();
};

afterEach(async () => {
  vi.useRealTimers();
  for (const renderer of renderers.splice(0)) act(() => renderer.unmount());
  for (const runtime of runtimes.splice(0)) {
    try {
      await runtime.close();
    } catch {
      // Already closed by a test.
    }
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Mobile M2 stabilization', () => {
  it('moves a pending bubble to history only when the bubble is opened', async () => {
    vi.useFakeTimers();
    const fetchDouble = provider();
    const store = keychain();
    const runtime = await open({ fetch: fetchDouble.fetcher, secretStore: store });
    await configure(runtime, store);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('第一条生命周期记录。');
    await runtime.runtime.capture('第二条生命周期记录。');
    await vi.advanceTimersByTimeAsync(8_000);
    await runtime.runtime.runScheduledAutomaticAwareness();

    const [item] = await runtime.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected pending item');
    expect(await runtime.runtime.unreadAwarenessCount()).toBe(1);

    const tree = renderShell(runtime);
    await flush();
    await press(tree, 'tab-awareness');
    expect(tree.root.findAllByProps({ testID: `awareness-bubble-${item.candidateId}` }).length).toBeGreaterThan(0);

    await press(tree, `awareness-bubble-${item.candidateId}`);
    expect(await runtime.runtime.unreadAwarenessCount()).toBe(0);
    expect(tree.root.findAllByProps({ testID: `awareness-bubble-${item.candidateId}` })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: `awareness-history-${item.candidateId}` }).length).toBeGreaterThan(0);
  });

  it('keeps viewed state across restart', async () => {
    vi.useFakeTimers();
    const fetchDouble = provider();
    const store = keychain();
    const databasePath = scratchDatabasePath();
    const first = await open({ location: databasePath, fetch: fetchDouble.fetcher, secretStore: store });
    await configure(first, store);
    await first.runtime.setAutomaticAwarenessEnabled(true);
    await first.runtime.capture('重启前第一条。');
    await first.runtime.capture('重启前第二条。');
    await vi.advanceTimersByTimeAsync(8_000);
    await first.runtime.runScheduledAutomaticAwareness();
    const [item] = await first.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected pending item');
    await first.runtime.markAwarenessViewed(item.candidateId);
    await first.close();

    const second = await open({ location: databasePath, fetch: fetchDouble.fetcher, secretStore: store });
    await second.runtime.hydrateAwarenessAutomation();
    const [restored] = await second.runtime.awarenessHistory();
    expect(restored?.status).toBe('viewed');
    expect(await second.runtime.unreadAwarenessCount()).toBe(0);
  });

  it('marks NO_OBSERVATION anchors covered and does not call again without a new anchor', async () => {
    vi.useFakeTimers();
    let requests = 0;
    const fetcher = (async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'test-model' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      requests += 1;
      return completion({ status: 'NO_OBSERVATION', language: 'zh-CN', suggestions: [] });
    }) as typeof fetch;
    const store = keychain();
    const runtime = await open({ fetch: fetcher, secretStore: store });
    await configure(runtime, store);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('NO_OBSERVATION A。');
    await runtime.runtime.capture('NO_OBSERVATION B。');
    await vi.advanceTimersByTimeAsync(8_000);
    await runtime.runtime.runScheduledAutomaticAwareness();
    expect(requests).toBe(1);
    const state = await runtime.runtime.automaticAwarenessState();
    expect(state.coveredRecordIds).toHaveLength(2);
    await runtime.runtime.runScheduledAutomaticAwareness();
    expect(requests).toBe(1);
  });

  it('does not mark anchors covered when the Provider fails', async () => {
    vi.useFakeTimers();
    const fetchDouble = provider({ fail: true });
    const store = keychain();
    const runtime = await open({ fetch: fetchDouble.fetcher, secretStore: store });
    await configure(runtime, store);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('失败 A。');
    await runtime.runtime.capture('失败 B。');
    await vi.advanceTimersByTimeAsync(8_000);
    await runtime.runtime.runScheduledAutomaticAwareness();
    const state = await runtime.runtime.automaticAwarenessState();
    expect(state.coveredRecordIds).toHaveLength(0);
    expect(state.jobs.some((job) => job.status === 'failed')).toBe(true);
  });

  it('uses old Records as context but requires a new anchor', async () => {
    vi.useFakeTimers();
    const fetchDouble = provider();
    const store = keychain();
    const runtime = await open({ fetch: fetchDouble.fetcher, secretStore: store });
    await configure(runtime, store);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('旧记录 A。');
    await runtime.runtime.capture('旧记录 B。');
    await vi.advanceTimersByTimeAsync(8_000);
    await runtime.runtime.runScheduledAutomaticAwareness();
    const firstRequests = fetchDouble.requests();
    await runtime.runtime.runScheduledAutomaticAwareness();
    expect(fetchDouble.requests()).toBe(firstRequests);

    await runtime.runtime.capture('新记录 C。');
    await vi.advanceTimersByTimeAsync(8_000);
    await runtime.runtime.runScheduledAutomaticAwareness();
    expect(fetchDouble.requests()).toBe(firstRequests + 1);
  });

  it('excludes Reflection Records from Record Space while keeping Understanding searchable', async () => {
    const fetchDouble = provider();
    const store = keychain();
    const runtime = await open({ fetch: fetchDouble.fetcher, secretStore: store });
    await configure(runtime, store);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('普通记录里的苹果。');
    await runtime.runtime.capture('第二条普通记录。');
    await runtime.runtime.runScheduledAutomaticAwareness();
    const [item] = await runtime.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected item');
    await runtime.runtime.submitObservationReflection({
      candidateId: item.candidateId,
      meaning: 'connected',
      reflectionText: '我的理解里也有苹果。',
    });

    const captureRecords = await runtime.runtime.listRecent();
    expect(captureRecords.some((record) => record.verbatim?.includes('我的理解里也有苹果'))).toBe(false);
    expect((await runtime.runtime.search('我的理解里也有苹果')).some((record) => record.verbatim?.includes('我的理解里也有苹果'))).toBe(false);
    const understanding = await runtime.runtime.listUnderstandingReflections();
    expect(understanding.some((item) => item.verbatim.includes('我的理解里也有苹果'))).toBe(true);
  });

  it('provides local search without touching the Provider', async () => {
    const fetchDouble = provider();
    const store = keychain();
    const runtime = await open({ fetch: fetchDouble.fetcher, secretStore: store });
    await configure(runtime, store);
    await runtime.runtime.capture('搜索得到的普通记录。');
    const before = fetchDouble.requests();
    const results = await runtime.runtime.search('搜索得到');
    expect(results).toHaveLength(1);
    expect(fetchDouble.requests()).toBe(before);
  });

  it('ends saving state with success feedback when the Core accepts the relation', async () => {
    const fetchDouble = provider();
    const store = keychain();
    const runtime = await open({ fetch: fetchDouble.fetcher, secretStore: store });
    await configure(runtime, store);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('保存状态 A。');
    await runtime.runtime.capture('保存状态 B。');
    await runtime.runtime.runScheduledAutomaticAwareness();
    const [item] = await runtime.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected item');

    const tree = renderShell(runtime);
    await flush();
    await press(tree, 'tab-awareness');
    await press(tree, `awareness-bubble-${item.candidateId}`);
    await press(tree, `awareness-choice-${item.candidateId}-connected`);
    const input = tree.root.findByProps({ testID: `awareness-reflection-${item.candidateId}` });
    await act(async () => {
      input.props.onChangeText('这条理解应该结束保存状态。');
      await Promise.resolve();
    });
    vi.spyOn(runtime.runtime, 'submitObservationReflection').mockResolvedValueOnce({
      status: 'discovery',
      message: '你的理解已保存。Core 已完成这次关系评估。',
      targetRef: 'relation:accepted',
      discoveryId: 'discovery:accepted',
    });
    await press(tree, `awareness-submit-${item.candidateId}`);

    const result = tree.root.findByProps({ testID: `awareness-result-${item.candidateId}` });
    expect(String(result.props.children)).toMatch(/已保存|理解/);
    const submit = tree.root.findByProps({ testID: `awareness-submit-${item.candidateId}` });
    expect(String(submit.findByType(Text).props.children)).not.toContain('正在保存');
    expect(String(submit.findByType(Text).props.children)).toContain('已保存到「理解」');
  });

  it('ends saving state with success feedback when only the Reflection is saved', async () => {
    const fetchDouble = provider();
    const store = keychain();
    const runtime = await open({ fetch: fetchDouble.fetcher, secretStore: store });
    await configure(runtime, store);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('仅保存理解 A。');
    await runtime.runtime.capture('仅保存理解 B。');
    await runtime.runtime.runScheduledAutomaticAwareness();
    const [item] = await runtime.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected item');

    const tree = renderShell(runtime);
    await flush();
    await press(tree, 'tab-awareness');
    await press(tree, `awareness-bubble-${item.candidateId}`);
    await press(tree, `awareness-choice-${item.candidateId}-connected`);
    const input = tree.root.findByProps({ testID: `awareness-reflection-${item.candidateId}` });
    await act(async () => {
      input.props.onChangeText('这条理解先保存，不形成长期关系。');
      await Promise.resolve();
    });
    vi.spyOn(runtime.runtime, 'submitObservationReflection').mockResolvedValueOnce({
      status: 'reflection_saved',
      message: '你的理解已保存。目前没有形成长期联系。',
      targetRef: 'record:reflection-only',
      reflectionRecordId: 'reflection-only',
    });
    await press(tree, `awareness-submit-${item.candidateId}`);

    const result = tree.root.findByProps({ testID: `awareness-result-${item.candidateId}` });
    expect(String(result.props.children)).toMatch(/已保存|理解/);
    const submit = tree.root.findByProps({ testID: `awareness-submit-${item.candidateId}` });
    expect(String(submit.findByType(Text).props.children)).toContain('已保存到「理解」');
  });

  it('ends saving state and shows an error when the save fails', async () => {
    const fetchDouble = provider();
    const store = keychain();
    const runtime = await open({ fetch: fetchDouble.fetcher, secretStore: store });
    await configure(runtime, store);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('保存失败 A。');
    await runtime.runtime.capture('保存失败 B。');
    await runtime.runtime.runScheduledAutomaticAwareness();
    const [item] = await runtime.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected item');

    const tree = renderShell(runtime);
    await flush();
    await press(tree, 'tab-awareness');
    await press(tree, `awareness-bubble-${item.candidateId}`);
    await press(tree, `awareness-choice-${item.candidateId}-connected`);
    const input = tree.root.findByProps({ testID: `awareness-reflection-${item.candidateId}` });
    await act(async () => {
      input.props.onChangeText('这条保存会失败。');
      await Promise.resolve();
    });
    vi.spyOn(runtime.runtime, 'submitObservationReflection').mockRejectedValueOnce(
      new Error('保存服务暂时不可用。'),
    );
    await press(tree, `awareness-submit-${item.candidateId}`);

    const result = tree.root.findByProps({ testID: `awareness-result-${item.candidateId}` });
    expect(String(result.props.children)).toContain('保存服务暂时不可用');
    const submit = tree.root.findByProps({ testID: `awareness-submit-${item.candidateId}` });
    expect(String(submit.findByType(Text).props.children)).not.toContain('正在保存');
    expect(String(submit.findByType(Text).props.children)).toContain('确认我的回应');
  });
});

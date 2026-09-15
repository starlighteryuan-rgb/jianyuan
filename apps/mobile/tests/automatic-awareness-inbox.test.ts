/**
 * Phase M2.4 regression: Automatic Awareness Inbox.
 *
 * The runtime, SQLite adapter, Core services, Provider contract, and quiet
 * window scheduler are production code. Only the transport and the process
 * timers are substituted.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AI_API_KEY_SECRET_NAME, ExpoSecureStoreSecretStore } from '../src/runtime/secret-store';
import type { SecureStoreBinding } from '../src/runtime/secret-store';
import {
  writeAwarenessAutomationState,
  type AwarenessAutomationStorage,
} from '../src/runtime/awareness-automation-store';
import type { AwarenessHistoryStorage } from '../src/runtime/awareness-history-store';
import {
  openMobileTestRuntime,
  type MobileTestRuntime,
} from './support/mobile-test-runtime';

const temporaryDirectories: string[] = [];
const openRuntimes: MobileTestRuntime[] = [];
let currentRuntime: MobileTestRuntime | null = null;

const scratchDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-m2-4-'));
  temporaryDirectories.push(directory);
  return join(directory, 'jianyuan.sqlite');
};

const workingKeychain = (): SecureStoreBinding & {
  readonly entries: Map<string, string>;
} => {
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

const createMemoryKeyValueStorage = (): AwarenessHistoryStorage & AwarenessAutomationStorage => {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
  };
};

interface FakeProvider {
  readonly fetcher: typeof fetch;
  readonly chatRequests: () => number;
}

const completion = (value: unknown): Response =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const fakeProvider = (options?: {
  readonly status?: 'SURFACE' | 'NO_OBSERVATION';
  readonly malformed?: boolean;
  readonly failWith?: number;
  readonly delayMs?: number;
}): FakeProvider => {
  let chatRequests = 0;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/v1/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'test-model' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (!url.endsWith('/v1/chat/completions')) {
      return new Response('{}', { status: 404 });
    }

    chatRequests += 1;
    if (options?.delayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    if (options?.failWith !== undefined) {
      return new Response('{}', { status: options.failWith });
    }

    const body = JSON.parse(String(init?.body)) as {
      readonly messages: readonly { readonly content: string }[];
    };
    const userPayload = JSON.parse(body.messages[1]?.content ?? '{}') as {
      readonly selectedRecords?: readonly { readonly recordId?: unknown }[];
    };
    const recordRefs = (userPayload.selectedRecords ?? []).flatMap((record) =>
      typeof record.recordId === 'string' ? [record.recordId] : [],
    );
    if (options?.malformed) {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'not-json' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (options?.status === 'NO_OBSERVATION') {
      return completion({
        status: 'NO_OBSERVATION',
        language: 'zh-CN',
        suggestions: [],
      });
    }
    return completion({
      status: 'SURFACE',
      language: 'zh-CN',
      suggestions: [
        {
          recordRefs,
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
  return { fetcher, chatRequests: () => chatRequests };
};

const openRuntime = async (options: {
  readonly location?: string;
  readonly fetch?: typeof fetch;
  readonly secretStore?: SecureStoreBinding & { readonly entries: Map<string, string> };
  readonly awarenessHistoryStorage?: AwarenessHistoryStorage;
  readonly awarenessAutomationStorage?: AwarenessAutomationStorage;
} = {}): Promise<MobileTestRuntime> => {
  const runtime = await openMobileTestRuntime({
    location: options.location ?? scratchDatabasePath(),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.secretStore === undefined
      ? {}
      : { secretStore: new ExpoSecureStoreSecretStore(options.secretStore) }),
    ...(options.awarenessHistoryStorage === undefined
      ? {}
      : { awarenessHistoryStorage: options.awarenessHistoryStorage }),
    ...(options.awarenessAutomationStorage === undefined
      ? {}
      : { awarenessAutomationStorage: options.awarenessAutomationStorage }),
  });

  // A restart in this suite must keep the same Keychain binding; production
  // SecureStore is process-persistent, while the test binding is injected.

  openRuntimes.push(runtime);
  currentRuntime = runtime;
  return runtime;
};

const configureAI = async (
  runtime: MobileTestRuntime,
  keychain: SecureStoreBinding & { readonly entries: Map<string, string> },
): Promise<void> => {
  keychain.entries.set(AI_API_KEY_SECRET_NAME, 'sk-m2-4-test');
  await runtime.runtime.configureAI({
    providerId: 'openai-compatible',
    baseUrl: 'https://provider.example/v1',
    model: 'test-model',
    apiKey: 'sk-m2-4-test',
  });
};

const flushTimers = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(8_000);
  await currentRuntime?.runtime.runScheduledAutomaticAwareness();
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(async () => {
  vi.useRealTimers();
  for (const runtime of openRuntimes.splice(0)) {
    try {
      await runtime.close();
    } catch {
      // Already closed by a test body.
    }
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Mobile Automatic Awareness Inbox (M2.4)', () => {
  it('does not call the Provider when the policy is OFF', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    const keychain = workingKeychain();
    const runtime = await openRuntime({ fetch: provider.fetcher, secretStore: keychain });
    await configureAI(runtime, keychain);

    await runtime.runtime.capture('默认关闭自动觉察时保存的记录。');
    await flushTimers();

    expect(provider.chatRequests()).toBe(0);
    expect(await runtime.runtime.awarenessHistory()).toEqual([]);
  });

  it('batches five rapid saves into one quiet-window check', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    const keychain = workingKeychain();
    const runtime = await openRuntime({ fetch: provider.fetcher, secretStore: keychain });
    await configureAI(runtime, keychain);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);

    for (let index = 0; index < 5; index += 1) {
      const saved = await runtime.runtime.capture(`连续记录 ${index + 1}：开始前先停一下。`);
      expect(saved.ok).toBe(true);
      await vi.advanceTimersByTimeAsync(500);
    }

    expect(await runtime.runtime.listRecent()).toHaveLength(5);
    expect(provider.chatRequests()).toBe(0);

    await flushTimers();
    expect(provider.chatRequests()).toBe(1);

    const state = await runtime.runtime.automaticAwarenessState();
    expect(state.pendingRecordIds).toEqual([]);
    expect(state.coveredRecordIds).toHaveLength(5);
    expect(state.jobs.filter((job) => job.status === 'completed')).toHaveLength(1);
    expect(await runtime.runtime.awarenessHistory()).toHaveLength(1);
    expect(await runtime.runtime.unreadAwarenessCount()).toBe(1);
  });

  it('runs one automatic check for a single save', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider({ status: 'NO_OBSERVATION' });
    const keychain = workingKeychain();
    const runtime = await openRuntime({ fetch: provider.fetcher, secretStore: keychain });
    await configureAI(runtime, keychain);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);

    await runtime.runtime.capture('单独保存的一条记录。');
    await flushTimers();

    // The Provider contract requires at least two records. A one-record batch
    // therefore settles locally as a successful no-observation check without a
    // network request, and without fabricating a Bubble.
    expect(provider.chatRequests()).toBe(0);
    expect(await runtime.runtime.awarenessHistory()).toEqual([]);
    expect(await runtime.runtime.unreadAwarenessCount()).toBe(0);
    const state = await runtime.runtime.automaticAwarenessState();
    expect(state.pendingRecordIds).toEqual([]);
    expect(state.coveredRecordIds).toHaveLength(1);
    expect(state.jobs.some((job) => job.status === 'no_observation')).toBe(true);
  });

  it('keeps Manual Awareness immediate and independent from the quiet window', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    const keychain = workingKeychain();
    const runtime = await openRuntime({ fetch: provider.fetcher, secretStore: keychain });
    await configureAI(runtime, keychain);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);

    await runtime.runtime.capture('第一条手动觉察上下文。');
    await runtime.runtime.capture('第二条手动觉察上下文。');
    const records = await runtime.runtime.listRecent();
    const beforeManual = provider.chatRequests();

    const experience = await runtime.runtime.suggestRelations(records[0]!.id);
    expect(experience.status).toBe('candidates');
    expect(provider.chatRequests()).toBe(beforeManual + 1);
  });

  it('does not create a fake Bubble when the Provider fails', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider({ failWith: 401 });
    const keychain = workingKeychain();
    const runtime = await openRuntime({ fetch: provider.fetcher, secretStore: keychain });
    await configureAI(runtime, keychain);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);

    const saved = await runtime.runtime.capture('Provider 失败也不能丢失的记录。');
    expect(saved.ok).toBe(true);
    await runtime.runtime.capture('Provider 失败路径需要第二条上下文。');
    await flushTimers();

    expect(await runtime.runtime.listRecent()).toHaveLength(2);
    expect(await runtime.runtime.awarenessHistory()).toEqual([]);
    const state = await runtime.runtime.automaticAwarenessState();
    expect(state.jobs.some((job) => job.status === 'failed')).toBe(true);
  });

  it('does not create a fake Bubble for a malformed response', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider({ malformed: true });
    const keychain = workingKeychain();
    const runtime = await openRuntime({ fetch: provider.fetcher, secretStore: keychain });
    await configureAI(runtime, keychain);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);

    await runtime.runtime.capture('畸形响应不会形成观察。');
    await flushTimers();

    expect(await runtime.runtime.awarenessHistory()).toEqual([]);
    expect(await runtime.runtime.listDiscoveries()).toEqual([]);
  });

  it('persists a pending batch when the app dies before the quiet window fires', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    const keychain = workingKeychain();
    const databasePath = scratchDatabasePath();
    const first = await openRuntime({
      location: databasePath,
      fetch: provider.fetcher,
      secretStore: keychain,
    });
    await configureAI(first, keychain);
    await first.runtime.setAutomaticAwarenessEnabled(true);
    await first.runtime.capture('被杀前第一条。');
    await first.runtime.capture('被杀前第二条。');
    expect((await first.runtime.automaticAwarenessState()).pendingRecordIds).toHaveLength(2);
    await first.close();

    const second = await openRuntime({
      location: databasePath,
      fetch: provider.fetcher,
      secretStore: keychain,
    });
    await second.runtime.hydrateAwarenessAutomation();
    await configureAI(second, keychain);
    expect((await second.runtime.automaticAwarenessState()).pendingRecordIds).toHaveLength(2);
    await second.runtime.runScheduledAutomaticAwareness();
    await flushTimers();
    expect(provider.chatRequests()).toBe(1);
    expect(await second.runtime.unreadAwarenessCount()).toBe(1);
  });

  it('uses one automatic job for the pending batch even when drained twice', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    const keychain = workingKeychain();
    const runtime = await openRuntime({ fetch: provider.fetcher, secretStore: keychain });
    await configureAI(runtime, keychain);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('同一批次第一条。');
    await runtime.runtime.capture('同一批次第二条。');
    await flushTimers();
    await runtime.runtime.runScheduledAutomaticAwareness();
    expect(provider.chatRequests()).toBe(1);
    expect(await runtime.runtime.awarenessHistory()).toHaveLength(1);
    const jobs = (await runtime.runtime.automaticAwarenessState()).jobs;
    expect(jobs.filter((job) => job.status === 'completed')).toHaveLength(1);
  });

  it('drains a new batch saved while an earlier automatic check is still running', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider({ delayMs: 2_000 });
    const keychain = workingKeychain();
    const runtime = await openRuntime({ fetch: provider.fetcher, secretStore: keychain });
    await configureAI(runtime, keychain);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('第一批记录 A。');
    await runtime.runtime.capture('第一批记录 B。');

    const firstDrain = runtime.runtime.runScheduledAutomaticAwareness();
    await vi.advanceTimersByTimeAsync(500);
    expect(provider.chatRequests()).toBe(1);

    await runtime.runtime.capture('检查进行中新增的记录 C。');
    await runtime.runtime.capture('检查进行中新增的记录 D。');
    const secondDrain = runtime.runtime.runScheduledAutomaticAwareness();
    await vi.advanceTimersByTimeAsync(2_000);
    await firstDrain;
    await vi.advanceTimersByTimeAsync(2_000);
    await secondDrain;

    expect(provider.chatRequests()).toBe(2);
    const state = await runtime.runtime.automaticAwarenessState();
    expect(state.pendingRecordIds).toEqual([]);
    expect(state.coveredRecordIds).toHaveLength(4);
  });

  it('does not duplicate a Bubble when an already-written automatic job is recovered', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    const keychain = workingKeychain();
    const databasePath = scratchDatabasePath();
    const automationStorage = createMemoryKeyValueStorage();
    const historyStorage = createMemoryKeyValueStorage();
    const first = await openRuntime({
      location: databasePath,
      fetch: provider.fetcher,
      secretStore: keychain,
      awarenessHistoryStorage: historyStorage,
      awarenessAutomationStorage: automationStorage,
    });
    await configureAI(first, keychain);
    await first.runtime.setAutomaticAwarenessEnabled(true);
    await first.runtime.capture('恢复幂等记录 A。');
    await first.runtime.capture('恢复幂等记录 B。');
    await flushTimers();

    const completed = await first.runtime.automaticAwarenessState();
    const recordIds = completed.jobs[0]!.recordIds;
    expect(await first.runtime.awarenessHistory()).toHaveLength(1);
    await writeAwarenessAutomationState(automationStorage, {
      pendingRecordIds: recordIds,
      coveredRecordIds: [],
      jobs: completed.jobs.map((job) => ({ ...job, status: 'running' })),
    });
    await first.close();

    const second = await openRuntime({
      location: databasePath,
      fetch: provider.fetcher,
      secretStore: keychain,
      awarenessHistoryStorage: historyStorage,
      awarenessAutomationStorage: automationStorage,
    });
    await second.runtime.hydrateAwarenessAutomation();
    const recovered = await second.runtime.automaticAwarenessState();
    expect(recovered.jobs).toHaveLength(1);
    expect(recovered.jobs[0]!.status).toBe('queued');
    await second.runtime.runScheduledAutomaticAwareness();

    expect(provider.chatRequests()).toBe(1);
    expect(await second.runtime.awarenessHistory()).toHaveLength(1);
    expect((await second.runtime.automaticAwarenessState()).jobs[0]!.status).toBe('completed');
  });
  it('persists pending and viewed state across restart', async () => {

    vi.useFakeTimers();
    const provider = fakeProvider();
    const keychain = workingKeychain();
    const databasePath = scratchDatabasePath();
    const first = await openRuntime({
      location: databasePath,
      fetch: provider.fetcher,
      secretStore: keychain,
    });
    await configureAI(first, keychain);
    await first.runtime.setAutomaticAwarenessEnabled(true);

    await first.runtime.capture('会在重启后保留的第一条记录。');
    await first.runtime.capture('会在重启后保留的第二条记录。');
    await flushTimers();
    const pending = await first.runtime.awarenessHistory();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.status).toBe('pending');
    expect(await first.runtime.unreadAwarenessCount()).toBe(1);
    await first.close();

    const second = await openRuntime({ location: databasePath, fetch: provider.fetcher });
    await second.runtime.hydrateAwarenessAutomation();
    const restoredPending = await second.runtime.awarenessHistory();
    expect(restoredPending[0]!.status).toBe('pending');
    expect(await second.runtime.unreadAwarenessCount()).toBe(1);

    const candidateId = restoredPending[0]!.candidateId;
    await second.runtime.markAwarenessViewed(candidateId);
    expect(await second.runtime.unreadAwarenessCount()).toBe(0);
    await second.close();

    const third = await openRuntime({ location: databasePath, fetch: provider.fetcher });
    await third.runtime.hydrateAwarenessAutomation();
    const restoredViewed = await third.runtime.awarenessHistory();
    expect(restoredViewed[0]!.status).toBe('viewed');
    expect(await third.runtime.unreadAwarenessCount()).toBe(0);
  });

  it('does not duplicate a Bubble when the same automatic job is processed again', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    const keychain = workingKeychain();
    const databasePath = scratchDatabasePath();
    const first = await openRuntime({
      location: databasePath,
      fetch: provider.fetcher,
      secretStore: keychain,
    });
    await configureAI(first, keychain);
    await first.runtime.setAutomaticAwarenessEnabled(true);

    await first.runtime.capture('幂等测试记录 A。');
    await first.runtime.capture('幂等测试记录 B。');
    await flushTimers();
    const before = await first.runtime.awarenessHistory();
    expect(before).toHaveLength(1);
    await first.close();

    const second = await openRuntime({ location: databasePath, fetch: provider.fetcher });
    await second.runtime.hydrateAwarenessAutomation();
    const after = await second.runtime.awarenessHistory();
    expect(after).toHaveLength(1);
    expect(after[0]!.candidateId).toBe(before[0]!.candidateId);
  });

  it('does not create Relation or Evidence for a quick response', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    const keychain = workingKeychain();
    const runtime = await openRuntime({ fetch: provider.fetcher, secretStore: keychain });
    await configureAI(runtime, keychain);
    await runtime.runtime.setAutomaticAwarenessEnabled(true);

    await runtime.runtime.capture('快捷回应边界记录 A。');
    await runtime.runtime.capture('快捷回应边界记录 B。');
    await flushTimers();
    const [item] = await runtime.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected inbox item');

    const quick = await runtime.runtime.submitObservationReflection({
      candidateId: item.candidateId,
      meaning: 'connected',
    });
    expect(quick.status).toBe('reflection_required');
    expect(await runtime.runtime.listDiscoveries()).toEqual([]);
  });

  it('keeps local Records working when no API key is configured', async () => {
    vi.useFakeTimers();
    const runtime = await openRuntime();
    await runtime.runtime.setAutomaticAwarenessEnabled(true);

    const saved = await runtime.runtime.capture('没有 API Key 也能保存。');
    expect(saved.ok).toBe(true);
    await flushTimers();

    expect(await runtime.runtime.listRecent()).toHaveLength(1);
    expect(await runtime.runtime.awarenessHistory()).toEqual([]);
  });
});

/**
 * M3.0 motion foundation guards.
 *
 * Motion may change how a change feels; it must not change what is mounted,
 * what persists, or whether a save finishes. These tests render the production
 * shell with the real Mobile runtime and SQLite. Only RN primitives, Reanimated,
 * and the network provider are test doubles.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExpoSecureStoreSecretStore } from '../src/runtime/secret-store';
import type { SecureStoreBinding } from '../src/runtime/secret-store';
import { AppShell } from '../src/shell/app-shell';
import { RuntimeProvider } from '../src/shell/runtime-context';
import { ThemeProvider } from '../src/theme/theme-context';
import type { MobileRuntime } from '../src/runtime/mobile-runtime';
import { openMobileTestRuntime, type MobileTestRuntime } from './support/mobile-test-runtime';
import { __setReducedMotion } from './support/reanimated-double';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let directory = '';
let testRuntime: MobileTestRuntime | null = null;
let renderer: ReactTestRenderer | null = null;

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

const surfaceProvider = (): typeof fetch => {
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/v1/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'test-model' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const body = JSON.parse(String(init?.body)) as {
      readonly messages: readonly { readonly content: string }[];
    };
    const payload = JSON.parse(body.messages[1]?.content ?? '{}') as {
      readonly selectedRecords?: readonly { readonly recordId?: unknown }[];
    };
    const refs = (payload.selectedRecords ?? []).flatMap((record) =>
      typeof record.recordId === 'string' ? [record.recordId] : [],
    );
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
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
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  return fetcher as typeof fetch;
};

const open = async (): Promise<MobileTestRuntime> => {
  const runtime = await openMobileTestRuntime({
    location: join(directory, 'jianyuan.sqlite'),
    fetch: surfaceProvider(),
    secretStore: new ExpoSecureStoreSecretStore(keychain()),
  });
  testRuntime = runtime;
  return runtime;
};

const renderShell = (runtime: MobileRuntime): ReactTestRenderer => {
  let created!: ReactTestRenderer;
  act(() => {
    created = create(
      <ThemeProvider systemScheme="light">
        <RuntimeProvider runtime={runtime}>
          <AppShell />
        </RuntimeProvider>
      </ThemeProvider>,
    );
  });
  renderer = created;
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

const testIds = (tree: ReactTestRenderer): readonly string[] =>
  tree.root
    .findAll((node) => typeof node.type === 'string' && node.props.testID !== undefined)
    .map((node) => String(node.props.testID));

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-m3-motion-'));
  __setReducedMotion(false);
});

afterEach(async () => {
  vi.restoreAllMocks();
  __setReducedMotion(false);
  if (renderer !== null) {
    const currentRenderer = renderer;
    act(() => {
      currentRenderer.unmount();
    });
    renderer = null;
  }
  if (testRuntime !== null) {
    await testRuntime.close();
    testRuntime = null;
  }
  rmSync(directory, { recursive: true, force: true });
});

describe('Mobile M3.0 motion foundation', () => {
  it('keeps navigation synchronous and structurally isolated during tab transitions', async () => {
    const runtime = await open();
    const tree = renderShell(runtime.runtime);
    await flush();

    await press(tree, 'tab-awareness');
    expect(testIds(tree)).toContain('active-space-awareness');
    expect(testIds(tree)).toContain('space-awareness');
    expect(testIds(tree)).not.toContain('space-records');

    await press(tree, 'tab-records');
    expect(testIds(tree)).toContain('active-space-records');
    expect(testIds(tree)).toContain('space-records');
    expect(testIds(tree)).not.toContain('space-awareness');

    await press(tree, 'settings-entry');
    expect(testIds(tree)).toContain('active-space-settings');
    await press(tree, 'settings-entry');
    expect(testIds(tree)).toContain('active-space-records');
  });

  it('morphs search without mounting input while collapsed and keeps Provider idle', async () => {
    const runtime = await open();
    const tree = renderShell(runtime.runtime);
    await flush();

    expect(tree.root.findAllByProps({ testID: 'local-search-input' })).toHaveLength(0);
    await press(tree, 'local-search-open');

    const input = tree.root.findByProps({ testID: 'local-search-input' });
    expect(input.props.autoFocus).toBe(true);
    await act(async () => {
      input.props.onChangeText('暂停');
      await Promise.resolve();
    });

    await press(tree, 'local-search-cancel');
    expect(tree.root.findAllByProps({ testID: 'local-search-input' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'local-search-open' }).length).toBeGreaterThan(0);
  });

  it('keeps awareness bubble, detail close, and reflection save state functional', async () => {
    const runtime = await open();
    await runtime.runtime.configureAI({
      providerId: 'openai-compatible',
      baseUrl: 'https://provider.example/v1',
      model: 'test-model',
      apiKey: 'sk-m3-motion',
    });
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('开始前停了一小段。');
    await runtime.runtime.capture('发言前也停了一小段。');
    await runtime.runtime.runScheduledAutomaticAwareness();
    const [item] = await runtime.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected an awareness item');

    const tree = renderShell(runtime.runtime);
    await flush();
    await press(tree, 'tab-awareness');
    expect(
      tree.root.findAllByProps({ testID: `awareness-bubble-${item.candidateId}` }).length,
    ).toBeGreaterThan(0);

    await press(tree, `awareness-bubble-${item.candidateId}`);
    expect(await runtime.runtime.unreadAwarenessCount()).toBe(0);
    await press(tree, `awareness-choice-${item.candidateId}-connected`);
    const reflection = tree.root.findByProps({
      testID: `awareness-reflection-${item.candidateId}`,
    });
    await act(async () => {
      reflection.props.onChangeText('这两件事都有准备后的进入感。');
      await Promise.resolve();
    });
    await press(tree, `awareness-submit-${item.candidateId}`);

    const submit = tree.root.findByProps({ testID: `awareness-submit-${item.candidateId}` });
    expect(String(submit.findByType(Text).props.children)).not.toContain('正在保存');
    expect(String(submit.findByType(Text).props.children)).toContain('已保存到「理解」');

    await press(tree, `awareness-close-${item.candidateId}`);
    expect(tree.root.findAllByProps({ testID: `awareness-detail-${item.candidateId}` })).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: `awareness-history-${item.candidateId}` }).length,
    ).toBeGreaterThan(0);
  });

  it('ends a failed reflection save in the error state', async () => {
    const runtime = await open();
    await runtime.runtime.configureAI({
      providerId: 'openai-compatible',
      baseUrl: 'https://provider.example/v1',
      model: 'test-model',
      apiKey: 'sk-m3-motion-failure',
    });
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('失败前第一条。');
    await runtime.runtime.capture('失败前第二条。');
    await runtime.runtime.runScheduledAutomaticAwareness();
    const [item] = await runtime.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected an awareness item');

    const tree = renderShell(runtime.runtime);
    await flush();
    await press(tree, 'tab-awareness');
    await press(tree, `awareness-bubble-${item.candidateId}`);
    await press(tree, `awareness-choice-${item.candidateId}-connected`);
    const reflection = tree.root.findByProps({
      testID: `awareness-reflection-${item.candidateId}`,
    });
    await act(async () => {
      reflection.props.onChangeText('这条保存会失败。');
      await Promise.resolve();
    });
    vi.spyOn(runtime.runtime, 'submitObservationReflection').mockRejectedValueOnce(
      new Error('保存服务暂时不可用。'),
    );
    await press(tree, `awareness-submit-${item.candidateId}`);

    const submit = tree.root.findByProps({ testID: `awareness-submit-${item.candidateId}` });
    expect(String(submit.findByType(Text).props.children)).not.toContain('正在保存');
    expect(String(submit.findByType(Text).props.children)).toContain('确认我的回应');
    expect(
      String(tree.root.findByProps({ testID: `awareness-result-${item.candidateId}` }).props.children),
    ).toContain('保存服务暂时不可用');
  });

  it('preserves navigation and search behavior under Reduce Motion', async () => {
    __setReducedMotion(true);
    const runtime = await open();
    const tree = renderShell(runtime.runtime);
    await flush();

    await press(tree, 'tab-awareness');
    expect(testIds(tree)).toContain('active-space-awareness');
    await press(tree, 'local-search-open');
    expect(tree.root.findByProps({ testID: 'local-search-input' }).props.autoFocus).toBe(true);
    await press(tree, 'local-search-cancel');
    expect(tree.root.findAllByProps({ testID: 'local-search-input' })).toHaveLength(0);
    await press(tree, 'tab-records');
    expect(testIds(tree)).toContain('active-space-records');
  });
});

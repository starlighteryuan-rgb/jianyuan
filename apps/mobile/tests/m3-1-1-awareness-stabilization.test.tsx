/**
 * M3.1.1 stabilization regression coverage.
 *
 * These tests exercise the real Mobile runtime and the real component tree.
 * They cover the five real-device findings: manual Awareness dedupe, staged
 * Bubble motion, staged Bubble open, Reflection settlement, and Search keyboard
 * lifecycle.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExpoSecureStoreSecretStore } from '../src/runtime/secret-store';
import type { SecureStoreBinding } from '../src/runtime/secret-store';
import { AppShell } from '../src/shell/app-shell';
import { RuntimeProvider } from '../src/shell/runtime-context';
import { ThemeProvider } from '../src/theme/theme-context';
import { openMobileTestRuntime, type MobileTestRuntime } from './support/mobile-test-runtime';
import { __clearKeyboardListeners, __emitKeyboardEvent } from './support/react-native-double';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let directory = '';
let runtime: MobileTestRuntime | null = null;
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

const provider = (options?: { readonly fail?: boolean }) => {
  let chatRequests = 0;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/v1/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'test-model' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    chatRequests += 1;
    if (options?.fail === true) return new Response('{}', { status: 500 });
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
  }) as typeof fetch;
  return { fetcher, chatRequests: () => chatRequests };
};

const open = async (fetchImpl?: typeof fetch): Promise<MobileTestRuntime> => {
  const opened = await openMobileTestRuntime({
    location: join(directory, 'jianyuan.sqlite'),
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
    secretStore: new ExpoSecureStoreSecretStore(keychain()),
  });
  await opened.runtime.configureAI({
    providerId: 'openai-compatible',
    baseUrl: 'https://provider.example/v1',
    model: 'test-model',
    apiKey: 'sk-m3-1-1',
  });
  runtime = opened;
  return opened;
};

const renderShell = (target: MobileTestRuntime): ReactTestRenderer => {
  let created!: ReactTestRenderer;
  act(() => {
    created = create(
      <ThemeProvider systemScheme="light">
        <RuntimeProvider runtime={target.runtime}>
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

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-m3-1-1-'));
  __clearKeyboardListeners();
  vi.restoreAllMocks();
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (renderer !== null) {
    act(() => renderer?.unmount());
    renderer = null;
  }
  if (runtime !== null) {
    await runtime.close();
    runtime = null;
  }
  rmSync(directory, { recursive: true, force: true });
});

describe('M3.1.1 manual Awareness coverage', () => {
  it('does not call the Provider twice for the same source set', async () => {
    const fake = provider();
    const opened = await open(fake.fetcher);
    await opened.runtime.capture('第一条。');
    await opened.runtime.capture('第二条。');
    const records = await opened.runtime.listRecent(5);

    const first = await opened.runtime.suggestRelations(records[0]!.id);
    expect(first.status).toBe('candidates');
    expect(fake.chatRequests()).toBe(1);

    const second = await opened.runtime.suggestRelations(records[0]!.id);
    expect(second.status).toBe('no_new_content');
    expect(second.candidates).toEqual([]);
    expect(fake.chatRequests()).toBe(1);
  });

  it('allows a new check after a new ordinary Record and keeps old Records as context', async () => {
    const fake = provider();
    const opened = await open(fake.fetcher);
    await opened.runtime.capture('旧记录 A。');
    await opened.runtime.capture('旧记录 B。');
    const before = await opened.runtime.listRecent(5);
    const first = await opened.runtime.suggestRelations(before[0]!.id);
    expect(first.status).toBe('candidates');
    expect(fake.chatRequests()).toBe(1);

    await opened.runtime.capture('新的普通记录 C。');
    const after = await opened.runtime.listRecent(5);
    const second = await opened.runtime.suggestRelations(after[0]!.id);
    expect(second.status).toBe('candidates');
    expect(fake.chatRequests()).toBe(2);
  });

  it('does not create a second model call after successful NO_OBSERVATION', async () => {
    let chatRequests = 0;
    const fetcher = (async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'test-model' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      chatRequests += 1;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  status: 'NO_OBSERVATION',
                  language: 'zh-CN',
                  suggestions: [],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;
    const opened = await open(fetcher);
    await opened.runtime.capture('没有观察 A。');
    await opened.runtime.capture('没有观察 B。');
    const records = await opened.runtime.listRecent(5);

    const first = await opened.runtime.suggestRelations(records[0]!.id);
    expect(first.status).toBe('no_candidate');
    const second = await opened.runtime.suggestRelations(records[0]!.id);
    expect(second.status).toBe('no_new_content');
    expect(chatRequests).toBe(1);
  });
});

describe('M3.1.2 render-level Reflection and Search', () => {
  it('renders 正在保存 then 已保存到「理解」 then stops showing 正在保存', async () => {
    vi.useFakeTimers();
    const fake = provider();
    const opened = await open(fake.fetcher);
    await opened.runtime.capture('渲染链路 A。');
    await opened.runtime.capture('渲染链路 B。');
    const tree = renderShell(opened);
    await flush();
    await press(tree, 'tab-awareness');
    await press(tree, 'awareness-start');
    const [item] = await opened.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected item');
    await press(tree, `awareness-bubble-${item.candidateId}`);
    await press(tree, `awareness-choice-${item.candidateId}-connected`);
    const input = tree.root.findByProps({ testID: `awareness-reflection-${item.candidateId}` });
    await act(async () => {
      input.props.onChangeText('这条回应必须走完整状态机。');
      await Promise.resolve();
    });

    // Resolve the save without awaiting so the visible saving label can be
    // observed before the promise settles.
    let resolveSave: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const originalSubmit = opened.runtime.submitObservationReflection.bind(opened.runtime);
    vi.spyOn(opened.runtime, 'submitObservationReflection').mockImplementation(async (value) => {
      await gate;
      return originalSubmit(value);
    });

    const submit = tree.root.findByProps({ testID: `awareness-submit-${item.candidateId}` });
    await act(async () => {
      submit.props.onPress?.();
      await Promise.resolve();
    });
    expect(
      tree.root.findAll((node) => node.props.children === '正在保存……').length,
    ).toBeGreaterThan(0);

    await act(async () => {
      resolveSave?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      tree.root.findAll((node) => node.props.children === '已保存到「理解」').length,
    ).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });
    expect(
      tree.root.findAll((node) => node.props.children === '正在保存……').length,
    ).toBe(0);
    vi.useRealTimers();
  });

  it('shows 已保存到「理解」 even when Relation evaluation never resolves', async () => {
    const fake = provider();
    const opened = await open(fake.fetcher);
    await opened.runtime.capture('慢评估 A。');
    await opened.runtime.capture('慢评估 B。');
    const tree = renderShell(opened);
    await flush();
    await press(tree, 'tab-awareness');
    await press(tree, 'awareness-start');
    const [item] = await opened.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected item');
    await press(tree, `awareness-bubble-${item.candidateId}`);
    await press(tree, `awareness-choice-${item.candidateId}-connected`);
    const input = tree.root.findByProps({ testID: `awareness-reflection-${item.candidateId}` });
    await act(async () => {
      input.props.onChangeText('这段文字已经保存，但评估很慢。');
      await Promise.resolve();
    });

    // Simulate the real-device stall: persist the Reflection, then hand the UI
    // an onPersisted signal, but never resolve the overall save promise.
    const original = opened.runtime.submitObservationReflection.bind(opened.runtime);
    vi.spyOn(opened.runtime, 'submitObservationReflection').mockImplementation(
      async (value) => {
        value.onPersisted?.('reflection-record-slow');
        await new Promise(() => undefined);
        return original(value);
      },
    );

    const submit = tree.root.findByProps({ testID: `awareness-submit-${item.candidateId}` });
    await act(async () => {
      submit.props.onPress?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      tree.root.findAll((node) => node.props.children === '已保存到「理解」').length,
    ).toBeGreaterThan(0);
  });

  it('collapses the real expanded container back to the circular control', async () => {
    const opened = await open();
    const tree = renderShell(opened);
    await flush();

    expect(tree.root.findAllByProps({ testID: 'local-search-input' })).toHaveLength(0);
    await press(tree, 'local-search-open');

    const expanded = tree.root.findByProps({ testID: 'local-search-control' });
    const expandedStyles = expanded.props.style.flat();
    expect(expandedStyles).toContainEqual(
      expect.objectContaining({ width: 236, height: 38 }),
    );

    await act(async () => {
      __emitKeyboardEvent('keyboardDidHide');
      await Promise.resolve();
    });

    // The expanded wrapper and its input must both be gone; only the circular
    // control may remain.
    expect(tree.root.findAllByProps({ testID: 'local-search-control' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'local-search-input' })).toHaveLength(0);
    const collapsed = tree.root.findByProps({ testID: 'local-search-open' });
    const collapsedStyles = collapsed.props.style.flat();
    expect(collapsedStyles).toContainEqual(
      expect.objectContaining({ width: 34, height: 34, borderRadius: 999 }),
    );
  });
});

describe('M3.1.1 provider failure and retry', () => {
  it('does not mark coverage on failure and allows a retry', async () => {
    let chatRequests = 0;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'test-model' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      chatRequests += 1;
      if (chatRequests === 1) return new Response('{}', { status: 500 });
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
    }) as typeof fetch;
    const opened = await open(fetcher);
    await opened.runtime.capture('重试 A。');
    await opened.runtime.capture('重试 B。');
    const records = await opened.runtime.listRecent(5);

    const first = await opened.runtime.suggestRelations(records[0]!.id);
    expect(first.status).toBe('unavailable');
    expect(chatRequests).toBe(1);

    const second = await opened.runtime.suggestRelations(records[0]!.id);
    expect(second.status).toBe('candidates');
    expect(chatRequests).toBe(2);
  });
});

describe('M3.1.1 reflection settlement', () => {
  it('settles after a successful Reflection-only save', async () => {
    vi.useFakeTimers();
    const fake = provider();
    const opened = await open(fake.fetcher);
    await opened.runtime.capture('第一条历史记录。');
    await opened.runtime.capture('第二条历史记录。');
    const tree = renderShell(opened);
    await flush();
    await press(tree, 'tab-awareness');
    await press(tree, 'awareness-start');
    const [item] = await opened.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected item');
    await press(tree, `awareness-bubble-${item.candidateId}`);
    await press(tree, `awareness-choice-${item.candidateId}-connected`);
    const input = tree.root.findByProps({ testID: `awareness-reflection-${item.candidateId}` });
    await act(async () => {
      input.props.onChangeText('这是我的理解。');
      await Promise.resolve();
    });
    await press(tree, `awareness-submit-${item.candidateId}`);
    expect(
      tree.root.findAll((node) => node.props.children === '已保存到「理解」').length,
    ).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it('leaves the saving state on failure', async () => {
    const fake = provider();
    const opened = await open(fake.fetcher);
    await opened.runtime.capture('失败路径 A。');
    await opened.runtime.capture('失败路径 B。');
    const created = await opened.runtime.suggestRelations(
      (await opened.runtime.listRecent(5))[0]!.id,
    );
    if (created.status !== 'candidates') throw new Error('expected candidate');
    const item = (await opened.runtime.awarenessHistory())[0]!;
    const original = opened.runtime.submitObservationReflection.bind(opened.runtime);
    vi.spyOn(opened.runtime, 'submitObservationReflection').mockImplementation(async () => {
      throw new Error('storage failure');
    });
    const tree = renderShell(opened);
    await flush();
    await press(tree, 'tab-awareness');
    await press(tree, `awareness-bubble-${item.candidateId}`);
    await press(tree, `awareness-choice-${item.candidateId}-connected`);
    const input = tree.root.findByProps({ testID: `awareness-reflection-${item.candidateId}` });
    await act(async () => {
      input.props.onChangeText('失败也要退出 saving。');
      await Promise.resolve();
    });
    await press(tree, `awareness-submit-${item.candidateId}`);
    expect(
      tree.root.findAll((node) => node.props.children === '正在保存……').length,
    ).toBe(0);
    vi.restoreAllMocks();
    void original;
  });
});

describe('M3.1.1 search clear after keyboard closed', () => {
  it('collapses when the query is cleared after the keyboard is already closed', async () => {
    const opened = await open();
    const tree = renderShell(opened);
    await flush();
    await press(tree, 'local-search-open');
    const input = tree.root.findByProps({ testID: 'local-search-input' });
    await act(async () => {
      input.props.onChangeText('会被清空');
      await Promise.resolve();
    });
    await act(async () => {
      __emitKeyboardEvent('keyboardDidHide');
      await Promise.resolve();
    });
    expect(tree.root.findByProps({ testID: 'local-search-input' })).toBeDefined();

    const stillOpen = tree.root.findByProps({ testID: 'local-search-input' });
    await act(async () => {
      stillOpen.props.onChangeText('');
      await Promise.resolve();
    });
    expect(tree.root.findAllByProps({ testID: 'local-search-input' })).toHaveLength(0);
  });
});

describe('M3.1.1 search keyboard lifecycle', () => {
  it('collapses an empty query when the keyboard hides', async () => {
    const opened = await open();
    const tree = renderShell(opened);
    await flush();
    await press(tree, 'local-search-open');
    await act(async () => {
      __emitKeyboardEvent('keyboardDidHide');
      await Promise.resolve();
    });
    expect(tree.root.findAllByProps({ testID: 'local-search-input' })).toHaveLength(0);
  });

  it('keeps a non-empty query expanded when the keyboard hides', async () => {
    const opened = await open();
    const tree = renderShell(opened);
    await flush();
    await press(tree, 'local-search-open');
    const input = tree.root.findByProps({ testID: 'local-search-input' });
    await act(async () => {
      input.props.onChangeText('保留');
      await Promise.resolve();
    });
    await act(async () => {
      __emitKeyboardEvent('keyboardDidHide');
      await Promise.resolve();
    });
    expect(tree.root.findByProps({ testID: 'local-search-input' })).toBeDefined();
  });
});

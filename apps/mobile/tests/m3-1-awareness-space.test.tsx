/**
 * M3.1 Awareness Space verification.
 *
 * The main Awareness surface is a stage for the current or newly emerged
 * observation. History is a separate retrieval view. Manual Awareness remains
 * one user action; the Record anchor stays internal.
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
import type { MobileRuntime } from '../src/runtime/mobile-runtime';
import { openMobileTestRuntime, type MobileTestRuntime } from './support/mobile-test-runtime';

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

const surfaceProvider = () => {
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

const typeName = (node: ReactTestRenderer['root']): string => String(node.type);

const testIds = (tree: ReactTestRenderer): readonly string[] =>
  tree.root
    .findAll((node) => typeof node.type === 'string' && node.props.testID !== undefined)
    .map((node) => String(node.props.testID));

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-m3-1-'));
  vi.restoreAllMocks();
});

afterEach(async () => {
  vi.restoreAllMocks();
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

describe('Mobile M3.1 Awareness Space', () => {
  it('keeps product identity in the header and removes repeated space titles', async () => {
    const runtime = await open();
    const tree = renderShell(runtime.runtime);
    await flush();

    expect(tree.root.findByProps({ testID: 'app-title' }).props.children).toBe('见渊');
    expect(testIds(tree)).not.toContain('space-awareness');

    for (const [tab, space] of [
      ['tab-awareness', 'space-awareness'],
      ['tab-reflection', 'space-reflection'],
      ['tab-exploration', 'space-exploration'],
      ['tab-records', 'space-records'],
    ] as const) {
      await press(tree, tab);
      expect(testIds(tree)).toContain(space);
      expect(tree.root.findByProps({ testID: 'app-title' }).props.children).toBe('见渊');
    }

    const textNodes = tree.root
      .findAll((node) => typeof node.type === 'string')
      .filter((node) => typeName(node) === 'Text' && node.props.children === '觉察历史');
    expect(textNodes).toHaveLength(0);
  });

  it('starts manual awareness with one action and never exposes a Record selector', async () => {
    const runtime = await open();
    await runtime.runtime.configureAI({
      providerId: 'openai-compatible',
      baseUrl: 'https://provider.example/v1',
      model: 'test-model',
      apiKey: 'sk-m3-1-manual',
    });
    await runtime.runtime.capture('第一条手动检查记录。');
    await runtime.runtime.capture('第二条手动检查记录。');
    const tree = renderShell(runtime.runtime);
    await flush();
    await press(tree, 'tab-awareness');

    expect(testIds(tree)).toContain('awareness-stage');
    expect(
      tree.root.findAll((node) => typeName(node) === 'Pressable' && node.props.testID === 'awareness-start'),
    ).toHaveLength(1);
    expect(
      tree.root.findAll((node) => String(node.props.testID ?? '').startsWith('awareness-record-')),
    ).toHaveLength(0);
    expect(tree.root.findAll((node) => node.props.children === '选择一条记录')).toHaveLength(0);

    await press(tree, 'awareness-start');
    const [item] = await runtime.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected a manual awareness item');
    expect(
      tree.root.findAllByProps({ testID: `awareness-bubble-${item.candidateId}` }).length,
    ).toBeGreaterThan(0);
  });

  it('moves viewed awareness out of the stage and into a separate History view', async () => {
    const runtime = await open();
    await runtime.runtime.configureAI({
      providerId: 'openai-compatible',
      baseUrl: 'https://provider.example/v1',
      model: 'test-model',
      apiKey: 'sk-m3-1',
    });
    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('第一条历史迁移记录。');
    await runtime.runtime.capture('第二条历史迁移记录。');
    await runtime.runtime.runScheduledAutomaticAwareness();
    const [item] = await runtime.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected an awareness item');

    const tree = renderShell(runtime.runtime);
    await flush();
    await press(tree, 'tab-awareness');
    await press(tree, `awareness-bubble-${item.candidateId}`);
    expect(tree.root.findAllByProps({ testID: `awareness-bubble-${item.candidateId}` })).toHaveLength(0);

    await press(tree, 'awareness-history-entry');
    expect(tree.root.findByProps({ testID: 'space-awareness-history' })).toBeDefined();
    expect(
      tree.root.findAllByProps({ testID: `awareness-history-${item.candidateId}` }).length,
    ).toBeGreaterThan(0);

    await press(tree, 'awareness-history-back');
    expect(tree.root.findByProps({ testID: 'space-awareness' })).toBeDefined();
    expect(tree.root.findAllByProps({ testID: `awareness-history-${item.candidateId}` })).toHaveLength(0);
  });

  it('collapses an empty query when search loses focus and keeps a filled query expanded', async () => {
    const runtime = await open();
    const tree = renderShell(runtime.runtime);
    await flush();

    await press(tree, 'local-search-open');
    const input = tree.root.findByProps({ testID: 'local-search-input' });
    await act(async () => {
      await input.props.onBlur?.();
      await Promise.resolve();
    });
    expect(tree.root.findAllByProps({ testID: 'local-search-input' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'local-search-open' }).length).toBeGreaterThan(0);

    await press(tree, 'local-search-open');
    const filledInput = tree.root.findByProps({ testID: 'local-search-input' });
    await act(async () => {
      filledInput.props.onChangeText('保留');
      await Promise.resolve();
    });
    await act(async () => {
      await filledInput.props.onBlur?.();
      await Promise.resolve();
    });
    expect(tree.root.findByProps({ testID: 'local-search-input' })).toBeDefined();
  });
});

/**
 * M2.4 UI regression: the inbox is the source of truth for unread state.
 *
 * This test renders the production shell and Awareness space. It verifies the
 * rule users will actually feel: opening the Tab is not reading a Bubble.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it } from 'vitest';

import { ExpoSecureStoreSecretStore } from '../src/runtime/secret-store';
import type { SecureStoreBinding } from '../src/runtime/secret-store';
import { AppShell } from '../src/shell/app-shell';

import type { MobileRuntime } from '../src/runtime/mobile-runtime';
import { RuntimeProvider } from '../src/shell/runtime-context';
import { ThemeProvider } from '../src/theme/theme-context';
import { openMobileTestRuntime, type MobileTestRuntime } from './support/mobile-test-runtime';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const directories: string[] = [];
const runtimes: MobileTestRuntime[] = [];
const renderers: ReactTestRenderer[] = [];

const scratchDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-m2-4-ui-'));
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

const provider = () => {
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/v1/models')) {
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
  return fetcher;
};

const open = async (
  location: string,
  secretStore: SecureStoreBinding & { readonly entries: Map<string, string> },
  fetcher: typeof fetch,
): Promise<MobileTestRuntime> => {
  const runtime = await openMobileTestRuntime({
    location,
    fetch: fetcher,
    secretStore: new ExpoSecureStoreSecretStore(secretStore),
  });
  runtimes.push(runtime);
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
  renderers.push(created);
  return created;
};

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const renderedText = (node: ReactTestRenderer['root']): string =>
  node
    .findAll((candidate) => typeof candidate.type === 'string')
    .flatMap((candidate) =>
      Array.isArray(candidate.props.children)
        ? candidate.props.children.filter((child: unknown): child is string => typeof child === 'string')
        : typeof candidate.props.children === 'string'
          ? [candidate.props.children]
          : [],
    )
    .join('');

const press = async (tree: ReactTestRenderer, testID: string): Promise<void> => {
  const node = tree.root.findByProps({ testID });
  await act(async () => {
    await node.props.onPress?.();
    await Promise.resolve();
  });
  await flush();
};

afterEach(async () => {
  for (const renderer of renderers.splice(0)) {
    act(() => renderer.unmount());
  }
  for (const runtime of runtimes.splice(0)) {
    await runtime.close();
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Automatic Awareness inbox UI (M2.4)', () => {
  it('shows a real unread badge and marks only the opened Bubble as viewed', async () => {
    const secretStore = keychain();
    const runtime = await open(scratchDatabasePath(), secretStore, provider());
    await runtime.runtime.configureAI({
      providerId: 'openai-compatible',
      baseUrl: 'https://provider.example/v1',
      model: 'test-model',
      apiKey: 'sk-m2-4-ui',
    });

    await runtime.runtime.setAutomaticAwarenessEnabled(true);
    await runtime.runtime.capture('第一条 UI 记录。');
    await runtime.runtime.capture('第二条 UI 记录。');
    await runtime.runtime.runScheduledAutomaticAwareness();

    const tree = renderShell(runtime.runtime);
    await flush();

    const tab = tree.root.findByProps({ testID: 'tab-awareness' });
    expect(renderedText(tab)).toContain('觉察 (1)');

    await press(tree, 'tab-awareness');
    expect(await runtime.runtime.unreadAwarenessCount()).toBe(1);

    const [item] = await runtime.runtime.awarenessHistory();
    if (item === undefined) throw new Error('expected an awareness item');
    expect(tree.root.findAllByProps({ testID: `awareness-bubble-${item.candidateId}` }).length).toBeGreaterThan(0);

    await press(tree, `awareness-bubble-${item.candidateId}`);
    expect(await runtime.runtime.unreadAwarenessCount()).toBe(0);

    const tabAfter = tree.root.findByProps({ testID: 'tab-awareness' });
    expect(renderedText(tabAfter)).not.toContain('觉察 (1)');
  });
});

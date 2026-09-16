/**
 * M2 local-search UI regression.
 *
 * The component under test is the production shell and the production local
 * search control. No provider is configured, so any accidental AI call would
 * surface as a failure rather than being hidden by a successful response.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it } from 'vitest';

import { AppShell } from '../src/shell/app-shell';
import { RuntimeProvider } from '../src/shell/runtime-context';
import { ThemeProvider } from '../src/theme/theme-context';
import { openMobileTestRuntime, type MobileTestRuntime } from './support/mobile-test-runtime';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const directories: string[] = [];
const runtimes: MobileTestRuntime[] = [];
const renderers: ReactTestRenderer[] = [];

const scratchDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-m2-search-ui-'));
  directories.push(directory);
  return join(directory, 'jianyuan.sqlite');
};

const open = async (): Promise<MobileTestRuntime> => {
  const runtime = await openMobileTestRuntime({ location: scratchDatabasePath() });
  runtimes.push(runtime);
  return runtime;
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
  for (const renderer of renderers.splice(0)) act(() => renderer.unmount());
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Mobile local search UI (M2 stabilization)', () => {
  it('does not autofocus, expands only on demand, and cancels cleanly', async () => {
    const runtime = await open();
    const tree = renderShell(runtime);
    await flush();

    expect(tree.root.findAllByProps({ testID: 'local-search-input' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'local-search-open' }).length).toBeGreaterThan(0);

    await press(tree, 'local-search-open');
    const input = tree.root.findByProps({ testID: 'local-search-input' });
    expect(input.props.autoFocus).toBe(true);

    await press(tree, 'local-search-cancel');
    expect(tree.root.findAllByProps({ testID: 'local-search-input' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'local-search-open' }).length).toBeGreaterThan(0);
  });

  it('clears the query when switching spaces', async () => {
    const runtime = await open();
    const tree = renderShell(runtime);
    await flush();

    await press(tree, 'local-search-open');
    const input = tree.root.findByProps({ testID: 'local-search-input' });
    await act(async () => {
      input.props.onChangeText('会切换');
      await Promise.resolve();
    });
    expect(tree.root.findByProps({ testID: 'local-search-input' }).props.value).toBe('会切换');

    await press(tree, 'tab-awareness');
    expect(tree.root.findAllByProps({ testID: 'local-search-input' })).toHaveLength(0);
  });
});

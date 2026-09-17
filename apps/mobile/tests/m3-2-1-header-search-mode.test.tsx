/**
 * M3.2.1 header search-mode regression.
 *
 * The header has one render mode, driven by a single `searchOpen` boolean. On
 * device, Awareness previously kept `见渊` mounted next to the expanding field,
 * so a small iPhone clipped the brand. These tests assert the real render tree:
 * in search mode the brand and the Awareness History / Settings actions are not
 * present at all, and they come back when search ends.
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
import { __clearKeyboardListeners, __emitKeyboardEvent } from './support/react-native-double';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const directories: string[] = [];
const runtimes: MobileTestRuntime[] = [];
const renderers: ReactTestRenderer[] = [];

const scratchDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-m3-2-1-header-'));
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

const has = (tree: ReactTestRenderer, testID: string): boolean =>
  tree.root.findAllByProps({ testID }).length > 0;

afterEach(async () => {
  __clearKeyboardListeners();
  for (const renderer of renderers.splice(0)) act(() => renderer.unmount());
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('M3.2.1 header search mode', () => {
  it('shows brand, History, Search and Settings in Awareness normal mode', async () => {
    const runtime = await open();
    const tree = renderShell(runtime);
    await flush();
    await press(tree, 'tab-awareness');

    expect(has(tree, 'app-title')).toBe(true);
    expect(has(tree, 'awareness-history-entry')).toBe(true);
    expect(has(tree, 'local-search-open')).toBe(true);
    expect(has(tree, 'settings-entry')).toBe(true);
  });

  it('removes brand and History from layout when search is open', async () => {
    const runtime = await open();
    const tree = renderShell(runtime);
    await flush();
    await press(tree, 'tab-awareness');
    await press(tree, 'local-search-open');

    expect(has(tree, 'local-search-input')).toBe(true);
    // The brand and the Awareness actions must not occupy layout in search mode.
    expect(has(tree, 'app-title')).toBe(false);
    expect(has(tree, 'awareness-history-entry')).toBe(false);
    expect(has(tree, 'settings-entry')).toBe(false);
  });

  it('restores the normal header when search collapses', async () => {
    const runtime = await open();
    const tree = renderShell(runtime);
    await flush();
    await press(tree, 'tab-awareness');
    await press(tree, 'local-search-open');
    expect(has(tree, 'app-title')).toBe(false);

    await press(tree, 'local-search-cancel');
    expect(has(tree, 'app-title')).toBe(true);
    expect(has(tree, 'awareness-history-entry')).toBe(true);
    expect(has(tree, 'settings-entry')).toBe(true);
  });

  it('keeps search mode when a non-empty query survives keyboard dismissal', async () => {
    const runtime = await open();
    const tree = renderShell(runtime);
    await flush();
    await press(tree, 'tab-awareness');
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

    expect(has(tree, 'local-search-input')).toBe(true);
    expect(has(tree, 'app-title')).toBe(false);
  });

  it('restores the normal header when an empty query loses the keyboard', async () => {
    const runtime = await open();
    const tree = renderShell(runtime);
    await flush();
    await press(tree, 'tab-awareness');
    await press(tree, 'local-search-open');

    await act(async () => {
      __emitKeyboardEvent('keyboardDidHide');
      await Promise.resolve();
    });

    expect(has(tree, 'local-search-input')).toBe(false);
    expect(has(tree, 'app-title')).toBe(true);
    expect(has(tree, 'awareness-history-entry')).toBe(true);
  });

  it('applies the same search-mode behavior in the Record space', async () => {
    const runtime = await open();
    const tree = renderShell(runtime);
    await flush();

    expect(has(tree, 'app-title')).toBe(true);
    await press(tree, 'local-search-open');
    expect(has(tree, 'app-title')).toBe(false);
    expect(has(tree, 'settings-entry')).toBe(false);
    expect(has(tree, 'local-search-input')).toBe(true);
  });
});

/**
 * Phase M1-B verification: navigation renders only the active space.
 *
 * THE REGRESSION THIS GUARDS AGAINST
 * The Desktop renderer shipped a bug where the sidebar's active state updated
 * correctly while every space section stayed mounted and visible, so content from
 * all spaces appeared at once. On Mobile the equivalent mistake would be
 * rendering all spaces and hiding the inactive ones.
 *
 * These tests assert the structural property directly: after each navigation,
 * the active space's content is present AND every other space's content is
 * absent from the rendered tree. They are written against testIDs that only the
 * space bodies emit, so they cannot pass because of styling.
 */

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppShell } from '../src/shell/app-shell';
import { RuntimeProvider } from '../src/shell/runtime-context';
import { ThemeProvider } from '../src/theme/theme-context';
import type { MobileRuntime } from '../src/runtime/mobile-runtime';
import { openMobileTestRuntime, type MobileTestRuntime } from './support/mobile-test-runtime';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const temporaryDirectories: string[] = [];
let testRuntime: MobileTestRuntime | null = null;
let renderer: ReactTestRenderer | null = null;

const openRuntime = async (): Promise<MobileTestRuntime> => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-nav-'));
  temporaryDirectories.push(directory);
  testRuntime = await openMobileTestRuntime({ location: join(directory, 'jianyuan.sqlite') });
  return testRuntime;
};

beforeEach(async () => {
  await openRuntime();
});

afterEach(async () => {
  if (renderer !== null) {
    act(() => renderer?.unmount());
    renderer = null;
  }
  if (testRuntime !== null) {
    await testRuntime.close();
    testRuntime = null;
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

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

/** Flush pending promise callbacks (the timeline load) inside act. */
const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

const press = async (tree: ReactTestRenderer, testID: string): Promise<void> => {
  const node = tree.root.findByProps({ testID });
  await act(async () => {
    node.props.onPress?.();
    await Promise.resolve();
  });
};

const testIds = (tree: ReactTestRenderer): readonly string[] =>
  tree.root
    .findAll((node) => typeof node.type === 'string' && node.props.testID !== undefined)
    .map((node) => String(node.props.testID));

describe('Mobile navigation isolation (M1-B)', () => {
  it('starts on the Record space and renders no other space', async () => {
    const tree = renderShell(testRuntime!.runtime);
    await flush();

    const ids = testIds(tree);
    expect(ids).toContain('active-space-records');
    expect(ids).toContain('record-input');

    for (const space of ['awareness', 'reflection', 'exploration', 'settings']) {
      expect(ids).not.toContain(`space-${space}`);
    }
  });

  it('renders only the selected space after navigating to each tab', async () => {
    const tree = renderShell(testRuntime!.runtime);
    await flush();

    const cases: readonly { readonly tab: string; readonly space: string }[] = [
      { tab: 'tab-awareness', space: 'awareness' },
      { tab: 'tab-reflection', space: 'reflection' },
      { tab: 'tab-exploration', space: 'exploration' },
      { tab: 'tab-records', space: 'records' },
    ];

    for (const testCase of cases) {
      await press(tree, testCase.tab);
      await flush();

      const ids = testIds(tree);
      expect(ids).toContain(`active-space-${testCase.space}`);
      expect(ids).toContain(`space-${testCase.space}`);

      // Every OTHER space must be entirely absent, not merely hidden.
      for (const other of ['records', 'awareness', 'reflection', 'exploration', 'settings']) {
        if (other === testCase.space) continue;
        expect(ids).not.toContain(`space-${other}`);
        expect(ids).not.toContain(`active-space-${other}`);
      }
    }
  });

  it('opens Settings from the header without adding it to the tab bar', async () => {
    const tree = renderShell(testRuntime!.runtime);
    await flush();

    // Settings is not reachable as a tab.
    expect(testIds(tree)).not.toContain('tab-settings');

    await press(tree, 'settings-entry');
    await flush();

    const ids = testIds(tree);
    expect(ids).toContain('active-space-settings');
    expect(ids).toContain('space-settings');
    expect(ids).not.toContain('space-records');

    // The four tabs remain, and none of them is Settings.
    expect(ids).toContain('tab-records');
    expect(ids).toContain('tab-awareness');
    expect(ids).toContain('tab-reflection');
    expect(ids).toContain('tab-exploration');
    expect(ids).not.toContain('tab-settings');
  });

  it('returns from Settings to the space the user was on', async () => {
    const tree = renderShell(testRuntime!.runtime);
    await flush();

    await press(tree, 'tab-reflection');
    await flush();
    await press(tree, 'settings-entry');
    await flush();
    expect(testIds(tree)).toContain('active-space-settings');

    await press(tree, 'settings-entry');
    await flush();
    // Back to the previously selected tab, not to the default.
    expect(testIds(tree)).toContain('active-space-reflection');
    expect(testIds(tree)).not.toContain('space-records');
  });

  it('keeps the tab bar present on every space', async () => {
    const tree = renderShell(testRuntime!.runtime);
    await flush();

    for (const tab of ['tab-awareness', 'tab-exploration', 'tab-records']) {
      await press(tree, tab);
      await flush();
      expect(testIds(tree)).toContain('tab-bar');
    }

    await press(tree, 'settings-entry');
    await flush();
    // Settings keeps the tab bar so the user can leave it.
    expect(testIds(tree)).toContain('tab-bar');
  });
});

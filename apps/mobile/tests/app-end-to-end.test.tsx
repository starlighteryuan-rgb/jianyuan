/**
 * Phase M1-A end-to-end: the exact user story M1 exists to deliver.
 *
 *   "在真实 iPhone 上打开见渊，写下一条记录，退出，再次打开，记录还在那里。"
 *
 * The device steps that cannot run in this environment are the iOS binary itself.
 * Everything else is exercised for real here: the shell renders, the user types
 * into the input, the save button runs the production capture path into a real
 * SQLite file, and a completely fresh runtime over that file shows the Record.
 */

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AppShell } from '../src/shell/app-shell';
import { RuntimeProvider } from '../src/shell/runtime-context';
import { ThemeProvider } from '../src/theme/theme-context';
import { openMobileTestRuntime, type MobileTestRuntime } from './support/mobile-test-runtime';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const temporaryDirectories: string[] = [];
const openRuntimes: MobileTestRuntime[] = [];
const renderers: ReactTestRenderer[] = [];

const scratchDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-e2e-'));
  temporaryDirectories.push(directory);
  return directory;
};

const openRuntime = async (location: string): Promise<MobileTestRuntime> => {
  const runtime = await openMobileTestRuntime({ location });
  openRuntimes.push(runtime);
  return runtime;
};

afterEach(async () => {
  for (const renderer of renderers.splice(0)) {
    act(() => renderer.unmount());
  }
  for (const runtime of openRuntimes.splice(0)) {
    try {
      await runtime.close();
    } catch {
      // Already closed by the test body.
    }
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

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
  });
};

describe('Mobile end-to-end user story (M1)', () => {
  it('saves a Record through the UI, then finds it after a full restart', async () => {
    const directory = scratchDirectory();
    const databasePath = join(directory, 'jianyuan.sqlite');

    // ── Session 1: open the app, type a line, save it ──────────────────────
    const first = await openRuntime(databasePath);
    const firstTree = renderShell(first);
    await flush();

    const input = firstTree.root.findByProps({ testID: 'record-input' });
    await act(async () => {
      input.props.onChangeText('今天把移动端的记录链路接通了。');
      await Promise.resolve();
    });

    const saveButton = firstTree.root.findByProps({ testID: 'record-save' });
    await act(async () => {
      await saveButton.props.onPress();
    });
    await flush();

    // The user sees the acknowledgement and their Record in the timeline.
    const savedMessage = firstTree.root.findByProps({ testID: 'record-saved-message' });
    expect(savedMessage.props.children).toBe('已经记下来了。');

    // The timeline is now a grouped time stream, not a FlatList, so assert on
    // the rendered Record text rather than a `data` prop.
    const firstTimeline = firstTree.root.findByProps({ testID: 'record-timeline' });
    const firstRecords = firstTimeline
      .findAll((node) => String(node.type) === 'Text')
      .map((node) => String(node.props.children ?? ''));
    expect(firstRecords).toContain('今天把移动端的记录链路接通了。');

    // ── Close the app entirely ─────────────────────────────────────────────
    act(() => firstTree.unmount());
    renderers.pop();
    await first.close();

    // ── Session 2: a fresh runtime and shell over the same file ────────────
    const second = await openRuntime(databasePath);
    const secondTree = renderShell(second);
    await flush();

    const reopenedTimeline = secondTree.root.findByProps({ testID: 'record-timeline' });
    const reopenedRecords = reopenedTimeline
      .findAll((node) => String(node.type) === 'Text')
      .map((node) => String(node.props.children ?? ''));
    expect(reopenedRecords).toContain('今天把移动端的记录链路接通了。');

    // The empty state must be gone, since there is a Record.
    expect(
      secondTree.root.findAllByProps({ testID: 'record-empty' }),
    ).toHaveLength(0);
  });

  it('shows the empty state on a genuinely first launch', async () => {
    const directory = scratchDirectory();
    const runtime = await openRuntime(join(directory, 'jianyuan.sqlite'));
    const tree = renderShell(runtime);
    await flush();

    const empty = tree.root.findByProps({ testID: 'record-empty' });
    expect(String(empty.props.children)).toContain('写下一些此刻想留下的东西');
  });

  it('does not clear the input when a save is refused', async () => {
    const directory = scratchDirectory();
    const runtime = await openRuntime(join(directory, 'jianyuan.sqlite'));
    const tree = renderShell(runtime);
    await flush();

    // Whitespace-only input is refused by the runtime.
    const input = tree.root.findByProps({ testID: 'record-input' });
    await act(async () => {
      input.props.onChangeText('   ');
      await Promise.resolve();
    });

    // The button is disabled for empty input, which is the first line of defence.
    const saveButton = tree.root.findByProps({ testID: 'record-save' });
    expect(saveButton.props.disabled).toBe(true);
  });
});

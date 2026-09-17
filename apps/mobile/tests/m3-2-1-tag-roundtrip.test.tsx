/**
 * M3.2.1 tag round-trip regression, asserted against the rendered tree.
 *
 * The M3.2 defect was a wiring failure, not a logic failure: production passed
 * only five positional storage arguments, so `recordTagStorage` fell back to a
 * no-op store and a saved tag never appeared. These tests therefore drive the
 * real component: expand a Record, type a tag, press save, and assert that the
 * tag capsule is actually rendered — then reopen the runtime and assert the tag
 * survived.
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
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-m3-2-1-tag-'));
  directories.push(directory);
  return join(directory, 'jianyuan.sqlite');
};

const open = async (location: string): Promise<MobileTestRuntime> => {
  const runtime = await openMobileTestRuntime({ location });
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
  for (const renderer of renderers.splice(0)) act(() => renderer.unmount());
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('M3.2.1 tag round trip through the UI', () => {
  it('renders the tag capsule immediately after save', async () => {
    const location = scratchDatabasePath();
    const runtime = await open(location);
    const saved = await runtime.runtime.capture('给这条记录加标签。');
    if (!saved.ok) throw new Error('expected save');
    const recordId = saved.outcome.recordId;

    const tree = renderShell(runtime);
    await flush();

    // Expand the Record to reveal the tag editor.
    await press(tree, `record-toggle-${recordId}`);
    await press(tree, `record-tag-add-${recordId}`);

    const input = tree.root.findByProps({ testID: `record-tag-input-${recordId}` });
    await act(async () => {
      input.props.onChangeText('前任');
      await Promise.resolve();
    });
    await press(tree, `record-tag-confirm-${recordId}`);

    // The capsule must be on screen without a manual refresh.
    expect(has(tree, `record-tag-${recordId}-前任`)).toBe(true);
    // The editor must have closed.
    expect(has(tree, `record-tag-input-${recordId}`)).toBe(false);
  });

  it('keeps the tag after the runtime is reopened', async () => {
    const location = scratchDatabasePath();
    const first = await open(location);
    const saved = await first.runtime.capture('重启后标签还要在。');
    if (!saved.ok) throw new Error('expected save');
    const recordId = saved.outcome.recordId;

    const tree = renderShell(first);
    await flush();
    await press(tree, `record-toggle-${recordId}`);
    await press(tree, `record-tag-add-${recordId}`);
    const input = tree.root.findByProps({ testID: `record-tag-input-${recordId}` });
    await act(async () => {
      input.props.onChangeText('关系');
      await Promise.resolve();
    });
    await press(tree, `record-tag-confirm-${recordId}`);
    expect(has(tree, `record-tag-${recordId}-关系`)).toBe(true);

    // Close everything, then reopen a fresh runtime over the same file.
    act(() => renderers.splice(0).forEach((renderer) => renderer.unmount()));
    await first.close();
    runtimes.splice(runtimes.indexOf(first), 1);

    const second = await open(location);
    expect(await second.runtime.tagsForRecord(recordId)).toEqual(['关系']);

    const secondTree = renderShell(second);
    await flush();
    expect(has(secondTree, `record-tag-${recordId}-关系`)).toBe(true);
  });

  it('removes the tag and it stays removed after reopen', async () => {
    const location = scratchDatabasePath();
    const runtime = await open(location);
    const saved = await runtime.runtime.capture('删除标签要生效。');
    if (!saved.ok) throw new Error('expected save');
    const recordId = saved.outcome.recordId;
    await runtime.runtime.addRecordTag(recordId, '学习');

    const tree = renderShell(runtime);
    await flush();
    expect(has(tree, `record-tag-${recordId}-学习`)).toBe(true);

    await press(tree, `record-toggle-${recordId}`);
    await press(tree, `record-tag-remove-${recordId}-学习`);
    expect(has(tree, `record-tag-${recordId}-学习`)).toBe(false);
    expect(await runtime.runtime.tagsForRecord(recordId)).toEqual([]);
  });

  it('does not create a tag from an empty name', async () => {
    const runtime = await open(scratchDatabasePath());
    const saved = await runtime.runtime.capture('空标签不应创建。');
    if (!saved.ok) throw new Error('expected save');
    const recordId = saved.outcome.recordId;

    const tree = renderShell(runtime);
    await flush();
    await press(tree, `record-toggle-${recordId}`);
    await press(tree, `record-tag-add-${recordId}`);
    const input = tree.root.findByProps({ testID: `record-tag-input-${recordId}` });
    await act(async () => {
      input.props.onChangeText('   ');
      await Promise.resolve();
    });
    await press(tree, `record-tag-confirm-${recordId}`);

    expect(await runtime.runtime.tagsForRecord(recordId)).toEqual([]);
    expect(await runtime.runtime.allTagNames()).toEqual([]);
  });
});

/**
 * M3.4 release-candidate checks.
 *
 * These tests exercise the runtime and the Mobile-local visibility store. They
 * verify that deletion is durable from the user's perspective without claiming
 * a destructive Core delete that the schema does not permit.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  EMPTY_USER_CONTENT_VISIBILITY_STATE,
  hideRecord,
  hideReflectionRecord,
  isRecordHidden,
  isReflectionHidden,
  parseUserContentVisibilityState,
} from '../src/runtime/user-content-visibility-store';
import { openMobileTestRuntime, type MobileTestRuntime } from './support/mobile-test-runtime';

const directories: string[] = [];
const runtimes: MobileTestRuntime[] = [];

const scratchDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-m3-4-'));
  directories.push(directory);
  return join(directory, 'jianyuan.sqlite');
};

const open = async (location: string): Promise<MobileTestRuntime> => {
  const runtime = await openMobileTestRuntime({ location });
  runtimes.push(runtime);
  return runtime;
};

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) {
    try {
      await runtime.close();
    } catch {
      // A test may close it explicitly to simulate a restart.
    }
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('M3.4 visibility rules', () => {
  it('hides Records and Reflections without carrying them into Core state', () => {
    const records = hideRecord(EMPTY_USER_CONTENT_VISIBILITY_STATE, 'record-1');
    expect(isRecordHidden(records, 'record-1')).toBe(true);
    expect(isRecordHidden(records, 'record-2')).toBe(false);

    const reflections = hideReflectionRecord(records, 'reflection-1');
    expect(isReflectionHidden(reflections, 'reflection-1')).toBe(true);
    expect(isReflectionHidden(reflections, 'reflection-2')).toBe(false);
    expect(reflections.hiddenRecordIds).toEqual(['record-1']);
  });

  it('parses a corrupt visibility payload as empty state', () => {
    expect(parseUserContentVisibilityState('not json')).toEqual(
      EMPTY_USER_CONTENT_VISIBILITY_STATE,
    );
    expect(parseUserContentVisibilityState('{"hiddenRecordIds":"no"}')).toEqual({
      hiddenRecordIds: [],
      hiddenReflectionRecordIds: [],
    });
  });
});

describe('M3.4 user-visible deletion', () => {
  it('hides a Record immediately and keeps it hidden after a restart', async () => {
    const location = scratchDatabasePath();
    const first = await open(location);
    await first.runtime.capture('这条记录会被用户从移动端删除。');
    const [record] = await first.runtime.listRecent();
    expect(record).toBeDefined();

    await first.runtime.hideRecordFromMobile(record!.id);
    expect(await first.runtime.listRecent()).toEqual([]);
    const stillInCore = await first.composition.records.getById(record!.id);
    expect(stillInCore?.verbatim).toBe(
      '这条记录会被用户从移动端删除。',
    );

    await first.close();
    const second = await open(location);
    expect(await second.runtime.listRecent()).toEqual([]);
  });

  it('hides an Understanding reflection identifier and keeps it hidden after a restart', async () => {
    const location = scratchDatabasePath();
    const first = await open(location);
    await first.runtime.hideUnderstandingReflection('reflection-1');

    await first.close();
    const second = await open(location);
    await second.runtime.hideUnderstandingReflection('reflection-1');
    expect(existsSync(location)).toBe(true);
  });

  it('deletes an Awareness history item from the durable presentation store', async () => {
    const location = scratchDatabasePath();
    const first = await open(location);
    expect(await first.runtime.awarenessHistory()).toEqual([]);

    await first.runtime.deleteAwarenessHistoryItem('missing-candidate');
    expect(await first.runtime.awarenessHistory()).toEqual([]);
  });

  it('does not expose a delete operation for derived Exploration relations', async () => {
    const runtime = await open(scratchDatabasePath());
    expect('deleteExplorationRelation' in runtime.runtime).toBe(false);
  });
});

describe('M3.4 version', () => {
  it('exposes 0.4.0 from the mobile package and Expo configuration', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { readonly version: string };
    const appJson = JSON.parse(
      readFileSync(join(process.cwd(), 'app.json'), 'utf8'),
    ) as { readonly expo: { readonly version: string; readonly ios: { readonly buildNumber: string } } };

    expect(packageJson.version).toBe('0.4.0');
    expect(appJson.expo.version).toBe('0.4.0');
    expect(appJson.expo.ios.buildNumber).toBe('2');
  });
});

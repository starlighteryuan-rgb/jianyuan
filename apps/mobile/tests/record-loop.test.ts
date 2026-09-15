/**
 * Phase M1-A verification: the Record closed loop.
 *
 * These tests exercise the production Mobile storage adapter, the production
 * composition root, and the production runtime against a real SQLite file. The
 * only substitution is the driver binding (node:sqlite instead of expo-sqlite),
 * so the SQL, migrations, transactions, and codec under test are the ones that
 * ship.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { RECORD_SAVED_MESSAGE } from '../src/runtime/mobile-runtime';
import { openMobileTestRuntime, type MobileTestRuntime } from './support/mobile-test-runtime';

const temporaryDirectories: string[] = [];
const openRuntimes: MobileTestRuntime[] = [];

const scratchDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-'));
  temporaryDirectories.push(directory);
  return join(directory, 'jianyuan.sqlite');
};

const openRuntime = async (location: string): Promise<MobileTestRuntime> => {
  const runtime = await openMobileTestRuntime({ location });
  openRuntimes.push(runtime);
  return runtime;
};

afterEach(async () => {
  for (const runtime of openRuntimes.splice(0)) {
    try {
      await runtime.close();
    } catch {
      // Already closed by the test body; nothing to do.
    }
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Mobile Record closed loop (M1-A)', () => {
  it('imports Core and exposes the shared Record model through the composition', async () => {
    const runtime = await openRuntime(scratchDatabasePath());

    // Reaching the service through the composition proves the shared package is
    // actually resolvable and instantiated, not merely type-imported.
    expect(runtime.composition.ingestion).toBeDefined();
    expect(runtime.composition.records).toBeDefined();
    expect(runtime.composition.storage.schemaVersion).toBe(1);
  });

  it('creates exactly one Record from one capture and returns the acknowledgement', async () => {
    const runtime = await openRuntime(scratchDatabasePath());

    const result = await runtime.runtime.capture('我先把任务拆成一个具体动作。');
    expect(result.ok).toBe(true);

    const records = await runtime.runtime.listRecent();
    expect(records).toHaveLength(1);
    expect(records[0]?.verbatim).toBe('我先把任务拆成一个具体动作。');
    expect(RECORD_SAVED_MESSAGE).toBe('已经记下来了。');
  });

  it('preserves the user wording verbatim, including modal markers', async () => {
    const runtime = await openRuntime(scratchDatabasePath());

    const wording = '我可能是因为太累了，好像不太想说话。';
    await runtime.runtime.capture(wording);

    const records = await runtime.runtime.listRecent();
    // §4.2: modal language must never be stripped or normalised on save.
    expect(records[0]?.verbatim).toBe(wording);
  });

  it('refuses empty input without writing a Record', async () => {
    const runtime = await openRuntime(scratchDatabasePath());

    const result = await runtime.runtime.capture('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe('empty_input');

    expect(await runtime.runtime.listRecent()).toHaveLength(0);
  });

  it('starts from a genuinely empty database with a normal empty state', async () => {
    const runtime = await openRuntime(scratchDatabasePath());

    // An empty timeline is a valid state, not an error and not a fabricated row.
    expect(await runtime.runtime.listRecent()).toEqual([]);
  });

  it('keeps Records across a full close and reopen of the database file', async () => {
    const location = scratchDatabasePath();

    const first = await openRuntime(location);
    await first.runtime.capture('第一条记录：今天把移动端链路接通了。');
    await first.runtime.capture('第二条记录：确认退出后数据还在。');
    expect(await first.runtime.listRecent()).toHaveLength(2);
    await first.close();

    // A brand-new adapter over the same file: this is the restart path.
    const second = await openRuntime(location);
    const reopened = await second.runtime.listRecent();

    expect(reopened).toHaveLength(2);
    expect(reopened.map((record) => record.verbatim)).toEqual([
      '第二条记录：确认退出后数据还在。',
      '第一条记录：今天把移动端链路接通了。',
    ]);
  });

  it('orders the timeline by createdAt descending, newest first', async () => {
    const runtime = await openRuntime(scratchDatabasePath());

    // Core sets Record.createdAt from capturedAt (ingest-record.ts), so the
    // ordering key IS the capture time. Capturing the earlier one second
    // proves the ordering is by createdAt and not by insertion order.
    const earlier = new Date('2026-09-01T00:00:00.000Z');
    const later = new Date('2026-09-01T00:00:01.000Z');

    await runtime.runtime.capture('时间更早的一条。', earlier);
    await runtime.runtime.capture('时间更晚的一条。', later);

    const records = await runtime.runtime.listRecent();
    expect(records.map((record) => record.verbatim)).toEqual([
      '时间更晚的一条。',
      '时间更早的一条。',
    ]);
  });

  it('keeps same-millisecond captures in newest-first order', async () => {
    const runtime = await openRuntime(scratchDatabasePath());

    // Both Records get an IDENTICAL createdAt. Without a rowid tiebreaker
    // SQLite returns equal keys in ascending rowid order even under DESC,
    // which silently reverses the batch and breaks "newest first".
    const sameInstant = new Date('2026-09-01T00:00:00.000Z');
    await runtime.runtime.capture('同毫秒写入的第一条。', sameInstant);
    await runtime.runtime.capture('同毫秒写入的第二条。', sameInstant);
    await runtime.runtime.capture('同毫秒写入的第三条。', sameInstant);

    const records = await runtime.runtime.listRecent();
    expect(records.map((record) => record.verbatim)).toEqual([
      '同毫秒写入的第三条。',
      '同毫秒写入的第二条。',
      '同毫秒写入的第一条。',
    ]);
  });

  it('keeps one Record per distinct source and re-attaches roles on read', async () => {
    const runtime = await openRuntime(scratchDatabasePath());

    await runtime.runtime.capture('同一条内容。');
    await runtime.runtime.capture('另一条内容。');

    const records = await runtime.runtime.listRecent();
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.epistemicRoles).toEqual(['user_expression']);
    }
  });

  it('reports runtime status without exposing any secret', async () => {
    const runtime = await openRuntime(scratchDatabasePath());
    const status = runtime.runtime.status();

    expect(status.platform).toBe('mobile');
    expect(status.schemaVersion).toBe(1);
    expect(status.secretStoreKeyPresent).toBe(false);
    expect(status.secretStore.status).toBe('unavailable');
    // The status object must never carry a key value.
    expect(JSON.stringify(status)).not.toMatch(/api[-_]?key["']?\s*[:=]\s*["'][^"']+["']/i);
  });
});

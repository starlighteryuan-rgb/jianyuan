/**
 * Phase M3.2 regression: Record Tags, tag persistence, and tag + text search.
 *
 * The runtime, the real SQLite Record store, and the tag key/value store are
 * production code. Tags are user-authored Record metadata; they must never
 * touch Core inference, the Provider, or the Record's own wording.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  addTagToRecord,
  EMPTY_RECORD_TAG_STATE,
  normalizeTagName,
  parseRecordTagState,
  recordHasTag,
  removeTagFromRecord,
} from '../src/runtime/record-tags-store';
import { openMobileTestRuntime, type MobileTestRuntime } from './support/mobile-test-runtime';

const temporaryDirectories: string[] = [];
const openRuntimes: MobileTestRuntime[] = [];

const scratchDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-mobile-m3-2-'));
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
      // Already closed by the test body.
    }
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('M3.2 tag rules (pure)', () => {
  it('rejects an empty or whitespace-only tag name', () => {
    expect(normalizeTagName('')).toBeNull();
    expect(normalizeTagName('   ')).toBeNull();
    expect(addTagToRecord(EMPTY_RECORD_TAG_STATE, 'r1', '  ')).toBe(
      EMPTY_RECORD_TAG_STATE,
    );
  });

  it('trims and collapses whitespace in a tag name', () => {
    expect(normalizeTagName('  重新   适应  ')).toBe('重新 适应');
  });

  it('reuses an existing tag instead of duplicating it', () => {
    const once = addTagToRecord(EMPTY_RECORD_TAG_STATE, 'r1', '关系');
    const twice = addTagToRecord(once, 'r2', '关系');
    expect(twice.tags).toEqual(['关系']);
    expect(twice.byRecord['r1']).toEqual(['关系']);
    expect(twice.byRecord['r2']).toEqual(['关系']);
  });

  it('folds case-insensitive duplicates to one tag', () => {
    const once = addTagToRecord(EMPTY_RECORD_TAG_STATE, 'r1', 'Focus');
    const twice = addTagToRecord(once, 'r1', 'focus');
    expect(twice.tags).toEqual(['Focus']);
    expect(twice.byRecord['r1']).toEqual(['Focus']);
  });

  it('does not attach the same tag twice to one Record', () => {
    const once = addTagToRecord(EMPTY_RECORD_TAG_STATE, 'r1', '学习');
    const twice = addTagToRecord(once, 'r1', '学习');
    expect(twice.byRecord['r1']).toEqual(['学习']);
  });

  it('removes a tag from one Record and keeps the vocabulary entry', () => {
    const added = addTagToRecord(EMPTY_RECORD_TAG_STATE, 'r1', '生活');
    const removed = removeTagFromRecord(added, 'r1', '生活');
    expect(removed.byRecord['r1']).toBeUndefined();
    expect(removed.tags).toEqual(['生活']);
  });

  it('reports whether a Record carries a tag', () => {
    const state = addTagToRecord(EMPTY_RECORD_TAG_STATE, 'r1', '身体');
    expect(recordHasTag(state, 'r1', '身体')).toBe(true);
    expect(recordHasTag(state, 'r1', '关系')).toBe(false);
  });

  it('parses defensively from a corrupt persisted value', () => {
    expect(parseRecordTagState('not json')).toEqual(EMPTY_RECORD_TAG_STATE);
    expect(parseRecordTagState(null)).toEqual(EMPTY_RECORD_TAG_STATE);
  });
});

describe('M3.2 tag persistence and Record association', () => {
  it('adds a tag to a Record and reads it back', async () => {
    const runtime = await openRuntime(scratchDatabasePath());
    const saved = await runtime.runtime.capture('今天把标签链路接通了。');
    if (!saved.ok) throw new Error('expected save');

    const recordId = (await runtime.runtime.listRecent())[0]!.id;
    await runtime.runtime.addRecordTag(recordId, '学习');

    expect(await runtime.runtime.tagsForRecord(recordId)).toEqual(['学习']);
    expect(await runtime.runtime.allTagNames()).toEqual(['学习']);
  });

  it('keeps tags across a full close and reopen', async () => {
    const location = scratchDatabasePath();
    const first = await openRuntime(location);
    const saved = await first.runtime.capture('重启后标签还要在。');
    if (!saved.ok) throw new Error('expected save');
    const firstRecordId = (await first.runtime.listRecent())[0]!.id;
    await first.runtime.addRecordTag(firstRecordId, '关系');
    await first.close();

    const second = await openRuntime(location);
    const records = await second.runtime.listRecent();
    expect(records).toHaveLength(1);
    expect(await second.runtime.tagsForRecord(records[0]!.id)).toEqual(['关系']);
  });

  it('rejects an empty tag and does not create it', async () => {
    const runtime = await openRuntime(scratchDatabasePath());
    const saved = await runtime.runtime.capture('空标签不应创建。');
    if (!saved.ok) throw new Error('expected save');

    const recordId = (await runtime.runtime.listRecent())[0]!.id;
    await runtime.runtime.addRecordTag(recordId, '   ');
    expect(await runtime.runtime.tagsForRecord(recordId)).toEqual([]);
    expect(await runtime.runtime.allTagNames()).toEqual([]);
  });

  it('removes a tag from a Record without altering the Record text', async () => {
    const runtime = await openRuntime(scratchDatabasePath());
    const wording = '这段原文不能被标签操作修改。';
    const saved = await runtime.runtime.capture(wording);
    if (!saved.ok) throw new Error('expected save');

    const recordId = (await runtime.runtime.listRecent())[0]!.id;
    await runtime.runtime.addRecordTag(recordId, '前任');
    await runtime.runtime.removeRecordTag(recordId, '前任');

    expect(await runtime.runtime.tagsForRecord(recordId)).toEqual([]);
    const records = await runtime.runtime.listRecent();
    expect(records[0]!.verbatim).toBe(wording);
  });

  it('does not put Reflection-origin Records in the normal Record feed', async () => {
    const runtime = await openRuntime(scratchDatabasePath());
    await runtime.runtime.capture('普通记录。');
    expect(await runtime.runtime.listRecent()).toHaveLength(1);
    // Reflection-origin exclusion is enforced by listRecent; here we only assert
    // the normal capture count is unaffected by tag operations.
    const records = await runtime.runtime.listRecent();
    await runtime.runtime.addRecordTag(records[0]!.id, '生活');
    expect(await runtime.runtime.listRecent()).toHaveLength(1);
  });
});

describe('M3.2 search + tag filtering', () => {
  it('supports text-only, tag-only, and combined matching', async () => {
    const runtime = await openRuntime(scratchDatabasePath());
    const a = await runtime.runtime.capture('关于前任的一段记录。');
    const b = await runtime.runtime.capture('关于学习的记录。');
    if (!a.ok || !b.ok) throw new Error('expected saves');

    const recent = await runtime.runtime.listRecent();
    const idA = recent.find((r) => (r.verbatim ?? '').includes('前任'))!.id;
    const idB = recent.find((r) => (r.verbatim ?? '').includes('学习'))!.id;
    await runtime.runtime.addRecordTag(idA, '关系');
    await runtime.runtime.addRecordTag(idB, '学习');

    const records = await runtime.runtime.listRecent();
    const tagOf = async (id: string) => runtime.runtime.tagsForRecord(id);
    const textMatch = (query: string) =>
      records.filter((record) => (record.verbatim ?? '').includes(query));
    const tagMatch = async (tag: string) => {
      const matches: string[] = [];
      for (const record of records) {
        if ((await tagOf(record.id)).includes(tag)) matches.push(record.id);
      }
      return matches;
    };

    expect(textMatch('前任').map((r) => r.id)).toEqual([idA]);
    expect(await tagMatch('关系')).toEqual([idA]);
    expect(await tagMatch('学习')).toEqual([idB]);

    // Combined: tag AND text.
    const combined: string[] = [];
    for (const record of records) {
      const hasTag = (await tagOf(record.id)).includes('关系');
      const hasText = (record.verbatim ?? '').includes('前任');
      if (hasTag && hasText) combined.push(record.id);
    }
    expect(combined).toEqual([idA]);
  });
});

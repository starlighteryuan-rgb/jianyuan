import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ZhihuExternalDatasetAdapter,
  type ZhihuDatasetSnapshotManifest,
} from '@/infra/external/zhihu-external-dataset-adapter';
import { createMemoryServices } from '@/server/container';
import { recordId } from '@/domain/shared/ids';

const SNAPSHOT_CAPTURED_AT = '2026-09-12T08:00:00.000Z';
const MANIFEST: ZhihuDatasetSnapshotManifest = {
  datasetId: 'zhihu-search-local',
  provider: 'zhihu',
  capturedAt: SNAPSHOT_CAPTURED_AT,
  snapshotVersion: 'v1',
};

const item = (
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ContentID: '1903044959663284716',
  ContentType: 'Answer',
  ContentText: '我会先<em>整理</em>桌面，再开始处理复杂任务。',
  Url: 'https://www.zhihu.com/answer/1903044959663284716?utm_source=test&utm_medium=openapi_platform',
  Title: '为什么开始复杂任务前会先整理？',
  EditTime: 1_748_355_858,
  AuthorName: 'external-author-secret',
  AuthorAvatar: 'https://picx.zhimg.com/external-author-secret.jpg',
  AuthorBadge: 'https://picx.zhimg.com/external-badge-secret.jpg',
  AuthorBadgeText: 'external-badge-text-secret',
  RankingScore: 0.98,
  VoteUpCount: 128,
  CommentInfoList: [{ Content: 'external-comment-secret' }],
  ...over,
});

const envelope = (items: readonly unknown[]) => ({
  Code: 0,
  Message: 'success',
  Data: {
    HasMore: false,
    SearchHashId: 'search-only-id',
    Items: items,
  },
});

describe('ZhihuExternalDatasetAdapter', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'zhihu-dataset-adapter-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const writeJson = async (name: string, value: unknown): Promise<void> => {
    await writeFile(join(directory, name), JSON.stringify(value), 'utf8');
  };

  const load = async () =>
    new ZhihuExternalDatasetAdapter().load({
      directory,
      manifest: MANIFEST,
      kind: 'experience',
    });

  it('maps valid Zhihu JSON with a valid manifest exactly', async () => {
    await writeJson('valid.json', envelope([item()]));

    const result = await load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toEqual([
      {
        url: 'https://www.zhihu.com/answer/1903044959663284716',
        provider: 'zhihu',
        kind: 'experience',
        excerpt: '我会先整理桌面，再开始处理复杂任务。',
        language: null,
        title: '为什么开始复杂任务前会先整理？',
        retrievedAt: new Date(SNAPSHOT_CAPTURED_AT),
      },
    ]);
    expect(result.value.manifest).toEqual(MANIFEST);
    expect(result.value.stats).toEqual({
      filesDiscovered: 1,
      validEnvelopes: 1,
      rejectedFiles: 0,
      itemsSeen: 1,
      validItems: 1,
      rejectedItems: 0,
      duplicateItemsCollapsed: 0,
      quarantinedItems: 0,
      conflictGroups: 0,
    });
  });

  it('fails closed on invalid JSON and keeps the diagnostic visible', async () => {
    await writeFile(join(directory, 'broken.json'), '{not-json', 'utf8');

    const result = await load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toEqual([]);
    expect(result.value.stats.rejectedFiles).toBe(1);
    expect(result.value.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'invalid_json',
        file: 'broken.json',
      }),
    ]);
  });

  it.each([
    ['invalid root', [], 'invalid_root'],
    ['missing Code', { Data: { Items: [] } }, 'invalid_code'],
    ['missing Data', { Code: 0 }, 'invalid_data'],
    ['missing Items', { Code: 0, Data: {} }, 'invalid_items'],
    ['non-zero Code', { Code: 30001, Data: { Items: [] } }, 'api_error'],
  ])('rejects a file with %s', async (_label, source, code) => {
    await writeJson('invalid-envelope.json', source);

    const result = await load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toEqual([]);
    expect(result.value.stats.rejectedFiles).toBe(1);
    expect(result.value.diagnostics).toEqual([
      expect.objectContaining({ code }),
    ]);
  });

  it.each(['ContentID', 'ContentType', 'Url', 'Title', 'ContentText'])(
    'rejects an item missing required field %s',
    async (field) => {
      const source = item();
      delete source[field];
      await writeJson('missing-field.json', envelope([source]));

      const result = await load();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.candidates).toEqual([]);
      expect(result.value.stats.rejectedItems).toBe(1);
      expect(result.value.diagnostics).toEqual([
        expect.objectContaining({ code: 'invalid_item', itemIndex: 0 }),
      ]);
    },
  );

  it('isolates author metadata and comments from the candidate', async () => {
    await writeJson('isolated.json', envelope([item()]));

    const result = await load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.value);
    expect(serialized).not.toContain('external-author-secret');
    expect(serialized).not.toContain('external-badge-secret');
    expect(serialized).not.toContain('external-badge-text-secret');
    expect(serialized).not.toContain('external-comment-secret');
    expect(result.value.candidates[0]?.excerpt).toBe(
      '我会先整理桌面，再开始处理复杂任务。',
    );
  });

  it('collapses duplicate ContentID entries using normalized ContentType', async () => {
    await writeJson(
      'duplicates.json',
      envelope([
        item({ ContentType: ' Answer ' }),
        item({ ContentType: 'answer' }),
      ]),
    );

    const result = await load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toHaveLength(1);
    expect(result.value.stats.duplicateItemsCollapsed).toBe(1);
    expect(result.value.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'info',
        code: 'duplicate_collapsed',
        identityKey: 'zhihu:answer:1903044959663284716',
      }),
    ]);
  });

  it('chooses the latest EditTime snapshot without using it as retrievedAt', async () => {
    await writeJson(
      'revisions.json',
      envelope([
        item({ ContentText: '旧摘要', EditTime: 100 }),
        item({ ContentText: '新摘要', EditTime: 200 }),
      ]),
    );

    const result = await load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toHaveLength(1);
    expect(result.value.candidates[0]?.excerpt).toBe('新摘要');
    expect(result.value.candidates[0]?.retrievedAt).toEqual(
      new Date(SNAPSHOT_CAPTURED_AT),
    );
  });

  it('quarantines conflicting duplicate excerpts at the selected EditTime', async () => {
    await writeJson(
      'conflict.json',
      envelope([
        item({ ContentText: '摘要 A' }),
        item({ ContentText: '摘要 B' }),
      ]),
    );

    const result = await load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toEqual([]);
    expect(result.value.stats.quarantinedItems).toBe(2);
    expect(result.value.stats.conflictGroups).toBe(1);
    expect(result.value.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'ambiguous_duplicate',
      }),
    ]);
  });

  it('quarantines one ContentID that points to different canonical URLs', async () => {
    await writeJson(
      'url-conflict.json',
      envelope([
        item(),
        item({ Url: 'https://www.zhihu.com/answer/999999' }),
      ]),
    );

    const result = await load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toEqual([]);
    expect(result.value.diagnostics).toEqual([
      expect.objectContaining({ code: 'identity_url_conflict' }),
    ]);
  });

  it('quarantines one canonical URL that points to different identities', async () => {
    await writeJson(
      'identity-conflict.json',
      envelope([
        item(),
        item({ ContentID: 'different-content-id' }),
      ]),
    );

    const result = await load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toEqual([]);
    expect(result.value.stats.conflictGroups).toBe(2);
    expect(result.value.diagnostics).toEqual([
      expect.objectContaining({ code: 'url_identity_conflict' }),
      expect.objectContaining({ code: 'url_identity_conflict' }),
    ]);
  });

  it('rejects a manifest with a missing snapshot timestamp', async () => {
    await writeJson('valid.json', envelope([item()]));

    const result = await new ZhihuExternalDatasetAdapter().load({
      directory,
      manifest: {
        datasetId: MANIFEST.datasetId,
        provider: MANIFEST.provider,
        snapshotVersion: MANIFEST.snapshotVersion,
      } as unknown as ZhihuDatasetSnapshotManifest,
      kind: 'experience',
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'missing_snapshot_capture_time',
        detail: 'Manifest capturedAt is required.',
      },
    });
  });

  it.each(['not-a-timestamp', '2026-02-31T08:00:00.000Z'])(
    'rejects a manifest with invalid snapshot timestamp %s',
    async (capturedAt) => {
      await writeJson('valid.json', envelope([item()]));

      const result = await new ZhihuExternalDatasetAdapter().load({
        directory,
        manifest: { ...MANIFEST, capturedAt },
        kind: 'experience',
      });

      expect(result).toEqual({
        ok: false,
        error: {
          kind: 'invalid_snapshot_capture_time',
          detail:
            'Manifest capturedAt must be a valid ISO 8601 timestamp with an explicit timezone.',
        },
      });
    },
  );

  it.each([
    ['datasetId', { ...MANIFEST, datasetId: '   ' }],
    ['provider', { ...MANIFEST, provider: 'other' }],
    ['snapshotVersion', { ...MANIFEST, snapshotVersion: '' }],
  ])('rejects an invalid manifest %s', async (field, manifest) => {
    await writeJson('valid.json', envelope([item()]));

    const result = await new ZhihuExternalDatasetAdapter().load({
      directory,
      manifest,
      kind: 'experience',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ kind: 'invalid_manifest', field }),
      }),
    );
  });

  it('returns deterministic output for the same files and manifest', async () => {
    await writeJson('b.json', envelope([item({ ContentID: 'b', Url: 'https://www.zhihu.com/answer/b' })]));
    await writeJson('a.json', envelope([item({ ContentID: 'a', Url: 'https://www.zhihu.com/answer/a' })]));
    const adapter = new ZhihuExternalDatasetAdapter();
    const request = {
      directory,
      manifest: MANIFEST,
      kind: 'experience' as const,
    };

    const first = await adapter.load(request);
    const second = await adapter.load(request);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.candidates.map((candidate) => candidate.url)).toEqual([
      'https://www.zhihu.com/answer/a',
      'https://www.zhihu.com/answer/b',
    ]);
    expect(first.value.candidates.every(
      (candidate) => candidate.retrievedAt.toISOString() === MANIFEST.capturedAt,
    )).toBe(true);
  });

  it('keeps sourceFingerprint, evidenceUnitId, and application writes outside its result and side effects', async () => {
    await writeJson('valid.json', envelope([item()]));
    const services = createMemoryServices();

    const result = await load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty('sourceFingerprint');
    expect(result.value).not.toHaveProperty('evidenceUnitId');
    expect(result.value.candidates[0]).not.toHaveProperty('sourceFingerprint');
    expect(result.value.candidates[0]).not.toHaveProperty('evidenceUnitId');
    expect(await services.repositories.records.listRecent(10)).toEqual([]);
    expect(await services.repositories.claims.listAll(10)).toEqual([]);
    expect(await services.repositories.hypotheses.listAll()).toEqual([]);
    expect(
      await services.repositories.discoveries.findByStableKey('unrelated'),
    ).toBeNull();
    expect(
      await services.repositories.reflectionRecords.listByRecord(
        recordId('unrelated'),
      ),
    ).toEqual([]);
  });
});

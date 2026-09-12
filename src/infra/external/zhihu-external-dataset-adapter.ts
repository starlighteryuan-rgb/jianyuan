/**
 * Read-only adapter for a local Zhihu search JSON dataset.
 *
 * The adapter ends at validated `RetrievedExternalReference` candidates. It
 * has no application-service dependency and therefore cannot import, ingest,
 * create Records/Evidence Units, or trigger semantic pipelines.
 */

import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

import {
  EXTERNAL_REFERENCE_KINDS,
  type ExternalReferenceKind,
  type RetrievedExternalReference,
} from '../../domain/external/external-reference';
import { type Result, err, ok } from '../../domain/shared/result';
import {
  ZHIHU_EXTERNAL_PROVIDER,
  canonicalizeZhihuUrl,
  sanitizeZhihuSearchExcerpt,
} from './zhihu-external-adapter';

export interface ZhihuDatasetLoadRequest {
  readonly directory: string;
  readonly manifest: ZhihuDatasetSnapshotManifest;
  /** Explicit retrieval intent; never inferred from platform metadata. */
  readonly kind: ExternalReferenceKind;
}

/** Serializable metadata that identifies one immutable local dataset snapshot. */
export interface ZhihuDatasetSnapshotManifest {
  readonly datasetId: string;
  readonly provider: string;
  /** ISO 8601 timestamp with an explicit timezone. */
  readonly capturedAt: string;
  readonly snapshotVersion: string;
}

export interface ValidatedZhihuDatasetSnapshotManifest {
  readonly datasetId: string;
  readonly provider: typeof ZHIHU_EXTERNAL_PROVIDER;
  /** Canonical UTC ISO representation. */
  readonly capturedAt: string;
  readonly snapshotVersion: string;
}

export type ZhihuDatasetDiagnosticCode =
  | 'read_failed'
  | 'invalid_json'
  | 'invalid_root'
  | 'invalid_code'
  | 'api_error'
  | 'invalid_data'
  | 'invalid_items'
  | 'invalid_item'
  | 'invalid_edit_time'
  | 'symlink_skipped'
  | 'duplicate_collapsed'
  | 'identity_url_conflict'
  | 'url_identity_conflict'
  | 'ambiguous_duplicate';

export interface ZhihuDatasetDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: ZhihuDatasetDiagnosticCode;
  /** Dataset-relative location. Raw content values are never included. */
  readonly file: string;
  readonly itemIndex: number | null;
  /** Adapter-local identity only; never provenance or Evidence identity. */
  readonly identityKey: string | null;
  readonly detail: string;
}

export interface ZhihuDatasetLoadStats {
  readonly filesDiscovered: number;
  readonly validEnvelopes: number;
  readonly rejectedFiles: number;
  readonly itemsSeen: number;
  readonly validItems: number;
  readonly rejectedItems: number;
  readonly duplicateItemsCollapsed: number;
  readonly quarantinedItems: number;
  readonly conflictGroups: number;
}

export interface ZhihuDatasetLoadOutcome {
  readonly manifest: ValidatedZhihuDatasetSnapshotManifest;
  readonly candidates: readonly RetrievedExternalReference[];
  readonly diagnostics: readonly ZhihuDatasetDiagnostic[];
  readonly stats: ZhihuDatasetLoadStats;
}

export type ZhihuDatasetLoadError =
  | {
      readonly kind: 'invalid_manifest';
      readonly field:
        | 'manifest'
        | 'datasetId'
        | 'provider'
        | 'snapshotVersion';
      readonly detail: string;
    }
  | {
      readonly kind: 'missing_snapshot_capture_time';
      readonly detail: string;
    }
  | {
      readonly kind: 'invalid_snapshot_capture_time';
      readonly detail: string;
    }
  | {
      readonly kind: 'invalid_reference_kind';
      readonly detail: string;
    }
  | {
      readonly kind: 'dataset_unreadable';
      readonly directory: string;
      readonly detail: string;
    };

interface SourceLocation {
  readonly file: string;
  readonly itemIndex: number;
}

interface ValidatedItem {
  readonly identityKey: string;
  readonly canonicalUrl: string;
  readonly title: string | null;
  readonly excerpt: string;
  readonly editTime: number | null;
  readonly location: SourceLocation;
}

interface MutableStats {
  filesDiscovered: number;
  validEnvelopes: number;
  rejectedFiles: number;
  itemsSeen: number;
  validItems: number;
  rejectedItems: number;
  duplicateItemsCollapsed: number;
  quarantinedItems: number;
  conflictGroups: number;
}

interface ParsedManifest {
  readonly value: ValidatedZhihuDatasetSnapshotManifest;
  readonly capturedAtMs: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ISO_TIMESTAMP_WITH_TIMEZONE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;

const isValidManifestTimestamp = (value: string): boolean => {
  const match = ISO_TIMESTAMP_WITH_TIMEZONE.exec(value);
  if (match === null) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[9] === undefined ? 0 : Number(match[9]);
  const offsetMinute = match[10] === undefined ? 0 : Number(match[10]);

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    return false;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth && !Number.isNaN(Date.parse(value));
};

const validateManifest = (
  value: unknown,
): Result<ParsedManifest, ZhihuDatasetLoadError> => {
  if (!isObject(value)) {
    return err({
      kind: 'invalid_manifest',
      field: 'manifest',
      detail: 'A dataset snapshot manifest is required.',
    });
  }

  if (typeof value.datasetId !== 'string' || value.datasetId.trim().length === 0) {
    return err({
      kind: 'invalid_manifest',
      field: 'datasetId',
      detail: 'Manifest datasetId must be a non-empty string.',
    });
  }

  if (value.provider !== ZHIHU_EXTERNAL_PROVIDER) {
    return err({
      kind: 'invalid_manifest',
      field: 'provider',
      detail: 'Manifest provider must be exactly "zhihu".',
    });
  }

  if (
    typeof value.snapshotVersion !== 'string' ||
    value.snapshotVersion.trim().length === 0
  ) {
    return err({
      kind: 'invalid_manifest',
      field: 'snapshotVersion',
      detail: 'Manifest snapshotVersion must be a non-empty string.',
    });
  }

  if (
    value.capturedAt === undefined ||
    value.capturedAt === null ||
    (typeof value.capturedAt === 'string' && value.capturedAt.trim().length === 0)
  ) {
    return err({
      kind: 'missing_snapshot_capture_time',
      detail: 'Manifest capturedAt is required.',
    });
  }

  if (
    typeof value.capturedAt !== 'string' ||
    !isValidManifestTimestamp(value.capturedAt)
  ) {
    return err({
      kind: 'invalid_snapshot_capture_time',
      detail: 'Manifest capturedAt must be a valid ISO 8601 timestamp with an explicit timezone.',
    });
  }

  const capturedAtMs = Date.parse(value.capturedAt);
  return ok({
    value: {
      datasetId: value.datasetId.trim(),
      provider: ZHIHU_EXTERNAL_PROVIDER,
      capturedAt: new Date(capturedAtMs).toISOString(),
      snapshotVersion: value.snapshotVersion.trim(),
    },
    capturedAtMs,
  });
};

const diagnostic = (
  severity: ZhihuDatasetDiagnostic['severity'],
  code: ZhihuDatasetDiagnosticCode,
  file: string,
  itemIndex: number | null,
  identityKey: string | null,
  detail: string,
): ZhihuDatasetDiagnostic => ({
  severity,
  code,
  file,
  itemIndex,
  identityKey,
  detail,
});

const portableRelativePath = (root: string, path: string): string =>
  relative(root, path).replaceAll('\\', '/');

const listJsonFiles = async (
  root: string,
  diagnostics: ZhihuDatasetDiagnostic[],
): Promise<readonly string[]> => {
  const files: string[] = [];

  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        diagnostics.push(
          diagnostic(
            'warning',
            'symlink_skipped',
            portableRelativePath(root, path),
            null,
            null,
            'Symbolic links are not followed by the read-only dataset adapter.',
          ),
        );
      } else if (entry.isDirectory()) {
        await visit(path);
      } else if (
        entry.isFile() &&
        extname(entry.name).toLowerCase() === '.json'
      ) {
        files.push(path);
      }
    }
  };

  await visit(root);
  return files;
};

const normalizeContentType = (value: string): string =>
  value.trim().toLowerCase();

const mappedPayloadKey = (item: ValidatedItem): string =>
  JSON.stringify([item.canonicalUrl, item.title, item.excerpt]);

const validateItem = (
  value: unknown,
  location: SourceLocation,
  diagnostics: ZhihuDatasetDiagnostic[],
): ValidatedItem | null => {
  if (!isObject(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid_item',
        location.file,
        location.itemIndex,
        null,
        'Item must be a JSON object.',
      ),
    );
    return null;
  }

  if (
    typeof value.ContentID !== 'string' ||
    value.ContentID.trim().length === 0 ||
    typeof value.ContentType !== 'string' ||
    normalizeContentType(value.ContentType).length === 0 ||
    typeof value.Url !== 'string' ||
    typeof value.Title !== 'string' ||
    typeof value.ContentText !== 'string'
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid_item',
        location.file,
        location.itemIndex,
        null,
        'Item is missing a valid ContentID, ContentType, Url, Title, or ContentText.',
      ),
    );
    return null;
  }

  const contentType = normalizeContentType(value.ContentType);
  const identityKey = `zhihu:${contentType}:${value.ContentID}`;
  const canonicalUrl = canonicalizeZhihuUrl(value.Url);
  if (!canonicalUrl.ok) {
    const detail =
      canonicalUrl.error.kind === 'api_error'
        ? canonicalUrl.error.message
        : canonicalUrl.error.detail;
    diagnostics.push(
      diagnostic(
        'error',
        'invalid_item',
        location.file,
        location.itemIndex,
        identityKey,
        detail,
      ),
    );
    return null;
  }

  const excerpt = sanitizeZhihuSearchExcerpt(value.ContentText);
  if (excerpt.trim().length === 0) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid_item',
        location.file,
        location.itemIndex,
        identityKey,
        'ContentText is empty after removing search-highlight markup.',
      ),
    );
    return null;
  }

  const editTime =
    typeof value.EditTime === 'number' &&
    Number.isInteger(value.EditTime) &&
    value.EditTime >= 0
      ? value.EditTime
      : null;

  if (editTime === null) {
    diagnostics.push(
      diagnostic(
        'warning',
        'invalid_edit_time',
        location.file,
        location.itemIndex,
        identityKey,
        'EditTime is unavailable or invalid; it will not be replaced or mapped to Domain time.',
      ),
    );
  }

  return {
    identityKey,
    canonicalUrl: canonicalUrl.value,
    title: value.Title.trim().length === 0 ? null : value.Title,
    excerpt,
    editTime,
    location,
  };
};

const validateEnvelope = (
  value: unknown,
  file: string,
  diagnostics: ZhihuDatasetDiagnostic[],
): readonly unknown[] | null => {
  if (!isObject(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid_root',
        file,
        null,
        null,
        'JSON root must be an object.',
      ),
    );
    return null;
  }

  if (typeof value.Code !== 'number' || !Number.isFinite(value.Code)) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid_code',
        file,
        null,
        null,
        'Root Code must be a finite number.',
      ),
    );
    return null;
  }

  if (value.Code !== 0) {
    diagnostics.push(
      diagnostic(
        'error',
        'api_error',
        file,
        null,
        null,
        `Root Code is non-zero (${String(value.Code)}); the file is rejected.`,
      ),
    );
    return null;
  }

  if (!isObject(value.Data)) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid_data',
        file,
        null,
        null,
        'Root Data must be an object.',
      ),
    );
    return null;
  }

  if (!Array.isArray(value.Data.Items)) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid_items',
        file,
        null,
        null,
        'Data.Items must be an array.',
      ),
    );
    return null;
  }

  return value.Data.Items;
};

const selectCandidate = (
  group: readonly ValidatedItem[],
): { readonly selected: ValidatedItem | null; readonly ambiguous: boolean } => {
  const validEditTimes = group
    .map((item) => item.editTime)
    .filter((value): value is number => value !== null);

  const selectedPool =
    validEditTimes.length === 0
      ? group
      : group.filter((item) => item.editTime === Math.max(...validEditTimes));

  const payloadKeys = new Set(selectedPool.map(mappedPayloadKey));
  if (payloadKeys.size !== 1) return { selected: null, ambiguous: true };

  return { selected: selectedPool[0] ?? null, ambiguous: false };
};

const deduplicate = (
  items: readonly ValidatedItem[],
  manifestCapturedAtMs: number,
  kind: ExternalReferenceKind,
  diagnostics: ZhihuDatasetDiagnostic[],
  stats: MutableStats,
): readonly RetrievedExternalReference[] => {
  const byIdentity = new Map<string, ValidatedItem[]>();
  const identitiesByUrl = new Map<string, Set<string>>();

  for (const item of items) {
    const group = byIdentity.get(item.identityKey) ?? [];
    group.push(item);
    byIdentity.set(item.identityKey, group);

    const identities = identitiesByUrl.get(item.canonicalUrl) ?? new Set();
    identities.add(item.identityKey);
    identitiesByUrl.set(item.canonicalUrl, identities);
  }

  const conflictingIdentities = new Set<string>();
  for (const [identityKey, group] of byIdentity) {
    if (new Set(group.map((item) => item.canonicalUrl)).size > 1) {
      conflictingIdentities.add(identityKey);
      const first = group[0];
      diagnostics.push(
        diagnostic(
          'error',
          'identity_url_conflict',
          first?.location.file ?? '',
          first?.location.itemIndex ?? null,
          identityKey,
          'One adapter-local identity points to multiple canonical URLs; the group is quarantined.',
        ),
      );
    }
  }

  for (const identities of identitiesByUrl.values()) {
    if (identities.size <= 1) continue;
    for (const identityKey of identities) {
      if (conflictingIdentities.has(identityKey)) continue;
      conflictingIdentities.add(identityKey);
      const first = byIdentity.get(identityKey)?.[0];
      diagnostics.push(
        diagnostic(
          'error',
          'url_identity_conflict',
          first?.location.file ?? '',
          first?.location.itemIndex ?? null,
          identityKey,
          'One canonical URL points to multiple adapter-local identities; the group is quarantined.',
        ),
      );
    }
  }

  const references: RetrievedExternalReference[] = [];
  const orderedGroups = [...byIdentity.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );

  for (const [identityKey, group] of orderedGroups) {
    const first = group[0];
    if (conflictingIdentities.has(identityKey)) {
      stats.conflictGroups += 1;
      stats.quarantinedItems += group.length;
      continue;
    }

    const selection = selectCandidate(group);
    if (selection.ambiguous || selection.selected === null) {
      stats.conflictGroups += 1;
      stats.quarantinedItems += group.length;
      diagnostics.push(
        diagnostic(
          'error',
          'ambiguous_duplicate',
          first?.location.file ?? '',
          first?.location.itemIndex ?? null,
          identityKey,
          'Duplicate identity has different mapped payloads at the selected EditTime; the group is quarantined.',
        ),
      );
      continue;
    }

    if (group.length > 1) {
      stats.duplicateItemsCollapsed += group.length - 1;
      diagnostics.push(
        diagnostic(
          'info',
          'duplicate_collapsed',
          first?.location.file ?? '',
          first?.location.itemIndex ?? null,
          identityKey,
          `${String(group.length)} dataset entries collapsed to one candidate.`,
        ),
      );
    }

    references.push({
      url: selection.selected.canonicalUrl,
      provider: ZHIHU_EXTERNAL_PROVIDER,
      kind,
      excerpt: selection.selected.excerpt,
      language: null,
      title: selection.selected.title,
      retrievedAt: new Date(manifestCapturedAtMs),
    });
  }

  return references;
};

export class ZhihuExternalDatasetAdapter {
  /**
   * Read and map one immutable local dataset snapshot.
   *
   * Invalid files/items are excluded and returned as diagnostics. Configuration
   * or directory-access failures return an outer error before any candidate can
   * be produced.
   */
  async load(
    request: ZhihuDatasetLoadRequest,
  ): Promise<Result<ZhihuDatasetLoadOutcome, ZhihuDatasetLoadError>> {
    const manifest = validateManifest(request.manifest);
    if (!manifest.ok) return manifest;

    if (!EXTERNAL_REFERENCE_KINDS.includes(request.kind)) {
      return err({
        kind: 'invalid_reference_kind',
        detail: 'External Reference kind must be supplied explicitly.',
      });
    }

    const root = resolve(request.directory);
    const diagnostics: ZhihuDatasetDiagnostic[] = [];
    let files: readonly string[];
    try {
      files = await listJsonFiles(root, diagnostics);
    } catch {
      return err({
        kind: 'dataset_unreadable',
        directory: root,
        detail: 'The local Zhihu dataset directory could not be read.',
      });
    }

    const stats: MutableStats = {
      filesDiscovered: files.length,
      validEnvelopes: 0,
      rejectedFiles: 0,
      itemsSeen: 0,
      validItems: 0,
      rejectedItems: 0,
      duplicateItemsCollapsed: 0,
      quarantinedItems: 0,
      conflictGroups: 0,
    };
    const validItems: ValidatedItem[] = [];

    for (const path of files) {
      const file = portableRelativePath(root, path);
      let raw: string;
      try {
        raw = await readFile(path, 'utf8');
      } catch {
        stats.rejectedFiles += 1;
        diagnostics.push(
          diagnostic(
            'error',
            'read_failed',
            file,
            null,
            null,
            'JSON file could not be read.',
          ),
        );
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        stats.rejectedFiles += 1;
        diagnostics.push(
          diagnostic(
            'error',
            'invalid_json',
            file,
            null,
            null,
            'File is not valid JSON.',
          ),
        );
        continue;
      }

      const items = validateEnvelope(parsed, file, diagnostics);
      if (items === null) {
        stats.rejectedFiles += 1;
        continue;
      }

      stats.validEnvelopes += 1;
      stats.itemsSeen += items.length;
      for (let index = 0; index < items.length; index += 1) {
        const item = validateItem(items[index], { file, itemIndex: index }, diagnostics);
        if (item === null) {
          stats.rejectedItems += 1;
        } else {
          stats.validItems += 1;
          validItems.push(item);
        }
      }
    }

    const candidates = deduplicate(
      validItems,
      manifest.value.capturedAtMs,
      request.kind,
      diagnostics,
      stats,
    );

    return ok({
      manifest: manifest.value.value,
      candidates,
      diagnostics,
      stats,
    });
  }
}

/**
 * Zhihu External Dataset Adapter.
 *
 * This module is deliberately outside the Domain and application layers. It
 * knows the Zhihu HTTP contract and maps that contract into the already
 * existing `RetrievedExternalReference` boundary object. It does not ingest a
 * Record, assign epistemic roles, mint evidence identity, or compute a source
 * fingerprint. Those responsibilities remain on the existing
 * `ExternalReferenceService -> IngestionService` path.
 */

import type {
  ExternalReferenceKind,
  RetrievedExternalReference,
} from '../../domain/external/external-reference';
import { type Result, err, ok } from '../../domain/shared/result';

export const ZHIHU_EXTERNAL_PROVIDER = 'zhihu' as const;
export const ZHIHU_SEARCH_ENDPOINT =
  'https://developer.zhihu.com/api/v1/content/zhihu_search';

const DEFAULT_COUNT = 10;
const MAX_COUNT = 10;

interface ZhihuHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type ZhihuFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<ZhihuHttpResponse>;

export interface ZhihuExternalAdapterDeps {
  /** Supplied by composition/configuration; never read from Domain state. */
  readonly accessSecret: string;
  readonly fetch?: ZhihuFetch;
  readonly now?: () => Date;
}

export interface ZhihuSearchRequest {
  readonly query: string;
  readonly count?: number;
  /**
   * Explicit retrieval intent, not a semantic classification inferred from
   * popularity, author badges, or authority metadata.
   */
  readonly kind: ExternalReferenceKind;
}

export interface ZhihuSearchOutcome {
  readonly references: readonly RetrievedExternalReference[];
  readonly searchHashId: string;
  readonly hasMore: boolean;
}

export type ZhihuExternalAdapterError =
  | {
      readonly kind: 'invalid_request';
      readonly field: 'accessSecret' | 'query' | 'count' | 'clock';
      readonly detail: string;
    }
  | {
      readonly kind: 'request_failed';
      readonly detail: string;
    }
  | {
      readonly kind: 'http_error';
      readonly status: number;
      readonly detail: string;
    }
  | {
      readonly kind: 'api_error';
      readonly code: number;
      readonly message: string;
    }
  | {
      readonly kind: 'invalid_response';
      readonly detail: string;
    };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const sanitizeZhihuSearchExcerpt = (value: string): string =>
  value.replaceAll('<em>', '').replaceAll('</em>', '');

/**
 * Zhihu search URLs carry Open Platform attribution parameters. They identify
 * the same content object, so the adapter removes only `utm_*` transport
 * metadata before the URL becomes a traceable `sourceRef`. No content identity
 * algorithm is changed here.
 */
export const canonicalizeZhihuUrl = (
  raw: string,
): Result<string, ZhihuExternalAdapterError> => {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    return err({
      kind: 'invalid_response',
      detail: 'Zhihu returned a content item with an invalid URL.',
    });
  }

  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== 'https:' ||
    (host !== 'zhihu.com' && !host.endsWith('.zhihu.com'))
  ) {
    return err({
      kind: 'invalid_response',
      detail: 'Zhihu returned a content item outside the HTTPS zhihu.com boundary.',
    });
  }

  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_')) parsed.searchParams.delete(key);
  }
  parsed.hash = '';

  return ok(parsed.toString());
};

const mapItem = (
  value: unknown,
  kind: ExternalReferenceKind,
  retrievedAt: Date,
): Result<RetrievedExternalReference, ZhihuExternalAdapterError> => {
  if (!isObject(value)) {
    return err({
      kind: 'invalid_response',
      detail: 'Zhihu returned a non-object search item.',
    });
  }

  if (
    typeof value.Title !== 'string' ||
    typeof value.ContentText !== 'string' ||
    typeof value.Url !== 'string'
  ) {
    return err({
      kind: 'invalid_response',
      detail: 'Zhihu returned a search item without Title, ContentText, or Url.',
    });
  }

  const canonicalUrl = canonicalizeZhihuUrl(value.Url);
  if (!canonicalUrl.ok) return canonicalUrl;

  return ok({
    url: canonicalUrl.value,
    provider: ZHIHU_EXTERNAL_PROVIDER,
    kind,
    // Remove only API search-highlight markup; the source wording is otherwise
    // preserved exactly and is never summarized again by this adapter.
    excerpt: sanitizeZhihuSearchExcerpt(value.ContentText),
    // The search API supplies no language field. §4.2 requires `null`, not a
    // guess based on script or platform.
    language: null,
    title: value.Title.trim().length === 0 ? null : value.Title,
    // EditTime is intentionally ignored. Publication/edit time is not an event
    // time about the user; this is the time our adapter retrieved the item.
    retrievedAt,
  });
};

export class ZhihuExternalAdapter {
  private readonly fetcher: ZhihuFetch;
  private readonly clock: () => Date;

  constructor(private readonly deps: ZhihuExternalAdapterDeps) {
    this.fetcher = deps.fetch ?? globalThis.fetch;
    this.clock = deps.now ?? (() => new Date());
  }

  /**
   * Search Zhihu and return quarantined external-reference inputs.
   *
   * The result is not stored automatically. A caller must explicitly pass a
   * selected reference to `ExternalReferenceService.import`, preserving the
   * existing pull-only and storage-permission boundaries.
   */
  async search(
    request: ZhihuSearchRequest,
  ): Promise<Result<ZhihuSearchOutcome, ZhihuExternalAdapterError>> {
    const secret = this.deps.accessSecret.trim();
    if (secret.length === 0) {
      return err({
        kind: 'invalid_request',
        field: 'accessSecret',
        detail: 'A Zhihu Access Secret is required.',
      });
    }

    const query = request.query.trim();
    if (query.length === 0) {
      return err({
        kind: 'invalid_request',
        field: 'query',
        detail: 'Zhihu search query must not be empty.',
      });
    }

    const count = request.count ?? DEFAULT_COUNT;
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
      return err({
        kind: 'invalid_request',
        field: 'count',
        detail: `Zhihu search count must be an integer from 1 to ${MAX_COUNT}.`,
      });
    }

    const requestedAt = this.clock();
    if (Number.isNaN(requestedAt.getTime())) {
      return err({
        kind: 'invalid_request',
        field: 'clock',
        detail: 'The adapter clock returned an invalid retrieval time.',
      });
    }

    const url = new URL(ZHIHU_SEARCH_ENDPOINT);
    url.searchParams.set('Query', query);
    url.searchParams.set('Count', String(count));

    let response: ZhihuHttpResponse;
    try {
      response = await this.fetcher(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secret}`,
          'X-Request-Timestamp': String(
            Math.floor(requestedAt.getTime() / 1_000),
          ),
          'Content-Type': 'application/json',
        },
      });
    } catch (cause) {
      return err({
        kind: 'request_failed',
        detail:
          cause instanceof Error
            ? `Zhihu search request failed: ${cause.message}`
            : 'Zhihu search request failed.',
      });
    }

    if (!response.ok) {
      return err({
        kind: 'http_error',
        status: response.status,
        detail: `Zhihu search returned HTTP ${response.status}.`,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return err({
        kind: 'invalid_response',
        detail: 'Zhihu search returned a non-JSON response.',
      });
    }

    if (!isObject(payload) || typeof payload.Code !== 'number') {
      return err({
        kind: 'invalid_response',
        detail: 'Zhihu search response is missing its numeric Code.',
      });
    }

    if (payload.Code !== 0) {
      return err({
        kind: 'api_error',
        code: payload.Code,
        message:
          typeof payload.Message === 'string'
            ? payload.Message
            : 'Zhihu API request failed.',
      });
    }

    if (!isObject(payload.Data) || !Array.isArray(payload.Data.Items)) {
      return err({
        kind: 'invalid_response',
        detail: 'Zhihu search response is missing Data.Items.',
      });
    }

    if (
      typeof payload.Data.SearchHashId !== 'string' ||
      typeof payload.Data.HasMore !== 'boolean'
    ) {
      return err({
        kind: 'invalid_response',
        detail: 'Zhihu search response is missing SearchHashId or HasMore.',
      });
    }

    const references: RetrievedExternalReference[] = [];
    for (const item of payload.Data.Items) {
      const mapped = mapItem(item, request.kind, requestedAt);
      if (!mapped.ok) return mapped;
      references.push(mapped.value);
    }

    return ok({
      references,
      searchHashId: payload.Data.SearchHashId,
      hasMore: payload.Data.HasMore,
    });
  }
}

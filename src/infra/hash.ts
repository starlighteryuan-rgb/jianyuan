/**
 * Hashing adapter.
 *
 * Lives in `infra` because it uses a platform API. The domain declares the
 * `HashFn` shape it needs (src/domain/ingestion/source-fingerprint.ts) and
 * receives an implementation, so the domain core stays free of Node built-ins.
 */

import { createHash } from 'node:crypto';

import type { HashFn } from '../domain/ingestion/source-fingerprint';

/** Deterministic SHA-256, hex encoded. */
export const sha256: HashFn = (canonical: string): string =>
  createHash('sha256').update(canonical, 'utf8').digest('hex');

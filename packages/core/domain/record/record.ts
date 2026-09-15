/**
 * Record (ENGINEERING_CONTRACT §4, §4.1, §4.2; docs/architecture.md §4).
 *
 * Structural commitments enforced by these types:
 *   - `sourceFingerprint` and `evidenceUnitId` are DIFFERENT branded types.
 *     Ingestion dedup identity can never be passed where evidence-independence
 *     identity is expected (INV-16, Patch 2).
 *   - A Record carries 0..N epistemic roles, held as a separate collection
 *     rather than one enum column (Patch 1).
 *   - A Record carries EXACTLY ONE evidenceUnitId (Patch 2).
 *   - Raw user wording is preserved verbatim, with modal language intact
 *     (§4.2).
 */

import type {
  EvidenceUnitId,
  RecordId,
  SourceFingerprint,
} from '../shared/ids';
import type { Provenance } from '../shared/provenance';
import type { TimeAssertion } from '../shared/time-semantics';
import type { EpistemicRole } from '../shared/enums';

/**
 * Raw expression preservation (ENGINEERING_CONTRACT §4.2).
 *
 * `verbatim` must hold the user's original wording. Modal markers such as
 * 可能 / 好像 / 我觉得 / 不知道 / 也许 must NOT be stripped. "我可能是因为……"
 * must never be normalized into "用户是因为……".
 */
export interface RawExpression {
  readonly verbatim: string;
  readonly language: string;
}

export interface PersonalRecord {
  readonly id: RecordId;

  /** Ingestion dedup only. Same raw source re-ingested → same Record. */
  readonly sourceFingerprint: SourceFingerprint;

  /** Evidence-independence identity. Exactly one per Record. */
  readonly evidenceUnitId: EvidenceUnitId;

  /** 0..N roles. Never collapsed to a single value (Patch 1). */
  readonly epistemicRoles: readonly EpistemicRole[];

  readonly provenance: Provenance;
  readonly time: TimeAssertion;

  /** Present whenever the source was an utterance. */
  readonly rawExpression: RawExpression | null;

  readonly createdAt: Date;
}

/**
 * Two records share an Evidence Unit iff their evidenceUnitIds are equal.
 *
 * Note what this deliberately does NOT consult: epistemic roles, record ids,
 * provenance, or how many times the pair was surfaced to the user.
 */
export const sharesEvidenceUnit = (
  a: Pick<PersonalRecord, 'evidenceUnitId'>,
  b: Pick<PersonalRecord, 'evidenceUnitId'>,
): boolean => a.evidenceUnitId === b.evidenceUnitId;

/**
 * Distinct Evidence Units across a record set — the quantity that matters for
 * Independent Support, never `records.length` (ENGINEERING_CONTRACT §10.2).
 */
export const distinctEvidenceUnitCount = (
  records: readonly Pick<PersonalRecord, 'evidenceUnitId'>[],
): number => new Set<string>(records.map((r) => r.evidenceUnitId)).size;

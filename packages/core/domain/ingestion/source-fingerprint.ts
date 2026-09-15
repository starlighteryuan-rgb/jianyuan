/**
 * Source fingerprint composition (docs/architecture.md §4, Patch 2).
 *
 * `sourceFingerprint` answers exactly ONE question:
 *
 *   "Have I already ingested this same raw source material?"
 *
 * It is INGESTION DEDUP ONLY. It is emphatically not an evidence-independence
 * claim — that is `evidenceUnitId`, a separate branded type resolved by
 * src/domain/record/evidence-unit.ts.
 *
 * Two exclusions below are load-bearing rather than incidental:
 *
 *   1. Epistemic roles are EXCLUDED. If roles participated, reclassifying one
 *      source would change its fingerprint, producing a second Record and thus
 *      a second apparent piece of evidence. That is precisely the failure
 *      INV-16 forbids ("one original information source cannot become multiple
 *      independent Evidence Units through reclassification").
 *
 *   2. `capturedAt` is EXCLUDED. The fingerprint identifies the SOURCE, not the
 *      ingestion event. If wall-clock capture time participated, re-ingesting
 *      the same source tomorrow would mint a duplicate Record, defeating the
 *      stated rule "same raw source re-ingested → same Record".
 *
 * The asserted time semantic and its value ARE included, because an
 * observation of a state at T1 and an observation of the same state at T2 are
 * genuinely different source material (ENGINEERING_CONTRACT §5.1: multiple
 * snapshots may support persistence at observed points).
 *
 * Hashing is injected rather than imported so the domain core stays free of
 * platform APIs and so the composition rule itself is testable.
 */

import type { ProvenanceActor, ProvenanceOrigin } from '../shared/enums';
import type { SourceFingerprint } from '../shared/ids';
import { sourceFingerprint } from '../shared/ids';
import {
  type TimeAssertion,
  isReportedInterval,
} from '../shared/time-semantics';

/** Injected hash. Must be deterministic and collision-resistant. */
export type HashFn = (canonical: string) => string;

export interface FingerprintInput {
  readonly origin: ProvenanceOrigin;
  readonly actor: ProvenanceActor;
  /** Traceable pointer to the original object. */
  readonly sourceRef: string;
  /** Raw verbatim content, when the source was an utterance. */
  readonly verbatim: string | null;
  readonly time: TimeAssertion;
}

/**
 * Field separator chosen to be impossible in ordinary text, so that
 * ("ab", "c") and ("a", "bc") can never canonicalize identically.
 */
const SEP = String.fromCharCode(0x1f);

const timeComponent = (time: TimeAssertion): string => {
  if (isReportedInterval(time)) {
    // A reported interval is identified by its bounds AND the user's wording:
    // "这半年" and "过去六个月" are different source expressions even if a
    // caller resolved them to the same bounds (ENGINEERING_CONTRACT §4.2, §12).
    return [
      time.semantic,
      time.from?.toISOString() ?? '',
      time.to?.toISOString() ?? '',
      time.reportedAs,
    ].join(SEP);
  }

  return [time.semantic, time.at.toISOString()].join(SEP);
};

/**
 * Canonical string for a source. Field order is fixed and explicit; nothing is
 * derived from object key order.
 */
export const canonicalSourceString = (input: FingerprintInput): string =>
  [
    'v1',
    input.origin,
    input.actor,
    input.sourceRef,
    input.verbatim ?? '',
    timeComponent(input.time),
  ].join(SEP);

export const computeSourceFingerprint = (
  input: FingerprintInput,
  hash: HashFn,
): SourceFingerprint => sourceFingerprint(hash(canonicalSourceString(input)));

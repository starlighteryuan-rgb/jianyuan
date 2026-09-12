/**
 * Provenance (ENGINEERING_CONTRACT §4.1).
 *
 * A Record must preserve enough provenance to answer:
 *   - Where did this come from?
 *   - Who produced it?
 *   - Was it directly observed, imported, generated, or reported?
 *   - What original object can it be traced back to?
 */

import type { ProvenanceActor, ProvenanceOrigin } from './enums';

export interface Provenance {
  readonly origin: ProvenanceOrigin;
  readonly actor: ProvenanceActor;
  /** Traceable pointer back to the original object. */
  readonly sourceRef: string;
  readonly capturedAt: Date;
}

/**
 * Provenance never carries an evidence verdict.
 *
 * Knowing that something was `generated` by `ai` is a provenance fact; whether
 * it may act as evidence is decided separately by Gate 2 / Evidence
 * Eligibility in a later phase (ENGINEERING_CONTRACT §8 Gate 2, INV-01).
 * This helper exists only to describe provenance, not to authorize use.
 */
export const isAiGenerated = (p: Provenance): boolean =>
  p.actor === 'ai' && p.origin === 'generated';

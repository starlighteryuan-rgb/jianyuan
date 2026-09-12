/**
 * Branded identifier types for the domain core.
 *
 * Framework-agnostic: this file must not import from Prisma, Next.js, or any
 * I/O library. Branding exists so that the type system refuses to interchange
 * identities the ENGINEERING_CONTRACT keeps separate — most importantly
 * `SourceFingerprint` (ingestion dedup) and `EvidenceUnitId`
 * (evidence-independence identity). See ENGINEERING_CONTRACT §4, §6.1,
 * INV-16, and docs/architecture.md §4 (Patch 2).
 */

declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** Identity of a stored Record. */
export type RecordId = Brand<string, 'RecordId'>;

/**
 * Evidence-independence identity.
 *
 * One original information source remains ONE Evidence Unit, however many
 * epistemic roles, summaries, or reformats are attached to it
 * (ENGINEERING_CONTRACT §4, INV-16).
 */
export type EvidenceUnitId = Brand<string, 'EvidenceUnitId'>;

/**
 * Ingestion-deduplication fingerprint of a raw source.
 *
 * Deliberately a DIFFERENT type from `EvidenceUnitId`. Re-ingesting the same
 * raw source yields the same Record; that is a storage concern, not an
 * evidence-independence claim (docs/architecture.md §4, Patch 2).
 */
export type SourceFingerprint = Brand<string, 'SourceFingerprint'>;

export type LineageEdgeId = Brand<string, 'LineageEdgeId'>;
export type DirectiveId = Brand<string, 'DirectiveId'>;
export type DiscoveryId = Brand<string, 'DiscoveryId'>;
export type StateAssignmentId = Brand<string, 'StateAssignmentId'>;
export type RelationClaimId = Brand<string, 'RelationClaimId'>;
export type HypothesisId = Brand<string, 'HypothesisId'>;
export type ReflectionEpisodeId = Brand<string, 'ReflectionEpisodeId'>;
export type UserReflectionRecordId = Brand<string, 'UserReflectionRecordId'>;

const asBrand = <T extends Brand<string, string>>(raw: string): T => raw as T;

export const recordId = (raw: string): RecordId => asBrand<RecordId>(raw);
export const evidenceUnitId = (raw: string): EvidenceUnitId =>
  asBrand<EvidenceUnitId>(raw);
export const sourceFingerprint = (raw: string): SourceFingerprint =>
  asBrand<SourceFingerprint>(raw);
export const lineageEdgeId = (raw: string): LineageEdgeId =>
  asBrand<LineageEdgeId>(raw);
export const directiveId = (raw: string): DirectiveId =>
  asBrand<DirectiveId>(raw);
export const discoveryId = (raw: string): DiscoveryId =>
  asBrand<DiscoveryId>(raw);
export const stateAssignmentId = (raw: string): StateAssignmentId =>
  asBrand<StateAssignmentId>(raw);
export const relationClaimId = (raw: string): RelationClaimId =>
  asBrand<RelationClaimId>(raw);
export const hypothesisId = (raw: string): HypothesisId =>
  asBrand<HypothesisId>(raw);
export const reflectionEpisodeId = (raw: string): ReflectionEpisodeId =>
  asBrand<ReflectionEpisodeId>(raw);
export const userReflectionRecordId = (raw: string): UserReflectionRecordId =>
  asBrand<UserReflectionRecordId>(raw);

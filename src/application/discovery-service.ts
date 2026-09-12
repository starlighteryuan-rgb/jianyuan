/**
 * Discovery / Attention orchestration.
 *
 * Follows the established split: this layer performs lookups and executes,
 * while every rule lives in the PURE planner
 * (src/domain/discovery/discovery-projection.ts). It contains no epistemic and
 * no attention rules of its own.
 *
 * Ordering is deliberate:
 *
 *   1. Resolve active focus contexts ONCE (§19) — shared by every subject.
 *   2. Resolve state per subject (archive/suspend) and directives (Gate 1, §26)
 *      — both computed on read, so a revoked directive or a restore takes
 *      effect immediately.
 *   3. Look up existing Discovery identity by stableKey, which decides Novelty.
 *   4. Project (pure).
 *   5. Persist IDENTITY ONLY, via an upsert idempotent on stableKey.
 *
 * WHAT THIS SERVICE NEVER WRITES: attention priority, presentation level, or any
 * score. Those are recomputed on every read (docs/architecture.md §4 Patch 6),
 * so the user's archive and restore decisions bind to a stable identity rather
 * than to a transient computed object.
 *
 * WHAT IT NEVER READS: evidence support level. Not for signals, not for
 * ordering, not for filtering (INV-09, §36).
 */

import {
  type DiscoveryProjection,
  type SubjectProjectionInput,
  orderForStream,
  projectSubject,
} from '../domain/discovery/discovery-projection';
import { deriveStableKey } from '../domain/discovery/discovery';
import type { DiscoverySubjectRef } from '../domain/discovery/discovery';
import type { CurrentFocusContext } from '../domain/discovery/focus-context';
import {
  type DirectiveSubject,
  resolveEffectivePermissions,
} from '../domain/directive/directive-resolution';
import type {
  DirectiveRepository,
  DiscoveryRepository,
  FocusContextRepository,
  StateAssignmentRepository,
} from '../domain/ports/repositories';
import type { DiscoveryKind } from '../domain/shared/enums';

export interface DiscoveryIdGenerator {
  nextDiscoveryId(): string;
}

export interface DiscoveryDeps {
  readonly discoveries: DiscoveryRepository;
  readonly focusContexts: FocusContextRepository;
  readonly states: StateAssignmentRepository;
  readonly directives: DirectiveRepository;
  readonly ids: DiscoveryIdGenerator;
}

/**
 * One subject to project, as supplied by the caller.
 *
 * Carries no evidence field: a caller cannot smuggle a support level into the
 * attention layer, because the type has nowhere to put it.
 */
export interface SubjectRequest {
  readonly subjectRef: DiscoverySubjectRef;
  readonly discoveryKind: DiscoveryKind;

  /** Resolved time points from the subject's records. Unresolvable ones omitted. */
  readonly resolvedTimePoints: readonly Date[];

  /** For Directive resolution (Gate 1, §26). */
  readonly directiveSubject: DirectiveSubject;

  /** Optional semantic judgments; both default conservatively in the planner. */
  readonly potential?: SubjectProjectionInput['potential'];
  readonly interpretationRisk?: SubjectProjectionInput['interpretationRisk'];
}

export interface ProjectRequest {
  readonly subjects: readonly SubjectRequest[];
  readonly now: Date;
  /** Defaults to off (§18, §40.5). */
  readonly l3Enabled?: boolean;
}

export class DiscoveryService {
  constructor(private readonly deps: DiscoveryDeps) {}

  /**
   * Project subjects into Discoveries and persist their identity.
   *
   * Returns projections in stream order — passively eligible only, newest first.
   * Subjects the user may not passively see are excluded from the returned
   * stream, though their identity is still persisted: §18's Level 1 means stored
   * but not surfaced, and forgetting the identity would lose the user's archive
   * decision.
   */
  async project(request: ProjectRequest): Promise<readonly DiscoveryProjection[]> {
    // Resolved once: focus contexts are global, not per-subject (§19).
    const focusContexts = await this.deps.focusContexts.listActive(request.now);

    const projections: DiscoveryProjection[] = [];

    for (const subject of request.subjects) {
      const projection = await this.projectOne(subject, focusContexts, request);
      projections.push(projection);
    }

    return orderForStream(projections);
  }

  /**
   * Project a single subject without ordering or filtering.
   *
   * Exposed for the case where the user opens one item directly: §18's Level 2
   * is "available when the user looks", and looking at a specific Discovery must
   * not depend on whether it would have surfaced in the stream.
   */
  async projectOne(
    subject: SubjectRequest,
    focusContexts: readonly CurrentFocusContext[],
    request: Pick<ProjectRequest, 'now' | 'l3Enabled'>,
  ): Promise<DiscoveryProjection> {
    // Identity first: whether a row already exists decides Novelty, and it must
    // be read BEFORE the upsert creates one.
    const stableKey = deriveStableKey(subject.subjectRef, subject.discoveryKind);
    const existing = await this.deps.discoveries.findByStableKey(stableKey);

    const [state, activeDirectives] = await Promise.all([
      this.deps.states.findByTarget('discovery', stableKey),
      // Resolved on read, so a revoked directive takes effect immediately (§26).
      this.deps.directives.listActive(),
    ]);

    const permissions = resolveEffectivePermissions(
      activeDirectives,
      subject.directiveSubject,
    );

    const projected = projectSubject({
      subject: {
        subjectRef: subject.subjectRef,
        discoveryKind: subject.discoveryKind,
        identityExistedBefore: existing !== null,
        resolvedTimePoints: subject.resolvedTimePoints,
        archived: state?.presentationState === 'archived',
        suspended: state?.workflowState === 'suspended',
        allowPassivePresentation: permissions.allowPassivePresentation,
        allowProactivePresentation: permissions.allowProactivePresentation,
        ...(subject.potential === undefined
          ? {}
          : { potential: subject.potential }),
        ...(subject.interpretationRisk === undefined
          ? {}
          : { interpretationRisk: subject.interpretationRisk }),
      },
      // Reuse the existing id when there is one, so a recomputation cannot mint
      // a competing identity for the same subject.
      discoveryId: existing?.id ?? this.deps.ids.nextDiscoveryId(),
      focusContexts,
      now: request.now,
      ...(request.l3Enabled === undefined
        ? {}
        : { l3Enabled: request.l3Enabled }),
    });

    // Identity only. `ensure` is idempotent on stableKey and leaves an existing
    // row untouched, so `createdAt` — and therefore Novelty — is never reset.
    const persisted = await this.deps.discoveries.ensure(projected.discovery);

    return { ...projected, discovery: persisted };
  }
}

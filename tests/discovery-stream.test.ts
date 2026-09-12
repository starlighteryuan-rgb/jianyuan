/**
 * V1.1 Architecture Stabilization B1 — the Awareness Stream must consume the
 * Discovery application boundary instead of presenting repositories directly.
 */

import { describe, expect, it } from 'vitest';

import type { Directive } from '@/domain/directive/directive';
import { deriveStableKey } from '@/domain/discovery/discovery';
import { buildStoredHypothesis } from '@/domain/hypothesis/hypothesis';
import { buildStoredClaim } from '@/domain/relation/relation-claim';
import type { StateAssignment } from '@/domain/state/state-assignment';
import {
  directiveId,
  hypothesisId,
  relationClaimId,
  stateAssignmentId,
} from '@/domain/shared/ids';
import { createMemoryServices } from '@/server/container';

const T0 = new Date('2026-01-01T00:00:00.000Z');
const T1 = new Date('2026-01-02T00:00:00.000Z');

const claim = () =>
  buildStoredClaim({
    id: relationClaimId('claim-1'),
    candidate: {
      recordRefs: [],
      comparisonAxis: {
        question: 'What changes after a deadline becomes close?',
        dimension: 'start_delay',
      },
      relationType: 'change',
      evidenceSummary: 'A descriptive relation.',
      assertsTemporalOrdering: false,
    },
    assessment: null,
    createdAt: T1,
  });

const hypothesis = () =>
  buildStoredHypothesis({
    id: hypothesisId('hypothesis-1'),
    candidate: {
      explanation: 'One possible explanation.',
      anchorRefs: ['claim-1'],
      anchorPath: 'supported_relation',
      patterns: [],
      supportBasis: 'directional_observation',
      supportingRecordRefs: [],
      explanatoryGain: {
        mechanism: 'A conditional mechanism.',
        discriminatingPredictions: ['A distinguishing observation.'],
      },
      alternatives: ['A competing explanation.'],
      discriminatingEvidence: {
        wouldStrengthen: ['A strengthening observation.'],
        wouldWeaken: ['A weakening observation.'],
      },
    },
    createdAt: T0,
  });

const directive = (
  over: Partial<Directive> = {},
): Directive => ({
  id: directiveId('directive-1'),
  allowAnalysis: true,
  allowStorage: true,
  allowPassivePresentation: true,
  allowProactivePresentation: false,
  appliesToFutureSimilar: true,
  scope: { kind: 'user_selected', value: 'claim-1' },
  revokedAt: null,
  createdAt: T0,
  ...over,
});

const state = (
  over: Partial<StateAssignment> = {},
): StateAssignment => ({
  id: stateAssignmentId('state-1'),
  targetType: 'relation_claim',
  targetRef: 'claim-1',
  userPosition: 'none',
  workflowState: 'active',
  presentationState: 'active',
  updatedAt: T1,
  ...over,
});

describe('DiscoveryService Awareness Stream boundary', () => {
  it('returns Relation and Hypothesis subjects only through Discovery projections', async () => {
    const services = createMemoryServices();
    await services.repositories.claims.save(claim());
    await services.repositories.hypotheses.save(hypothesis());

    const stream = await services.discovery.listStream({
      now: T1,
      relationLimit: 50,
    });

    expect(stream.map((item) => item.kind)).toEqual([
      'relation',
      'hypothesis',
    ]);
    expect(
      stream.map((item) => item.projection.discovery.subjectRef),
    ).toEqual([
      { type: 'relation_claim', id: 'claim-1' },
      { type: 'hypothesis', id: 'hypothesis-1' },
    ]);
  });

  it('filters a subject when a matching Directive forbids passive presentation', async () => {
    const services = createMemoryServices();
    await services.repositories.claims.save(claim());
    await services.repositories.directives.save(
      directive({ allowPassivePresentation: false }),
    );

    const stream = await services.discovery.listStream({
      now: T1,
      relationLimit: 50,
    });

    expect(stream).toEqual([]);
  });

  it('applies an anchored Relation axis Directive to a Hypothesis', async () => {
    const services = createMemoryServices();
    await services.repositories.claims.save(claim());
    await services.repositories.hypotheses.save(hypothesis());
    await services.repositories.directives.save(
      directive({
        allowPassivePresentation: false,
        scope: { kind: 'relation_axis', value: 'start_delay' },
      }),
    );

    const stream = await services.discovery.listStream({
      now: T1,
      relationLimit: 0,
    });

    expect(stream).toEqual([]);
  });

  it('applies a subject suspension before returning the projection', async () => {
    const services = createMemoryServices();
    await services.repositories.claims.save(claim());
    await services.repositories.states.save(
      state({ workflowState: 'suspended' }),
    );

    const [item] = await services.discovery.listStream({
      now: T1,
      relationLimit: 50,
    });

    expect(item?.projection.presentation.proactiveEligible).toBe(false);
    expect(item?.projection.presentation.reasons.join(' ')).toContain(
      'Suspended',
    );
  });

  it('reads archive state by the persisted Discovery id', async () => {
    const services = createMemoryServices();
    await services.repositories.claims.save(claim());

    await services.discovery.listStream({ now: T1, relationLimit: 50 });
    const existing = await services.repositories.discoveries.findByStableKey(
      deriveStableKey(
        { type: 'relation_claim', id: 'claim-1' },
        'relation_discovery',
      ),
    );
    expect(existing).not.toBeNull();

    await services.repositories.states.save(
      state({
        id: stateAssignmentId('state-discovery'),
        targetType: 'discovery',
        targetRef: existing?.id ?? '',
        presentationState: 'archived',
      }),
    );

    const [item] = await services.discovery.listStream({
      now: T1,
      relationLimit: 50,
    });

    expect(item?.projection.presentation.proactiveEligible).toBe(false);
    expect(item?.projection.presentation.reasons.join(' ')).toContain(
      'Archived',
    );
  });
});

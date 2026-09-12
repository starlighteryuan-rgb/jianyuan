/**
 * Foundation invariant tests — Discovery stable identity and target-scoped state.
 *
 * Covers:
 *   INV-09 — strong evidence support does not imply high attention priority.
 *   INV-04 — user disagreement does not erase factual evidence.
 *   INV-10 — archive does not change truth or evidence strength.
 *   INV-11 — suspension stops progression but preserves evidence.
 *   ENGINEERING_CONTRACT §16, §16.1-16.3, §17;
 *   docs/architecture.md §4 (Patch 6, Patch B).
 */

import { describe, expect, it } from 'vitest';

import {
  type Discovery,
  deriveStableKey,
  hasStableIdentity,
} from '@/domain/discovery/discovery';
import {
  type StateAssignment,
  describesActivePresentation,
  isArchived,
  isSuspended,
} from '@/domain/state/state-assignment';
import {
  PRESENTATION_STATES,
  STATE_TARGET_TYPES,
  USER_POSITIONS,
  WORKFLOW_STATES,
} from '@/domain/shared/enums';
import { discoveryId, stateAssignmentId } from '@/domain/shared/ids';

const discovery = (over: Partial<Discovery> = {}): Discovery => ({
  id: discoveryId('disc-1'),
  subjectRef: { type: 'relation_claim', id: 'rc-1' },
  discoveryKind: 'relation_discovery',
  stableKey: deriveStableKey(
    { type: 'relation_claim', id: 'rc-1' },
    'relation_discovery',
  ),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

const state = (over: Partial<StateAssignment> = {}): StateAssignment => ({
  id: stateAssignmentId('sa-1'),
  targetType: 'discovery',
  targetRef: 'disc-1',
  userPosition: 'none',
  workflowState: 'active',
  presentationState: 'active',
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('Patch 6 — Discovery persists identity only', () => {
  it('stores no attention priority or presentation level', () => {
    const d = discovery();

    expect(Object.keys(d).sort()).toEqual(
      ['createdAt', 'discoveryKind', 'id', 'stableKey', 'subjectRef'].sort(),
    );

    // INV-09: attention must be recomputed, never frozen onto the entity.
    expect('attentionPriority' in d).toBe(false);
    expect('presentationLevel' in d).toBe(false);
    expect('presentationState' in d).toBe(false);
  });

  it('recomputes to the same stable key for the same subject', () => {
    const first = deriveStableKey({ type: 'relation_claim', id: 'rc-9' }, 'relation_discovery');
    const second = deriveStableKey({ type: 'relation_claim', id: 'rc-9' }, 'relation_discovery');

    expect(first).toBe(second);
    expect(hasStableIdentity(discovery())).toBe(true);
  });

  it('separates keys across subjects and kinds', () => {
    const a = deriveStableKey({ type: 'relation_claim', id: 'x' }, 'relation_discovery');
    const b = deriveStableKey({ type: 'hypothesis', id: 'x' }, 'hypothesis_discovery');

    expect(a).not.toBe(b);
  });
});

describe('Patch B — StateAssignment target scope is frozen to three types', () => {
  it('admits exactly relation_claim, hypothesis, discovery', () => {
    expect([...STATE_TARGET_TYPES]).toEqual([
      'relation_claim',
      'hypothesis',
      'discovery',
    ]);
  });

  it('excludes reflection_episode from the target scope', () => {
    // An episode records elicitation provenance; it is not a target of
    // user_position, suspension, or archival.
    expect(STATE_TARGET_TYPES).not.toContain('reflection_episode');
  });

  it('binds Discovery presentation state through a target-scoped row', () => {
    const d = discovery();
    const archived = state({ targetType: 'discovery', targetRef: d.id, presentationState: 'archived' });

    expect(archived.targetRef).toBe(d.id);
    expect(isArchived(archived)).toBe(true);
  });
});

describe('§16.1 / INV-04 — disagreement does not touch evidence', () => {
  it('represents the strong-evidence + disagrees + suspended combination', () => {
    const s = state({ userPosition: 'disagrees', workflowState: 'suspended' });

    expect(s.userPosition).toBe('disagrees');
    expect(isSuspended(s)).toBe(true);
  });

  it('exposes no evidence field reachable from state', () => {
    const s = state({ userPosition: 'disagrees' });

    // arch §11 Patch 9: a user's stance can never mutate a descriptive score.
    expect('evidenceSupportLevel' in s).toBe(false);
    expect('evidenceNumericScore' in s).toBe(false);
    expect('evidenceDimensionScores' in s).toBe(false);
  });

  it('offers all four user positions', () => {
    expect([...USER_POSITIONS]).toEqual(['none', 'agrees', 'disagrees', 'uncertain']);
  });
});

describe('§16.2 / §16.3 — archive and suspend stay orthogonal', () => {
  it('represents all four workflow x presentation combinations', () => {
    const combos = WORKFLOW_STATES.flatMap((w) =>
      PRESENTATION_STATES.map((p) => {
        const s = state({ workflowState: w, presentationState: p });
        return `${s.workflowState}|${s.presentationState}`;
      }),
    );

    // If a single "Hold" state had been invented, these would collapse.
    expect(new Set(combos).size).toBe(4);
  });

  it('does not derive one field from the other', () => {
    const archivedActive = state({ workflowState: 'active', presentationState: 'archived' });
    const suspendedVisible = state({ workflowState: 'suspended', presentationState: 'active' });

    expect(isArchived(archivedActive)).toBe(true);
    expect(isSuspended(archivedActive)).toBe(false);

    expect(isSuspended(suspendedVisible)).toBe(true);
    expect(isArchived(suspendedVisible)).toBe(false);
  });

  it('treats a fully active row as actively presentable', () => {
    expect(describesActivePresentation(state())).toBe(true);
    expect(describesActivePresentation(state({ presentationState: 'archived' }))).toBe(false);
    expect(describesActivePresentation(state({ workflowState: 'suspended' }))).toBe(false);
  });
});

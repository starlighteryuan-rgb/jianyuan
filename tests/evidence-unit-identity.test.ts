/**
 * Foundation invariant tests — Evidence Unit identity.
 *
 * Covers:
 *   INV-16 — one source cannot become multiple independent Evidence Units
 *            through reclassification.
 *   INV-03 — repeated prompting does not manufacture independent evidence.
 *   ENGINEERING_CONTRACT §4, §6.1; docs/architecture.md §4 (Patch 2), §6 (Patch 7).
 */

import { describe, expect, it } from 'vitest';

import {
  EVIDENCE_INHERITING_RELATIONS,
  countIndependentEvidenceUnits,
  inheritsEvidenceUnitByDefault,
  resolveEvidenceUnit,
} from '@/domain/record/evidence-unit';
import {
  addRolePreservingEvidenceUnit,
  normalizeRoles,
} from '@/domain/record/epistemic-role';
import { distinctEvidenceUnitCount, sharesEvidenceUnit } from '@/domain/record/record';
import { EPISTEMIC_ROLES } from '@/domain/shared/enums';
import { evidenceUnitId, sourceFingerprint } from '@/domain/shared/ids';
import { isErr, isOk, unwrap } from '@/domain/shared/result';

const EU1 = evidenceUnitId('eu-1');
const EU2 = evidenceUnitId('eu-2');

describe('INV-16 — reclassification cannot multiply Evidence Units', () => {
  it('keeps one Evidence Unit while every epistemic role is attached', () => {
    // Worst case: pile ALL ten contract roles onto a single source.
    const start = { roles: [] as readonly (typeof EPISTEMIC_ROLES)[number][], evidenceUnitId: EU1 };

    const withEveryRole = EPISTEMIC_ROLES.reduce(
      (acc, role) => addRolePreservingEvidenceUnit(acc, role),
      start,
    );

    expect(withEveryRole.roles).toHaveLength(EPISTEMIC_ROLES.length);
    // Ten roles, still exactly one Evidence Unit.
    expect(withEveryRole.evidenceUnitId).toBe(EU1);
    expect(countIndependentEvidenceUnits([withEveryRole.evidenceUnitId])).toBe(1);
  });

  it('treats repeated identical role assignment as idempotent', () => {
    const once = addRolePreservingEvidenceUnit(
      { roles: [], evidenceUnitId: EU1 },
      'user_expression',
    );
    const twice = addRolePreservingEvidenceUnit(once, 'user_expression');

    expect(twice.roles).toEqual(['user_expression']);
    expect(twice.evidenceUnitId).toBe(EU1);
  });

  it('normalizes duplicate roles without inventing meaning', () => {
    expect(normalizeRoles(['observed_event', 'observed_event', 'user_expression'])).toEqual([
      'observed_event',
      'user_expression',
    ]);
  });

  it('counts one unit no matter how many records carry it', () => {
    // R1 original, R2 summary, R3 reformat — the arch §4 Patch 2 example.
    const records = [
      { evidenceUnitId: EU1 },
      { evidenceUnitId: EU1 },
      { evidenceUnitId: EU1 },
    ];

    expect(records).toHaveLength(3);
    // Three records, ONE independent evidence unit.
    expect(distinctEvidenceUnitCount(records)).toBe(1);
  });
});

describe('arch §4 Patch 2 — derived records inherit by default', () => {
  it.each(EVIDENCE_INHERITING_RELATIONS)(
    'inherits the parent Evidence Unit for %s',
    (relation) => {
      const resolved = resolveEvidenceUnit({
        kind: 'derived',
        parent: { parentEvidenceUnitId: EU1, relationToParent: relation },
      });

      expect(isOk(resolved)).toBe(true);
      const value = unwrap(resolved);
      expect(value.evidenceUnitId).toBe(EU1);
      expect(value.inheritedFromParent).toBe(true);
      expect(value.determinationReason).toBeUndefined();
    },
  );

  it('declares exactly derived_from, summarizes, reformats as inheriting', () => {
    expect([...EVIDENCE_INHERITING_RELATIONS]).toEqual([
      'derived_from',
      'summarizes',
      'reformats',
    ]);
    expect(inheritsEvidenceUnitByDefault('derived_from')).toBe(true);
    expect(inheritsEvidenceUnitByDefault('responds_to')).toBe(false);
  });

  it('reproduces the R1 -> R2 -> R3 chain as a single unit', () => {
    const r2 = unwrap(
      resolveEvidenceUnit({
        kind: 'derived',
        parent: { parentEvidenceUnitId: EU1, relationToParent: 'summarizes' },
      }),
    );
    const r3 = unwrap(
      resolveEvidenceUnit({
        kind: 'derived',
        parent: {
          parentEvidenceUnitId: r2.evidenceUnitId,
          relationToParent: 'reformats',
        },
      }),
    );

    expect(countIndependentEvidenceUnits([EU1, r2.evidenceUnitId, r3.evidenceUnitId])).toBe(1);
  });

  it('mints a new unit only via an explicit, audited determination', () => {
    const resolved = resolveEvidenceUnit({
      kind: 'derived',
      parent: { parentEvidenceUnitId: EU1, relationToParent: 'derived_from' },
      determination: {
        newIndependentFactualContent: true,
        reason: 'User supplied a new concrete fact not present in the parent.',
        mintedEvidenceUnitId: EU2,
      },
    });

    const value = unwrap(resolved);
    expect(value.evidenceUnitId).toBe(EU2);
    expect(value.inheritedFromParent).toBe(false);
    // The reason is retained for audit (arch §11, ENGINEERING_CONTRACT §42).
    expect(value.determinationReason).toBeTruthy();
  });
});

describe('INV-03 / arch §6 Patch 7 — no automatic independence', () => {
  it.each(['responds_to', 'references', 'revises', 'supersedes'] as const)(
    'refuses to guess independence for %s',
    (relation) => {
      const resolved = resolveEvidenceUnit({
        kind: 'derived',
        parent: { parentEvidenceUnitId: EU1, relationToParent: relation },
      });

      // Fails closed: a reply to AI prompting, a reaction to an external
      // reference, or a meaning revision never silently mints evidence.
      expect(isErr(resolved)).toBe(true);
      if (isErr(resolved)) {
        expect(resolved.error.kind).toBe('independence_determination_required');
      }
    },
  );

  it('does not let a prompting round-trip inflate evidence count', () => {
    // AI asks -> user answers -> AI rephrases -> user answers again (§37).
    // Both answers respond_to the same stimulus lineage and are explicitly
    // determined to add no new factual content, so they inherit.
    const answers = ['responds_to', 'responds_to'].map(() =>
      unwrap(
        resolveEvidenceUnit({
          kind: 'derived',
          parent: { parentEvidenceUnitId: EU1, relationToParent: 'derived_from' },
        }),
      ).evidenceUnitId,
    );

    expect(answers).toHaveLength(2);
    // Interaction count 2, evidence count 1.
    expect(countIndependentEvidenceUnits([EU1, ...answers])).toBe(1);
  });

  it('mints a unit for a genuinely independent root source', () => {
    const resolved = unwrap(
      resolveEvidenceUnit({ kind: 'root', mintedEvidenceUnitId: EU2 }),
    );
    expect(resolved.evidenceUnitId).toBe(EU2);
    expect(resolved.inheritedFromParent).toBe(false);
    expect(countIndependentEvidenceUnits([EU1, EU2])).toBe(2);
  });
});

describe('Patch 2 — source fingerprint is separate from Evidence Unit', () => {
  it('does not treat an equal fingerprint string as an Evidence Unit', () => {
    // Same underlying string, two DIFFERENT domain identities.
    const fp = sourceFingerprint('shared-string');
    const eu = evidenceUnitId('shared-string');

    // Structurally equal at runtime...
    expect(String(fp)).toBe(String(eu));

    // ...but they answer different questions and are never compared in
    // production code. Evidence comparison consults evidenceUnitId only.
    const a = { evidenceUnitId: EU1, sourceFingerprint: sourceFingerprint('fp-a') };
    const b = { evidenceUnitId: EU1, sourceFingerprint: sourceFingerprint('fp-b') };

    // Different raw sources, same evidence unit: legitimate for a
    // reformat/summary pair. Independence must follow the unit, not the
    // fingerprint.
    expect(sharesEvidenceUnit(a, b)).toBe(true);
    expect(a.sourceFingerprint).not.toBe(b.sourceFingerprint);
  });

  it('keeps distinct units distinct even when fingerprints look related', () => {
    const a = { evidenceUnitId: EU1, sourceFingerprint: sourceFingerprint('fp-1') };
    const b = { evidenceUnitId: EU2, sourceFingerprint: sourceFingerprint('fp-1') };

    expect(sharesEvidenceUnit(a, b)).toBe(false);
    expect(distinctEvidenceUnitCount([a, b])).toBe(2);
  });
});

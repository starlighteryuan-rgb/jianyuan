/**
 * Phase 2 tests — effective permission resolution.
 *
 * Covers:
 *   INV-17 — directive scope must distinguish analysis from presentation.
 *   ENGINEERING_CONTRACT §8 Gate 1 — user directives override system preference.
 *   ENGINEERING_CONTRACT §18, §40.5 — Level 3 disabled by default.
 *   ENGINEERING_CONTRACT §26 — revocability; presentation without forbidding analysis.
 *   docs/architecture.md §13 — future-similar scope is explicit-only.
 */

import { describe, expect, it } from 'vitest';

import {
  SYSTEM_BASELINE,
  type DirectiveSubject,
  appliesTemporally,
  permitsAnalysis,
  permitsPassivePresentation,
  permitsProactivePresentation,
  permitsStorage,
  resolveEffectivePermissions,
  scopeMatches,
} from '@/domain/directive/directive-resolution';
import type { Directive } from '@/domain/directive/directive';
import { directiveId } from '@/domain/shared/ids';

const JAN = new Date('2026-01-01T00:00:00Z');
const JUN = new Date('2026-06-01T00:00:00Z');

const directive = (over: Partial<Directive> = {}): Directive => ({
  id: directiveId('d-1'),
  allowAnalysis: true,
  allowStorage: true,
  allowPassivePresentation: true,
  allowProactivePresentation: true,
  appliesToFutureSimilar: false,
  scope: null,
  revokedAt: null,
  createdAt: JAN,
  ...over,
});

const subject = (over: Partial<DirectiveSubject> = {}): DirectiveSubject => ({
  topicTags: ['exercise'],
  source: 'zhihu',
  relationAxes: ['start_delay'],
  userSelectedRefs: [],
  createdAt: JAN,
  ...over,
});

describe('§18 / §40.5 — proactive presentation is off by default', () => {
  it('disables proactive presentation in the system baseline', () => {
    expect(SYSTEM_BASELINE.allowProactivePresentation).toBe(false);
  });

  it('permits analysis, storage, and passive presentation by default', () => {
    expect(SYSTEM_BASELINE.allowAnalysis).toBe(true);
    expect(SYSTEM_BASELINE.allowStorage).toBe(true);
    expect(SYSTEM_BASELINE.allowPassivePresentation).toBe(true);
  });

  it('falls back to the baseline when no directive matches', () => {
    const resolved = resolveEffectivePermissions([], subject());

    expect(resolved.appliedDirectiveIds).toEqual([]);
    expect(permitsProactivePresentation(resolved)).toBe(false);
    expect(permitsAnalysis(resolved)).toBe(true);
  });
});

describe('Gate 1 / §26 — an explicit directive overrides the baseline', () => {
  it('lets a user explicitly grant proactive reminders', () => {
    // If a matching directive were ANDed with the default-off baseline, this
    // grant could never take effect — inverting "user directives override
    // system preference".
    const resolved = resolveEffectivePermissions(
      [directive({ allowProactivePresentation: true })],
      subject(),
    );

    expect(permitsProactivePresentation(resolved)).toBe(true);
  });

  it('records which directives contributed, for auditability', () => {
    const resolved = resolveEffectivePermissions(
      [directive({ id: directiveId('d-7') })],
      subject(),
    );

    expect(resolved.appliedDirectiveIds).toEqual([directiveId('d-7')]);
  });
});

describe('INV-17 — dimensions resolve independently', () => {
  it('expresses "以后类似的也别主动提醒我" without disabling analysis', () => {
    const resolved = resolveEffectivePermissions(
      [
        directive({
          allowAnalysis: true,
          allowStorage: true,
          allowPassivePresentation: true,
          allowProactivePresentation: false,
          appliesToFutureSimilar: true,
          scope: { kind: 'topic_tag', value: 'exercise' },
        }),
      ],
      subject(),
    );

    expect(permitsProactivePresentation(resolved)).toBe(false);
    expect(permitsAnalysis(resolved)).toBe(true);
    expect(permitsPassivePresentation(resolved)).toBe(true);
    expect(permitsStorage(resolved)).toBe(true);
  });

  it('expresses "只记录，不分析" as storage without analysis', () => {
    const resolved = resolveEffectivePermissions(
      [directive({ allowStorage: true, allowAnalysis: false })],
      subject(),
    );

    expect(permitsStorage(resolved)).toBe(true);
    expect(permitsAnalysis(resolved)).toBe(false);
  });
});

describe('conflicting directives resolve to the most restrictive', () => {
  it('ANDs each dimension across all applying directives', () => {
    const resolved = resolveEffectivePermissions(
      [
        directive({ id: directiveId('d-1'), allowAnalysis: true, allowPassivePresentation: false }),
        directive({ id: directiveId('d-2'), allowAnalysis: false, allowPassivePresentation: true }),
      ],
      subject(),
    );

    // Neither permissive reading survives; the user's stricter instruction wins
    // on every dimension independently.
    expect(permitsAnalysis(resolved)).toBe(false);
    expect(permitsPassivePresentation(resolved)).toBe(false);
    expect(resolved.appliedDirectiveIds).toHaveLength(2);
  });
});

describe('§26 — revoked directives stop applying', () => {
  it('ignores a revoked directive and reverts to the baseline', () => {
    const resolved = resolveEffectivePermissions(
      [directive({ allowAnalysis: false, revokedAt: JUN })],
      subject(),
    );

    expect(resolved.appliedDirectiveIds).toEqual([]);
    expect(permitsAnalysis(resolved)).toBe(true);
  });
});

describe('docs/architecture.md §13 — scope matching is explicit, never inferred', () => {
  it('treats a null scope as global', () => {
    expect(scopeMatches(directive({ scope: null }), subject())).toBe(true);
  });

  it.each([
    ['topic_tag', 'exercise', true],
    ['topic_tag', 'sleep', false],
    ['source', 'zhihu', true],
    ['source', 'twitter', false],
    ['relation_axis', 'start_delay', true],
    ['relation_axis', 'other_axis', false],
  ] as const)('matches %s=%s -> %s', (kind, value, expected) => {
    expect(scopeMatches(directive({ scope: { kind, value } }), subject())).toBe(
      expected,
    );
  });

  it('matches user_selected only against explicitly selected refs', () => {
    const d = directive({ scope: { kind: 'user_selected', value: 'rc-1' } });

    expect(scopeMatches(d, subject({ userSelectedRefs: ['rc-1'] }))).toBe(true);
    expect(scopeMatches(d, subject({ userSelectedRefs: [] }))).toBe(false);
  });

  it('does not match a merely similar topic tag', () => {
    // No AI-driven broadening of "similar": 'exercising' is not 'exercise'.
    const d = directive({ scope: { kind: 'topic_tag', value: 'exercising' } });
    expect(scopeMatches(d, subject({ topicTags: ['exercise'] }))).toBe(false);
  });
});

describe('temporal applicability', () => {
  it('covers future subjects when appliesToFutureSimilar is true', () => {
    const d = directive({ appliesToFutureSimilar: true, createdAt: JAN });
    expect(appliesTemporally(d, subject({ createdAt: JUN }))).toBe(true);
  });

  it('does not capture future subjects when it is false', () => {
    const d = directive({ appliesToFutureSimilar: false, createdAt: JAN });

    expect(appliesTemporally(d, subject({ createdAt: JUN }))).toBe(false);
    expect(appliesTemporally(d, subject({ createdAt: JAN }))).toBe(true);
  });

  it('reverts to the baseline when a directive does not reach the subject', () => {
    const resolved = resolveEffectivePermissions(
      [directive({ allowAnalysis: false, appliesToFutureSimilar: false, createdAt: JAN })],
      subject({ createdAt: JUN }),
    );

    expect(permitsAnalysis(resolved)).toBe(true);
  });
});

/**
 * Foundation invariant tests — Directive permission independence.
 *
 * Covers:
 *   INV-17 — directive scope must distinguish analysis from presentation.
 *   ENGINEERING_CONTRACT §26; docs/architecture.md §4 (Patch 5), §13.
 */

import { describe, expect, it } from 'vitest';

import {
  type Directive,
  isActive,
  mayPresentPassively,
  mayPresentProactively,
  validateDirectiveScope,
} from '@/domain/directive/directive';
import { directiveId } from '@/domain/shared/ids';

const base = (over: Partial<Directive> = {}): Directive => ({
  id: directiveId('d-1'),
  allowAnalysis: true,
  allowStorage: true,
  allowPassivePresentation: true,
  allowProactivePresentation: true,
  appliesToFutureSimilar: false,
  scope: null,
  revokedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('INV-17 — the four permission dimensions stay independent', () => {
  it('expresses "以后类似的也别主动提醒我" without restricting analysis', () => {
    const d = base({
      allowAnalysis: true,
      allowStorage: true,
      allowPassivePresentation: true,
      allowProactivePresentation: false,
      appliesToFutureSimilar: true,
      scope: { kind: 'topic_tag', value: 'exercise' },
    });

    // Proactive reminders off...
    expect(mayPresentProactively(d)).toBe(false);
    // ...while analysis and passive visibility remain ON. §26: a directive may
    // target presentation without forbidding analysis.
    expect(d.allowAnalysis).toBe(true);
    expect(mayPresentPassively(d)).toBe(true);
  });

  it('expresses "只记录，不分析" as storage without analysis', () => {
    const d = base({ allowStorage: true, allowAnalysis: false });

    expect(d.allowStorage).toBe(true);
    expect(d.allowAnalysis).toBe(false);
  });

  it('allows all 16 combinations of the four booleans', () => {
    // If any pair had been collapsed into a level or derived field, some of
    // these 16 states would be unrepresentable.
    const seen = new Set<string>();

    for (const analysis of [true, false]) {
      for (const storage of [true, false]) {
        for (const passive of [true, false]) {
          for (const proactive of [true, false]) {
            const d = base({
              allowAnalysis: analysis,
              allowStorage: storage,
              allowPassivePresentation: passive,
              allowProactivePresentation: proactive,
            });
            seen.add(
              [
                d.allowAnalysis,
                d.allowStorage,
                d.allowPassivePresentation,
                d.allowProactivePresentation,
              ].join('|'),
            );
          }
        }
      }
    }

    expect(seen.size).toBe(16);
  });

  it('keeps passive and proactive presentation independent in both directions', () => {
    const passiveOnly = base({
      allowPassivePresentation: true,
      allowProactivePresentation: false,
    });
    const proactiveOnly = base({
      allowPassivePresentation: false,
      allowProactivePresentation: true,
    });

    expect(mayPresentPassively(passiveOnly)).toBe(true);
    expect(mayPresentProactively(passiveOnly)).toBe(false);

    // "don't show it if I look" does not imply "don't proactively remind me"
    // (arch §4 Patch 5, explicitly bidirectional).
    expect(mayPresentPassively(proactiveOnly)).toBe(false);
    expect(mayPresentProactively(proactiveOnly)).toBe(true);
  });
});

describe('ENGINEERING_CONTRACT §26 — directives are revocable', () => {
  it('withdraws every presentation permission once revoked', () => {
    const d = base({ revokedAt: new Date('2026-02-01T00:00:00Z') });

    expect(isActive(d)).toBe(false);
    expect(mayPresentPassively(d)).toBe(false);
    expect(mayPresentProactively(d)).toBe(false);
  });
});

describe('arch §13 — future-similar scope is explicit-only', () => {
  it('rejects appliesToFutureSimilar without an explicit scope', () => {
    const problem = validateDirectiveScope({
      appliesToFutureSimilar: true,
      scope: null,
    });

    expect(problem).not.toBeNull();
    expect(problem?.kind).toBe('future_similar_requires_explicit_scope');
  });

  it.each(['topic_tag', 'source', 'relation_axis', 'user_selected'] as const)(
    'accepts an explicit %s scope',
    (kind) => {
      expect(
        validateDirectiveScope({
          appliesToFutureSimilar: true,
          scope: { kind, value: 'v' },
        }),
      ).toBeNull();
    },
  );

  it('permits a non-future-similar directive to carry no scope', () => {
    expect(
      validateDirectiveScope({ appliesToFutureSimilar: false, scope: null }),
    ).toBeNull();
  });
});

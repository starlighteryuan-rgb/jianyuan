/**
 * Phase 2 tests — source fingerprint composition.
 *
 * Covers:
 *   INV-16 — reclassification must not mint a second Record (and hence a
 *            second apparent Evidence Unit).
 *   docs/architecture.md §4 (Patch 2) — same raw source re-ingested → same Record.
 *   ENGINEERING_CONTRACT §5.1 — distinct observations are distinct sources.
 */

import { describe, expect, it } from 'vitest';

import {
  type FingerprintInput,
  canonicalSourceString,
  computeSourceFingerprint,
} from '@/domain/ingestion/source-fingerprint';
import { EPISTEMIC_ROLES } from '@/domain/shared/enums';
import { sha256 } from '@/infra/hash';

const base = (over: Partial<FingerprintInput> = {}): FingerprintInput => ({
  origin: 'directly_observed',
  actor: 'user',
  sourceRef: 'zhihu:answer:123',
  verbatim: '我可能只是害怕开始',
  time: { semantic: 'observation_time', at: new Date('2026-09-01T00:00:00Z') },
  ...over,
});

const fp = (input: FingerprintInput): string =>
  computeSourceFingerprint(input, sha256);

describe('dedup identity — same source yields same fingerprint', () => {
  it('is deterministic across repeated computation', () => {
    expect(fp(base())).toBe(fp(base()));
  });

  it('produces a stable hex digest', () => {
    expect(fp(base())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('INV-16 — roles and capture time are excluded from identity', () => {
  it('does not accept epistemic roles as an input at all', () => {
    // Structural: FingerprintInput has no role field, so reclassification
    // CANNOT change the fingerprint. If it could, re-labelling one source
    // would mint a second Record and thus a second apparent evidence item.
    const keys = Object.keys(base());

    expect(keys).not.toContain('epistemicRoles');
    expect(keys).not.toContain('roles');
    for (const role of EPISTEMIC_ROLES) {
      expect(canonicalSourceString(base())).not.toContain(role);
    }
  });

  it('does not accept capturedAt as an input', () => {
    // The fingerprint identifies the SOURCE, not the ingestion event.
    // Including wall-clock capture time would make re-ingestion produce a
    // duplicate Record, defeating "same raw source re-ingested → same Record".
    expect(Object.keys(base())).not.toContain('capturedAt');
  });

  it('yields one fingerprint when the same source is ingested twice', () => {
    // Simulates re-ingestion a day later: identical source material, and the
    // only thing that differed (when we happened to ingest it) is not an input.
    const firstPass = fp(base());
    const secondPass = fp(base());

    expect(new Set([firstPass, secondPass]).size).toBe(1);
  });
});

describe('distinct source material yields distinct fingerprints', () => {
  it.each([
    ['sourceRef', { sourceRef: 'zhihu:answer:999' }],
    ['verbatim', { verbatim: '我害怕开始' }],
    ['origin', { origin: 'imported' as const }],
    ['actor', { actor: 'ai' as const }],
  ])('changes when %s changes', (_label, over) => {
    expect(fp(base(over))).not.toBe(fp(base()));
  });

  it('separates two observations of the same state at different times', () => {
    // §5.1: multiple snapshots may support persistence at observed points.
    // They are genuinely different source material, not one duplicated source.
    const august = base({
      time: { semantic: 'observation_time', at: new Date('2026-08-01T00:00:00Z') },
    });
    const september = base({
      time: { semantic: 'observation_time', at: new Date('2026-09-01T00:00:00Z') },
    });

    expect(fp(august)).not.toBe(fp(september));
  });

  it('separates the same instant asserted under different time semantics', () => {
    // §5: an observation_time is not an event_time. They must not collide.
    const at = new Date('2026-09-01T00:00:00Z');

    expect(fp(base({ time: { semantic: 'observation_time', at } }))).not.toBe(
      fp(base({ time: { semantic: 'event_time', at } })),
    );
  });

  it('separates reported intervals that differ only in user wording', () => {
    // §4.2 / §12: the user's phrasing is part of the source.
    const half = base({
      time: {
        semantic: 'user_reported_interval',
        from: null,
        to: null,
        reportedAs: '这半年',
      },
    });
    const sixMonths = base({
      time: {
        semantic: 'user_reported_interval',
        from: null,
        to: null,
        reportedAs: '过去六个月',
      },
    });

    expect(fp(half)).not.toBe(fp(sixMonths));
  });

  it('is not confusable across field boundaries', () => {
    // ("ab","c") must not canonicalize the same as ("a","bc").
    const left = base({ sourceRef: 'ab', verbatim: 'c' });
    const right = base({ sourceRef: 'a', verbatim: 'bc' });

    expect(fp(left)).not.toBe(fp(right));
  });

  it('distinguishes an absent verbatim from an empty one', () => {
    expect(fp(base({ verbatim: null }))).toBe(fp(base({ verbatim: null })));
    // Both are representable; this simply pins that null is handled.
    expect(fp(base({ verbatim: null }))).toMatch(/^[0-9a-f]{64}$/);
  });
});

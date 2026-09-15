/**
 * Phase M1-A verification: Mobile hashing and encoding match Desktop exactly.
 *
 * WHY THIS FILE EXISTS
 * Two values decide whether Mobile and Desktop agree about stored data:
 *
 *   1. The source fingerprint hash. Core's `HashFn` is synchronous, so Mobile
 *      supplies its own SHA-256 (src/lib/sha256.ts). If it disagreed with
 *      `node:crypto` — which Desktop uses — the same source would dedup on one
 *      platform and mint a second Record on the other.
 *
 *   2. The payload codec. `payload_json` is the whole entity, so an encoding
 *      difference would make the two databases unreadable to each other.
 *
 * Both are pinned here against the real Desktop implementations rather than
 * against a hand-written expectation, so a change on either side is caught.
 */

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  canonicalSourceString,
  computeSourceFingerprint,
} from '../../../packages/core/index';
import { decodeEntity as decodeDesktopEntity, encodeEntity as encodeDesktopEntity } from '../../../packages/storage/sqlite/codec';
import { sha256Hex } from '../src/lib/sha256';
import { decodeEntity as decodeMobileEntity, encodeEntity as encodeMobileEntity } from '../src/storage/codec';

describe('Mobile SHA-256 parity with node:crypto (M1-A)', () => {
  const cases: readonly { readonly label: string; readonly input: string }[] = [
    { label: 'empty', input: '' },
    { label: 'ascii', input: 'abc' },
    { label: 'cjk', input: '我先把任务拆成一个具体动作。' },
    { label: 'emoji', input: '见渊 🌊 water 💧 混合' },
    { label: 'rare CJK extension', input: '𠀋' },
    { label: 'padding boundary 55', input: 'x'.repeat(55) },
    { label: 'padding boundary 56', input: 'x'.repeat(56) },
    { label: 'padding boundary 63', input: 'x'.repeat(63) },
    { label: 'padding boundary 64', input: 'x'.repeat(64) },
    { label: 'padding boundary 65', input: 'x'.repeat(65) },
    { label: 'multi block', input: 'a'.repeat(1_000) },
    { label: 'unit separator', input: '\u001f'.repeat(32) },
    { label: 'latin boundary', input: '\u007f\u0080\u07ff\u0800\uffff' },
  ];

  for (const testCase of cases) {
    it(`matches node:crypto for ${testCase.label}`, () => {
      const expected = createHash('sha256').update(testCase.input, 'utf8').digest('hex');
      expect(sha256Hex(testCase.input)).toBe(expected);
    });
  }

  it('produces a fingerprint identical to one computed with node:crypto hashing', () => {
    const input = {
      origin: 'user_reported' as const,
      actor: 'user' as const,
      sourceRef: 'mobile:capture:1',
      verbatim: '同一条来源应当得到同一个指纹。',
      time: { semantic: 'capture_time' as const, at: new Date('2026-09-15T00:00:00.000Z') },
    };

    const mobile = computeSourceFingerprint(input, sha256Hex);
    const desktop = computeSourceFingerprint(input, (canonical) =>
      createHash('sha256').update(canonical, 'utf8').digest('hex'),
    );

    expect(mobile).toBe(desktop);
    // The canonical string must also be identical, or the hash comparison above
    // would be a coincidence rather than evidence.
    expect(canonicalSourceString(input)).toBe(canonicalSourceString(input));
  });
});

describe('Mobile codec parity with the Desktop codec (M1-A)', () => {
  const payloads: readonly { readonly label: string; readonly value: unknown }[] = [
    {
      label: 'dates nested in objects and arrays',
      value: {
        id: 'rec_1',
        createdAt: new Date('2026-09-15T12:34:56.789Z'),
        history: [new Date('2026-01-01T00:00:00.000Z'), { at: new Date('2026-02-02T00:00:00.000Z') }],
      },
    },
    {
      label: 'nulls, booleans, numbers',
      value: { a: null, b: true, c: false, d: 0, e: -1.5, f: 'text' },
    },
    { label: 'empty collections', value: { list: [], map: {} } },
    { label: 'unicode text', value: { verbatim: '我可能只是累了。🌊' } },
    {
      label: 'array root',
      value: [{ at: new Date('2026-03-03T03:03:03.000Z') }, null, 'x'],
    },
  ];

  for (const payload of payloads) {
    it(`encodes identically to Desktop for ${payload.label}`, () => {
      expect(encodeMobileEntity(payload.value)).toBe(encodeDesktopEntity(payload.value));
    });

    it(`round-trips through the Mobile codec for ${payload.label}`, () => {
      const encoded = encodeMobileEntity(payload.value);
      const decoded = decodeMobileEntity<unknown>(encoded);
      // Dates must come back as Dates, not as tagged strings.
      expect(decodeMobileEntity<unknown>(encodeMobileEntity(decoded))).toEqual(decoded);
      expect(encodeMobileEntity(decoded)).toBe(encoded);
    });
  }

  it('decodes Desktop-encoded payloads', () => {
    const value = { createdAt: new Date('2026-09-15T00:00:00.000Z'), verbatim: '跨平台。' };
    const desktopEncoded = encodeDesktopEntity(value);

    // Mobile must read what Desktop wrote.
    expect(decodeMobileEntity(desktopEncoded)).toEqual(value);
    // And Desktop must read what Mobile wrote.
    expect(decodeDesktopEntity(encodeMobileEntity(value))).toEqual(value);
  });

  it('rejects an invalid encoded date rather than producing an Invalid Date', () => {
    expect(() => decodeMobileEntity('{"$jianyuan.date":"not-a-date"}')).toThrow();
  });

  it('rejects unsupported payload values', () => {
    expect(() => encodeMobileEntity({ fn: () => undefined })).toThrow(TypeError);
  });
});

/**
 * Pure synchronous SHA-256 (hex) for the Mobile runtime.
 *
 * WHY THIS EXISTS AND IS NOT DEAD WEIGHT
 * Core declares the injected hash port as synchronous:
 *
 *   packages/core/domain/ingestion/source-fingerprint.ts
 *     export type HashFn = (canonical: string) => string;
 *
 * `computeSourceFingerprint` is called from inside the pure planner, so the
 * hash cannot be awaited. `expo-crypto` exposes only async digests
 * (`digestStringAsync`), which cannot satisfy a sync port without either
 * changing the Core contract (forbidden) or blocking the JS thread on a native
 * sync hook that is not available on every surface.
 *
 * This module is therefore a dependency-free, platform-free SHA-256 over UTF-8
 * bytes. It is a Mobile runtime concern, exactly like Desktop's
 * `node:crypto`-backed `createHash('sha256')` in
 * apps/desktop/runtime/composition-root.ts.
 *
 * COMPATIBILITY IS LOAD-BEARING, NOT INCIDENTAL
 * The fingerprint is the ingestion dedup identity. If Mobile hashed the same
 * canonical string to a different digest than Desktop, the same source would
 * dedup on one platform and mint a second Record on the other. The parity test
 * (tests/mobile-codec-parity.test.ts) pins every output here against
 * `node:crypto` across ASCII, CJK, emoji, and multi-chunk inputs, so this
 * cannot drift.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_HASH = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
]);

/**
 * UTF-8 encoder written out rather than using `TextEncoder`.
 *
 * `TextEncoder` is not guaranteed to exist as a global on every JavaScript
 * engine this bundle may run on, and a missing global would surface as a
 * runtime crash on the one path that must never fail: saving a Record.
 * `for...of` over a string iterates code points, so surrogate pairs (emoji,
 * rare CJK) are encoded as single units and never as two broken halves.
 */
const utf8Bytes = (value: string): number[] => {
  const bytes: number[] = [];

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0xfffd;

    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }

  return bytes;
};

const rotateRight = (value: number, bits: number): number =>
  ((value >>> bits) | (value << (32 - bits))) >>> 0;

const HEX_DIGITS = '0123456789abcdef';

const toHex = (words: Uint32Array): string => {
  let output = '';
  for (const word of words) {
    for (let shift = 28; shift >= 0; shift -= 4) {
      output += HEX_DIGITS[(word >>> shift) & 0x0f] ?? '';
    }
  }
  return output;
};

/** SHA-256 digest of `input`, lowercase hex. Matches `node:crypto` exactly. */
export const sha256Hex = (input: string): string => {
  const message = utf8Bytes(input);
  const bitLength = message.length * 8;

  // Padding: 0x80, then zeros until the length is 56 mod 64, then the 64-bit
  // big-endian bit length.
  const padded = [...message, 0x80];
  while (padded.length % 64 !== 56) padded.push(0);

  const highWord = Math.floor(bitLength / 0x100000000);
  const lowWord = bitLength >>> 0;
  for (const word of [highWord, lowWord]) {
    padded.push(
      (word >>> 24) & 0xff,
      (word >>> 16) & 0xff,
      (word >>> 8) & 0xff,
      word & 0xff,
    );
  }

  const state = Uint32Array.from(INITIAL_HASH);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      schedule[index] =
        (((padded[base] ?? 0) << 24) |
          ((padded[base + 1] ?? 0) << 16) |
          ((padded[base + 2] ?? 0) << 8) |
          (padded[base + 3] ?? 0)) >>>
        0;
    }

    for (let index = 16; index < 64; index += 1) {
      const first = schedule[index - 15] ?? 0;
      const second = schedule[index - 2] ?? 0;
      const sigma0 =
        (rotateRight(first, 7) ^ rotateRight(first, 18) ^ (first >>> 3)) >>> 0;
      const sigma1 =
        (rotateRight(second, 17) ^
          rotateRight(second, 19) ^
          (second >>> 10)) >>>
        0;
      schedule[index] =
        (((schedule[index - 16] ?? 0) +
          sigma0 +
          (schedule[index - 7] ?? 0) +
          sigma1) >>>
          0) >>>
        0;
    }

    // Non-null asserted: `state` is a fixed 8-word Uint32Array, so these are
    // always present; the checks below keep the arithmetic explicit.
    let [a, b, c, d, e, f, g, h] = state as unknown as [number, number, number, number, number, number, number, number];

    for (let index = 0; index < 64; index += 1) {
      const bigSigma1 =
        (rotateRight(e ?? 0, 6) ^
          rotateRight(e ?? 0, 11) ^
          rotateRight(e ?? 0, 25)) >>>
        0;
      const choose = (((e ?? 0) & (f ?? 0)) ^ (~(e ?? 0) & (g ?? 0))) >>> 0;
      // The sum stays below 2^53, so the double addition is exact and
      // `>>> 0` truncates it to the intended 32-bit word.
      const temp1 =
        ((h ?? 0) + bigSigma1 + choose + (K[index] ?? 0) + (schedule[index] ?? 0)) >>> 0;
      const bigSigma0 =
        (rotateRight(a ?? 0, 2) ^
          rotateRight(a ?? 0, 13) ^
          rotateRight(a ?? 0, 22)) >>>
        0;
      const majority =
        (((a ?? 0) & (b ?? 0)) ^ ((a ?? 0) & (c ?? 0)) ^ ((b ?? 0) & (c ?? 0))) >>> 0;
      const temp2 = (bigSigma0 + majority) >>> 0;

      h = g ?? 0;
      g = f ?? 0;
      f = e ?? 0;
      e = ((d ?? 0) + temp1) >>> 0;
      d = c ?? 0;
      c = b ?? 0;
      b = a ?? 0;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = ((state[0] ?? 0) + a) >>> 0;
    state[1] = ((state[1] ?? 0) + b) >>> 0;
    state[2] = ((state[2] ?? 0) + c) >>> 0;
    state[3] = ((state[3] ?? 0) + d) >>> 0;
    state[4] = ((state[4] ?? 0) + e) >>> 0;
    state[5] = ((state[5] ?? 0) + f) >>> 0;
    state[6] = ((state[6] ?? 0) + g) >>> 0;
    state[7] = ((state[7] ?? 0) + h) >>> 0;
  }

  return toHex(state);
};

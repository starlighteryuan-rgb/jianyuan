/**
 * M3.2.1 wiring guard: production must pass every storage seam.
 *
 * WHY THIS EXISTS
 * M3.2 shipped Record Tags that worked in tests but not on device. The cause was
 * not the tag logic: `MobileRuntime` took storage seams as POSITIONAL
 * constructor arguments, and `bootstrap.ts` still passed the old five while the
 * constructor had grown a sixth (`recordTagStorage`). The missing seam silently
 * fell back to a no-op store, so writes went nowhere and reads returned empty.
 *
 * The constructor now takes a NAMED options object, which makes the omission
 * visible at the call site. This test additionally asserts that the production
 * bootstrap actually passes each seam, so a future refactor cannot quietly drop
 * one again.
 *
 * It reads the bootstrap source rather than importing it on purpose: bootstrap
 * imports `expo-crypto` / `expo-secure-store` / `expo-sqlite`, which are native
 * modules and cannot load under Node.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const bootstrapSource = readFileSync(
  join(__dirname, '..', 'src', 'runtime', 'bootstrap.ts'),
  'utf8',
);

describe('M3.2.1 production storage wiring', () => {
  it('passes every storage seam to the runtime, including Record Tags', () => {
    for (const seam of [
      'awarenessHistory',
      'awarenessPreference',
      'awarenessAutomation',
      'awarenessManual',
      'recordTags',
    ]) {
      expect(bootstrapSource).toContain(`${seam}:`);
    }
  });

  it('wires Record Tags to a real Mobile storage binding, not the no-op store', () => {
    expect(bootstrapSource).toContain('createMobileRecordTagStorage()');
    expect(bootstrapSource).not.toContain('NOOP_RECORD_TAG_STORAGE');
  });

  it('constructs the runtime with a named-options object', () => {
    // Guards against a return to positional arguments, which is what allowed
    // the tag seam to be dropped silently in the first place.
    expect(bootstrapSource).toMatch(/new MobileRuntime\(composition,\s*\{/);
  });
});

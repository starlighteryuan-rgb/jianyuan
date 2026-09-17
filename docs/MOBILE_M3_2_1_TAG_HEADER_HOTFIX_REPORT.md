# Mobile Phase M3.2.1 — Record Tag Persistence + Header Search Mode Hotfix

Status: M3.2.1 TAG + HEADER HOTFIX CODE COMPLETE — REAL DEVICE ACCEPTANCE PENDING

This round fixes exactly two real-device problems: Record tags not persisting,
and the Awareness header being overlapped by the expanding Search field. The
M3.2 Record visual system, Awareness, Understanding, Exploration, Core,
Provider, and the SQLite schema are untouched.

## TAG REAL DEVICE FAILURE

On device the user could expand a Record, tap `+ 添加标签`, type a name, and tap
`保存` — the editor closed and no error appeared — yet the tag never appeared on
the Record, and was gone after reopening the app.

The failure was **silent**: the save path completed without throwing, so the UI
had nothing to report.

## TAG ROOT CAUSE

The failing layer was **production runtime wiring**, not the tag logic and not
the storage implementation.

`MobileRuntime`'s constructor took its storage seams as **positional
arguments**:

```
constructor(
  composition,
  awarenessHistoryStorage,
  awarenessPreferenceStorage,
  awarenessAutomationStorage,
  awarenessManualStorage,
  recordTagStorage,          // added in M3.2
)
```

M3.2 added `recordTagStorage` as the **sixth** positional parameter, but
`apps/mobile/src/runtime/bootstrap.ts` still passed only **five** arguments.
Because the parameter had a default (`NOOP_RECORD_TAG_STORAGE`), the call was
valid TypeScript and the app built and ran normally. Production therefore wrote
tags into the **no-op store**:

- `setItemAsync` discarded the value;
- `getItemAsync` always returned `null`;
- `readRecordTagState` parsed that to the empty state.

So `addRecordTag` returned the new list for that one call, the editor closed, and
the very next `refresh()` read back an empty store and rendered no capsule. The
tests never caught it because the test runtime passed a real store, while
production did not — a genuine environment divergence.

The `mobile-schema-parity` constraint meant tags could not live in SQLite, so
this store had to be wired explicitly; nothing else would have surfaced the
omission.

## TAG FIX

1. **Replaced positional constructor arguments with a named options object.**
   `MobileRuntime` now takes `storage: MobileRuntimeStorageOptions`, with named
   seams: `awarenessHistory`, `awarenessPreference`, `awarenessAutomation`,
   `awarenessManual`, `recordTags`. A missing seam is now visible at the call
   site instead of silently defaulting.

2. **Wired production explicitly.**
   `bootstrap.ts` now passes `recordTags: createMobileRecordTagStorage()`, the
   real `expo-sqlite/kv-store` binding, alongside the other four seams.

3. **Updated the test runtime** to the same named shape so both environments use
   one construction contract.

4. **Added a wiring guard test** (`m3-2-1-storage-wiring.test.ts`) that reads the
   bootstrap source and asserts every seam is passed, that `recordTags` is bound
   to a real storage factory and not the NOOP store, and that the runtime is
   still constructed with a named object. This is the regression that would have
   caught the original defect.

Round-trip now verified through the real component: expand a Record, type a tag,
save, and the capsule renders immediately; reopen the runtime and the tag is
still there. Remove detaches it and it stays removed after reopen. Empty names
still create nothing.

## HEADER ISSUE

The header rendered `见渊` and the action row as permanent siblings, and the
expanded Search field was a fixed `236pt` wide control. On Awareness the action
row also carries `历史` and `设置`, so the total intrinsic width exceeded a small
iPhone. React Native laid the fixed-width field over the brand, clipping
`渊`. Fading or shrinking the brand would have hidden the symptom while leaving
the overflow, so the layout model itself had to change.

## HEADER SEARCH MODE

The header now has one render mode, driven by the single `searchOpen` boolean —
no combination of independent `brandVisible` / `historyVisible` /
`settingsVisible` / `searchExpanded` flags.

- **Normal mode**: `见渊` on the left; actions on the right. Awareness shows
  `历史  搜索  设置`; other spaces show `搜索  设置`. Unchanged from before.
- **Search mode** (`searchOpen === true`): the brand is not rendered at all,
  `历史` and `设置` are not rendered, and the Search field fills the header
  (`fill` prop → `flex: 1`). The field is the header's only content, so overlap
  is structurally impossible rather than merely visually unlikely.
- **Transition**: entering and leaving search mode swaps the render branches;
  the field animates via its own existing collapse timing. No large slide, no
  spring overshoot, no layout jump.
- **Restoration**: when Search collapses, the brand and the space's actions are
  rendered again. Awareness restores `历史`.

The existing keyboard lifecycle is preserved and now also drives header
restoration, because both come from the same `searchOpen` state:

- empty query + keyboard dismiss → collapse → Normal header;
- non-empty query + keyboard dismiss → stays in Search mode (brand stays out);
- clear query while keyboard hidden → collapse → Normal header.

The Record tag-filter row still renders below the header in search mode, so
Search + tag filtering is unchanged.

## TESTS

New suites:

- `apps/mobile/tests/m3-2-1-tag-roundtrip.test.tsx` (4 tests) — drives the real
  component: expand → add tag → assert the rendered capsule; reopen the runtime
  and assert persistence; remove and assert it is gone; empty name creates
  nothing.
- `apps/mobile/tests/m3-2-1-header-search-mode.test.tsx` (6 tests) — asserts the
  real render tree: Awareness normal mode shows brand / History / Search /
  Settings; search mode removes brand and History from layout; collapse restores
  them; non-empty query keeps search mode after keyboard dismiss; empty query
  restores normal; Record space behaves identically.
- `apps/mobile/tests/m3-2-1-storage-wiring.test.ts` (3 tests) — the production
  wiring guard described above.

## REGRESSION

- Mobile tests: 163 / 163 PASS
- Mobile typecheck: PASS
- Root tests: 857 / 857 PASS
- Root typecheck: PASS
- Production JS bundle: PASS

Confirmed not regressed: Record weak-card visual system and day grouping,
long-Record expansion, Awareness Bubble timing, Reflection save feedback,
manual Awareness dedupe, Awareness History structure, the `见渊` brand in normal
mode, Bottom Tab motion, and Reflection-origin Record filtering.

## IOS BUILD

Recorded after the unsigned iOS build completes.

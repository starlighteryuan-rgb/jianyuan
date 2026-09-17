# Mobile Phase M3.1.2 - Reflection Save + Search Lifecycle Final Hotfix

Status: M3.1.2 UI STATE HOTFIX CODE COMPLETE - REAL DEVICE ACCEPTANCE PENDING

This round changes only two UI state chains: the Reflection save feedback and the
Local Search container lifecycle. Manual Awareness dedupe, Bubble timing, the
`见渊` header, Bottom Tab motion, Awareness History, Core, storage semantics,
Provider contract, and SQLite schema are untouched.

## REAL DEVICE FAILURES

1. Reflection UI stayed on `正在保存` forever even though the Reflection was
   already persisted and visible in 「理解」.
2. Local Search kept a rectangular field (and sometimes an extra white strip)
   after the iOS keyboard was dismissed with an empty query.

## WHY M3.1.1 DID NOT FIX IT

### Reflection

M3.1.1 added an `idle -> saving -> saved -> settled` reducer in
`AwarenessDetail` and settled it from the value returned by
`onRespond()`. Every deterministic test passed because the test double resolved
`submitObservationReflection` immediately.

The real execution chain was different:

- `apps/mobile/src/runtime/awareness-session.ts` persists the Reflection with
  `composition.reflection.respond(...)`.
- Only after that does the same function run `composition.relations.evaluate(...)`
  and then `composition.discovery.listStream(...)`.
- The function returns its final `discovery` / `reflection_saved` result only
  after those later steps complete.

So the visible label waited on a promise that included Relation evaluation and
Discovery projection work. On device, the Reflection was already durable at that
point (which is why it appeared in 「理解」), but the promise had not settled, so
the reducer never received an outcome and stayed on `saving`. The M3.1.1 test
proved the reducer, not the real Promise timing.

### Search

M3.1.1 added `Keyboard.addListener('keyboardDidHide', ...)` and collapsed the
logic correctly — the tests asserted that `open` became `false` and that the
`TextInput` unmounted.

But the visible container was still driven by a Reanimated shared value
(`progress`) that interpolated the container `width` between `34` and `236`.
Collapsing flipped the React state, yet the previously committed animated width
could remain at the expanded value on the native side, and the wrapper was
reused rather than replaced. The logical state and the visual container came
from two different sources of truth, so the rectangle survived even though the
React tree said collapsed. The M3.1.1 test asserted React state and input
mounting, never the actual container style.

## ROOT CAUSE

### Reflection

Conflating "the user's Reflection is durably saved" with "the whole Awareness
response flow finished". `submitObservationReflection` returned only after
`relations.evaluate` and `discovery.listStream`; the UI had no earlier signal,
so a slow or stuck evaluation produced a permanent `正在保存` even though
persistence had already succeeded.

### Search

Two sources of truth for one visual element. React `open` drove which JSX branch
existed; a Reanimated `progress` shared value drove the container
`width` / `borderRadius` / `height`. Collapsing only wrote React state, so the
native animated style could stay expanded and leave a residual rectangle plus a
layout spacer.

## FIX

### Reflection

- `submitObservationReflection` now accepts an `onPersisted(reflectionRecordId)`
  callback and invokes it immediately after `composition.reflection.respond`
  confirms a durable Reflection, before any Relation or Discovery work runs.
- `MobileRuntime.submitObservationReflection` forwards that callback.
- `AwarenessDetail` passes it and dispatches the `saved` outcome the moment it
  fires, so the visible label moves to `已保存到「理解」` as soon as persistence
  succeeds. Relation evaluation continues in the background and can no longer
  hold the UI on `saving`.
- `AwarenessDetail` also treats a durably `reflected` / `dismissed` history item
  as authoritative: an effect re-asserts the saved outcome for that item, so no
  remount or parent refresh can put it back on `saving`.
- The save label is now derived by one pure `reflectionSaveReducer` plus
  `reflectionSaveLabel`; the previous implicit multi-branch boolean mix is gone.

### Search

- `LocalSearchControl` no longer uses a Reanimated shared value for the
  container. The render mode is a single React boolean `open`.
- Collapsed and expanded are separate render branches with literal styles
  (`34x34` circular vs `236x38` field). When `open` is false the expanded
  wrapper and its `TextInput` are not in the tree at all, so no stale animated
  width can survive.
- All endings funnel through one `collapse()` helper: keyboard hide with an
  empty query, blur with an empty query, clear after the keyboard is gone, and
  cancel. A non-empty query keeps the field expanded when the keyboard hides.

## TEST

The new tests are intentionally render-level:

- A gated save double lets the test observe `正在保存……`, then resolve, then
  assert `已保存到「理解」`, then assert that `正在保存……` is gone.
- A second test simulates the real-device stall: it fires `onPersisted` and then
  never resolves the overall save promise, and asserts the UI already shows
  `已保存到「理解」`. This is the specific scenario M3.1.1 missed.
- The Search test asserts the real wrapper styles: the expanded container is
  `width: 236, height: 38`, and after keyboard hide neither the expanded wrapper
  nor the input exists while the collapsed control is `width: 34, height: 34,
  borderRadius: 999`.

## REGRESSION

- Mobile tests: 136 / 136 PASS
- Mobile typecheck: PASS
- Root tests: 857 / 857 PASS
- Root typecheck: PASS
- Production JS bundle (`npx expo export --platform ios`): PASS (1105 modules)

Confirmed untouched: manual Awareness source-set dedupe, Bubble emergence
timing (520 / 420 / 820 ms), Awareness History, `见渊` header, Bottom Tab
motion, Core, Provider contract, and storage semantics.

## IOS BUILD

- Commit: d00a476a090ebebcbc3c248a0bfff1ec43f2db28
- Run ID: 35170579755
- Run URL: https://github.com/starlighteryuan-rgb/jianyuan/actions/runs/35170579755
- Status: completed / success
- All workflow steps: success (typecheck, mobile tests, iphoneos Release build,
  entitlement/signature audit, unsigned IPA verification, artifact upload)
- Artifacts: Jianyuan-iOS-unsigned-ipa, Jianyuan-iOS-unsigned-app
- IPA SHA256: 84ec783dd182e2436f3f8aa638e7a82ac1e8cf1c71216a170438d2aad153e347
- APP zip SHA256: 2f11c499fe0e7eda0dd42041f14c4b2613b288aac2cabdc57c626e74a5bc28f5
- Local unsigned audit of the downloaded IPA: 0 embedded.mobileprovision,
  0 `_CodeSignature`, 0 `CodeResources` (matches CI verification)

## REAL DEVICE ACCEPTANCE

Test A: save a free-text Awareness response and confirm
`正在保存 → 已保存到「理解」 → 状态结束`.

Test B: open an empty Search and dismiss the iOS keyboard; confirm the
rectangle fully retracts to the circular Search button.

If both pass on device, the M3.1 series is frozen and the next phase is UI
Design.

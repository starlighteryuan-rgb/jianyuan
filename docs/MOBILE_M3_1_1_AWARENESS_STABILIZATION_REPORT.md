# Mobile Phase M3.1.1 - Awareness UX & State Stabilization Report

Status: M3.1.1 AWARENESS STABILIZATION CODE COMPLETE - REAL DEVICE FINAL ACCEPTANCE PENDING

This round only addresses the five real-device findings from the M3.1 acceptance
pass. Record semantics, Reflection semantics, Relation / Evidence rules,
Provider contract, Core contract, SQLite schema, Desktop behavior, and Web
behavior remain unchanged.

## REAL DEVICE FINDINGS

1. Manual Awareness kept re-analyzing the same Record source set.
2. Bubble emergence felt like a fast UI transition, not a slow "float up".
3. Opening a Bubble still read like a Card accordion.
4. Reflection data was saved, but the UI stayed on `正在保存`.
5. Search did not collapse after the iOS keyboard was dismissed with an empty
   query.

Accepted / frozen from M3.1 and deliberately untouched: the unified `见渊`
header, removal of duplicate space titles, Bottom Tab motion, the Awareness
main page without a Record list, the single `开始一次觉察` action, the separate
History entry, the Bubble emergence concept, and quick responses.

## ROOT CAUSES

### 1. Manual Awareness repeated the same request

Automatic Awareness already had `coveredRecordIds`, `recordSetFingerprint`, and
job dedupe. Manual Awareness called `suggestRelations` directly with only the
latest Record id. It never consulted any coverage state and had no source-set
fingerprint, so every tap produced a fresh Provider request.

### 2. Bubble emergence finished too abruptly

The Bubble had a single spring-driven `entered` value. Opacity, scale, ripple,
and text all interpolated from that one value, so they started and ended
together in roughly 200-300ms. There was no staging between "gather", "shape",
"reveal text", and "ripple dissipate".

### 3. Bubble open felt like an accordion

Opening only rendered `AwarenessDetail` in place. The surrounding stage kept its
full emphasis and there was no containment, so the interaction read as a card
expanding its own body rather than one observation being opened.

### 4. Reflection stayed on `正在保存`

The component tracked only a boolean `submitting` plus a `saved` flag. Some
success outcomes (`discovery`, `reflection_saved`) did not reliably drive a
terminal state, and there was no settlement step that clears the input and
leaves the saving state. A recovery timer was also absent.

### 5. Search did not collapse on keyboard dismissal

The previous fix relied only on `TextInput.onBlur`. On iOS, dismissing the
keyboard does not guarantee a blur event, so the empty expanded input could
remain. There was no Keyboard listener and no explicit lifecycle state.

## IMPLEMENTATION

### Manual Awareness coverage / dedupe

Added `apps/mobile/src/runtime/awareness-manual-store.ts`, an operational-only
key/value store that records sorted Record-ID source-set fingerprints. It uses
the existing KV storage channel; no SQLite schema change is required.

`MobileRuntime.suggestRelations` now resolves the newest ordinary Records
(Reflection-origin Records excluded through the existing `listRecent`) into a
deterministic source set, computes its fingerprint, and returns
`no_new_content` without a Provider call when that exact source set was already
successfully checked. Successful `candidates` and `no_candidate` outcomes mark
coverage; Provider failures do not, so retry remains possible. A new ordinary
Record changes the source set and enables a fresh check, while older Records
remain valid historical context.

### Bubble timing

`MOTION_DURATION` gained `bubble` (520ms), `textReveal` (420ms), and `ripple`
(820ms) entries. The Bubble now uses three separate shared values:
`entered`, `textIn`, and `rippleOut`. Emergence, text reveal, and ripple
dissipation therefore form a visible sequence instead of ending together.
Reduce Motion still disables ripple movement and collapses the spatial/scale
distance.

### Bubble open motion

Entering detail now dims and slightly recedes the surrounding stage while the
detail surface becomes the focus. The original observation stays visually
continuous. This is local motion only; no new route was introduced.

### Reflection state settlement

`AwarenessDetail` now uses an explicit state machine:
`idle -> saving -> saved -> settled` (with `error` as a terminal failure
state). Every successful Reflection persistence outcome, including
`reflection_saved` with no admitted Relation, moves to `saved`, shows
`已保存到「理解」`, then clears the input and settles after about one second.
All failures and unexpected exceptions leave the saving state. An unmount
cleanup clears the settlement timer.

### Search keyboard lifecycle

`LocalSearchControl` now subscribes to React Native Keyboard events. On
`keyboardDidHide`, an empty query collapses the control regardless of whether
iOS kept the input focused. A non-empty query stays expanded with its results.
Clearing the query after the keyboard is already hidden collapses immediately.
No search algorithm, scope, or visual language changed.

## TESTS

New suite: `apps/mobile/tests/m3-1-1-awareness-stabilization.test.tsx` (9 tests).

- manual Awareness does not call the Provider twice for the same source set;
- a new ordinary Record enables a new check and keeps old Records as context;
- successful `NO_OBSERVATION` marks coverage and prevents a second call;
- Provider failure does not mark coverage and allows a retry;
- successful Reflection-only save reaches `已保存到「理解」`;
- failure leaves the saving state;
- empty query + keyboard hide collapses Search;
- non-empty query + keyboard hide keeps Search expanded;
- clearing the query after keyboard hide collapses Search.

`apps/mobile/tests/awareness-quality.test.ts` was updated for the new
`no_new_content` result on repeat requests.

## REGRESSION

- Mobile tests: 133 / 133 PASS
- Mobile typecheck: PASS
- Root tests: 857 / 857 PASS
- Root typecheck: PASS

Confirmed not regressed: Awareness main has no Record list; only one
`开始一次觉察`; History remains a separate view; Automatic Awareness, Adaptive
Awareness, Bubble viewed persistence, Reflection into Understanding, the
`见渊` headers, and Bottom Tab motion all still pass their existing suites.

## IOS BUILD

The final run id, commit, status, artifact names, and SHA256 values are appended
after the unsigned iOS build completes.

## REAL DEVICE CHECKLIST

1. Save A/B/C, run manual Awareness, then tap `开始一次觉察` again: no second
   model call, and the no-new-content message appears.
2. Add a new ordinary Record, run it again: the new Record anchors a fresh
   check while older Records remain context.
3. Save a free-text Reflection: it settles to `已保存到「理解」` and is visible
   in Understanding.
4. Watch a new Bubble: it should float and reveal in stages rather than flash.
5. Open a Bubble: it should feel like one observation opening, with the rest
   receding.
6. Tap Search, dismiss the keyboard with an empty query: the field collapses.
7. Type a query, dismiss the keyboard: the expanded field and results remain.

This phase stays real-device final acceptance pending until the new unsigned IPA
is installed and checked on iPhone.

# Mobile Phase M3.0 - Motion & Navigation Foundation Report

Status: CODE COMPLETE - REAL DEVICE ACCEPTANCE PENDING

This phase changes presentation and interaction timing only. It does not change
Record semantics, Awareness lifecycle, Reflection persistence, Core contracts,
SQLite schema, Provider contracts, or Desktop runtime behavior.

## MOTION TOKENS

The shared implementation is in `apps/mobile/src/theme/motion.ts`.

- FAST: 150 ms
- NORMAL: 240 ms
- SLOW: 380 ms
- Standard easing: in-out quadratic timing
- Soft spring: damping 26, mass 0.9, stiffness 240
- Spatial distance: normally 16 px and intentionally small
- Bubble entrance scale: 0.96
- Detail entrance scale: 0.98

All animated surfaces read the same token helper through `useMotion()`. React
Native Reanimated is installed at exact versions `4.5.1` and
`react-native-worklets` at `0.10.1`, with the worklets Babel plugin configured
for the Mobile app.

## TAB TRANSITION

`AppShell` computes direction from the Record / Awareness / Understanding /
Exploration order. Switching to a later space enters from the right; switching
to an earlier space enters from the left.

Only the active content layer animates. The movement is 16 px with opacity from
zero to one. Navigation state changes synchronously, while animation is
presentation-only.

The active space remains structurally isolated: inactive spaces are never
constructed, not merely hidden.

## STABLE SHELL

Header, Settings entry, local Search entry, and Bottom Tabs stay mounted during
a tab switch. The changing element is the content layer.

The selected tab animates color and a very small scale. The Awareness unread
badge animates with a soft entrance and a short fade-out; it does not bounce
heavily.

## SEARCH MORPH

The collapsed and expanded Search controls share one animated container.

- Collapsed: circular icon control.
- Expanded: rounded field with input, clear, and cancel actions.
- Opening animates width, height, corner radius, and face opacity.
- The input is mounted only while expanded and receives focus on mount.
- Closing clears the query and returns to the circular control.
- Search is local to the space; it does not call the Provider.

## RECORD SAVE MOTION

Record saving remains local-first and independent from AI loading.

On success, the input well has a very small scale pulse and the existing
`RECORD_SAVED_MESSAGE` acknowledgement fades and rises slightly. Failed saves
do not clear the input and show the existing error state.

## AWARENESS BUBBLE APPEARANCE

A new Awareness Bubble enters with a soft spring from opacity 0 to 1 and scale
0.96 to 1. A single low-weight ripple expands slightly and fades out.

Under Reduce Motion, the ripple is disabled and the bubble remains functional.

## BUBBLE DETAIL TRANSITION

Tapping a Bubble applies a small focus scale and opens the matching Detail. The
Detail enters with opacity and scale rather than hard-cutting.

Close reverses the visual transition and calls close immediately; there is no
delayed state dependency that can leave the overlay stuck. A short close lock
guards repeated taps. Functional read state is already committed before the
Detail is opened, so closing cannot undo that state.

## NEW TO HISTORY TRANSITION

When an item leaves pending state, it is rendered through
`AwarenessHistoryCard`. The History card fades in with a 4 px upward settle.
The item identity remains the candidate id, so the same Awareness is represented
as the same durable item in History.

## REFLECTION SAVE FEEDBACK

The submit button states remain `idle -> saving -> saved/error`.

When the runtime returns `reflection_saved` or an accepted relation /
discovery result, the button shows `已保存到「理解」` and never remains in
`正在保存……`. A failed save ends in the error state and restores the action so
the user can retry.

## REDUCE MOTION

`useMotion()` reads Reanimated's reduced-motion preference. When enabled:

- spatial translation is zero;
- heavy scale distances collapse to scale 1;
- bubble ripple is hidden;
- springs and timings remain short, functional state transitions;
- navigation, Search, Detail close, and save behavior stay unchanged.

## PERFORMANCE

Implementation notes:

- Reanimated shared values drive animation instead of JS intervals.
- Navigation state is synchronous and only one space is mounted.
- The Search input is not mounted while collapsed.
- Stable keys continue to identify Record, Bubble, Detail, and History items.
- The new motion layer does not query SQLite or call the Provider.

## TESTS

Automated verification on the current checkout:

- Mobile tests: 16 files / 120 tests PASS
- Mobile typecheck: PASS
- Root regression: 47 files / 857 tests PASS
- Root typecheck: PASS

New M3.0 guards cover:

- synchronous navigation while preserving active-space isolation;
- Search collapsed without an input and expanded with focused input;
- Search cancel returning to the collapsed control;
- Bubble open marking only that item viewed;
- Detail close leaving the item in History;
- successful Reflection feedback leaving the saving state;
- failed Reflection ending in the error state;
- navigation and Search behavior under Reduce Motion.

The Node test environment uses a small Reanimated double in
`apps/mobile/tests/support/reanimated-double.ts`; production Mobile uses the
real Reanimated dependency.

## REAL DEVICE ACCEPTANCE

NOT RUN.

Required real-device checklist before marking the phase fully accepted:

1. Switch Record / Awareness / Understanding / Exploration repeatedly and
   confirm stable Shell, no flash, and no obvious dropped frames.
2. Open Search, enter text, cancel, and confirm the morph returns cleanly.
3. Receive a real Awareness Bubble and confirm the soft entrance.
4. Open Detail, close it, and confirm the item appears in History.
5. Confirm Reflection save shows the real saved feedback.
6. Enable system Reduce Motion and repeat navigation, Search, Detail, and save.

## KNOWN LIMITATIONS

- This is not the final visual redesign; Pair A Warm Paper / Deep Amber
  structure remains.
- Full shared-element Bubble-to-Detail geometry is approximated rather than
  introducing a larger navigation framework.
- Gesture-driven interactive dismiss and Bubble dragging are intentionally
  deferred to later M3 phases.
- Real-device frame timing has not yet been measured.

## M3.1 HANDOFF

M3.1 can proceed on this foundation after the real-device checklist above.
Motion tokens, the stable Shell, directional transitions, Search morph, and
functional save/error feedback are the base for the Record-focused M3.1 pass.

# Mobile Phase M3.1 - Awareness Space Redesign Report

Status: CODE COMPLETE - REAL DEVICE UX ACCEPTANCE PENDING

This phase changes Mobile presentation, navigation, and search interaction only.
Record semantics, Awareness lifecycle, Reflection semantics, Relation / Evidence
rules, Core contracts, SQLite schema, Provider contracts, Automatic Awareness
anchoring, and Desktop runtime behavior remain unchanged.

## BEFORE

The Awareness main page mixed several responsibilities:

- browsing and selecting recent Records;
- manually starting Awareness;
- pending and viewed Awareness history;
- responding to Awareness; and
- local search.

This made the main surface read like an inbox plus a Record list. It also
repeated the space title already shown by Bottom Tabs, and the empty-query
search field could remain expanded after keyboard dismissal.

## NEW INFORMATION ARCHITECTURE

The Awareness main page now represents the current stage:

- idle state with one restrained `开始一次觉察` action;
- Provider loading and `NO_OBSERVATION` / provider-failure status;
- pending Automatic and manual Awareness Bubbles;
- Bubble detail and user response flow.

The user no longer selects a Record. The internal anchor remains the latest
Record from the existing runtime boundary, loaded through `listRecent(5)`, and
is not exposed in the UI.

`AwarenessHistoryView` is now a separate secondary view owned by `AppShell`.
The header exposes `历史` on Awareness and `返回` inside History. History
supports local text filtering and keeps the existing card / retrieval layout.

Manual candidates and Automatic pending candidates both render through the same
`AwarenessBubble` component. Opening a pending Bubble still commits viewed state
through the existing runtime method before rendering the detail.

## MOTION

M3.0 Bubble emergence and Ripple remain in place. Opening a Bubble continues to
use the existing focus scale plus detail opacity / scale transition. Viewed
items leave the stage and enter History through the existing settle transition.

Reduce Motion continues to disable ripple and reduce spatial displacement while
keeping fade and functional transitions.

## HEADER SYSTEM

The shell header is fixed to `见渊` across the four primary spaces. The primary
space surfaces no longer repeat `记录`, `觉察`, `理解`, or `探索` as large page
titles. Bottom Tabs remain the primary space locator.

History remains a true secondary view and continues to display its own
`觉察历史` title. Settings, Awareness History entry / back, local Search, and
Bottom Tabs stay in the shell header / tab system.

## SEARCH FIX

The empty-query lifecycle now collapses on blur. With a nonempty query, blur
keeps the expanded field and results. Clearing or cancelling still returns to
the circular idle control.

The input remains mounted only while expanded, so a collapsed control cannot own
an input or leave a blank field on screen.

## CORE SAFETY

No Core, SQLite schema, Provider contract, Desktop runtime, Automatic Awareness
orchestration, Relation / Evidence rule, or Record persistence semantics were
changed. The internal manual Awareness anchor remains the latest Record.

## VERIFICATION

- Mobile tests: 124 / 124 PASS
- Mobile typecheck: PASS
- Root tests: 857 / 857 PASS
- Root typecheck: PASS

## REAL DEVICE CHECKLIST

1. Awareness main page is visibly cleaner and contains no Record list.
2. Manual Awareness requires only `开始一次觉察`.
3. Internal Record anchor is not exposed.
4. New Awareness Bubbles emerge and ripple gently.
5. Bubble opening feels continuous rather than a hard page jump.
6. Automatic Awareness appears as a quiet stage Bubble.
7. History is a clear independent entry and remains retrievable.
8. All four primary headers show `见渊`; no repeated space titles.
9. Empty query + blur collapses Search; nonempty query remains expanded.
10. Reduce Motion remains usable.

The phase remains real-device UX acceptance pending until the iOS unsigned
artifact is installed and checked on iPhone.

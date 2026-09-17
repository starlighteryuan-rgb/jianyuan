---
name: ui-animation
description: Motion design and review adapted for React Native Reanimated. Use when designing, implementing, reviewing, or debugging mobile UI motion, timing, easing, springs, transitions, enter/exit, and Reduce Motion behavior in the Jianyuan app; not for visual direction (use ui-design) or mobile UX hierarchy (use mobile-ui-ux-designer).
metadata:
  short-description: React Native motion design, timing, and review
---

# UI Animation

Motion craft for the Jianyuan mobile app. Adapted from the `ui-animation` skill
in `mblode/agent-skills`, trimmed to React Native + Reanimated rather than
CSS/Motion for web, and subordinated to `jianyuan-mobile-design` when the two
disagree.

## Core rule

Animate for feedback, orientation, continuity, or deliberate delight. If motion
exists only to look cool and the user sees it often, do not add it.

Motion is the visible form of a state change — not decoration. In 见渊 the verbs
are: Record settles, Awareness surfaces, Understanding sinks, Exploration
connects. Read `jianyuan-mobile-design/references/motion-language.md`.

## Timing

- fast: 120–180 ms
- normal: 200–300 ms
- slow: 320–450 ms

Treat these as reference. Real-device feel wins.

Frozen: Awareness Bubble emergence — Bubble ≈520 ms, content ≈420 ms, ripple
≈820 ms. Do not change it without an explicit request.

## Sequencing

Do not start and end every property together. Build a time hierarchy, so the
user perceives cause and result rather than a single flash.

## Springs and easing

- Prefer restrained springs. No overshoot or bounce unless the product meaning
  genuinely calls for it, which in 见渊 it generally does not.
- Interruptible UI should retarget, not restart from zero.
- High-frequency interactions should feel immediate; occasional, meaningful
  transitions may be slightly slower.

## Enter and exit

Occasional interactions may enter slightly slower and exit fast. High-frequency
transient UI inverts this: enter quickly, exit with a brief fade. Never block
focus or task completion on an animation finishing.

## Reduce Motion

Follow the iOS system Reduce Motion setting. It is not an in-app toggle.

When Reduce Motion is on: reduce large scale and spatial movement and disable
ripple movement; keep fade and emphasis transitions; never remove the state
information the motion was carrying. Navigation, save feedback, and state must
still work.

## Gestures

A gesture must have a discoverable, accessible alternative. Never make a gesture
the only way to reach a required action. Respect platform gesture conventions
and the safe area.

## Implementation notes for this codebase

- The app uses React Native Reanimated. Work in `apps/mobile/src/theme/motion.ts`
  and read the existing `useMotion()` tokens rather than inventing local timings.
- The test double in `apps/mobile/tests/support/reanimated-double.ts` does not
  reproduce native animation. Motion correctness therefore requires real-device
  verification, not only tests.
- Do not drive layout-critical container dimensions with Reanimated values when
  a plain React render-mode boolean would be authoritative; visual state and
  logical state must share one source of truth. This exact split previously left
  a stale expanded container on device.

## Review output

When reviewing motion, report per issue: what is wrong, why it is wrong, and the
concrete fix. Distinguish "must fix" from "taste". End with a verdict. A
passing test is not proof of correct motion.

---
name: ui-design
description: Visual design direction and UI audit adapted for Expo/React Native mobile. Use when choosing or auditing visual hierarchy, typography, spacing, color, surface, component language, design tokens, and state design for a mobile screen; not for motion timing (use ui-animation) or mobile UX hierarchy (use mobile-ui-ux-designer).
metadata:
  short-description: Visual direction and UI audit for mobile
---

# UI Design

Visual design craft, adapted for the Jianyuan mobile app. Adapted from the
`ui-design` skill in `mblode/agent-skills`, trimmed to Expo + React Native +
iOS rather than web/CSS/Tailwind, and subordinated to
`jianyuan-mobile-design` when the two disagree.

## Modes

Resolve one mode before acting:

- **Direction** — the user wants a visual direction: palette, type scale,
  spacing, radius, depth, layout pattern. Deliver a spec, not code.
- **Build** — the surface does not exist yet and the user asked to build it.
- **Audit** — the surface exists and the user did not name a change. Report
  defects with `file:line` evidence.
- **Retrofit** — one dimension added to existing UI, such as light/dark.

If the user says "let's discuss the UI", that is Direction or Audit, not Build.
Do not edit code until the user explicitly asks to implement.

## Visual thesis

Start from a one-sentence visual thesis: mood, material, energy. For 见渊 the
thesis is quiet, private, human, low-noise, with room to breathe — never an AI
dashboard.

## Hierarchy

- Information hierarchy is decided before visuals. What is first, second, and
  absent.
- One clear focal point per screen region.
- Use size, weight, spacing, and position before you reach for color or
  containers.
- Do not let metadata outrank the user's own writing.

## Typography

- A small, stable set of type scales. Do not invent a new size per screen.
- Body text for user writing must stay comfortably readable; never demote it to
  tiny secondary styling to make a layout fit.
- Allow text to wrap and containers to grow. Never truncate meaning silently.
- Support Dynamic Type; avoid hard-coded sizes that ignore the user setting.

## Spacing

- Use a consistent spacing scale (the project's `SPACING` tokens in
  `apps/mobile/src/theme/tokens.ts` are the source of truth).
- Prefer whitespace and grouping over borders and containers.
- Fix spacing rhythm across a screen rather than tuning each gap by eye.

## Color and surface

- Restraint. Low saturation. No purple/blue AI-cliché gradients, no neon.
- Depth should be quiet: subtle surface separation over stacked shadows.
- Color is never the only state signal.
- Keep light and dark mode hierarchy equally readable.

## Cards

Card is not the default answer. Use a Card only when grouping, hierarchy, or an
interaction boundary genuinely requires one. Prefer whitespace, division by
typography, dividers, timeline, or a subtle surface.

## State design

Every surface must define its real states: empty, loading, error, success, and
the boundary/`NO_OBSERVATION` case where relevant. A screen designed only in its
happy populated state is incomplete.

## Audit verdict

End an audit with a clear verdict and per-item severity, grounded in `file:line`.
A passing test, typecheck, or build is not a design verdict. Real-device
acceptance is the final bar.

## Boundary

This skill owns visual direction, tokens, and audit. It does not decide product
semantics, does not change Core behavior, and does not own motion timing.

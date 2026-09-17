---
name: mobile-ui-ux-designer
description: iOS-first React Native mobile UX design, review, and implementation handoff for Expo apps. Use when designing or reviewing mobile information hierarchy, screen states, interaction contracts, navigation, touch targets, safe area, accessibility, Dynamic Type, keyboard lifecycle, responsive layout, and motion contracts for a mobile screen; not for visual direction alone (use ui-design) or motion timing alone (use ui-animation).
metadata:
  short-description: iOS-first React Native mobile UX and handoff
---

# Mobile UI/UX Designer

Mobile UX craft for an iOS-first Expo + React Native app.

Adapted from `mobile-ui-ux-designer` in
[`mdrmuhaimin/agentic-skills`](https://github.com/mdrmuhaimin/agentic-skills)
(`codex/mobile-ui-ux-designer/skill.md`, MIT). The upstream is a 43 KB
cross-platform spec covering iOS, Android, Flutter, React Native, and web, and
it ships as `skill.md`; this local version keeps the upstream methodology —
priority stack, phased workflow, state model, interaction contracts,
accessibility and motion contracts, token discipline, handoff — and trims it to
Expo + React Native + iOS, and to the `SKILL.md` name Codex requires.

For Jianyuan product meaning, four-space semantics, and frozen UI,
`jianyuan-mobile-design` takes priority over this skill.

## Priority stack

1. **User goal first.** Do not produce visual design before the user goal,
   primary action, and next step are defined.
2. **P0 content available immediately.** Title, status, primary instruction, and
   primary action are visible or reachable through an obvious first interaction.
3. **No vague design language.** "Modern", "clean", "premium", "intuitive" are
   never acceptable. Replace with concrete behavior.
4. **Every state needs a recovery.** Error → retry or explain. Empty → next
   action. Disabled → why. No state is a dead end.
5. **Tokens before arbitrary values.** Reference the project's token roles in
   `apps/mobile/src/theme/tokens.ts` before inventing numbers.
6. **Accessibility is not optional.** Motion is reducible. Color is never the
   only signal. Touch targets meet platform minimums. Accessible order matches
   visual hierarchy.
7. **One dominant next action per screen mode.** If two actions are genuinely
   equal (accept / decline), model an explicit choice state rather than demoting
   one.
8. **Do not invent research.** If something is unverified, say so.
9. **Stop at stop conditions.** If a stop condition fires, surface it instead of
   silently approximating.
10. **Compress.** Longer output is not higher quality. Cut filler.

## Workflow

### Phase 1 — Understand

1. **Triage.** Low (one component / one state), medium (one screen), high
   (multi-screen or design-system work). Match the output size to the tier.
2. **Clarify.** User problem, primary user, single next action, visible vs
   deferred, screen type, usage context, cost of misunderstanding.
3. **Read local context.** Task-specific or root `AGENTS.md`, product docs,
   existing tokens, sibling screens, reusable components, navigation files,
   tests. Live conventions beat stale docs; call out drift.
4. **Audit the current UI.** Read the real component. Never imagine state.

### Phase 2 — Design

Produce only the sections the tier needs:

- **UX problem statement** — current problem, desired outcome, primary action,
  what must not happen.
- **Design principles** — 3–7, actionable, not aesthetic.
- **Information hierarchy** — orientation → status → instruction → primary
  action → support → recovery. State what should not appear.
- **Screen state model** — initial, empty, loading, ready, in progress,
  completed, error, offline, locked, disabled, partial data. Every disabled
  state explains why; every error offers recovery; every empty state teaches
  the next step.
- **Design decision log** — decision, options considered, chosen, reason.
- **Interaction contracts** — trigger, preconditions, system response, UI
  feedback, loading, success, failure, accessibility announcement, "must not".
- **Responsive layout** — small / standard / large compact, plus larger
  devices. Prefer flexible layout over hard-coded absolute positions.
- **Wireframe** — major vertical blocks only, not pixel mockups.
- **Visual direction** — defer to `ui-design` and `jianyuan-mobile-design`.
- **Motion contract** — defer to `ui-animation` and
  `jianyuan-mobile-design/references/motion-language.md`.
- **Accessibility contract** — see below.
- **Token and component spec** — reference real token roles; if a role is
  missing, propose it and mark it as proposed.
- **Copy and microcopy** — specific and non-judgmental.
- **Implementation handoff** — real component names, states, and files.

### Phase 3 — Verify

- **Self-review gate** — re-read the design against the priority stack.
- **Verification** — tests and typecheck when implementation was requested.
- **Real device** — the final verdict is real-device acceptance. A test,
  typecheck, build, or screenshot is not experience acceptance.

## iOS / React Native specifics

- Touch targets: minimum 44x44 pt. If the visual is smaller, pad the pressable,
  not the icon.
- Safe area: respect top and bottom insets; do not place essential content under
  the notch or home indicator.
- Keyboard: content and primary action must stay reachable when the keyboard is
  open. Treat keyboard dismissal as an event, not only input blur.
- Dynamic Type: allow text to grow; do not hard-code sizes that ignore the user
  setting or clip at larger sizes.
- Navigation: follow iOS conventions; a gesture must not be the only path to a
  required action.
- Reanimated drives motion; timing tokens live in
  `apps/mobile/src/theme/motion.ts`. Do not invent local timings.
- A component test double does not reproduce native layout or animation;
  container geometry and motion need real-device verification.

## Accessibility contract

- Primary CTA has a semantic label describing the outcome, not just the visual
  label.
- Critical state is never communicated by color alone.
- Text supports system font scaling without clipping or hiding actions.
- Interactive targets meet the iOS minimum; dense rows are spaced to avoid
  accidental activation.
- Disabled controls explain why they are disabled.
- Meaningful state changes get an appropriate screen-reader announcement.
- Motion is reducible and never required to complete a task.

## Stop conditions

Stop and surface to the user when: the user goal or primary action is genuinely
undefined; the change would alter Core, Relation, Evidence, or Reflection
semantics; required data does not exist; or the design would violate
`jianyuan-mobile-design`.

## Output discipline

- Name concrete components and `file:line` in audits; separate must-fix from
  nice-to-have.
- Do not report a passing test as proof the mobile experience is complete.
- Do not edit code when the user asked only to discuss the UI.

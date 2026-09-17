---
name: jianyuan-mobile-design
description: Jianyuan (见渊) mobile design language for Record, Awareness, Understanding, Exploration, cards, tags, search, and motion. Use when designing, redesigning, auditing, or implementing any Jianyuan mobile UI, React Native screen, visual system, card, tag, navigation detail, or animation; not for Core, storage, or Provider semantics.
metadata:
  short-description: Jianyuan mobile UI design language and workflow
---

# Jianyuan Mobile Design

The design language of 见渊 for the Expo + React Native + iOS-first app. This
skill governs how the four spaces look, group, move, and behave. It does not
change product semantics, and it does not replace real-device acceptance.

## The one rule above all others

**AI 只提出可能性，用户决定意义。**

AI Observation is a possibility, never a user fact. Reflection belongs to the
user. A Relation needs evidence boundaries. Evidence must not arise
automatically from an unconfirmed AI Observation. A quick choice is a stance,
not a Reflection. Only user free-text Reflection may enter the Core Gate.
`NO_OBSERVATION` is a legitimate, normal outcome.

No visual treatment may imply that an AI interpretation is the user's actual
state, diagnosis, or identity.

## Non-negotiable semantics

These are product law, not style choices. Do not change them while designing:

- Record is the user's own original expression.
- AI Observation ≠ User Fact.
- Reflection belongs to the user.
- Relation requires evidence boundaries.
- Evidence never auto-generates from unconfirmed AI Observation.
- Quick Response alone is not a Reflection.
- Only user free-text Reflection enters the Core Gate.
- `NO_OBSERVATION` is a normal result, not an error or an empty failure.

If a visual idea conflicts with any of these, the semantics win.

## Routing

- For visual direction, typography, color, spacing, and surfaces: use with the
  `ui-design` skill.
- For motion timing, easing, springs, and transitions: use with the
  `ui-animation` skill.
- For mobile UX, hierarchy, touch targets, safe area, and accessibility:
  use with the `mobile-ui-ux-designer` skill.
- Read [references/product-spaces.md](references/product-spaces.md) when
  designing or auditing any of the four spaces.
- Read [references/design-principles.md](references/design-principles.md) for
  the visual philosophy and what to avoid.
- Read [references/motion-language.md](references/motion-language.md) for the
  motion semantics of settle / surface / sink / connect.
- Read [references/frozen-ui.md](references/frozen-ui.md) before changing
  anything in the App Shell or current accepted interaction behavior.

## The four spaces are related, not identical

Shared across all four: typography family, spacing system, design tokens,
navigation, and overall calm. Different: what each space is for and how it
should feel.

| Space | Meaning | Verb | Feel |
| --- | --- | --- | --- |
| Record / 记录 | 我留下了什么 | 落下 / capture | quiet, personal, direct, text-first |
| Awareness / 觉察 | 有什么值得现在注意 | 浮现 / surface | emergence, stage, ripple, transient |
| Understanding / 理解 | 我自己留下的理解 | 沉淀 / sink | stable, owned by the user, sedimented |
| Exploration / 探索 | 长期形成的结构与关系 | 连接 / connect | relation, trajectory, structure, longitudinal |

Do not render these as the same card with four different titles.

## Card is not the default answer

Before introducing a Card container, answer: **does this information actually
need a Card?** Consider whitespace, grouping, typography, dividers, timeline,
spatial placement, and subtle surface first.

Use a Card only when there is a real need for grouping, hierarchy, or an
interaction boundary. Card-as-default produces a dashboard, and 见渊 is not a
dashboard.

## Observation Is Not Object

AI Observation / Awareness Result defaults to text, not a visual object. It is
closer to a discovered sentence, a surfaced observation, or a judgment clue
worth pausing for than to an AI card, bubble, or generated panel.

Prefer typography, whitespace, focus line, tonal shift, and subtle emergence.
Do not default to card, bubble, panel, or closed container.

## Awareness Main Is Stage, Not Bubble

The center circle / halo in Awareness Main is stage language: attention center,
emergence field, quiet anticipation. It is not a bubble, content container, or
object shell.

Only light halo and tonal field are allowed. Heavy outlines and solid object
shapes are not.

## Visual character

Target: 克制, 安静, 有呼吸感, 留白, 低噪声, 私密, 人本, 不判断, 不强迫用户行动,
not over-AI, not enterprise dashboard, not productivity SaaS.

Avoid: neon AI, purple/blue AI gradients, everywhere glassmorphism, everywhere
gradients, everywhere cards, excessive shadow, excessive blur, high-saturation
CTAs, gamification, streaks, scores, and badge overload.

## Motion

Motion is not decoration. Motion is the visible form of a state change.

- Record: what the user wrote "lands".
- Awareness: something worth noticing "floats up".
- Understanding: the user's own thinking "settles".
- Exploration: long-term relations "gradually form".

Base timings: fast 120–180 ms, normal 200–300 ms, slow 320–450 ms. Treat these
as reference, not mechanical law. Real-device feel wins.

The accepted automatic Awareness Bubble emergence is frozen: Bubble ≈520 ms,
content ≈420 ms, ripple ≈820 ms. Do not speed it up without an explicit request.
The text-first manual Awareness Result reuses the emergence timing without
reusing the Bubble object shape.

Accessibility is part of motion: follow iOS Reduce Motion, keep Dynamic Type
usable, keep touch targets reasonable, keep contrast reasonable, never use color
as the only state signal, keep dark and light hierarchy intact, respect the
keyboard lifecycle, safe area, and screen-size adaptation.

## Design and implementation are separate

When the user says "let's discuss the UI", do not edit code. Audit, propose,
compare alternatives, and produce a design spec. Only implement when the user
explicitly says to build it ("做吧", "开始实现", "按这个方案改").

When implementing a large UI phase, follow this order:

1. **Audit** — read the real code and current UI. Never imagine component state.
2. **Product intent** — what problem does this space solve.
3. **Information hierarchy** — what the user sees first, then next, and what
   should not appear at all.
4. **Visual direction** — only now choose typography, spacing, surface, color,
   cards, labels, icons.
5. **Motion** — decide how states change.
6. **Implementation** — write React Native.
7. **Real device** — the final verdict comes from a real device, not a
   screenshot or a test.

## CODE COMPLETE ≠ EXPERIENCE COMPLETE

A passing test, a passing typecheck, a passing build, an animation that exists,
or a screenshot that looks right is not proof that the experience is done. The
final judgment is **REAL DEVICE ACCEPTANCE**.

## Conflict priority

When rules conflict, apply this order:

1. The user's explicit current request.
2. `jianyuan-mobile-design` (this skill).
3. Mobile UX.
4. UI design.
5. UI animation.
6. Generic third-party defaults.

If a third-party skill suggests something beautiful but off-philosophy, do not
adopt it.

## Scope boundary

Design work may propose layout variants, card alternatives, typography, tag
interaction, navigation detail, and visual hierarchy. It must not change Core
semantics, Reflection boundaries, Relation rules, Evidence rules, Awareness
meaning, or user agency. Product semantics rank above visual solutions.

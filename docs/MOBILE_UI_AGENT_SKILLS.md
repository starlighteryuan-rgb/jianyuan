# Mobile UI Agent Skills

How to use the UI design skills for 见渊 (Jianyuan) during the M3.2 UI Design
phase and afterwards.

## Where the skills live

Project-local, version-controlled skills:

```
.agents/skills/
```

Codex loads repository skills from `.agents/skills` in every directory from the
current working directory up to the repository root. This directory is
committed to the repository, so any new Codex session in this repo can read the
same skills without depending on a specific machine's private global state.

Global user skills live separately at `~/.agents/skills` and are not used for
Jianyuan-specific rules.

## Installed skills

| Skill | Type | Purpose |
| --- | --- | --- |
| `jianyuan-mobile-design` | Project-specific | 见渊's own product design language, the four spaces, visual philosophy, motion philosophy, frozen UI, and the design/implementation workflow. |
| `mobile-ui-ux-designer` | Adapted from `mdrmuhaimin/agentic-skills` | iOS-first React Native UX: hierarchy, screen states, interaction contracts, touch targets, safe area, accessibility, Dynamic Type, keyboard lifecycle, handoff. |
| `ui-design` | Adapted from `mblode/agent-skills` | Visual direction and UI audit: typography, spacing, color, surface, components, states. Trimmed to Expo/React Native. |
| `ui-animation` | Adapted from `mblode/agent-skills` | Motion design and review for React Native Reanimated. Trimmed to mobile. |

## Responsibility split

- **Product / UX** — `jianyuan-mobile-design` + `mobile-ui-ux-designer`
- **Visual** — `ui-design`
- **Motion** — `ui-animation`

`jianyuan-mobile-design` always ranks above the three generic skills. If a
generic skill suggests something that conflicts with 见渊's product meaning or
visual character, follow `jianyuan-mobile-design`.

## Recommended combinations

| Task | Skills to use |
| --- | --- |
| Design Record Space | `jianyuan-mobile-design`, `mobile-ui-ux-designer`, `ui-design` |
| Design Awareness Bubble | `jianyuan-mobile-design`, `ui-design`, `ui-animation` |
| Motion tuning | `jianyuan-mobile-design`, `ui-animation` |
| Accessibility audit | `mobile-ui-ux-designer`, `jianyuan-mobile-design` |
| Understanding / Exploration redesign | `jianyuan-mobile-design`, `mobile-ui-ux-designer`, `ui-design` |
| Tag / Card work | `jianyuan-mobile-design`, `ui-design` |

## Conflict priority

1. The user's explicit current request.
2. `jianyuan-mobile-design`.
3. `mobile-ui-ux-designer` (mobile UX).
4. `ui-design` (visual).
5. `ui-animation` (motion).
6. Generic third-party defaults.

## Design vs implementation

When the user says "let's discuss the UI", the skills produce audit, options,
and a design spec only. Implementation starts when the user explicitly says to
build it.

## References inside `jianyuan-mobile-design`

- `references/product-spaces.md` — the four spaces and their semantics.
- `references/design-principles.md` — visual philosophy, what to avoid.
- `references/motion-language.md` — settle / surface / sink / connect, Reduce
  Motion.
- `references/frozen-ui.md` — accepted UI and interaction contracts.

## Source and adaptation notes

- `ui-design` and `ui-animation` are adapted from
  [`mblode/agent-skills`](https://github.com/mblode/agent-skills). The upstream
  versions target web, Next.js, Tailwind, and CSS; the local versions are
  trimmed to Expo, React Native, Reanimated, and iOS. They are adaptations, not
  verbatim copies.
- `mobile-ui-ux-designer` is adapted from
  [`mdrmuhaimin/agentic-skills`](https://github.com/mdrmuhaimin/agentic-skills)
  (`codex/mobile-ui-ux-designer/skill.md`, MIT). The upstream is a
  cross-platform spec that ships as `skill.md`; the local version is renamed to
  `SKILL.md` and trimmed to Expo, React Native, and iOS.
- `jianyuan-mobile-design` is entirely project-specific.

## Safety

No third-party scripts or binaries were executed when creating these skills.
Upstream content was only read as reference material. No runtime dependency was
added to the app.

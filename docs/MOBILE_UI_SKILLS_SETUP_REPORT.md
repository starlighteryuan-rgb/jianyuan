# Mobile UI Agent Skills Setup Report

Status: MOBILE UI AGENT SKILLS READY

This round only builds the reusable Codex skill environment for the upcoming
M3.2 UI Design phase. No mobile UI implementation, Core, Provider, SQLite,
Desktop, or Web code was changed.

## ENVIRONMENT

- Codex CLI: `codex-cli 0.154.0`.
- Skill mechanism confirmed from the official Codex manual (fetched via the
  bundled `openai-docs` helper): a skill is a directory with a required
  `SKILL.md` containing `name` and `description`, plus optional `references/`,
  `scripts/`, and `assets/`. Codex sees skill name + description first and loads
  the full body only when the skill is selected.
- Repository skill location, per the official manual: Codex reads repository
  skills from `.agents/skills` in every directory from the current working
  directory up to the repository root. The user location is `~/.agents/skills`;
  the admin location is `/etc/codex/skills`.
- This repository had only an empty, gitignored `.codex/` directory and no
  existing skills or `SKILL.md` files. `.codex/skills` is therefore NOT the
  discovery path Codex reads for this project.
- Chosen location: `.agents/skills` at the repository root, `.agents/` is not
  gitignored, so the skills are version-controlled and available to any new
  Codex session in this repo.

## INSTALLED / ADAPTED SKILLS

| Skill | Source | Original or adapted | Location | Purpose |
| --- | --- | --- | --- | --- |
| `jianyuan-mobile-design` | Authored in this repo | Original, project-specific | `.agents/skills/jianyuan-mobile-design/` | 见渊's own design language, four-space semantics, visual and motion philosophy, frozen UI, workflow. |
| `mobile-ui-ux-designer` | `mdrmuhaimin/agentic-skills` (`codex/mobile-ui-ux-designer/skill.md`, MIT) | Adapted to Expo + React Native + iOS | `.agents/skills/mobile-ui-ux-designer/` | iOS-first React Native UX: hierarchy, screen states, interaction contracts, touch targets, safe area, accessibility, Dynamic Type, keyboard lifecycle, handoff. |
| `ui-design` | `mblode/agent-skills` (`skills/ui-design`) | Adapted to Expo/React Native | `.agents/skills/ui-design/` | Visual direction and UI audit: typography, spacing, color, surface, components, states. |
| `ui-animation` | `mblode/agent-skills` (`skills/ui-animation`) | Adapted to React Native Reanimated | `.agents/skills/ui-animation/` | Motion design and review: timing, easing, springs, transitions, enter/exit, Reduce Motion. |

### Notes on the requested upstream sources

- `mdrmuhaimin/agentic-skills` does contain a real `mobile-ui-ux-designer` at
  `codex/mobile-ui-ux-designer/skill.md` (MIT, 43 KB). It is not directly
  installable as-is on two counts: the file is named `skill.md` rather than the
  `SKILL.md` Codex requires, and its content is cross-platform (iOS, Android,
  Flutter, React Native, web) with substantial web/Android material. Following
  the task rule "do not mechanically copy, trim to Expo + React Native +
  iOS-first", the upstream methodology was adapted locally rather than copied
  verbatim. This is disclosed in the skill body itself.
- `mblode/agent-skills` contains real, complete `skills/ui-design` and
  `skills/ui-animation` directories. Their upstream content targets web, Next.js,
  Tailwind, and CSS. Only the applicable methodology was carried over and
  rewritten for Expo + React Native + iOS. These are adaptations, not verbatim
  copies, and no upstream script was copied in.

## JIANYUAN SKILL

`jianyuan-mobile-design` (`SKILL.md` plus four references) encodes:

- The top rule: **AI 只提出可能性，用户决定意义.**
- Non-negotiable semantics: Record is the user's original expression; AI
  Observation ≠ User Fact; Reflection belongs to the user; Relation requires
  evidence boundaries; Evidence never auto-generates from unconfirmed AI
  Observation; Quick Response alone is not a Reflection; only user free-text
  Reflection enters the Core Gate; `NO_OBSERVATION` is a normal result.
- The four spaces with meaning, verb, and feel: Record/记录 (落下), Awareness/觉察
  (浮现), Understanding/理解 (沉淀), Exploration/探索 (连接), and the explicit
  "同源但不同" rule.
- Visual character and the avoid list (no neon AI, no purple/blue AI gradients,
  no glassmorphism everywhere, no cards everywhere, no excessive shadow/blur, no
  high-saturation CTA, no gamification/streak/score/badge overload).
- The rule **Card is not the default answer.**
- Motion philosophy and the frozen Awareness Bubble timing (520 / 420 / 820 ms).
- Accessibility and Reduce Motion requirements.
- **CODE COMPLETE ≠ EXPERIENCE COMPLETE** and real-device acceptance as the
  final bar.
- Design vs implementation separation: when the user says "let's discuss the
  UI", produce audit / alternatives / spec and do not edit code until told to
  build.
- The frozen App Shell, Awareness, Search, and Reflection contracts.
- Conflict priority: user request > `jianyuan-mobile-design` > mobile UX >
  UI design > UI animation > generic defaults.

References:

- `references/product-spaces.md`
- `references/design-principles.md`
- `references/motion-language.md`
- `references/frozen-ui.md`

## DISCOVERY VALIDATION

A real, non-interactive Codex session was run in this repository with a
read-only sandbox and this prompt:

> Audit the Jianyuan Record Space using the available mobile design skills. Do
> not edit files. In your answer, first list exactly which skills you loaded by
> name, then give a short audit of apps/mobile/src/spaces/record-space.tsx.

Result: the session loaded and named all four project skills —
`jianyuan-mobile-design`, `mobile-ui-ux-designer`, `ui-design`,
`ui-animation` — and produced a Record Space audit without editing any file.

A second read-only session was run after `mobile-ui-ux-designer` was rewritten
with the adapted upstream content. Its prompt was to audit the Record space for
information hierarchy, touch target size, and safe area using the project mobile
design skills. It loaded and named `jianyuan-mobile-design`,
`mobile-ui-ux-designer`, and `ui-design`; `ui-animation` was correctly not
loaded because the task involved no motion. This confirms discovery works and
that skills load selectively rather than all at once.

Both sessions confirmed the skills are discovered from `.agents/skills` and are
usable in this repository.

The audit's specific findings are that session's own judgment and were not
independently verified here; they are not part of this task's deliverables and
should be re-checked during M3.2 rather than treated as confirmed defects.

## SAFETY

- No unknown third-party install script, shell script, or binary was executed.
- Upstream skills were read as reference material only (raw `SKILL.md` and
  directory listings via the public GitHub API).
- No upstream `scripts/` directory was copied into this repository.
- No runtime dependency was added to the app.
- No `package.json` in `apps/mobile` or the repository root was modified.

## CODE IMPACT

- Mobile UI implementation: not modified.
- Core / Provider / SQLite: not modified.
- Desktop / Web: not modified.
- `docs/learning/`, `apps/desktop/src-tauri/Cargo.toml`, `.release-artifacts/`:
  not modified, not staged.
- Added only: `.agents/skills/**`, `docs/MOBILE_UI_AGENT_SKILLS.md`,
  `docs/MOBILE_UI_SKILLS_SETUP_REPORT.md`.

## FILES ADDED

```
.agents/skills/jianyuan-mobile-design/SKILL.md
.agents/skills/jianyuan-mobile-design/references/product-spaces.md
.agents/skills/jianyuan-mobile-design/references/design-principles.md
.agents/skills/jianyuan-mobile-design/references/motion-language.md
.agents/skills/jianyuan-mobile-design/references/frozen-ui.md
.agents/skills/mobile-ui-ux-designer/SKILL.md
.agents/skills/ui-design/SKILL.md
.agents/skills/ui-animation/SKILL.md
docs/MOBILE_UI_AGENT_SKILLS.md
docs/MOBILE_UI_SKILLS_SETUP_REPORT.md
```

## NEXT

The M3.1 series is frozen. The next phase is M3.2 Record Space UI, to be defined
together with ChatGPT Product Design. This round stops here.

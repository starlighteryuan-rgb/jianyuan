# Mobile M3.3 — Global Visual Language Review Report

Status: DESIGN REVIEW MATERIAL READY — AWAITING USER VISUAL DECISION

This round produced a global visual language and a paired Light / Dark visual
board for review. No runtime UI code was changed.

## CONCLUSION

A single global visual language for 见渊 mobile is defined, with one paired
Light / Dark expression and a reviewable board covering all four spaces,
Awareness main and history, the opened awareness object, search mode, tags, and
awareness emergence motion. It is ready for visual review; nothing is frozen
until the board is approved.

## PRODUCED

Documents:

- `docs/MOBILE_M3_3_GLOBAL_VISUAL_LANGUAGE.md` — the global language: theme
  roles and values, typography, spacing / radius / touch, surface hierarchy,
  motion language, four-space expression, and the path from global language to a
  single screen.

Visual lab (reviewable board, no runtime dependency):

- `apps/mobile/visual-lab/m3-3-global/index.html` — the board
- `apps/mobile/visual-lab/m3-3-global/tokens.css` — token sheet for both themes
- `apps/mobile/visual-lab/m3-3-global/board.css` — board layout and component
  language
- `apps/mobile/visual-lab/m3-3-global/preview/board-full.png` — full board render
- `apps/mobile/visual-lab/m3-3-global/preview/closeup-record.png`
- `apps/mobile/visual-lab/m3-3-global/preview/closeup-awareness.png`
- `apps/mobile/visual-lab/m3-3-global/preview/closeup-search.png`

Screens on the board, each in Light and Dark where meaningful (17 phone frames,
9 Light, 8 Dark):

1. App shell — header + bottom tab
2. Record space — weak-carded time stream, rest and opened state
3. Awareness — main stage, idle and emerged
4. Awareness — bubble opened / detail, stage-centred object
5. Awareness — history
6. Understanding — settled reflection
7. Exploration — thread and lattice with evidence boundary
8. Search — header search mode, on a small iPhone width
9. Tag / chip / filter
10. Motion — awareness emergence frames (520 / 420 / 820 ms) plus Reduce Motion
11. Theme role table, layout / spacing / radius / touch table, surface hierarchy
    table

## DESIGN CONCLUSION

**Core style.** One calm, warm, restrained system. Light is *Warm Paper*
(`#f6f2ea` ground, one amber accent); Dark is *Deep Amber* (`#14130f` warm
near-black, the same accent lightened for the dark ground). They are not two
products and not an inversion: every role has the same name in both, and only
the value changes.

**Structural style.** Text is the material. Most surfaces are level 0 (canvas +
hairline) or level 1 (faint surface). Cards are the exception, used mainly for
the awareness object. Nothing is neon, glassy, gradient-heavy, or shadow-stacked.

**Space differentiation.** Record settles (time stream, body dominant),
Awareness surfaces (object on a stage with a soft halo), Understanding sinks
(settled user text with AI support visibly secondary), Exploration connects
(threads and a light lattice with a stated evidence boundary).

**Semantics preserved.** No treatment lets an AI observation outrank the user's
own words, no tag is colour-coded as meaning, and Exploration never draws a
hypothesis as a confirmed fact.

## FROZEN IF APPROVED

Proposed to freeze once reviewed (currently *proposals*, not yet frozen):

- One token role list, two themes; geometry identical across themes.
- Warm paper light ground and warm near-black dark ground; a single restrained
  amber accent; the accent lightens in Dark.
- Metadata never outranks the user's own words; body text never below 16 px.
- Card is not the default answer; surface levels 0 and 1 carry most screens, and
  level 3 is reserved for Awareness.
- Small radius scale (6 / 10 / 14 / pill); no large rounded rectangles.
- 44×44 pt touch targets; safe-area insets on the shell.
- Awareness bubble emergence timing 520 / 420 / 820 ms stays frozen.
- Reduce Motion degrades to fade, drops scale, movement, and ripple.
- Search mode removes the brand and actions from the header layout rather than
  compressing them (already accepted behavior, now part of the language).

## NEEDS YOUR DECISION

These specifically need a visual call before implementation:

1. **Light ground warmth** — keep `#f6f2ea`, or move slightly warmer / cooler.
2. **Accent strength in Light** — keep `#7a5a2e`, or mute it further.
3. **Awareness halo at rest** — visible always, or only during emergence and
   then fade out. This affects whether Awareness reads as calm or as glowing.
4. **Awareness bubble-open treatment** — the board proposes the object becoming
   the stage centre with surroundings receding. This is the known debt and the
   biggest open question.
5. **Exploration structure** — whether the thread/lattice reads as connection or
   as decoration when seen on a real device.
6. **Tag capsule weight** — whether the current pill is light enough, or should
   become a text-only chip.

## FIRST SPACE TO IMPLEMENT

Recommendation: **Record first**, Awareness second.

Reason: Record's direction is already accepted on a real device (weak-carded
time stream, body-dominant, quiet tags). Rebuilding it against the new tokens is
the lowest-risk way to validate the token system in both themes before spending
effort on Awareness, where the bubble-open treatment is still unresolved and
carries the highest rework risk.

If the priority is visual impact instead of risk, Awareness is the alternative,
but its open-object treatment should be settled first.

## DO NOT DO YET

- Do not rebuild all four spaces in one pass.
- Do not implement the token values into runtime before the board is approved.
- Do not add tag colours, category colours, or a semantic colour system.
- Do not introduce gradients, glass, or glow as decoration.
- Do not turn Exploration into a graph tool or Awareness into a dashboard.
- Do not change Bottom Tab motion, awareness timing, or the accepted search
  lifecycle as part of this change.

## VERIFICATION

How the design output was checked:

- The board was rendered headlessly and checked programmatically: 17 phone frames
  rendered (9 Light, 8 Dark), zero header overflow elements, and no horizontal
  page overflow.
- Close-up renders of Record, Awareness, and Search were inspected visually to
  confirm text fits, tags stay light, and search mode shows no overlap of the
  brand.
- Theme values were authored as one role list with two value sets, so Light and
  Dark cannot drift in geometry.

What this verification does **not** prove: real-device feel. Contrast, Dynamic
Type growth, and motion timing still require real-device acceptance, and the
board is a design reference rather than a running screen.

## CODE IMPACT

- Runtime mobile UI: not modified.
- Core / SQLite / Provider / Desktop / Web: not modified.
- `docs/learning/`, `apps/desktop/src-tauri/Cargo.toml`, `.release-artifacts/`:
  not touched, not staged.
- Added: `docs/MOBILE_M3_3_GLOBAL_VISUAL_LANGUAGE.md`,
  `docs/MOBILE_M3_3_GLOBAL_VISUAL_LANGUAGE_REVIEW.md`,
  `apps/mobile/visual-lab/m3-3-global/**`.

## GIT

Not committed yet at the time of writing; the commit is created after the board
and report are both in place.

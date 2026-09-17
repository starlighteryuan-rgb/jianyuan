# Mobile M3.3 — Global Visual Language / Theme System

Status: DESIGN PROPOSAL — AWAITING VISUAL REVIEW

This round defines the global visual language for 见渊 mobile and gives one
paired Light / Dark expression of it. It does **not** change runtime UI code.
The reviewable artifacts are in `apps/mobile/visual-lab/m3-3-global/`.

## GOAL

Decide what 见渊 looks like before deciding what each screen looks like.

- One product identity, two theme expressions — not two designs and not an
  inverted copy.
- One set of token roles; only the values change between Light and Dark.
- Shared typography, spacing, radius, surface, and motion across all four spaces.
- The four spaces stay "same origin, different expression" rather than one card
  with four headings.

Explicitly not in scope: rewriting runtime screens, changing Core / SQLite /
Provider / Awareness orchestration, or restyling every page in one pass.

## DESIGN PRINCIPLES

1. **Body text is the subject.** The user's own words carry the heaviest visual
   weight on every screen. Container, chrome, and metadata are quieter than the
   content they hold.
2. **Card is not the default answer.** Most of the product is canvas, space, and
   a hairline. A surface is introduced only where grouping or an interaction
   boundary genuinely requires it.
3. **One accent, restrained.** A single warm amber accent marks the one primary
   action and active state. No colour-coding by category, no per-tag colours, no
   semantic rainbow.
4. **Depth is quiet.** Separation comes from space and tone before borders, and
   borders before shadow. Shadows are almost never used.
5. **Color is never the only signal.** Every state carries text, shape, or
   position as well.
6. **Calm is structural, not decorative.** No neon, no glass, no gradient, no
   glow-as-effect. Stillness is the brand.
7. **AI stays visually subordinate.** An AI observation never outranks the
   user's own words or reflection.

## LIGHT / DARK THEME SYSTEM

One role list, two value sets. Same geometry in both themes by construction.

| Role | Light · Warm Paper | Dark · Deep Amber |
| --- | --- | --- |
| `canvas` | `#f6f2ea` | `#14130f` |
| `surface` | `#fbf8f2` | `#1b1a15` |
| `elevated` | `#fffdf8` | `#21201a` |
| `sunken` | `#ede7db` | `#100f0c` |
| `textPrimary` | `#221f1a` | `#edeae3` |
| `textSecondary` | `#565146` | `#b3aea3` |
| `textMuted` | `#6e685c` | `#918b7e` |
| `textFaint` *(new)* | `#938c7e` | `#6e6960` |
| `borderHair` | `#e4dcce` | `#2a2721` |
| `borderStrong` | `#cfc5b2` | `#3a362d` |
| `accent` | `#7a5a2e` | `#ddb276` |
| `accentFill` | `#8a683a` | `#c69355` |
| `accentSoft` | `rgba(138,104,58,.09)` | `rgba(221,178,118,.12)` |
| `onAccent` | `#fffdf8` | `#1a1712` |
| `focus` *(new)* | `rgba(168,121,47,.40)` | `rgba(221,178,118,.42)` |
| `success` | `#3d6a45` | `#8fbe97` |
| `danger` | `#9a3f31` | `#e39c8b` |
| `warning` *(new)* | `#8a6420` | `#d6ac6a` |

Awareness and tag families derive from `accent` so they cannot drift:

| Family | Light | Dark |
| --- | --- | --- |
| `awarenessFill` | `rgba(138,104,58,.06)` | `rgba(221,178,118,.07)` |
| `awarenessEdge` | `rgba(138,104,58,.30)` | `rgba(221,178,118,.34)` |
| `awarenessGlow` | `rgba(138,104,58,.14)` | `rgba(221,178,118,.18)` |
| `awarenessRipple` | `rgba(138,104,58,.20)` | `rgba(221,178,118,.24)` |
| `tagBg` | `rgba(138,104,58,.07)` | `rgba(221,178,118,.10)` |
| `tagBorder` | `rgba(138,104,58,.22)` | `rgba(221,178,118,.24)` |
| `tagText` | `#6a5732` | `#d8bf94` |

Why these choices:

- **Light is a warm paper, not white.** `erased-white` screens read as office
  software; a warm ground reads as private writing.
- **Dark is a warm near-black, not pure black and not black-gold.** Pure black
  raises contrast to a harsh level and reads as a media player. Warm dark keeps
  the relationship to the light theme.
- **The accent lightens in dark mode.** `#7a5a2e` on a dark ground would lose
  contrast, so the accent becomes `#ddb276`. Same role, corrected for the ground.
- **Text roles shift by mood, not by invert.** `textMuted` gets lighter in dark
  mode so metadata stays legible instead of fading into the ground.
- **New roles this round:** `textFaint` (day headers, timestamps),
  `focus` (keyboard focus ring), `warning` (degraded AI state), plus the
  awareness and tag families.

State tokens: `selected` = `accentSoft` fill + `accentFill` border;
`pressed` = one step toward `sunken`; `disabled` = `textMuted` ink at reduced
opacity plus an explicit reason string; `focus` = `focus` ring.

## TYPOGRAPHY SYSTEM

| Role | Size / leading | Colour | Used for |
| --- | --- | --- | --- |
| app title | 20 / 26 | `textPrimary` | `见渊` (header, frozen) |
| nav title | 17 / 24 | `textPrimary` | secondary page titles (e.g. 觉察历史) |
| section title | 15 / 22 | `textPrimary` | exploration thread axis |
| day group | 12 / 16 | `textFaint` | 今天 / 昨天 / 9月15日 |
| body · record | 16 / 26 | `textPrimary` | Record verbatim (the subject) |
| body · reflection | 17 / 28 | `textPrimary` | Understanding reflection |
| body · observation | 17 / 28 | `textPrimary` | Awareness observation |
| secondary | 14 / 22 | `textSecondary` | supporting copy, evidence summary |
| metadata / timestamp | 12 / 16 | `textMuted` | time, status |
| tag / chip | 12 / 16 | `tagText` | tag capsules, filters |
| action / button | 15 / 20 | `accent` or `onAccent` | primary and secondary actions |
| empty state | 15 / 24 | `textMuted` | empty guidance |

Rules: body size never drops below 16 for user writing; metadata may not carry
more weight than the content; the type scale is deliberately small so screens
stay calm; all sizes must tolerate Dynamic Type growth without clipping meaning.

## LAYOUT / SPACING / RADIUS / TOUCH

| Item | Value | Reason |
| --- | --- | --- |
| Page margin | 20 px | breathing room without wasting width |
| Section gap | 24 px | separate by space, not boxes |
| List item padding | 12 px vertical | records read as one stream |
| Header height | 52 px | stable, identical in both themes |
| Header margin | 20 px horizontal | same rhythm as content |
| Search field | 38 px tall, `flex: 1` in search mode | full width so nothing can overlap |
| Filter row | 10 px vertical | light, does not become a toolbar |
| Radius | xs 6 · sm 10 · md 14 · pill | small radii; nothing is a big blob |
| Touch target | 44×44 pt | iOS minimum; pad the pressable |
| Safe area | top + bottom insets on the shell | nothing essential under notch / home indicator |

Search expanded structure: in search mode the brand and the actions leave the
layout entirely, so the field occupies the full header width. The tag filter row
sits directly below the header. This reuses the accepted M3.2.1 behavior.

## SURFACE HIERARCHY

Five levels, with a reason for each:

| Level | Treatment | Appears when |
| --- | --- | --- |
| 0 · None | canvas, separation by space + hairline | record at rest, day groups, threads |
| 1 · Faint surface | `surface` fill, no border, no shadow | an opened record, a settled reflection |
| 2 · Interactive surface | `surface` + hairline border | write-in well, pressed control |
| 3 · Object surface | `surface` + awareness edge, optional halo, one soft shadow | awareness bubble / opened object |
| 4 · Overlay | `elevated` over scrim | a true modal or picker, used rarely |

Most of the product lives at levels 0–1. Level 3 is reserved for Awareness,
where the object genuinely is the point. This is the concrete meaning of
"Card is not the default answer".

## MOTION LANGUAGE

Motion is the visible form of a state change, not decoration.

| Moment | Semantics | Timing | Reduce Motion |
| --- | --- | --- | --- |
| Space switch | horizontal motion + fade (frozen) | 240 ms | fade only, no translate |
| Search expand / collapse | header swaps mode, field takes full width | 140–240 ms | opacity only |
| Record save | text settles down into the stream | ~180–240 ms | opacity only |
| Record expand | in-place reveal, no page jump | 200 ms | immediate |
| Awareness emergence | gather → shape → text → ripple | **520 / 420 / 820 ms (frozen)** | fade, ripple disabled |
| Bubble open | object becomes stage centre, surroundings recede | 240–320 ms | fade, no scale |
| Understanding | slower settle, no celebration | 320–450 ms | opacity only |
| Exploration | connections form gradually | 320–450 ms slow | static lines, fade |

Reduce Motion degradation: drop large scale and spatial movement and the ripple;
keep fade and emphasis; never remove the state information the motion carried.

## FOUR SPACES — SAME ORIGIN, DIFFERENT EXPRESSION

| Space | Verb | Expression in this system |
| --- | --- | --- |
| 记录 Record | 落下 settle | Level-0 time stream; body dominant; time faint; tags light; day headers quiet |
| 觉察 Awareness | 浮现 surface | Level-3 object on a quiet stage; single soft halo; history separate |
| 理解 Understanding | 沉淀 sink | Level-1 settled text; user's reflection reads as the subject; AI support visibly secondary |
| 探索 Exploration | 连接 connect | Threads and a light lattice with an explicit evidence boundary, not a card list and not a graph tool |

Shared: typography family, spacing, radius, surface language, navigation, calm.
Different: what each space is for and how the transition reads.

## WHY NOT CHANGE RUNTIME CODE YET

The global system has to be judged as a whole, in both themes, before any screen
is rebuilt against it. Changing runtime code now would mean:

- committing to values before they are reviewed;
- diverging Light and Dark during implementation;
- re-touching screens more than once.

The visual lab is a static board. It carries no runtime dependency and changes
no shipping file. Once the values are approved, implementation becomes a token
value swap plus per-space layout work, not a redesign.

## NEXT: FROM GLOBAL LANGUAGE TO A SINGLE SCREEN

Recommended order after approval:

1. Freeze token values for both themes.
2. Pick one space to implement first — recommend **Record** (its direction is
   already accepted; it is the lowest-risk validation of the token system) or
   **Awareness** (highest visual payoff, but the bubble-open treatment is still
   the known debt).
3. Implement that space against the tokens only; verify Light and Dark together
   on a real device.
4. Only then propagate to the remaining spaces.

## OPEN QUESTIONS FOR REVIEW

- Whether Light should be slightly warmer or slightly cooler than `#f6f2ea`.
- Whether the awareness halo should be visible at rest or only during emergence.
- Whether the accent should be a touch more muted in Light.
- Whether the exploration lattice reads as "structure" or as "decoration" on a
  real device.

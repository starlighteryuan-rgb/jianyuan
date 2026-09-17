# Mobile M3.3 Direction B — Spatial / Depth

Status: DIRECTION B READY FOR REVIEW — NO RUNTIME CODE CHANGED

A second, independent art direction for 见渊 mobile. Direction A (Editorial /
Quiet Archive) is untouched. Reviewable board:
`apps/mobile/visual-lab/m3-3-direction-b/`.

## CONCEPT

**Direction B — Spatial / Depth.** Content does not simply line up on one flat
plane; it sits in a shallow psychological space with a few depth layers. The
meaning of a space is carried by *where its content sits between those layers*,
not by typography or container styling.

The proposition: the user's records, awareness, understanding, and relations all
exist at different depths. A record just made is near; an older record has
receded. Something worth noticing comes forward out of the background; a
reflection settles into a stable layer; relations are distances that shorten.

This is deliberately **not** 3D, sci-fi, hologram, glassmorphism, neon, or VR.
The depth is a light psychological sense of space. There is no perspective
trickery, no stacked drop shadows, and no blur.

## DIFFERENCE FROM A

Direction A organises with **typography and whitespace** in a two-column
editorial frame. Direction B organises with **layers and distance**. They are
genuinely different structures, not variations:

| Axis | Direction A | Direction B |
| --- | --- | --- |
| composition | margin rail + body column, one flat plane | stacked depth planes that overlap and recede |
| surface | almost none; hairline rules separate | tone-stepped planes; only `emerge` gets one soft shadow |
| hierarchy | type scale and whitespace | depth: distance, width, contrast, tiny scale |
| rhythm | paragraph rhythm (26 px / 40 px spacing) | spatial rhythm from overlap and offsets |
| Awareness | centred statement + concentric 1 px halos | ghosts in the background, object walking forward |
| Exploration | numbered index + woven line | nodes placed by depth, real distances between them |
| emotional tone | paper archive, study; quiet and bookish | mineral dusk, psychological space; quiet but deep |
| palette | warm paper + amber | cooled mineral + muted moss |

The colour families are intentionally different too, but colour is not the
differentiator — the de-colour proof section shows the structure holds with all
hue removed.

## DEPTH GRAMMAR

Four layers, deliberately few:

| Layer | Meaning | Expressed by (no shadow) |
| --- | --- | --- |
| `base` | the quiet ground; atmosphere only, no content | page tone + a very light radial tone |
| `rest` | long-lived, stable content that recedes | narrower margins, `scale .965`, lower-contrast ink, sits lower |
| `active` | what the user is reading or operating on now | normal margins, `scale .985`, normal contrast |
| `emerge` | what has just come forward and needs attention | full width, `scale 1`, highest contrast, the only layer allowed one soft ambient shadow |

Depth is expressed by **tone, contrast, margin width, a very small scale step,
position, and slight overlap**. Shadow appears exactly once, on `emerge`, purely
to separate "what just came forward" from "what has long been there". No layer
uses stacked shadows, and nothing uses blur.

The background is not flat but is not a gradient wallpaper either: two very low
opacity radial tones give a hint of atmosphere. At a glance it still reads as a
plain quiet ground.

## LIGHT / DARK

One grammar, two themes.

- **Light — Mineral**: `#e9ece8` base, planes stepping `#f1f3ef → #f8faf7 →
  #fcfefb`, near-black ink `#1b1e1c`, muted moss accent `#4f6b4e`.
- **Dark — Dusk**: `#111413` base, planes stepping `#171b19 → #1e2321 →
  #252b28`, warm off-white ink, accent lifted to `#9dbc93`.

Light does not become a stack of grey cards: depth comes from tone and contrast,
and the plane tones are very close together. Dark is not pure black and not
black-gold: it is a warm charcoal set with a muted moss accent. Both themes use
identical geometry and the same four layers.

## FOUR SPACES

**Record** — records sit at different depths. The newest is `emerge` (full width,
strongest contrast), the previous is `active`, older ones recede into `rest` with
narrower margins, lower contrast and a small scale step. Date coordinates
(`今天 · 09·17`) act as spatial markers rather than section headers. Tags are
small anchors pinned to the plane edge, not coloured chips. Chronology and
readability are unchanged.

**Awareness** — the key scene. Low-contrast **ghost planes** sit behind the
attention centre, visibly smaller, lower and offset; the emerging object walks
forward into the near layer. This is not "a new card appeared"; it is something
that was already in the background coming into attention.

**Understanding** — reflections settle into the stable `active`/`rest` layers.
The main reflection is fully present; earlier ones sink behind it, narrower and
dimmer, so the layering reads as "settling one under another" rather than a list.
This is deliberately unlike both Record (which is deep chronology) and Awareness
(which is emergence).

**Exploration** — relation nodes are placed in space by depth: close-in-time
nodes sit near and bright, cross-time nodes sit far, smaller and dimmer. Real
connector lines run between them, with strong support drawn in the accent. The
user sees that some distances are short and some paths are visible — not a graph
being managed.

## AWARENESS

How "surface" and foregrounding are expressed:

1. **Emergence (main).** Three ghost planes sit behind the centre. They are
   full planes — not blur, not glow — but smaller, lower, offset and lower
   contrast, so they read as content still in the background. The emerging
   object overlaps them from the front and is the only plane with an ambient
   shadow. On a static frame this reads as a foreground object standing in front
   of receding content.
2. **Open.** Opening does not increase height. The object moves to the near
   layer and steps slightly up in scale; the previous list collapses into a
   single low-contrast `behind-strip` at the top. Explanation, provenance,
   evidence strength and responses all appear **inside the same spatial object**,
   separated by hairlines rather than by new cards. That answers the known
   device complaint that opening felt like an accordion: the change is
   foreground/background, not height.
3. Evidence strength is shown as a short bar strip inside the object, so an AI
   possibility is never presented as a confirmed fact.

The frozen emergence timings (520 / 420 / 820 ms) are unchanged; only the
meaning of the motion changes — ghost planes fade back and shrink, the object
moves forward.

## EXPLORATION

How "connection" is expressed, and how it avoids being a list with lines:

- Nodes are not in a column. They are laid out on a two-dimensional field with
  real horizontal and vertical distance, at three depth levels.
- Depth is the primary signal: near nodes are `active`/`emerge` tone, larger and
  readable; far nodes are `rest` tone, smaller and dimmer.
- Connections are actual drawn segments between node centres, angled according
  to their real relative position. Strong-support links use the accent colour.
- A single caption states the cluster, the record count, the time span and the
  support level, ending with the explicit line "这是可能的结构，不是结论。"
- There is no node dragging, no graph editing, no zoom, no pan. Relations are
  **seen**, not managed.

## SELF CHECK

**1. If Direction B were recoloured with Direction A's exact palette, would it
still be a different design?** Yes. The difference is structural: stacked,
overlapping, receding planes versus a flat rail + column; ghosts walking forward
versus concentric rings; depth-placed link nodes versus a numbered woven index.
The board proves this directly in section 7 with a fully neutral grey render that
keeps the depth and drops all hue.

**2. Can foreground / background / active layer actually be felt in a static
screenshot?** Yes, and this was the hardest part of the round. The first render
had ghosts so faint that they were invisible behind the object; they were
increased in tone, size and asymmetric offset until the overlap is plainly
visible in the frame itself. In the Awareness and Record close-ups the front
plane visibly extends past and overlaps the planes behind it, and the far planes
are dimmer and narrower — legible without any caption. The Exploration view shows
the same relationship between near and far nodes.

**3. With titles hidden, can the four spaces be distinguished by composition?**
Yes. Record is a vertical run of overlapping planes narrowing into the distance.
Awareness is a centred object standing in front of several ghost planes.
Understanding is a stack of plates sinking behind one another. Exploration is a
distributed field of linked nodes. These are four different compositions, not one
layout with four headings.

**4. Is it still over-reliant on rectangle cards?** Partly — and this is Direction
B's honest weakness. It uses **planes**, which are rounded rectangles. They are
used to express depth rather than to contain list rows, and they overlap and
change width with depth, but a viewer can still read them as cards. Record uses
three planes, Understanding three overlapping plates, Awareness one object plus
three ghosts, Search one plane plus a background strip. Only Exploration avoids
rectangles entirely (it uses positioned nodes). This is a real risk relative to
Direction A, which uses almost no containers at all.

## HONEST ASSESSMENT

**Strongest:**

- Awareness. Ghost planes walking forward is a genuinely different answer to
  "浮现", and it removes the accordion feel from the open state.
- Exploration. This is clearly stronger than Direction A here: distance and
  depth express connection far better than a numbered index does.
- The de-colour proof holds: depth survives with all colour removed.

**Weakest / riskiest:**

- Record leans on overlapping planes, so it can drift toward a "card stack" —
  the exact failure mode the product is trying to avoid. This is the most
  conservative and most contested space in Direction B.
- Depth depends on tone steps that are deliberately small. On a low-quality or
  badly calibrated screen, the far planes may flatten into one another.
- The single soft shadow on `emerge` is the only shadow in the system; if it is
  strengthened further, Direction B starts to look like a generic card UI.
- Understanding's overlapping plates can read as stacked cards rather than
  settling, depending on how much overlap is used.

**Best fit:** Exploration first (clear win over A), then Awareness.

## NEXT

No direction is chosen here. Compare A and B, then decide whether a third
direction is worth exploring. Do not implement yet.

## FILES

- Board: `apps/mobile/visual-lab/m3-3-direction-b/index.html`
- Tokens: `apps/mobile/visual-lab/m3-3-direction-b/tokens.css`
- Board styles: `apps/mobile/visual-lab/m3-3-direction-b/board.css`
- Renders: `apps/mobile/visual-lab/m3-3-direction-b/preview/`

## VERIFICATION

- Headless render of the board: 16 phone frames (6 Light, 6 Dark, 4 neutral
  de-colour proof), 21 connector lines and 18 constellation nodes rendered
  programmatically, zero clipped content frames, zero horizontal page overflow.
- Close-ups of Record, Awareness, Awareness-open and Exploration were inspected
  visually; the ghost-plane offsets and tone steps were adjusted after the first
  render because the depth was not legible enough in a static frame.
- Not proven here: how the small tone steps read on a real OLED panel, and
  whether overlapping planes feel calm or busy at real size. Those need a real
  device.

## CODE IMPACT

- `apps/mobile/src/**`: not modified.
- Core / SQLite / Provider / Desktop / Web: not modified.
- `docs/learning/`, `apps/desktop/src-tauri/Cargo.toml`, `.release-artifacts/`:
  not touched, not staged.
- Added: this document plus `apps/mobile/visual-lab/m3-3-direction-b/**`.
- Direction A files were not modified.

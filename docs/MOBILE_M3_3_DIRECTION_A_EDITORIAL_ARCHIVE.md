# Mobile M3.3 Direction A — Editorial / Quiet Archive

Status: DIRECTION A READY FOR REVIEW — NO RUNTIME CODE CHANGED

A concept direction for 见渊 mobile that deliberately departs from the current
composition rather than polishing it. Reviewable board:
`apps/mobile/visual-lab/m3-3-direction-a/`.

## CONCEPT

**Direction A — Editorial / Quiet Archive.** A quiet personal archive, not an AI
product, not a productivity tool, not a notes database.

Three ideas carry it:

1. **Typography as structure.** Information is organised by type hierarchy, line
   height, paragraph rhythm, dates, small headings, and whitespace. Containers
   are not the organising device.
2. **Whitespace as hierarchy.** Space is not leftover; it groups, breathes,
   separates, and creates rhythm. Inter-entry space (26 px) versus
   inter-day space (40 px) is what makes the page read as a document rather
   than a list.
3. **Archive feeling.** Not retro, not paper skeuomorphism. Two structural
   devices create it: a **left margin index rail** holding time and markers, and
   **index marks** (`§ 重新适应`) instead of pill tags. Content reads as
   something quietly filed and kept.

## DIFFERENCE FROM CURRENT UI

This is not a polish pass. The changes are structural, and the board opens with
a side-by-side Before / Direction A comparison plus a table of the five axes:

| Axis | Current | Direction A |
| --- | --- | --- |
| composition | single column: input box → divider → card list | two-column frame: margin index rail + body column |
| surface | every record is a bordered, filled rounded card | no container at rest; hairline rules and space only |
| hierarchy | time above body inside the same card; tag is a pill | time lives in the left rail; tag becomes a margin index mark |
| rhythm | equal cards with equal gaps, reads as a list | 26 px between entries, 40 px between days; reads as paragraphs |
| metaphor | content management: one item = one card | a quiet archive: one page of saved paragraphs |

Concretely, the current UI's signature element — a column of rounded cards with a
bordered input box — no longer exists in Direction A. The write-in well becomes
a **writing line** (a single underline). The card is replaced by a **margin
rail + paragraph**.

## LIGHT / DARK

One direction, two theme expressions. Neither is a recolor of the other and
neither is an inverted copy.

- **Light — Warm Paper**: `#f4f0e7` ground, `#fbf9f3` paper, near-black warm ink
  `#1f1c17`, amber accent `#7c5c2f`.
- **Dark — Deep Amber**: `#131209` warm near-black ground, `#1a1912` paper, warm
  off-white ink `#ece8dd`, amber accent lightened to `#d9ad72`.

Same role names in both; only values change. Geometry (rail width, measure,
gutter, breathing distances) is identical by construction, so Light and Dark
cannot drift apart structurally.

The accent is deliberately restrained: it appears on index marks, the reply
selection, section kickers, and the primary action — never as a background wash.

## FOUR SPACES

Each space has a different composition, not just different content:

**Record** — margin index rail (time) + body paragraphs separated by hairlines.
No record is boxed. Tags are margin index marks. Day headers are a small serif
label with a rule that runs to the edge.

**Awareness** — the hardest case under an editorial language. The observation is
a **centred statement standing in space**, wrapped in two very light concentric
halos (1 px rings). It is not a rectangle card, not a list row, and not an inbox
entry. Most of the screen is intentionally empty, and that emptiness means
"nothing else has surfaced". The single action sits on a rule at the bottom.

**Understanding** — an **essay fragment**. The user's reflection uses a larger
serif body with a drop cap, reading as a page of their own short writing. Its
source is an attribution line in the smallest type, so the AI's contribution can
never share the user's visual weight.

**Exploration** — an **index of threads**, not a list and not a graph. Each
thread is a numbered index row: axis, date span, a woven line of nodes and
connectors, an explicit support level, and cross-references to other threads.
Structure is expressed by the weave and numbering; no node is ever drawn as a
confirmed fact.

## SURFACE STRATEGY

The board includes a per-screen surface audit. Result:

- **No content entry in Direction A is wrapped in a rectangle card.** Record,
  Awareness, Awareness-open, Understanding, and Exploration all use space,
  hairline rules, and type instead.
- The only remaining rectangles/lines are chrome boundaries: the tab-bar top
  rule, the search underline, the composer underline, and the reply divider.
- The awareness halos are 1 px rings, not filled containers — they carry the
  "surface" semantics without becoming a card.

Where surface is genuinely needed it is minimal: an opened reply row uses a
hairline divider, and nothing uses a shadow for grouping.

## MOTION LANGUAGE

Concept only; nothing implemented.

- **Record — settle.** A newly saved paragraph fades in and drops 2 px into
  place. No bounce, no pop.
- **Awareness — surface.** The halo expands slowly outward once, then stops;
  the text appears last. The frozen 520 / 420 / 820 ms timing is preserved.
- **Understanding — sink.** The essay fragment settles more slowly, with no
  celebratory motion.
- **Exploration — connect.** The woven line draws from left to right, then the
  nodes appear.
- **Search mode.** Brand and actions fade out; the search line fades in. No
  translation.

All motion is opacity plus small position, with no spring overshoot. Reduce
Motion keeps the fade and drops the halo expansion, the drop, and the line draw.

## SELF-CHECK

**1. If all colour were reverted to the current palette, would this still look
obviously different?** Yes. This is proven on the board, not asserted: section 7
re-renders Record, Awareness, Understanding, and Exploration in a fully neutral
grey palette. The four spaces remain unmistakably different from each other and
from the current card-list UI, because the difference lives in the margin rail,
the centred statement with halos, the drop-cap essay, and the numbered thread
index — none of which depend on colour. The layout tokens (rail, measure,
gutter, breath) are separate from the colour tokens for exactly this reason.

**2. With the titles removed, can the four spaces still be told apart?** Yes. In
the neutral proof, Record is a rail + paragraph stream, Awareness is a centred
statement inside concentric rings, Understanding is a drop-cap essay with
attribution, and Exploration is a numbered index with woven connectors. The
compositions are structurally distinct, not one layout with four headings.

**3. Does it still over-rely on cards?** No. Zero content entries use a card. The
surface audit above lists every remaining line and shows why each exists.

## WHAT WORKS BEST

- Record: the margin index rail + paragraph flow reads as an archive and removes
  the card column entirely. The writing-line composer is the clearest single
  improvement over the current bordered input.
- Understanding: the drop-cap essay makes the user's own words unambiguously the
  subject, which is the product's core semantic.
- The de-colour proof itself: it demonstrates the change is structural.

## STILL CONSERVATIVE

- The Awareness halo is intentionally very light. On a real device it may read
  as too faint to register as "emergence", or it may still read as a large faint
  circle rather than a floating object. This is the least settled element.
- Exploration stops at a thread index with a woven line. It expresses connection
  but does not yet suggest long-term shape or trajectory; a paper-like archive
  can only go so far before it needs a different structural idea.
- The top bar and tab bar keep the current contract and remain visually close to
  the current chrome. Only type and rules changed there.
- Serif body text is a real direction change but also a real risk: it must be
  legible at 17 px on a small iPhone and it must survive Dynamic Type.

## NEXT

Only one suggestion: review this board on a real screen, then decide whether the
serif editorial voice and the margin index rail are the identity to carry
forward for one space — recommend **Record** first, since it is the lowest-risk
place to validate the type system, the rail, and Light / Dark together.

Do not implement yet. Do not start Direction B until this direction is judged.

## FILES

- Board: `apps/mobile/visual-lab/m3-3-direction-a/index.html`
- Tokens: `apps/mobile/visual-lab/m3-3-direction-a/tokens.css`
- Board styles: `apps/mobile/visual-lab/m3-3-direction-a/board.css`
- Renders: `apps/mobile/visual-lab/m3-3-direction-a/preview/`

## VERIFICATION

- Headless render checked: 18 phone frames (7 Light, 6 Dark, 4 neutral proof,
  1 current-style snapshot per side of the comparison), zero clipped content
  frames, zero header overflow, zero horizontal page overflow.
- Close-up renders of Record, Awareness, and the de-colour proof were inspected
  to confirm text fits, hairlines align, and the four spaces stay distinct.
- Not proven by this: real-device legibility of the serif at 17 px, Dynamic Type
  growth, and how the halo actually reads on an OLED screen. Those need a real
  device and are called out as open.

## CODE IMPACT

- `apps/mobile/src/**`: not modified.
- Core / SQLite / Provider / Desktop / Web: not modified.
- `docs/learning/`, `apps/desktop/src-tauri/Cargo.toml`, `.release-artifacts/`:
  not touched, not staged.
- Added: this document plus `apps/mobile/visual-lab/m3-3-direction-a/**`.

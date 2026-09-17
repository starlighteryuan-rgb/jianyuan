# Mobile M3.3 Direction AB — Editorial x Spatial Synthesis

Status: DESIGN REVIEW MATERIAL READY — NO RUNTIME CODE CHANGED

Direction AB keeps Direction A as the product identity and borrows only the
spatial capability of Direction B2. It is not a third visual language and it is
not a recoloured Direction B2.

Reviewable board: `apps/mobile/visual-lab/m3-3-direction-ab/`.

## CONCLUSION

AB is ready for page-by-page visual review.

- Record remains an editorial text stream. B2 contributes only near / far tone
  and focus, not a card stack.
- Awareness Main remains Direction A: whitespace, stage, halo, and the sense
  that something surfaces. B2 only gives a very light background recede.
- Awareness Open uses A's reading structure and B2's foreground focus. It does
  not use a heavy rectangular response panel.
- Understanding remains A. The first-person "我" stays the visual anchor, and
  the screen is not a stack of cards.
- Exploration keeps B2's spatial relation structure with A's surface and
  typography. Nodes are text plus hairline anchors, not rounded cards.
- Search keeps the existing interaction contract. It is visually part of AB,
  and search mode does not get a new interaction model.

No runtime mobile UI, Core, storage, Provider, Desktop, or Web code was changed
in this direction.

## PRINCIPLE

**A owns the identity.**

- warm paper ground in Light;
- typography-led hierarchy;
- whitespace and reading rhythm;
- weak surfaces;
- card is not the default answer.

**B2 contributes only capability.**

- near / far;
- focus / recede;
- an object entering the foreground;
- spatial relation layout.

B2 does not become the base style. Its heavy planes and card-like objects stay
in the comparison board as a reference, not in the AB specification.

## PAGE MAPPING

| Page | Base | Borrowed from B2 |
| --- | --- | --- |
| Record | A | light layering, near / far, focus / recede |
| Record Expanded | A | current record enters foreground, the rest recede |
| Awareness Main | A | very light background recede |
| Awareness Open | A layout | foreground focus for the opened object |
| Understanding | A | quiet hierarchy between the current and older reflections |
| Exploration | B2 structure | A surface and typography |
| Search Mode | A | weak result recede |

## PAGE REVIEW

### Record

The screen is still a dated text stream: day marker, margin time, body text, and
a light tag line. The current entry is slightly nearer through tone and a
gradient; older entries recede by contrast and opacity. There is no shadow-based
depth and no rounded card stack.

Verdict: **PASS**. AB is materially A, with B2 used only as a focus capability.

### Record Expanded

The current record moves into an in-place foreground. The expanded item uses a
left focus rule rather than a floating card, and the surrounding records lose
contrast and move back. This preserves the earlier correction away from heavy
surface.

Verdict: **PASS**. Keep the text-stream structure and the left focus rule.

### Awareness Main

The central stage, large empty field, concentric halo, and single current
awareness statement are intact. The object is not turned into a floating card.
B2 is visible only as a very light background recede.

Verdict: **PASS**. This is still an A-owned screen. The frozen awareness
emergence timing remains 520 / 420 / 820 ms.

### Awareness Open

The content order is A: observation, possible explanation, provenance, response
choices, free-text response, and the boundary note. The opened object enters the
foreground while the surrounding stage recedes. There is a weak tonal surface
and an upper boundary, but not a heavy rectangular panel.

Verdict: **PASS**. Keep the current light surface and focus / recede treatment.

### Understanding

The first-person "我" remains the anchor through the drop cap and essay
structure. The current reflection is slightly nearer; older reflection and
metadata are quieter. The screen does not become a card feed and does not stack
rounded plates.

Verdict: **PASS**.

### Exploration

The board keeps B2's two-dimensional relation structure: nodes are distributed
in space and connected by lines. The AB nodes use A's language: text, a hairline
anchor, quiet metadata, low-contrast links, and one accent relation. The rounded
node cards visible in the comparison section belong to the B2 reference column,
not to AB.

Verdict: **PASS**.

### Search Mode

Search removes the brand and actions from the header, uses A's editorial search
line, keeps tag filters as light index words, and uses weak recede for result
hierarchy. It does not become a card list and does not change the accepted
search lifecycle.

Verdict: **PASS for the static design contract**. Runtime behaviour remains a
separate implementation and real-device check.

## WHAT AB REJECTS

- B2's overlapping rounded planes as the default Record structure.
- B2's ghost placeholder cards in Awareness Main.
- B2's heavy response panel in Awareness Open.
- B2's stacked plates as the default Understanding structure.
- B2's rounded node cards in Exploration.
- Shadow-led depth. AB uses tone, contrast, line, and position first.
- Any new palette, gradient, glass, or neon treatment.

## MOTION CONCEPT

| Space | Meaning | AB expression | Reduce Motion |
| --- | --- | --- | --- |
| Record | settle | new text fades in and settles 2 px; the current item moves near while the rest recede | direct layer change, fade only |
| Awareness Main | surface | keep A's halo / ripple order; background only recedes slightly; keep 520 / 420 / 820 ms | object appears directly, ripple disabled |
| Awareness Open | enter foreground | object reaches the near layer in 240-320 ms; surrounding stage loses contrast and recedes | fade only, no scale or translation |
| Understanding | sink | the current reflection settles slowly; older content loses contrast only | fade only |
| Exploration | connect | nodes are placed first, then connections are drawn | lines appear directly |
| Search Mode | foreground | the result set comes forward; background results recede by contrast; no page jump | same, no translation |

This section is a concept. No animation was implemented in this round.

## VERIFICATION

The following was checked against local files and the current preview renders:

- `apps/mobile/visual-lab/m3-3-direction-ab/index.html`
- `apps/mobile/visual-lab/m3-3-direction-ab/tokens.css`
- `apps/mobile/visual-lab/m3-3-direction-ab/board.css`
- `apps/mobile/visual-lab/m3-3-direction-ab/preview/*.png`

The AB preview renders were regenerated on 2026-09-17 and include Record,
Record Expanded, Awareness Main, Awareness Open, Understanding, Exploration,
Search Mode, the de-colour check, and the A / B2 / AB comparison board.

The source check confirms:

- Record and Understanding use text structure, not a default card;
- Awareness Main keeps the stage and halo;
- Exploration's AB nodes are text plus hairline anchors;
- rounded node cards exist only in the B2 reference column;
- Search uses the A editorial line and weak result recede.

What is not proven: real-device feel, OLED tone separation, Dynamic Type growth,
keyboard behaviour, and motion timing. Those require device acceptance.

## FILES

- Board: `apps/mobile/visual-lab/m3-3-direction-ab/index.html`
- Tokens: `apps/mobile/visual-lab/m3-3-direction-ab/tokens.css`
- Board styles: `apps/mobile/visual-lab/m3-3-direction-ab/board.css`
- Renders: `apps/mobile/visual-lab/m3-3-direction-ab/preview/`
- Capture script: `docs/design/review-boards/m3-3-b2/_work/capture-ab.mjs`

## CODE IMPACT

- `apps/mobile/src/**`: not modified.
- Core / SQLite / Provider / Desktop / Web: not modified.
- `docs/learning/`, `apps/desktop/src-tauri/Cargo.toml`, `.release-artifacts/`:
  not touched, not staged.
- Added: this document plus `apps/mobile/visual-lab/m3-3-direction-ab/**`.
- Direction A and Direction B2 files were not modified by this round.

## NEXT

Do not implement all spaces in one pass. Use this board to choose whether AB is
accepted. If it is accepted, freeze the A-owned token values first, then
implement one space against them and verify Light and Dark together on a real
device.

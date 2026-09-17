# Frozen UI

Parts of the current mobile UI have been accepted on a real device. Treat them
as frozen unless the user explicitly asks to change them.

## App Shell

- Header left shows `见渊`, the application identity, on all four primary
  spaces. It does not change with the space.
- Bottom Tab: 记录 / 觉察 / 理解 / 探索.
- Tab switching uses horizontal motion + fade. This has been accepted; do not
  change it.
- iOS safe-area base structure is accepted.
- The four primary spaces do not repeat their space name as a large in-content
  title. Secondary pages (such as Awareness History) may show their own title.

Default UI iteration happens in the **content layer**, not by repeatedly
redesigning the App Shell.

## Awareness

- Awareness Main and Awareness History are separate. Main is the current stage;
  History is retrieval. Accepted.
- Manual Awareness does not ask the user to select a Record. There is one
  `开始一次觉察` action. Accepted.
- Manual Awareness source-set dedupe: the same source set is not re-analyzed.
  Accepted.
- Bubble emergence timing (520 / 420 / 820 ms) is accepted for automatic
  Awareness entries.
- Automatic Awareness and Adaptive Awareness behavior are accepted.

### Awareness Has Three Distinct States

Awareness Main, New Awareness Result, and Awareness Open are separate states
and must not share one object language.

#### Awareness Main — Stage, Not Object

Main may keep a blurred circular / halo atmosphere, a soft tonal diffusion,
and an attention center. The stage expresses “觉察正在发生的空间”.

Allowed: very light circular / concentric halo, soft tonal diffusion, low
contrast center focus, equivalent Light / Dark structure.

Forbidden: solid dark circular blocks, closed heavy outlines, obvious object
boundaries, and anything that reads as a card, ball, bubble, or floating object.

#### New Awareness Result — Observation Is Not Object

The result of `开始一次觉察` is frozen as editorial text flow, not an object
card. Keep the relation between “新的觉察”, the observation, and time clear.

Prefer typography, whitespace, a very light focus line, tonal shift, and subtle
emergence.

Do not use a circle, oval, halo, large shape, card, bubble, panel, floating
panel, or closed container around the result.

#### Awareness Open — AB Foreground Reading Logic

Open keeps the AB foreground reading logic: the opened observation enters the
foreground, surrounding content recedes, reading order stays clear, and the
response area remains natural.

Do not rebuild Open as a heavy card or heavy container.

Never return to the regressed state of a track-shaped outline, a solid dark
circle, or text incorrectly enclosed by an object.

## Interaction contracts

- Search: circular button → morph to a field. Empty query plus keyboard
  dismissal collapses back to the circular button. A non-empty query keeps the
  field expanded. This lifecycle is accepted.
- Reflection save feedback: `正在保存` → `已保存到「理解」` → settled. Reflection
  persistence must never be blocked by Relation evaluation. Accepted.
- Swipe-to-delete is accepted. Do not redesign the deletion interaction while
  freezing unrelated UI.

## Product semantics

Core, Relation, Evidence, Reflection, and Provider semantics are frozen. Visual
work may not change them.

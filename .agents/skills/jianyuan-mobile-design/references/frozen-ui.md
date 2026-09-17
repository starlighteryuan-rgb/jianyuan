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

### Awareness Main Is Stage, Not Bubble

The circular center / halo in Awareness Main is frozen as stage language:

- it may provide an attention center;
- it may suggest an emergence field;
- it may create quiet anticipation;
- it must stay low-contrast and non-objectified.

It is not a bubble, a content container, or an object shell. Do not use a solid
dark circle, a heavy closed outline, or any boundary that reads as a card, ball,
or floating object.

### Awareness Result Is Not Object

The result of `开始一次觉察` is frozen as text-first:

- no bubble;
- no closed oval / rounded outer frame;
- no card surface;
- no floating panel;
- no obvious object container.

It may use whitespace, a focus line, and tonal emphasis. It should read as
“一条浮现出来的观察”, not “AI 生成了一张结果卡片”.

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

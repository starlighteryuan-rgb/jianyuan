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
- Bubble emergence timing (520 / 420 / 820 ms) is accepted.
- Automatic Awareness and Adaptive Awareness behavior are accepted.

## Interaction contracts

- Search: circular button → morph to a field. Empty query plus keyboard
  dismissal collapses back to the circular button. A non-empty query keeps the
  field expanded. This lifecycle is accepted.
- Reflection save feedback: `正在保存` → `已保存到「理解」` → settled. Reflection
  persistence must never be blocked by Relation evaluation. Accepted.

## Product semantics

Core, Relation, Evidence, Reflection, and Provider semantics are frozen. Visual
work may not change them.

## UI debt that is explicitly deferred

The Bubble open transition still reads somewhat like a card opening. This is
known debt, scheduled for the UI Design phase. Do not fix it opportunistically
while doing other work.

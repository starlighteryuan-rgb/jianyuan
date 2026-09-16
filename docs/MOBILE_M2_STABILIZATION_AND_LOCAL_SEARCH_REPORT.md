# Mobile M2 Stabilization and Local Search Report

## Scope

This report covers the M2 stabilization hotfix on top of:

- Baseline commit: `630cdd3e809891822131036ad9f7f086eddff6ca`
- Message: `fix(mobile): persist awareness reflections correctly`
- Product boundary: Mobile only; no Core contract, SQLite schema, Desktop runtime,
  release, tag, or `docs/learning/` changes.

The purpose of this hotfix is to correct real-device lifecycle and persistence
problems, add deterministic automatic-Awareness coverage, and add a small
space-scoped local search entry. It is not an M3 visual redesign.

## AWARENESS LIFECYCLE FIX

The durable Awareness item status is the single source of truth:

- `pending`: unread and shown in "新的觉察"
- `viewed`: opened by the user and shown in "历史觉察"
- `reflected`: a user response was persisted and shown in history
- `dismissed`: the user said the observation was not their experience

Entering the Awareness tab does not mark items viewed. `markAwarenessViewed`
runs only when a concrete bubble is opened. The unread count and the New
section now derive from the same `pending` predicate, so they cannot disagree.

The unread visual dot is rendered only while `status === 'pending'`.

## NEW / HISTORY QUERY

- New: `status === 'pending'`
- History: `status === 'viewed'`, `status === 'reflected'`, or
  `status === 'dismissed'`
- `createdAt` is not used to decide whether an item is new.
- Viewed state is persisted in the existing Awareness history storage and is
  restored after a process restart.

## AUTO-AWARENESS NEW-RECORD ANCHOR

Automatic Awareness now requires at least one pending Record that is not in the
covered set. The anchor check runs before creating an automatic job or calling
the Provider.

Old Records remain available as supporting context. The automatic path sends
the batch Record ids to the existing candidate selection flow, whose newest
Record remains the anchor while the rest can be context. Old Records alone do
not trigger another automatic check.

## OLD RECORD CONTEXT POLICY

The implementation does not ban a Record from participating again. It only
prevents a covered Record from being the sole trigger for a new automatic
check. A new Record C can therefore cause A/B/C to be evaluated while A/B
continue to provide context.

This remains the existing deterministic candidate selection path. No RAG,
vector database, embedding search, or semantic recall system was added.

## COVERAGE CHECKPOINT

Each automatic job records its Record set and a deterministic
`recordSetFingerprint`.

- Successful `SURFACE` check: the job is `completed` and its Record ids are
  added to `coveredRecordIds`.
- `NO_OBSERVATION`: the job is `no_observation`, and the batch is still marked
  covered because the check completed successfully.
- Provider or transport failure: the job is `failed`, and no Record ids are
  marked covered.
- A completed or no-observation job with the same Record set is not started
  again.

The persisted covered set is bounded to the existing automation-state limit.

## OBSERVATION DEDUPE

This hotfix uses deterministic identity only:

- A job has one durable job id.
- The same Record set is not started twice after completion or
  `NO_OBSERVATION`.
- Candidate insertion checks the existing automation job id plus canonical
  candidate Record refs before writing a Bubble.
- A crash after candidates are written but before job completion recovers from
  the durable candidate result instead of calling the Provider again.

No semantic or embedding-based dedupe was added.

## REFLECTION SAVE UI STATE

The confirmation flow now has a real terminal state:

- saving starts when the user confirms
- `discovery` and `reflection_saved` are both successful outcomes
- success ends the saving state and shows `已保存到「理解」`
- failure ends the saving state and shows the returned error text
- unexpected exceptions are converted into an `unavailable` result, so the UI
  cannot remain on `正在保存……`

The internal result name for the accepted-relation path is `discovery`; there
is no separate `relation_accepted` enum value in the current Mobile runtime.
The regression test covers that accepted-relation path explicitly.

## REFLECTION RECORD VISIBILITY

Core may continue to represent a saved user Reflection as a Record entity. The
fix is at the presentation/query boundary:

- `MobileRuntime.listRecent()` excludes Record ids registered in
  `user_reflection_records`.
- `MobileRuntime.search()` excludes the same ids.
- `listUnderstandingReflections()` still reads all saved Reflections,
  including ones that did not become a Relation.
- Record Space therefore shows user-captured Records only, while Understanding
  remains the Reflection surface.

The SQLite adapter exposes `listRecordIds()` on the existing
`userReflectionRecords` port. No Core contract or schema change was needed.

## LOCAL SEARCH

A circular Search control appears to the left of the existing Settings entry on
the four primary spaces. It is closed by default.

- Clicking Search expands the control and autofocuses the TextInput.
- Clear empties the query.
- Cancel clears the query, closes the control, and restores the Search button.
- Switching tabs clears the query and closes search.
- Opening a space does not autofocus or open the keyboard.

Search is local-only. It uses substring, case-insensitive matching and does not
call the Provider, create Awareness, enter the Core Gate, or write search state
to SQLite.

## SPACE-SCOPED SEARCH

- Records: ordinary Capture Record verbatim only; Reflection-origin Records are
  excluded.
- Awareness: durable Awareness observation text, including pending and history
  items.
- Understanding: saved user Reflection verbatim.
- Exploration: persistent Relation fields already admitted by the Core Gate;
  transient AI observations are not searched.

Each space filters its own local collection. There is no cross-space search
index or shared result list.

## TESTS

Added or updated:

- `apps/mobile/tests/m2-stabilization.test.tsx`
- `apps/mobile/tests/m2-local-search-ui.test.tsx`

Verified in this workspace:

- Mobile test suite: 15 files, 115 tests passed.
- Root test suite: 47 files, 857 tests passed.
- Mobile TypeScript check: passed.
- Root TypeScript check: passed.
- `git diff --check`: passed.

The focused stabilization file covers lifecycle, restart persistence,
new-anchor behavior, covered checkpoints, Provider failure, Reflection Record
visibility, local Provider-free search, accepted-relation save state,
Reflection-only save state, and save failure state.

## KNOWN LIMITATIONS

- The iOS device acceptance run was not performed in this workspace.
- The Node test runtime uses the production Mobile composition and SQLite
  adapter with the Node driver; it is not a substitute for an iPhone smoke test.
- Search is intentionally simple substring matching. It has no ranking,
  stemming, fuzzy matching, embeddings, or semantic retrieval.
- Semantic Observation dedupe is intentionally not implemented. The current
  guarantee is deterministic job/source-set identity.
- The current result type calls the accepted-relation path `discovery`; future
  naming work should not assume a `relation_accepted` enum value.

## M3 HANDOFF

M2 functionality should be frozen after a real iPhone acceptance pass. M3 can
then address visual and interaction design without changing the Core contract or
the lifecycle/query boundaries established here.

The next real-device checks should confirm:

1. Search opens only on demand and the keyboard behaves correctly.
2. A pending Bubble moves to History after opening and remains there after
   restart.
3. A saved Reflection appears in Understanding and not in the Record timeline.
4. Automatic Awareness does not repeat for an already-covered batch without a
   new uncovered Record.
5. A save failure ends the saving state and displays an error.

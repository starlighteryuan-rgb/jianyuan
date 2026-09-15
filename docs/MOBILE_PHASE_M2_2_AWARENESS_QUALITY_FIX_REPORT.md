# Mobile Phase M2.2 — Awareness Quality and Reliability Fix

## Scope

This phase fixes the real Awareness reliability problems reported on Mobile and Desktop:

- weak relations were surfaced as if they were meaningful
- user-facing Awareness copy could mix languages or leak English
- generated Observations disappeared after leaving the page or restarting the app
- response buttons could cross-contaminate their selected values
- repeated Directive creation appended duplicate rule cards
- Desktop shared the same weak-surfacing and verbose-copy problems

No Core contract, SQLite schema, provider port, Phase 8 semantics, Phase 9 IA, or Phase 10 visual design was changed.

## Root Causes

### 1. Weak relations were treated as valid candidates

The shared OpenAI-compatible provider accepted any relation-shaped object and returned it to the application layer. It did not have a successful "no observation" outcome, so the product had no truthful way to say that the selected Records were not worth revisiting together.

The provider now returns a structured result:

```ts
type RelationSuggestionStatus = 'SURFACE' | 'NO_OBSERVATION';

interface RelationSuggestionResult {
  status: RelationSuggestionStatus;
  language: 'zh-CN';
  suggestions: readonly RelationSuggestion[];
}
```

`NO_OBSERVATION` is a successful outcome, not an error. Mobile, Web orchestration, and Desktop all map it to an empty candidate list and the short product copy:

```text
目前没有发现值得回看的明显联系。
```

### 2. Weak-signal filtering happened too late

The provider now rejects or filters suggestions whose only support is:

- same day
- close timestamps
- timestamps merely existing
- one Record being abstract and the other concrete
- a generic shared category
- weak semantic similarity
- both Records merely being daily notes

A relation must describe a shared theme, repeated pattern, or structural connection that may genuinely be worth revisiting.

### 3. Language validation was too loose

The provider prompt now requires simplified Chinese for every user-visible field and explicitly forbids English sentences and mixed-language headings.

The parser checks `language: 'zh-CN'`, requires Chinese copy in user-visible fields, and retries once when the shape or language is invalid. Invalid output is not passed through to the UI.

### 4. Awareness history was only in memory

Mobile now persists presentation history outside the Core SQLite schema. It uses the app sandbox key/value store and keeps at most 50 items.

Persisted states:

- `new`
- `viewed`
- `responded`
- `dismissed`

The history is presentation state, not a Core Relation, Observation registry, Discovery, or Evidence store. It is not exported as Core data and does not become a new Core table.

Re-requesting the same Record replaces its prior pending card for that Record instead of accumulating stale duplicates.

### 5. Response state was shared across candidate cards

The previous Awareness screen held one `meaning` and one `reflectionText` state for the whole page. With more than one candidate, selecting a value on one card could affect another.

Each candidate card now owns its own selected response and reflection text. Only the current `meaning` value is submitted.

### 6. Directive creation appended duplicate active rules

The Directive application service previously generated a new id and created a new active Directive for every write.

It now resolves an existing active Directive by the same scope and `appliesToFutureSimilar` value, reuses its identity and `createdAt`, and overwrites the rule. Repeated setting writes therefore update one current rule instead of appending duplicate cards.

## Verification

| Check | Result |
| --- | --- |
| Root tests | PASS — 857 passed |
| Mobile tests | PASS — 81 passed |
| Desktop tests | PASS — 16 passed |
| Provider tests | PASS — 18 passed |
| Root typecheck | PASS |
| Mobile typecheck | PASS |
| Desktop typecheck | PASS |
| Provider check | PASS |

New Mobile regressions cover:

- same-day or close-time-only suggestion returns `no_candidate`
- compliant Chinese observation is shown
- history survives leaving the page and reopening the runtime
- `connected` persists as `connected`
- `different_understanding` persists as `different_understanding`
- `not_my_experience` persists as `not_my_experience`
- repeated request for one Record does not create duplicate history cards

New Desktop regression covers:

- `NO_OBSERVATION` returns no suggestions and records `no_observation`

New Directive regression covers:

- repeated creation of the same active rule overwrites it instead of appending

## Known Limitations

- The Mobile history double used by the Node tests models restart persistence at the storage seam. Real device persistence still depends on `expo-sqlite/kv-store`, which is the production binding but is not exercised by the Node test runner.
- This phase does not add provider-key UX, cloud sync, push, widgets, App Groups, advanced animation, or a new visual design.
- Desktop uses a separate runtime class but now follows the same structured `SURFACE` / `NO_OBSERVATION` contract and the same short no-observation copy.

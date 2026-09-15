# Mobile Phase M2.3 - Adaptive Awareness Density

## Scope

This phase changes how much the AI says, not what the product means.

The old four-part template made every surfaced Observation look like a report:

- AI noticed
- one possible explanation
- AI is uncertain
- a question to continue thinking

That structure encouraged filler, repeated disclaimers, and extra inference. M2.3 replaces it with an adaptive contract: `observation` is the only required user-visible field when status is `SURFACE`; `question`, `explanation`, and `uncertainty` are optional.

No Core Gate, Relation, Evidence, Reflection, SQLite schema, Phase 8/9/10 semantics, or M2.2 conservative surfacing gate was changed.

## Contract

The provider contract now uses:

```ts
interface RelationSuggestion {
  kind: 'relation_candidate';
  recordRefs: readonly string[];
  comparisonAxis: { question: string; dimension: string };
  relationType: string;
  observation: string;
  question?: string;
  explanation?: string;
  uncertainty?: string;
  assertsTemporalOrdering: boolean;
}
```

`NO_OBSERVATION` remains a successful, preferred outcome and still requires no other fields.

When status is `SURFACE`:

- `observation` is required
- `question` is optional
- `explanation` is optional
- `uncertainty` is optional

The Provider no longer injects a generic explanation or a fixed uncertainty sentence when the model does not provide one.

## Provider Prompt and Parser

The prompt now explicitly says that the model may say less:

- do not fill fields merely to complete a shape
- a simple observation may contain only `observation`
- omit `question` when no natural question helps the user look again
- omit `explanation` when the observation is already clear
- omit `uncertainty` unless a specific uncertainty matters
- do not repeat blanket disclaimers
- do not expose internal taxonomy names

The parser and validator now:

- accept missing optional fields
- reject `SURFACE` without `observation`
- reject non-simplified-Chinese user-facing copy
- reject internal labels such as `activity_domain`, `time_context`, `relation_type`, and related taxonomy names
- apply observation, question, explanation, and uncertainty length budgets
- preserve `comparisonAxis`, `relationType`, and `assertsTemporalOrdering` for Core gate evaluation

## Presentation

Web, Mobile, and Desktop now render only the sections that actually exist.

The default order and visual weight are:

1. core observation
2. optional question
3. related records and optional detail

An absent question, explanation, or uncertainty produces no heading and no empty section. The Web and Desktop views no longer synthesize a local explanation or fixed uncertainty statement.

Mobile history and persistence validation were updated to accept optional fields while still rejecting malformed stored data.

## Core Boundary

The provider's `observation` maps to the existing Core candidate `evidenceSummary`. This keeps the change at the presentation and provider-density layer and avoids changing Core semantics.

The internal fields required by Core remain available:

- `comparisonAxis`
- `relationType`
- `assertsTemporalOrdering`

An Observation remains transient until the user provides free-text meaning and the existing Core gates admit a Relation.

## Tests

Targeted coverage now includes:

- `NO_OBSERVATION` with no additional fields
- `SURFACE` with only `observation`
- `SURFACE` with optional question, explanation, or uncertainty
- `SURFACE` without `observation` is invalid
- internal labels are rejected
- weak same-day or close-time-only suggestions still return `NO_OBSERVATION`
- Mobile mapping and rehydration accept observation-only candidates
- root orchestration does not synthesize explanation or fixed uncertainty

## Verification

| Check | Result |
| --- | --- |
| Root tests | PASS - 857 passed |
| Mobile tests | PASS - 82 passed |
| Desktop tests | PASS - 16 passed |
| Provider tests | PASS - 20 passed |
| Root typecheck | PASS |
| Mobile typecheck | PASS |
| Desktop typecheck | PASS |

## Known Limitations

- The provider is instructed to aim for concise copy, but length is a validation budget rather than a hard sentence-level rewrite. A slightly long valid sentence is not mechanically truncated.
- Mobile history persistence is validated at the storage seam; on-device behavior still depends on the production `expo-sqlite/kv-store` binding.
- This phase does not implement Automatic Awareness Inbox, notifications, animations, Cloud Sync, or a new visual redesign.

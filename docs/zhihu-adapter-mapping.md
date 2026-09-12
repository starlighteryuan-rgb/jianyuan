# Zhihu External Adapter Mapping Specification

Status: design specification only. This document does not authorize production
code changes or dataset import.

## 1. Purpose and boundary

This specification defines how the profiled local Zhihu search dataset may be
translated into the existing `RetrievedExternalReference` boundary object.

The adapter is an External Dataset Adapter, not a personal-data ingestion path.
Its output may widen interpretation only. It MUST NOT define the user, create a
personal baseline, support a personal Relation or Hypothesis, or infer that an
external author is the user.

The mapping operation ends after producing validated, deduplicated
`RetrievedExternalReference` candidates. It MUST NOT:

- call `ExternalReferenceService.import`;
- call `IngestionService`;
- create a `Record`;
- create or supply an `evidenceUnitId`;
- calculate or replace `sourceFingerprint`;
- trigger Relation or Hypothesis candidate generation;
- reinterpret author, ranking, votes, comments, or edit time as personal facts.

## 2. Dataset facts used by this specification

The source profile is `docs/zhihu-dataset-profile.md`.

- 834 JSON files were found; all 834 parsed successfully.
- Every root object contains `Code`, `Data`, and `Message`.
- `Data.Items` contains 8,330 item objects across 833 files.
- Every item contains `ContentID`, `ContentType`, `ContentText`, `Title`, `Url`,
  and `EditTime`.
- `ContentID` and `Url` each contain 8,050 unique values, 252 duplicate groups,
  and 280 repeated occurrences.
- `AuthorSignature` is absent from 208 items. `AuthorName`, `AuthorAvatar`,
  `AuthorBadge`, and `AuthorBadgeText` are structurally present, but some values
  are empty.
- `CommentInfoList` is absent from 4,837 items and present on 3,493 items. The
  present lists contain 8,108 comment text values.
- The dataset exposes only one time candidate, `EditTime`.

These observations describe this dataset snapshot. They do not grant any field
new Domain meaning.

## 3. Source envelope mapping

| Source field | Adapter treatment | Domain / ExternalReference mapping |
| --- | --- | --- |
| `Code` | Validate as a numeric API result code. Non-zero means the file is an error result and its `Items` MUST NOT be mapped. | None |
| `Message` | Diagnostic metadata only. It MAY appear in a local validation report but MUST NOT enter content or provenance. | None |
| `Data.Items` | Iterate as the source item collection. Each item is validated independently before deduplication. | One candidate input per valid, deduplicated item |
| `Data.SearchHashId` | Search-request correlation only. It MUST NOT identify content and MUST NOT become `sourceRef`. | None |
| `Data.HasMore` | Dataset-completeness metadata only. It MUST NOT change evidence status or content ranking. | None |
| `Data.EmptyReason` | Optional diagnostic metadata for an empty result. | None |

A file with missing `Code`, missing/non-object `Data`, or non-array `Data.Items`
MUST fail closed for that file. Other successfully validated files may still be
profiled or mapped, but the failure must remain visible to the caller.

## 4. Source item field mapping

| Source field | Required | Adapter meaning | Mapping destination |
| --- | ---: | --- | --- |
| `ContentID` | Yes | Zhihu content identifier. Used only in the adapter-local dedup key and consistency checks. | Not mapped into `RetrievedExternalReference` |
| `ContentType` | Yes | Namespace for `ContentID` and platform object type. It is not an External Reference kind. | Not mapped |
| `Url` | Yes | Traceable content locator. Validate as an HTTPS `zhihu.com` URL, remove the fragment and `utm_*` transport parameters. Preserve all other query parameters. | `RetrievedExternalReference.url` |
| `Title` | Yes | Platform-supplied title. Preserve as supplied. An empty or whitespace-only value maps to `null`; do not fabricate a title. | `RetrievedExternalReference.title` |
| `ContentText` | Yes | Dataset-provided search excerpt. Remove only literal search-highlight tags `<em>` and `</em>`; otherwise preserve wording and whitespace. Do not summarize, combine, or rewrite it. Empty-after-highlight-removal input MUST be refused. | `RetrievedExternalReference.excerpt` |
| `EditTime` | Yes in this snapshot | Platform content edit/revision metadata. It may choose the representative snapshot inside one duplicate group, but it is not user-event time or adapter retrieval time. | Not mapped to Domain time |
| `AuthorName` | No semantic requirement | External presentation metadata only. Blank values remain unknown external authors. | Not mapped |
| `AuthorAvatar` | No semantic requirement | External presentation metadata only. | Not mapped |
| `AuthorSignature` | Optional | External presentation metadata only; absence is expected. | Not mapped |
| `AuthorBadge` | Optional value | External presentation metadata only. | Not mapped |
| `AuthorBadgeText` | Optional value | External presentation metadata only. | Not mapped |
| `AuthorityLevel` | No | Retrieval metadata only. It MUST NOT become evidence strength, confidence, or External Reference kind. | Not mapped |
| `RankingScore` | No | Search ordering metadata only. It MUST NOT become evidence strength or confidence. | Not mapped |
| `VoteUpCount` | No | Platform engagement metadata only. | Not mapped |
| `CommentCount` | No | Platform engagement metadata only. It is not proof that any comment text is present or complete. | Not mapped |
| `CommentInfoList` | Optional | Separate external utterances with insufficient standalone identity in this dataset. | Not mapped; see Section 10 |

`ContentText` is an excerpt returned by the search dataset, not necessarily the
full answer or article. The adapter MUST describe it as an excerpt and MUST NOT
claim that it is the complete source content.

## 5. `RetrievedExternalReference` mapping

For each valid item surviving adapter-local deduplication:

| `RetrievedExternalReference` field | Value | Rule |
| --- | --- | --- |
| `url` | Canonicalized `Url` | HTTPS Zhihu URL only; strip fragment and `utm_*` parameters only. |
| `provider` | `'zhihu'` | Fixed constant; never copied from dataset text. |
| `kind` | Explicit caller/job configuration | MUST be one of `experience`, `practical`, `perspectives`, or `professional`. MUST NOT be inferred from `ContentType`, author metadata, authority, votes, ranking, title, or excerpt. If no explicit kind exists, mapping fails closed. |
| `excerpt` | Sanitized `ContentText` | Strip only `<em>`/`</em>` search highlighting. Preserve all other text verbatim; do not concatenate title or comments. |
| `language` | `null` | The profiled dataset contains no language field. The adapter MUST NOT guess from script or platform. |
| `title` | `Title` or `null` | Original supplied title; blank-only becomes `null`. |
| `retrievedAt` | Validated `manifest.capturedAt` | MUST NOT use `EditTime`, file modification time, or current time on each item. See Section 7. |

Author fields and comments are deliberately absent from this object. Their
absence prevents them from leaking into provenance, personal identity, or raw
expression.

## 6. Provenance mapping

If a separate, explicitly authorized workflow later passes one mapped candidate
to the existing `ExternalReferenceService.import`, the existing mapping remains:

| Provenance / capture field | Fixed value or source |
| --- | --- |
| `origin` | `'imported'` |
| `actor` | `'platform'` |
| `sourceRef` | Canonicalized `RetrievedExternalReference.url` |
| `verbatim` | `RetrievedExternalReference.excerpt` |
| `language` | `RetrievedExternalReference.language` (`null` here) |
| `time` | `{ semantic: 'capture_time', at: retrievedAt }` |
| `epistemicRoles` | `['external_reference']` |
| `capturedAt` | `retrievedAt` |
| `derivation` | `null` |

The adapter MUST NOT expose parameters that allow a caller to change `origin`,
`actor`, `epistemicRoles`, or time semantic for these dataset items.

In particular:

- `AuthorName` does not make `actor = 'user'`.
- A matching display name does not prove account ownership.
- `ContentType`, votes, rank, badges, or authority do not change the fixed
  `external_reference` role.
- `EditTime` does not become `event_time` or `observation_time`.

## 7. Timestamp semantics

Three timestamps must remain conceptually separate:

1. `EditTime` is Zhihu content revision metadata.
2. Dataset capture time is when this immutable local snapshot was obtained.
3. Mapping execution time is when the local adapter happens to run.

Only the dataset capture time may populate `RetrievedExternalReference.retrievedAt`.
The later External Reference plan maps that value to `capture_time`.

Every adapter run requires this serializable manifest input:

```ts
interface ZhihuDatasetSnapshotManifest {
  datasetId: string;
  provider: 'zhihu';
  capturedAt: string; // ISO 8601 with explicit timezone
  snapshotVersion: string;
}
```

The manifest MUST be validated before any dataset file is read. `datasetId` and
`snapshotVersion` must be non-empty, `provider` must be exactly `zhihu`, and
`capturedAt` must be present and valid. The timestamp is normalized to UTC once
and reused for every candidate, so repeated runs over the same snapshot are
deterministic. Manifest identity and version remain adapter metadata; they do
not enter provenance, adapter-local content identity, `sourceFingerprint`, or
`evidenceUnitId`.

If no trustworthy manifest capture timestamp exists, mapping MUST fail closed.
Preview/profile work may continue without importing.

The adapter MUST NOT substitute:

- `EditTime`, because publication or revision time does not say when described
  events happened and does not say when the dataset was captured;
- filesystem creation or modification time, unless an authoritative dataset
  manifest explicitly defines that value as the snapshot capture timestamp;
- a new wall-clock value on each run, because that would make reprocessing the
  same immutable snapshot unstable at the existing fingerprint boundary.

## 8. Dedup identity strategy

Deduplication has two distinct layers and they MUST NOT be conflated.

### 8.1 Adapter-local dataset dedup

Before producing `RetrievedExternalReference` candidates, group items by:

```text
zhihu:<normalized ContentType>:<exact ContentID>
```

Rules:

1. `ContentType` is normalized only for case and surrounding whitespace.
2. `ContentID` is treated as an opaque string. It is never parsed as a number.
3. Canonicalized `Url` is a required cross-check.
4. Same dedup key with different canonical URLs is a conflict and MUST be
   quarantined rather than merged.
5. Same canonical URL with different `(ContentType, ContentID)` is also a
   conflict and MUST be quarantined.
6. Repeated entries with the same key and URL are candidates for one external
   content object; equality of identity does not permit merging their text.
7. When valid `EditTime` values differ, choose the entry with the greatest value
   as the latest platform snapshot. `EditTime` is used only for this selection;
   it gains no Domain time meaning.
8. If multiple entries remain at the selected `EditTime`, compare only the
   mapped payload: canonical URL, title, and sanitized excerpt. Identical mapped
   payloads collapse to one candidate.
9. If entries at the selected `EditTime` have different mapped payloads, the
   group is ambiguous and MUST be quarantined. Search excerpts may vary by
   query, so the adapter MUST NOT pick one by arbitrary file order.
10. If every `EditTime` in a group is invalid, identical mapped payloads may
    collapse; differing payloads MUST be quarantined.
11. Relative file path plus array index may order diagnostics deterministically,
    but MUST NOT decide which conflicting content becomes the mapped excerpt.
12. Never merge excerpts, author fields, or comment arrays across duplicates.

The profile's matching duplicate totals for `ContentID` and `Url` support this
two-field cross-check for the current snapshot, but the adapter must still
detect future conflicts explicitly.

### 8.2 Existing ingestion fingerprint

`sourceFingerprint` remains owned by the existing ingestion path. Its current
composition and hashing MUST remain unchanged. The adapter MUST NOT:

- precompute it;
- provide it as input;
- add `ContentID`, `SearchHashId`, author data, comments, rank, or votes to it;
- remove any existing fingerprint component;
- use adapter-local dedup as evidence-independence identity.

Adapter-local dedup only prevents duplicate dataset candidates from reaching a
future explicit import selection. It does not replace `sourceFingerprint`.

## 9. Evidence identity and generation isolation

`evidenceUnitId` remains entirely owned by the existing ingestion/evidence-unit
resolution path. The adapter MUST NOT create, derive, cache, reuse, or suggest
an `evidenceUnitId`.

Producing or selecting an external candidate MUST NOT automatically call:

- Relation candidate generation;
- Relation evaluation;
- Hypothesis generation or admission;
- Discovery projection;
- Reflection creation.

Even after a separately authorized import, the resulting Record retains the
fixed `external_reference` role and remains ineligible as personal Relation
evidence. Popularity, author identity, duplicate frequency, or comment agreement
cannot lift that quarantine.

## 10. Author isolation rules

1. All `Author*` fields describe an external platform author only.
2. No author field maps to provenance `actor`, user ID, user profile, personal
   subject, directive subject, evidence identity, or source fingerprint.
3. Empty `AuthorName` means unknown external author. Do not fill it from other
   fields.
4. Display-name equality with the local user is not account ownership evidence.
5. Avatar, badge, badge text, signature, authority, votes, and ranking MUST NOT
   be used to infer credibility, personal relevance, or External Reference kind.
6. Author metadata may be retained only in an adapter-local presentation DTO
   with an explicit `externalAuthor` namespace. It MUST be discarded before
   creating `RetrievedExternalReference` unless a future, separately reviewed
   presentation contract adds a non-personal metadata field.
7. The adapter has no user-owned-content classification path. A different
   authenticated, ownership-verifying feature would require a separate design
   and MUST NOT reuse this mapping implicitly.

## 11. Comment handling rules

The current dataset does not provide stable comment IDs, comment URLs, authors,
or timestamps for `CommentInfoList[].Content`. Therefore:

1. Comments MUST NOT be appended or prepended to `ContentText`.
2. Comments MUST NOT be folded into the parent item's excerpt, title, author,
   provenance, `sourceRef`, or dedup identity.
3. `CommentCount` MUST NOT be used as proof that `CommentInfoList` is complete.
4. Missing `CommentInfoList` is normal for this snapshot and is not an item
   validation failure.
5. Present comments may be shown only as ephemeral external preview context if
   the surrounding product flow already permits outside perspective.
6. Present comments MUST NOT be imported, create Records, support Relations or
   Hypotheses, or be counted as independent evidence.
7. A future comment import requires stable per-comment provenance: at minimum a
   traceable comment identifier or URL, external author separation, and honest
   capture-time metadata. Until that contract exists, comment import fails
   closed.

This prevents multiple anonymous comments from being mistaken for independent
personal evidence or from changing the identity of the parent content.

## 12. Required mapping outcome

For this design phase, a successful adapter run returns only:

```text
validated source diagnostics
+ validated snapshot manifest metadata
+ adapter-local duplicate/conflict diagnostics
+ deduplicated RetrievedExternalReference candidates
```

It performs no writes outside an explicitly requested diagnostic/report file.
Import, Record creation, Relation, Hypothesis, Discovery, and Reflection are all
out of scope.

# Zhihu Dataset Runtime Integration Result

## Result

The full local Zhihu dataset was successfully processed by the existing
`ZhihuExternalDatasetAdapter`. The run stopped at in-memory
`RetrievedExternalReference` candidates. It did not invoke an import,
ingestion, persistence, user, reflection, relation, hypothesis, or discovery
workflow.

## Runtime Input

| Input | Value |
| --- | --- |
| Dataset directory | `<local_dataset_path>` |
| Dataset ID | `zhihu-search-export-test` |
| Provider | `zhihu` |
| Manifest `capturedAt` | `2026-09-13T00:00:00+08:00` |
| Normalized `retrievedAt` | `2026-09-12T16:00:00.000Z` |
| Snapshot version | `v1` |
| External Reference kind | `perspectives` |

The normalized UTC value represents the same instant as the supplied
`capturedAt`. Every generated candidate received that one value; no item used
`EditTime`, a filesystem timestamp, or the runtime clock as `retrievedAt`.

## Processing Summary

| Metric | Count |
| --- | ---: |
| JSON files discovered / processed | 834 |
| Valid file envelopes | 834 |
| Rejected files | 0 |
| Zhihu items discovered / processed | 8,330 |
| Valid mapped items before deduplication | 8,330 |
| Rejected items | 0 |
| Generated external reference candidates | 7,945 |
| Duplicate items collapsed | 156 |
| Duplicate groups collapsed | 147 |
| Quarantined conflicting items | 229 |
| Quarantined conflict groups | 105 |
| Parse/schema failures | 0 |

The count reconciles as follows:

```text
8,330 valid items - 156 collapsed duplicates - 229 quarantined items
= 7,945 candidates
```

## Diagnostics and Schema Anomalies

| Diagnostic | Severity | Count | Handling |
| --- | --- | ---: | --- |
| `duplicate_collapsed` | info | 147 groups | 156 redundant entries collapsed adapter-locally |
| `ambiguous_duplicate` | error | 105 groups | 229 entries quarantined; none emitted as candidates |

No invalid JSON, invalid root envelope, non-zero `Code`, invalid `Data.Items`,
invalid required item field, invalid URL, unreadable file, symlink, or invalid
`EditTime` diagnostic occurred.

The 105 error diagnostics are conflict quarantine decisions, not file or item
parse failures. They occur when duplicate adapter-local identities have
different mapped payloads at the selected `EditTime`; the adapter fails closed
and does not merge the excerpts.

## Candidate Shape and Isolation

Every emitted candidate contained only these fields:

```text
excerpt, kind, language, provider, retrievedAt, title, url
```

Runtime checks found none of these forbidden or out-of-boundary fields on any
candidate:

```text
AuthorName, AuthorAvatar, AuthorBadge, CommentInfoList, RankingScore,
VoteUpCount, sourceFingerprint, evidenceUnitId, userId
```

All 7,945 candidates had provider `zhihu`, kind `perspectives`, language
`null`, and retrievedAt `2026-09-12T16:00:00.000Z`.

## Sample Mapped Outputs

The `excerptPreview` values below are display-only prefixes. Candidate excerpts
were not rewritten or persisted by the integration runner.

```json
[
  {
    "url": "https://www.zhihu.com/question/13070566468/answer/112020461868",
    "provider": "zhihu",
    "kind": "perspectives",
    "title": "内心如何适应自己的发展变化呢? - 知乎",
    "excerptPreview": "面对外部世界的不确定性，转向内心寻找确定性是一种有效的应对方式。这需要我们建立清晰的自我认知，了解自己的价值观和人生目标。通过冥想、阅读、写作等方式，我们可以更好地认识自己，找到内心的平静。",
    "excerptLength": 313,
    "language": null,
    "retrievedAt": "2026-09-12T16:00:00.000Z"
  },
  {
    "url": "https://www.zhihu.com/question/1983132672168572752/answer/1984743085780001988",
    "provider": "zhihu",
    "kind": "perspectives",
    "title": "在跨地域交流中,方言差异曾给你带来过哪些有趣或困扰的经历? - 知乎",
    "excerptPreview": "有个记者在成都街头做采访，问一个刚从公交车失火现场下来的幸存者：“车上有锤子吗？”\n老乡一听，情绪激动，脱口而出：“有个锤子！”",
    "excerptLength": 240,
    "language": null,
    "retrievedAt": "2026-09-12T16:00:00.000Z"
  },
  {
    "url": "https://www.zhihu.com/question/275354446/answer/2283403832",
    "provider": "zhihu",
    "kind": "perspectives",
    "title": "在成都月薪1万是什么体验? - 知乎",
    "excerptPreview": "不是成都土著，23岁，2017级毕业生，运营\n 底薪6K 绩效+奖金4K左右，目前税后\n差不多1w，年13-14。",
    "excerptLength": 1013,
    "language": null,
    "retrievedAt": "2026-09-12T16:00:00.000Z"
  }
]
```

## User-Data Boundary Confirmation

- The runner imported only `ZhihuExternalDatasetAdapter`.
- The adapter used read-only filesystem operations and has no application
  service, repository, Prisma, or database dependency.
- No `ExternalReferenceService.import()` or `IngestionService` call occurred.
- No `User`, `UserReflectionRecord`, `ReflectionPreference`, `Record`, Evidence
  Unit, personal Relation, Hypothesis, Discovery, or Reflection data was
  created or modified.
- Full candidates existed only in process memory. The only persisted output of
  this run is this aggregate report.
- SHA-256 hashes of `external-reference.ts`, `source-fingerprint.ts`,
  `evidence-unit.ts`, and `ingestion-service.ts` were identical before and after
  execution. Existing `sourceFingerprint` and `evidenceUnitId` behavior was not
  invoked or modified.

Therefore external author and comment metadata remained isolated, and this
integration run had no path capable of modifying core user data.

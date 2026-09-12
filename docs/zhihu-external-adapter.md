# Zhihu External Adapter

`ZhihuExternalAdapter` is an external dataset plugin. It calls the official
Zhihu search endpoint and maps results into the existing
`RetrievedExternalReference` input type.

## Boundary

- It does not modify Domain semantics.
- It does not create Records or Evidence Units.
- It does not calculate or alter `sourceFingerprint`.
- It does not infer personal meaning from author, vote, ranking, authority, or
  edit-time metadata.
- It does not auto-import search results. A selected result must still pass
  through `ExternalReferenceService.import`, including storage directives and
  the fixed `external_reference` role.
- `EditTime` is not mapped to event time. `retrievedAt` is the adapter clock and
  becomes the existing `capture_time` through the External Reference service.

## Configuration and use

Supply the Access Secret from runtime configuration. Do not commit it or pass it
through Domain objects.

```ts
const adapter = new ZhihuExternalAdapter({
  accessSecret: runtimeSecret,
});

const searched = await adapter.search({
  query: '复杂任务如何开始',
  count: 5,
  kind: 'experience',
});

if (searched.ok) {
  const selected = searched.value.references[0];
  if (selected !== undefined) {
    await services.externalReferences.import({ source: selected });
  }
}
```

`kind` is explicit retrieval intent. The adapter does not derive it from
popularity or platform metadata. The search API provides no language field, so
the mapped value is `null` rather than a guessed language.

## HTTP contract

- `GET https://developer.zhihu.com/api/v1/content/zhihu_search`
- Query parameters: `Query`, `Count` (`1..10`)
- Headers: `Authorization: Bearer ...`, second-level
  `X-Request-Timestamp`, and `Content-Type: application/json`
- API `Code != 0`, malformed payloads, non-JSON responses, and non-Zhihu result
  URLs are explicit errors; they are never converted to an empty result.

The adapter strips Open Platform `utm_*` query parameters and search-highlight
`<em>` tags. It otherwise preserves the returned excerpt wording. This keeps
the traceable source URL stable without changing the core fingerprint algorithm.

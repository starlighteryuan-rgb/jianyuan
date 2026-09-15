# @jianyuan/providers

Provider adapters stay outside Core.

- `deterministic/` provides the offline semantic adapter used by tests and
  non-AI flows.
- `ai/` provides the disabled mode, provider-neutral discovery contracts and a
  direct-HTTP OpenAI-compatible adapter.

Core owns `SemanticJudgmentPort`; provider-only concerns such as model listing,
credentials, HTTP paths, caching and upstream errors remain in this layer.

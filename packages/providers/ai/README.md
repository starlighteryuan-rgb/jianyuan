# `@jianyuan/provider-ai`

Replaceable AI provider boundary for Personal Awareness.

- `DisabledAIProvider` is the default and sends no data.
- `OpenAICompatibleProvider` uses direct HTTP for `/v1/models` and
  `/v1/chat/completions` (or `/models` and `/chat/completions` when the configured
  Base URL already ends in `/v1`).
- Model discovery, caching, URL construction, authentication, timeouts and
  response parsing remain inside this package.
- Manual Model ID works independently of discovery.
- Relation output is a candidate. Core remains responsible for directives,
  gates, evidence assessment and persistence.
- Reflection output is an invitation. It never creates a user response.

The package does not persist API keys, model lists, AI output, or personal data.
It does not use a vendor SDK and never logs upstream response bodies.

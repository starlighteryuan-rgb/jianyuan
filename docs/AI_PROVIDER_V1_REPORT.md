# 见渊 Phase 5：AI Provider V1 报告

STATUS: completed

## 结论

Phase 5 已完成并通过自审。见渊现在有一个可关闭、可替换、直接 HTTP 的
OpenAI-compatible Provider，并支持从真实上游响应发现模型。AI 默认关闭；关闭或
失败时不会阻塞 Capture、Query、Search、Relation、Discovery、Reflection、Export
或 Restore。

AI Provider 不写数据库。Relation 输出只能先成为 candidate，之后仍由 Core 执行
Directive、admissibility、abstraction ceiling、evidence scoring 与 persistence。
Reflection 输出只能成为 invitation/question，不能创建用户回答。

## Provider architecture

```text
Web / Composition Root
  -> AwarenessAIProvider                 (provider package contract)
     -> DisabledAIProvider               (default)
     -> OpenAICompatibleProvider         (explicit opt-in)

Core Relation Application
  -> Core SemanticJudgmentPort           (Core-owned port)
  -> OpenAICompatibleProvider            (adapter implementation)
  -> direct HTTP
```

`packages/core` 没有 model discovery、HTTP 路径、API key、厂商模型名或 AI SDK。
模型发现 contract 位于 `packages/providers/ai`，不会污染 Domain。

## OpenAI-compatible 实现

实现位于 `packages/providers/ai/openai-compatible-provider.ts`，支持：

- Base URL
- API Key
- manual Model ID
- timeout
- optional custom headers
- `GET /v1/models`，或 Base URL 已以 `/v1` 结尾时 `GET /models`
- `POST /v1/chat/completions`，或 Base URL 已以 `/v1` 结尾时
  `POST /chat/completions`

没有引入 OpenAI、DeepSeek、Qwen 或其他厂商 SDK。认证、URL 拼接、timeout、解析
与错误映射全部留在 adapter 内。

## Runtime 配置

AI 必须由 `JIANYUAN_AI_ENABLED=true` 显式启用。支持：

- `JIANYUAN_AI_PROVIDER`
- `JIANYUAN_AI_BASE_URL`
- `JIANYUAN_AI_API_KEY`
- `JIANYUAN_AI_MODEL`
- `JIANYUAN_AI_TIMEOUT_MS`

API key 不硬编码、不持久化、不进入日志、不进入报告或测试快照。配置不完整时
Provider 返回 `invalid_configuration`；非 AI Core graph 仍能启动和工作。

## Model Discovery

`listModels()` 只从上游响应中的 `data` 生成 provider-neutral metadata：

- `id`
- optional `displayName`
- `provider`
- optional `ownedBy`
- optional primitive `metadata`

不会根据 `gpt`、`qwen`、`deepseek` 等模型名字猜 reasoning、vision、context
window、tool use、JSON mode 或 embedding 能力。上游未提供的能力保持 unknown，
也就是不创建 capability 字段。

行为区分：

- 上游支持但没有模型：`modelDiscoverySupported=true, models=[]`
- 404 / 405 / 501：`modelDiscoverySupported=false`，原因是
  `upstream_unsupported`
- 401 / 403：`unauthorized`
- 网络/endpoint 不可达：`upstream_error`
- malformed model list：`malformed_response`

因此“不支持发现”不会被伪装成空列表。

## Cache semantics

模型列表使用 Provider instance 内存缓存：

- 普通调用命中 cache，不重复请求。
- `{ refresh: true }` 绕过 cache。
- Base URL、API Key 或 Provider ID 改变时立即失效。
- Model ID 改变不会清空 model list cache，因为列表身份没有改变。
- cache 不持久化 API key 或用户数据。

## Manual Model ID fallback

`getManualModelId()` 独立于 `listModels()`。即使上游 `/models` 返回 404，手工填写的
Model ID 仍可直接用于 chat/completions。该链路已有测试覆盖。

## Permission boundary

发送 Record context 前必须同时满足：

- `userEnabledAI=true`
- `directiveAllowsAI=true`
- `reason` 非空
- `selectedRecordIds` 非空且无重复
- 实际发送的 Record IDs 与显式选择集合完全一致

任一条件不满足时返回 `disabled` 或 `privacy_boundary`，并在发起 HTTP 前停止。

Core RelationService 在调用 `SemanticJudgmentPort` 前仍先执行自己的 Directive gate；
Provider bridge 的审计 reason 明确表示这是 gate 之后的调用。AI 不获得全库访问权，
也不持有任何 repository。

## Disabled provider

`DisabledAIProvider` 是正式支持的默认模式：

- `enabled=false`
- model discovery 明确报告 disabled capability
- suggestion / invitation 返回 `disabled`
- Semantic port 返回零 candidate 或保守的 unavailable/rejected judgment
- 不发起网络请求
- 不制造数据

## AI capabilities V1

### Relation Suggestion

输入仅包含明确选择的 Record context。输出带固定
`kind='relation_candidate'`，只保留候选关系字段。即便上游返回 `assessment`、
`supportLevel`、`identity` 等字段，parser 也会丢弃。

候选进入 Core 后才能经过 gates 与 evidence assessment；Provider 自身不能保存
Evidence、Relation、用户身份或结论。

### Reflection Prompt

输出固定 `kind='reflection_invitation'` 与一个 question。它不包含 user answer，
不调用 Reflection repository，也不能代用户确认某种意义。

### 未加入的能力

本阶段没有实现 summarization，也没有让 AI 生成 Hypothesis；这两项不是 V1 必需
能力，避免把范围扩张到人格总结、心理诊断或未经要求的解释生成。

## Error handling

统一安全错误类型覆盖：

- timeout
- 401 / 403
- 404
- 429
- 5xx
- endpoint/network failure
- malformed JSON
- malformed model list
- malformed completion
- malformed structured suggestion/invitation

错误消息不包含 API key 或上游 response body。AI 请求没有 Storage 引用；集成测试
让 AI 返回 500 后关闭并重开 SQLite，原始 Record 仍然存在。

Core semantic bridge 遇到 Provider 失败时 fail closed：不生成 candidate，或返回保守
rejection / unavailable score，不伪造证据。

## Tests

Provider package：2 files / 14 tests，覆盖：

- successful model discovery
- 401 credential error
- unreachable endpoint
- 404 / 405 unsupported discovery
- supported empty model list
- malformed model response
- cache hit
- Refresh
- Base URL / API Key / Provider cache invalidation
- manual Model ID fallback
- Disabled provider
- Relation candidate
- Reflection invitation
- permission boundary
- timeout
- 403 / 404 / 429 / 503
- malformed JSON / structured output
- no capability-name guessing
- no Web / database / vendor SDK dependency

Root integration：

- runtime defaults to Disabled Provider
- explicit env configuration creates replaceable compatible Provider
- AI-enabled Core + SQLite full relation/invitation/reflection flow
- SQLite survives AI 500 failure
- AI-disabled Core + SQLite full flow and restart

## 真实 API 网络验证

检测到运行环境存在 `DEEPSEEK_API_KEY`，因此使用正式 Provider 对
`https://api.deepseek.com/v1/models` 做了一次只读、零生成 token 的最小请求。上游
返回 HTTP 401，Provider 正确映射为 `unauthorized`，且没有输出 key 或 response
body。

因此：**真实网络错误处理已验证，但没有完成成功的真实 API/模型列表验证。** 当前
key 是否过期、权限不足或不适用于该 endpoint 无法从 401 进一步确定，报告不作猜测。

## Phase 5 自审 A-N

| 检查 | 结果 |
| --- | --- |
| A. Core 没有 AI SDK | 通过 |
| B. Domain 不知道厂商/模型名称 | 通过 |
| C. 无 API key 泄露 | 通过 |
| D. AI 可完全关闭 | 通过，且默认关闭 |
| E. 无 AI 时完整核心流程成立 | 通过 |
| F. AI 输出不直接成为 Evidence | 通过 |
| G. Relation suggestion 是 candidate | 通过 |
| H. Reflection prompt 是 invitation | 通过 |
| I. API failure 不破坏 SQLite | 通过 |
| J. Provider 可替换 | 通过；contract + composition injection |
| K. Model discovery 不污染 Core | 通过 |
| L. 不支持 discovery 有明确 capability | 通过 |
| M. Manual Model ID fallback | 通过 |
| N. 不按模型名猜能力 | 通过 |

## 已知限制

- 尚无 Settings UI；当前只支持环境变量/runtime config。
- 模型缓存只在进程内，不跨启动持久化。
- 兼容层采用 chat/completions；只支持 Responses API 的网关不在 V1 范围。
- 结构化输出依赖上游遵循 JSON prompt；malformed output 会 fail closed，没有自动修复。
- 没有成功完成真实 API smoke test；需要有效 key 后重试。
- Core relation path 的 Provider 错误目前转为保守结果，没有用户可见的详细 AI 状态页。

Phase 5 没有阻塞非 AI 产品能力的 BLOCKING 问题。

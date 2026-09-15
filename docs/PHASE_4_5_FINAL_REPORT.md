# 见渊正式产品化 Night Run：Phase 4 + Phase 5 最终报告

STATUS: completed

## 1. 结论

Phase 4 与 Phase 5 已按顺序完成、自审并通过最终回归。

正式默认链路现在是：

```text
Web Presentation
  -> Composition Root
  -> packages/core
  -> Core Storage Ports
  -> packages/storage/sqlite
  -> local SQLite file
```

AI 链路是：

```text
Core SemanticJudgmentPort
  -> packages/providers/ai
  -> DisabledAIProvider (default)
     or OpenAICompatibleProvider (explicit opt-in)
```

Memory Adapter 和旧 container fallback 都保留；没有删除旧代码，没有修改 UI 设计，
没有接入云同步/账户/移动端，也没有执行 Git commit。

## 2. Phase 4 完成情况

- 新增完整 SQLite Storage Adapter。
- 使用 schema version 与 migration ledger 初始化数据库。
- 持久化 Record、role、lineage、Directive、Relation、Hypothesis、Discovery、
  state、focus context 与 Reflection。
- Record Query 支持最近记录、单条记录、Reflection context 与最小文本搜索。
- Ingestion、Relation、Hypothesis、Restore 使用事务保护相关写入。
- 提供逻辑 JSON Export / Restore。
- 使用真实临时 SQLite 文件验证 close/reopen 后数据存在。
- Web composition root 默认选择 SQLite，Memory 与 legacy 可显式切换。
- 建立 encryption/key-management seam，但明确未完成设备级加密。

详细证据见 `docs/SQLITE_LOCAL_FIRST_REPORT.md`。

## 3. Phase 5 完成情况

- 新增 provider-neutral `AwarenessAIProvider` contract。
- 新增正式支持的 `DisabledAIProvider`，默认不发送任何数据。
- 新增直接 HTTP 的 `OpenAICompatibleProvider`。
- 支持 Base URL、API Key、manual Model ID、timeout 与 custom headers。
- 支持真实上游 `/models` 模型发现。
- 区分不支持发现与受支持的空模型列表。
- 支持 cache、主动 Refresh，以及 Base URL/API Key/Provider 改变时失效。
- 保留不依赖 discovery 的 manual Model ID fallback。
- Relation 只输出 candidate；Reflection 只输出 invitation。
- 明确检查 AI enablement、Directive permission、selected Record IDs 与发送原因。
- Provider 实现现有 Core `SemanticJudgmentPort`；Core 不依赖 HTTP 或厂商 SDK。
- AI timeout/API/malformed output fail closed，且不访问 Storage。

详细证据见 `docs/AI_PROVIDER_V1_REPORT.md`。

## 4. 修改文件

### Phase 4

- `.gitignore`
- `packages/core/contracts/records.ts`
- `packages/core/domain/ports/repositories.ts`
- `packages/core/application/record-query-service.ts`
- `packages/core/tests/core-boundary.test.ts`
- `packages/core/tests/record-query-service.test.ts`
- `packages/storage/memory/memory-record-repository.ts`
- `packages/storage/memory/tests/storage-replaceability.test.ts`
- `packages/storage/sqlite/**`
- `packages/storage/README.md`
- `src/server/capture-composition-root.ts`
- `src/server/legacy-record-query-adapter.ts`
- `tests/capture-composition-root.test.ts`
- `tests/sqlite-core-flow.test.ts`
- `docs/SQLITE_LOCAL_FIRST_REPORT.md`

### Phase 5

- `.env.example`
- `packages/providers/README.md`
- `packages/providers/ai/**`
- `src/server/ai-provider-config.ts`
- `src/server/capture-composition-root.ts`
- `src/server/legacy-core-composition-adapter.ts`
- `tests/ai-provider-config.test.ts`
- `tests/ai-sqlite-flow.test.ts`
- `tests/sqlite-core-flow.test.ts`
- `docs/AI_PROVIDER_V1_REPORT.md`
- `docs/PHASE_4_5_FINAL_REPORT.md`

工作区还包含 Phase 1–3.5 的既有未提交变更和 archive 移动；本 Night Run 没有回滚、
删除或提交它们。

## 5. 新目录结构

```text
packages/
  core/
    application/
    contracts/
    domain/
    events/
  storage/
    memory/
    sqlite/
      encryption.ts
      migrations.ts
      codec.ts
      sqlite-storage.ts
      tests/
  providers/
    deterministic/
    ai/
      contracts.ts
      disabled-ai-provider.ts
      openai-compatible-provider.ts
      tests/
```

## 6. SQLite 状态

SQLite 是正式 composition root 的默认 adapter。完整 Core graph 共用同一个
`SqliteStorageAdapter`，无双写、无模块级 split graph。数据库默认在
`.jianyuan/jianyuan.sqlite`，可通过 `JIANYUAN_SQLITE_PATH` 覆盖。

已验证 migration、事务回滚、字面量搜索、Export/Restore、完整闭环与 restart
persistence。

未完成真实设备级 encryption；当前只有明确 seam 与未验证状态。同步
`DatabaseSync` 适合当前单用户本地 MVP，但未来 runtime 仍需做性能与打包验证。

## 7. AI Provider 状态

AI 默认关闭。只有 `JIANYUAN_AI_ENABLED=true` 才创建 OpenAI-compatible Provider；
其余配置来自环境变量。配置不完整或网络失败不会阻止 SQLite/Core graph 启动。

AI-enabled 集成测试证明：Capture -> AI candidate -> Core Relation gates/assessment
-> Discovery -> AI reflection invitation -> user Reflection -> SQLite persistence ->
restart 可完整运行。

AI-disabled 集成测试证明：不使用 AI 时同一 Core/SQLite 主链路仍可完成
Record -> Relation -> Discovery -> Reflection 并跨重启读取。

## 8. Model Discovery 状态

- 模型列表只来自上游响应，不硬编码。
- 404/405/501 明确表示 discovery unsupported。
- `modelDiscoverySupported=true, models=[]` 表示上游支持但当前为空。
- 返回 provider-neutral metadata，不把上游原始 JSON带入 Core。
- 不按模型名字推测能力。
- 进程内 cache、Refresh、identity invalidation 已测试。
- Manual Model ID fallback 已测试。

真实 DeepSeek endpoint 请求返回 401：网络路径与安全错误映射已验证，但成功的真实
模型列表尚未验证。无法确认当前环境 key 是过期、权限不足或 endpoint 不适用，
因此不作推测。

## 9. 最终验证

| 验证项 | 结果 |
| --- | --- |
| Core typecheck | 通过 |
| Core tests | 3 files / 6 tests 通过 |
| Memory Storage typecheck | 通过 |
| Memory Storage tests | 3 files / 3 tests 通过 |
| SQLite Storage typecheck | 通过 |
| SQLite Storage tests | 2 files / 5 tests 通过 |
| AI Provider typecheck | 通过 |
| AI Provider tests | 2 files / 14 tests 通过 |
| Root/Web typecheck | 通过 |
| 全量 root tests | 40 files / 795 tests 通过 |
| Production build | 通过，Next.js 15.5.25 |
| `git diff --check` | 无 whitespace error；仅 Windows line-ending warning |

## 10. 最终架构审计

- Core 不依赖 SQLite、HTTP、AI SDK、Next.js、React、Prisma 或具体 Provider。
- Presentation 不直接访问 SQLite 或 AI endpoint。
- SQLite 只实现 Core Storage Ports。
- AI model discovery contract 留在 Provider layer。
- Provider 可关闭、可替换；Disabled 是正式模式。
- AI 只收到显式选择且 Directive 允许的 context。
- Suggestion 不等于 Evidence；Invitation 不等于用户回答。
- AI 故障不会修改或删除 SQLite 原始数据。
- 未恢复知乎/Hackathon 正式链路。
- 无 Git commit、push 或 history rewrite。

Phase 4 自审 A-L 与 Phase 5 自审 A-N 均通过，没有 BLOCKING 问题。

## 11. 未完成事项

- 设备级 SQLite encryption / SQLCipher 与系统密钥库验证。
- Export/Restore 产品 UI。
- AI Settings UI、获取模型按钮与模型选择界面。
- 跨启动持久化的 model-list cache。
- 成功的真实 API smoke test。
- 对只支持 Responses API、不支持 chat/completions 的上游兼容。
- 用户可见但不含敏感数据的 Provider health/error 状态。

以上均明确留给后续阶段，不影响本 Night Run 的两个核心交付。

## 12. 已知风险

- `node:sqlite` 是同步 API；更高并发或不同 Desktop/Mobile runtime 需要重新验证。
- 当前 SQLite 未加密，不应宣称已达到设备级本地加密目标。
- 环境变量适合当前服务端 runtime，但不是最终 API key 管理方式。
- 兼容网关对 chat/completions 与 JSON 输出的行为不完全一致；malformed output 当前会
  fail closed，不会自动重试或修复。
- SQLite composition 构造失败仍会回退 legacy；后续应增加不含用户数据的明确状态，
  避免部署长期无声使用 fallback。

## 13. 下一步最值得做的一件事

选择一个正式 Desktop runtime，完成 **SQLite 设备级加密 + 系统密钥库中的数据库密钥
和 AI API key 管理** 的小型验证。它同时关闭当前最重要的本地隐私缺口，并为后续
Settings UI 提供真实、安全的配置落点；在此之前不建议扩张到同步或多端。

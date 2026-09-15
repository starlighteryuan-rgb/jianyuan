# 见渊 Architecture Status Freeze V1

状态：正式架构状态冻结  
冻结日期：2026-09-14  
产品：见渊（Jianyuan / Personal Awareness）  
用途：供未来开发者与 AI 在继续开发前快速恢复当前正式边界  

## 结论

见渊当前已经完成从 Demo 到正式 Shared Core、可替换 Storage、SQLite local-first
以及可关闭 AI Provider 的基础迁移。

当前正式默认架构是：

```text
Web Presentation
  -> Composition Root
  -> packages/core Application
  -> Core-owned Ports
  -> SQLite Storage Adapter
```

AI 是可选的边界能力，默认关闭。它可以在 Relation candidate generation / semantic
judgment 和 Reflection invitation 两处参与，但不能绕过 Core gates，不能直接写入
Storage，也不能替用户定义意义。

本冻结描述的是**当前未提交工作区**，不是某个可由 Git commit 单独重建的状态。
审计时分支为 `phase-9-freeze`，HEAD 为
`49895de docs: finalize public release hygiene`，其上存在 Phase 1–5 的未提交变更。

## 1. 当前目录结构

以下为与正式架构有关的结构；构建产物和依赖目录未展开。

```text
project build/
├── apps/
│   └── README.md                    # 正式多端应用目录占位，尚无独立 app
├── archive/
│   └── demo/                        # 知乎黑客松 Demo 组件与素材归档
├── docs/                            # 架构、迁移、自审与交接报告
├── packages/
│   ├── core/                        # 正式 Shared Core
│   │   ├── domain/
│   │   ├── application/
│   │   ├── contracts/
│   │   ├── events/
│   │   └── tests/
│   ├── core-spike/                  # Phase 2.1 历史验证，不是正式 Core
│   ├── storage/
│   │   ├── memory/                  # 可替换的内存 Adapter / 测试实现
│   │   └── sqlite/                  # 当前正式默认持久化 Adapter
│   └── providers/
│       ├── deterministic/           # 无网络的确定性语义测试 Adapter
│       └── ai/                      # Disabled + OpenAI-compatible Provider
├── prisma/                          # 旧数据库 schema，未进入 Shared Core
├── src/
│   ├── app/                         # Next.js Web Presentation / Server Actions
│   ├── server/
│   │   ├── capture-composition-root.ts
│   │   ├── ai-provider-config.ts
│   │   ├── legacy-core-composition-adapter.ts
│   │   └── container.ts             # 旧 graph，保留为 fallback
│   ├── domain/                      # 旧 Domain，保留，不是正式迁移目标
│   ├── application/                 # 旧 Application，保留
│   └── infra/                       # 旧 memory / Prisma 等实现，保留
└── tests/                           # Web、旧边界和跨 package 集成测试
```

目录角色冻结如下：

- `packages/core` 是唯一正式 Shared Core。
- `packages/core-spike` 只保留历史证据，不应继续承载产品功能。
- 新 Storage 实现进入 `packages/storage/<adapter>`。
- 新 AI / External Reference 实现进入 `packages/providers/<provider>`。
- `src/app` 只负责 Web presentation/transport。
- `src/server/capture-composition-root.ts` 是当前正式 composition root。
- 旧 `src/domain`、`src/application`、`src/infra`、Prisma 与 container 暂不删除。

## 2. Core 边界

`packages/core` 由四部分组成：

- `domain`：Record、Directive、Relation、Hypothesis、Discovery、Reflection、State、
  lineage、evidence 与时间语义。
- `application`：Ingestion、Record Query、Directive、Relation、Hypothesis、Discovery、
  Reflection 与 External Reference 的用例编排。
- `contracts`：Storage aggregate、Record read models、Semantic Judgment 与 External
  Reference provider-facing ports。
- `events`：Core event 出口，目前保持轻量。

Core 可以依赖纯 TypeScript 领域类型与由自身定义的 Port，但不得依赖：

- Next.js / React
- Prisma / PostgreSQL
- SQLite 或 `node:sqlite`
- AI SDK、HTTP endpoint 或 API key
- OpenAI、DeepSeek、Qwen 等具体 Provider/模型名称
- Zhihu 等具体 External Reference Adapter
- Web Presentation

关键边界：

- `CoreStoragePorts` 聚合完整 Storage Adapter；各 Application service 仍只接收自己
  需要的窄 repository ports。
- `SemanticJudgmentPort` 是语义判断进入 Core 的唯一正式入口。Core 负责权限、
  admissibility、gates、证据计算和状态变化。
- `ExternalReferenceProvider` 只负责检索和映射；导入仍由 Core
  `ExternalReferenceService` 显式执行。
- `RecordQueries` 向 Presentation 暴露 storage-neutral read model，UI 不读取
  repository implementation。

当前 Core 仍保持以下产品不变量：

- AI suggestion 不等于 Relation Evidence。
- AI/系统解释不等于用户身份或用户结论。
- Reflection invitation 不等于用户回答。
- 用户的按钮反馈不会自动制造新 Evidence。
- External Reference 不能充当个人经验 Evidence。

## 3. Storage 架构

正式关系：

```text
Core Application
  -> CoreStoragePorts
     -> MemoryStorageAdapter
     -> SqliteStorageAdapter
```

当前 adapter：

- `packages/storage/memory`：完整实现 `CoreStoragePorts`，用于测试、开发和显式
  `core-memory` 模式。
- `packages/storage/sqlite`：完整实现 `CoreStoragePorts`，是 Web composition root 的
  默认正式模式。
- 旧 Prisma/Memory repositories：仍位于 `src/infra`，只通过旧 container fallback
  使用，不是正式 Shared Core adapter。

Composition mode：

- 默认或 `JIANYUAN_STORAGE=sqlite`：SQLite graph。
- `JIANYUAN_STORAGE=memory` 或 `core-memory`：Memory graph。
- `JIANYUAN_STORAGE=legacy`：旧 container graph。
- 仍兼容旧变量 `JIANYUAN_CAPTURE_COMPOSITION`。

每个正式 graph 中，Ingestion、Query、Directive、Relation、Hypothesis、Discovery 和
Reflection 共享同一个 Storage Adapter 实例。业务写入失败不会改走第二个 Adapter，
以避免双写、重复写入和 split graph。只有正式 graph 构造失败时才回退旧 container。

## 4. SQLite 状态

状态：Phase 4 已完成，当前正式默认 Storage。

- Driver：Node.js 内置 `node:sqlite` / `DatabaseSync`。
- 当前审计运行时：Node.js v24.18.0。
- 默认路径：`.jianyuan/jianyuan.sqlite`。
- 自定义路径：`JIANYUAN_SQLITE_PATH`。
- 当前工作区审计时默认数据库文件不存在；它由运行时首次创建。
- journal mode：WAL。
- foreign keys：开启。
- schema version：1。
- migration ledger：`_jianyuan_migrations`。

Schema V1 覆盖：

- records / record_roles / lineage_edges
- directives / state_assignments
- relation_claims / relation_record_refs
- hypotheses / hypothesis_anchor_refs
- discoveries / focus_contexts
- reflection_preferences / reflection_episodes / user_reflection_records

已实现并有测试证据：

- Record 保存、最近查询、单条查询和字面量文本搜索
- Relation、Hypothesis、Discovery、Directive 与 Reflection 持久化
- Ingestion、Relation、Hypothesis 和 Restore 的事务边界
- foreign-key 失败后的 Ingestion 回滚
- logical JSON Export
- clear + Restore
- 关闭连接、重建 Adapter 后的数据恢复
- 同一个 SQLite graph 上的 Record -> Relation -> Discovery -> Reflection

当前限制：

- 未完成设备级 SQLite encryption；只有 `SqliteEncryptionController` seam。
- 未实现 SQLCipher 或系统密钥库。
- Export/Restore 只有 Adapter API，没有产品 UI。
- 搜索是字面量 `LIKE`，不是 FTS。
- `DatabaseSync` 为同步 API，未来正式 Desktop/Mobile runtime 需重新验证性能和打包。
- migration 目前只有 V1；未来只能追加版本，不应改写已发布 migration。

## 5. AI Provider 状态

状态：Phase 5 V1 已完成；默认关闭，显式启用。

`packages/providers/ai` 提供：

- `AwarenessAIProvider`：provider-neutral contract。
- `DisabledAIProvider`：默认正式模式，不发网络、不制造数据。
- `OpenAICompatibleProvider`：直接 HTTP Adapter，同时实现 Core
  `SemanticJudgmentPort`。

运行时配置：

- `JIANYUAN_AI_ENABLED=true` 才启用网络 Provider。
- `JIANYUAN_AI_PROVIDER`
- `JIANYUAN_AI_BASE_URL`
- `JIANYUAN_AI_API_KEY`
- `JIANYUAN_AI_MODEL`
- `JIANYUAN_AI_TIMEOUT_MS`

AI Provider V1 支持：

- Relation candidate suggestion
- Core 所需的 Relation semantic judgments
- Reflection invitation/question
- timeout、401/403、404、429、5xx、网络失败和 malformed response 的安全错误
- Provider 失败后的 fail-closed 行为

权限边界：

- 用户必须显式启用 AI。
- Directive 必须允许本次处理。
- 调用必须列出选择的 Record IDs、实际 context 与发送原因。
- 实际 context IDs 必须与显式选择集合完全一致。
- Provider 没有 repository，不可访问全库，也不直接写 SQLite。

尚未实现：

- AI Settings UI
- 系统密钥库中的 API key 管理
- Summarization
- AI Hypothesis generation
- Provider health/status 页面
- 对只支持 Responses API 的 endpoint 的适配

真实网络验证状态：曾对 DeepSeek 模型列表 endpoint 发起最小请求，上游返回
HTTP 401。已验证安全错误映射，没有成功验证真实模型列表或真实推理调用。401 的
具体原因未知，不应推测。

## 6. Model Discovery 状态

`listModels()` 位于 Provider 层，Core 不知道 HTTP 路径或上游原始 JSON。

当前行为：

- Base URL 以 `/v1` 结尾：请求 `/models`。
- 其他 Base URL：请求 `/v1/models`。
- 使用 Bearer API key；key 不进入日志、报告或错误内容。
- 将真实上游响应映射为 `ProviderModel`：`id`、可选 `displayName`、`provider`、
  可选 `ownedBy` 与 primitive metadata。
- 不根据模型名字猜 reasoning、vision、context window、tool use、JSON mode 或
  embedding 能力；上游未给出的能力保持 unknown。

能力状态严格区分：

- `modelDiscoverySupported=true, models=[]`：支持发现，但当前列表为空。
- 404/405/501：`modelDiscoverySupported=false` / `upstream_unsupported`。
- Disabled 模式：`modelDiscoverySupported=false` / `ai_disabled`。

缓存语义：

- Provider instance 内存缓存。
- 普通读取可命中 cache。
- `{ refresh: true }` 强制刷新。
- Base URL、API Key 或 Provider ID 改变会使 cache 失效。
- Model ID 改变不使列表 cache 失效。
- cache 当前不跨进程持久化。
- 上游不支持 discovery 时仍可使用手工 Model ID。

## 7. 当前数据流

### 主闭环

```text
Capture Form
  -> submitCapture Server Action
  -> Composition Root
  -> Core IngestionService
  -> Core Storage Port
  -> SQLite Adapter (default)
  -> Record persistence

Record Query
  -> Core RecordQueryService
  -> same Storage graph

Selected Records
  -> Core RelationService
  -> Directive gate
  -> SemanticJudgmentPort
     -> DisabledAIProvider (default: no candidates)
     -> OpenAICompatibleProvider (optional: candidates/judgments)
  -> Core admissibility + evidence gates
  -> Relation persistence in same Storage graph

Stored Relation/Hypothesis
  -> Core DiscoveryService
  -> Discovery persistence/projection

Discovery / Relation target
  -> optional AI Reflection invitation
  -> user Reflection response
  -> Core ReflectionFlowService
  -> Reflection + derived user-expression Record persistence
```

可压缩为：

```text
Capture -> Core -> Storage -> Relation -> Discovery -> Reflection
```

AI 不是末端结论层，而是 Relation 与 Reflection 两处可缺席的 sidecar。AI 关闭时，
Capture、Query、Search、已有 Relation/Discovery 展示、用户 Reflection、Export 与
Restore 仍然可用。

## 8. 已完成阶段

| 阶段 | 状态 | 正式结果 |
| --- | --- | --- |
| Phase 1 | 完成 | 脱离知乎黑客松 Demo；素材/fixture 进入 `archive/demo` |
| Phase 2 | 完成 | Core 边界审计；确认 Domain/Application 可演进为 Shared Core |
| Phase 2.1 | 完成 | `core-spike` 验证核心闭环可脱离平台和具体基础设施运行 |
| Phase 3.1 | 完成 | 建立正式 `packages/core` boundary |
| Phase 3.2 | 完成 | 建立完整 Memory Storage Adapter |
| Phase 3.3 | 完成 | Capture composition root migration |
| Phase 3.4 | 完成 | Record read/query path migration |
| Phase 3.5 | 完成 | Relation/Discovery/Reflection 接入统一 Core + Storage graph |
| Phase 4 | 完成 | SQLite local-first persistence、migration、transaction、backup/restart |
| Phase 5 | 完成 | Disabled/OpenAI-compatible AI Provider 与 model discovery V1 |

Phase 4/5 最近一次记录的验证结果：

- Core：3 files / 6 tests
- Memory Storage：3 files / 3 tests
- SQLite Storage：2 files / 5 tests
- AI Provider：2 files / 14 tests
- Root/Web：40 files / 795 tests
- TypeScript typecheck：通过
- Next.js production build：通过

本次 Architecture Status Freeze 为只读审计，没有重新运行 tests/build；以上数字取自
已完成的 Phase 4/5 最终验证报告，并结合当前源码静态核对。

## 9. 未完成事项

按当前优先级记录：

1. 设备级 SQLite encryption 与数据库密钥管理尚未验证。
2. AI API key 仍来自环境变量，尚未进入系统密钥库。
3. 尚无正式 Desktop/Mobile runtime；`apps/` 当前只有占位说明。
4. 尚无 Export/Restore UI。
5. 尚无 AI Settings、Fetch Models、Refresh、Manual Model ID 的产品界面；目前只有
   Provider/runtime API。
6. Model list cache 不跨进程持久化。
7. 尚未完成成功的真实 AI endpoint/model discovery smoke test。
8. Provider error 会 fail closed，但尚无用户可见且不泄密的 health/error surface。
9. SQLite 使用同步 Driver，正式 runtime 的阻塞、打包与升级行为尚未验证。
10. 构造 SQLite graph 失败时仍会静默回退 legacy graph，缺少明确运行状态提示。
11. 旧 `src/domain`、`src/application`、`src/infra`、Prisma 与 container 仍存在；当前
    不应删除，待正式 cutover 和数据迁移策略确定后处理。
12. `packages/core-spike` 仍保留；应视为历史证据，不继续扩展。
13. `.env.example` 当前包含两组重复的 `JIANYUAN_STORAGE` 和
    `JIANYUAN_AI_*` 示例，其中 Base URL 示例值也不一致；本次只记录，未修改。
14. 当前 Phase 1–5 工作区尚未形成 Git checkpoint，不能仅凭当前 HEAD 恢复。

## 10. 下一阶段建议

下一阶段只建议做一件事：

**选择一个正式 Desktop runtime，完成 SQLite 设备级加密与系统密钥库验证。**

最小范围应包括：

- 验证 `node:sqlite` 或替代 Driver 在目标 runtime 的打包和迁移行为。
- 选择并验证 SQLCipher/等价方案，不提前宣称设备级加密完成。
- 数据库密钥与 AI API key 只进入系统密钥库，不写 Git、日志、export 或普通配置。
- 验证冷启动、升级 migration、错误密钥、备份/恢复与数据不可损坏。
- 保持现有 Core、Storage Port 和 AI Provider contract 不变。

在此验证完成前，不建议扩张到云同步、多端、账户、OAuth、CRDT 或完整 Settings UI。

## 未来开发者 / AI 启动规则

继续开发前：

1. 先读本文件。
2. 再读 `docs/SQLITE_LOCAL_FIRST_REPORT.md`、`docs/AI_PROVIDER_V1_REPORT.md` 和
   `docs/PHASE_4_5_FINAL_REPORT.md`。
3. 检查 `git status`，因为正式架构目前位于未提交工作区。
4. 把 `packages/core` 视为正式 Core，把 `core-spike` 和旧 `src/*` 视为历史/fallback。
5. 不让具体数据库、HTTP、Provider SDK 或 Web framework 进入 Core。
6. 不让 AI suggestion 自动成为 Evidence、身份或结论。
7. 不在未验证设备级加密前声称本地数据库已经加密。
8. 每个新阶段完成后同步更新本冻结文档或生成后续版本，不覆写历史事实。

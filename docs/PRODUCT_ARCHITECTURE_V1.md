# 见渊 Product Architecture v1

**状态：** 正式产品架构基线  
**日期：** 2026-09-13  
**适用周期：** 未来 1-3 年的产品演进  
**上位约束：** `ENGINEERING_CONTRACT.md` 仍是产品逻辑与认识边界的最高约束。本文件不重定义 Record、Evidence Unit、Relation Claim、Hypothesis、Discovery、Reflection 的含义。

## 0. 结论

见渊应继续采用**模块化单体 + 端口/适配器**，而不是拆成微服务，也不应重写现有 Domain / Application 核心。正式产品推荐：

- Mobile：React Native + Expo，作为日常主入口；
- Desktop：Tauri 2 + React，作为完整本地产品与深度回看入口；
- Web：Next.js，作为轻量访问和跨设备入口；
- Shared Core：纯 TypeScript，跨端共享领域规则、用例、数据契约、同步规则和 AI 权限规则；
- 本地数据：Mobile/Desktop 使用 SQLite；生产版启用数据库级加密，密钥进入系统安全存储；Web 使用 IndexedDB/OPFS 适配器并对敏感载荷做应用层加密；
- 同步：默认关闭、用户自愿启用；推荐“端到端加密的变更日志同步”，服务端只保存密文、设备与游标；
- AI：是可插拔能力，不是启动依赖。无 Provider 时仍可记录、搜索、浏览、提醒、反思、导入导出和同步；
- 账号：本地模式不需要账号。只有启用托管同步、Web 跨设备访问或恢复服务时，才需要创建同步身份；不默认 OAuth。

核心判断是：**共享规则与数据语义，不强求共享页面和交互。**

## 1. 总体架构

```text
┌──────────────────────────────── Presentation ────────────────────────────────┐
│ Expo Mobile UI       Tauri Desktop UI          Next.js Web UI                │
│ Mobile navigation    Desktop workbench         Responsive light client       │
│ Local notifications  Menus/windows/import      Browser capabilities           │
│ 刘看山仅在这一层：视觉反馈、空状态、动效；不参与判断与解释                  │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ commands / queries / view models
┌───────────────────────────────▼ Application ─────────────────────────────────┐
│ Capture │ Ingestion │ Directive │ Relation │ Hypothesis │ Discovery           │
│ Reflection │ Search │ Timeline │ Export/Import │ Backup │ Sync orchestration   │
│ SettingsPolicy │ AIRequestPolicy │ NotificationPolicy │ MigrationRunner       │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ domain values / ports
┌───────────────────────────────▼ Domain ──────────────────────────────────────┐
│ Record → Evidence Unit → Relation Claim → Hypothesis → Discovery             │
│                                      → Reflection Episode → User Reflection  │
│ Provenance │ Time Semantics │ Lineage │ State Assignment │ hard gates          │
│ 规则：模型提出可能性；代码守住事实边界；用户决定意义                        │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ interfaces
┌───────────────────────────────▼ Ports ───────────────────────────────────────┐
│ Repository │ Transaction │ Search │ Clock │ Crypto │ SecureKeyStore          │
│ AIProvider │ SyncTransport │ BackupStore │ Notification │ FilePicker │ Update  │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ platform adapters
┌───────────────────────────────▼ Infrastructure ──────────────────────────────┐
│ SQLite/SQLCipher │ IndexedDB/OPFS │ Keychain/Keystore/DPAPI │ WebCrypto       │
│ E2EE Sync Relay │ OpenAI/DeepSeek/Qwen/Compatible API/Local Model            │
│ OS notifications │ filesystem │ app updater │ crash journal                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

依赖只能向内：Presentation 调用 Application，Application 操作 Domain 并依赖 Ports，Infrastructure 实现 Ports。平台代码不能绕过 Application 直接改领域表；AI 适配器不能授予权限、创建事实或决定展示等级。

运行形态仍是一个产品内核，不是三个后端：

```text
Mobile/Desktop: UI + Shared Core + local DB + optional sync/AI
Web:            UI + Shared Core + browser DB + optional sync/AI gateway
Cloud:          encrypted sync relay + optional AI proxy; never canonical truth
```

## 2. 三端职责

| 端 | 最适合承担 | 不应强行承担 |
|---|---|---|
| Mobile | 秒级 Capture、语音转文字后的原文确认、系统分享入口、通知、短 Reflection、今日与最近线索、离线使用 | 大规模批量整理、复杂来源审计、密集多栏比较 |
| Desktop | 长期历史浏览、多栏对照、搜索与筛选、Relation/Hypothesis 证据审计、批量导入导出、备份恢复、Provider 与同步诊断 | 模仿手机的单列放大版 |
| Web | 临时设备访问、轻量 Capture、搜索与回看、只读分享自己的导出内容、无法安装客户端时的入口 | 承诺与原生端完全相同的后台通知、文件系统控制和本地保密强度 |

Mobile 是频率最高的入口，Desktop 是理解密度最高的入口，Web 是可达性最高的入口。三端共享同一领域语义，但分别设计导航、信息密度和操作方式。

## 3. Shared Core

### 必须共享

- 领域实体、值对象、状态机、全部 Hard Gates、Evidence Unit 去重与 lineage 规则；
- Application 用例：Capture、Ingestion、Directive resolution、Reflection、同步合并、导入校验；
- 结构化命令、查询结果、错误码、序列化格式和 schema version；
- 设置到行为的映射规则，而不只是设置字段；
- AI 任务定义、结构化输出 schema、权限裁剪、审计事件和 fallback；
- 同步操作格式、冲突决策、tombstone、加密信封；
- 数据迁移与导入导出格式的兼容性测试；
- 测试夹具与合同级 invariant 测试。

### 不应共享

- 页面、导航结构、组件树和布局；
- 原生通知、后台任务、分享扩展、菜单、快捷键、窗口和文件选择；
- SQLite、浏览器存储、系统密钥库等适配器实现；
- Mobile 手势与底部操作区、Desktop 多栏/右键/键盘交互；
- 刘看山呈现策略和不同端的动效细节。

可共享 design tokens、文案 key 和无状态格式化函数；不建立一个充满平台条件分支的“万能 UI 包”。

## 4. 技术栈与 Monorepo

### 推荐组合

| 目标 | 推荐 | 原因 |
|---|---|---|
| Mobile | React Native + Expo，使用 development build | 原生导航、通知、安全存储、SQLite、分享与后台能力更自然；保留 TypeScript/React 团队资产。Expo Go 只能用于早期 UI 验证，生产加密数据库等原生能力需要 development build。 |
| Desktop | Tauri 2 + React + Vite | 系统 WebView、安装体积和内存通常低于内置 Chromium；Rust 壳适合承载文件、密钥、SQLite、更新和系统菜单。领域逻辑仍留在 TypeScript，不把业务搬到 Rust。 |
| Web | Next.js | 延续现有项目经验；适合路由、Web 入口和可选服务端能力。核心写操作必须通过客户端 Application + browser persistence，不能依赖 Server Action 才能工作。 |
| Workspace | pnpm workspaces + Turborepo | 清晰管理 apps/packages、增量构建和缓存；工具成熟，迁移可以逐包进行。 |

### Electron 与 Tauri 比较

Electron 的优势是当前 Next/React 页面迁移最快、Chromium 行为一致、Node 生态直接；代价是安装体积、内存、安全面和主进程/渲染进程维护负担更高。它适合“尽快得到桌面包装”的短期验证。

Tauri 的优势是使用系统 WebView、发布包更小、权限能力可以显式收窄，且官方覆盖桌面与移动平台。它的代价是引入 Rust 构建链、WebView 差异和原生插件验证。见渊的桌面核心诉求是本地数据库、文件、密钥与更新，不依赖庞大的 Node 桌面生态，所以正式方案选 Tauri。

**保留退路：** 先做一个 2 周技术 spike，验证 SQLite 加密、中文全文检索、自动更新、Windows/macOS 签名和崩溃恢复。若其中出现无法接受的插件阻塞，再切 Electron；不要同时长期维护两套桌面壳。

### 目录建议

```text
apps/
  mobile/              Expo / React Native
  desktop/             Tauri shell + React renderer
  web/                 Next.js
packages/
  domain/              现有 src/domain 演进而来，零平台依赖
  application/         现有 src/application 演进而来
  contracts/           command/query/event/schema definitions
  settings-policy/     设置到行为的确定性映射
  ai/                  provider interface、任务 schema、发送策略
  sync/                op-log、merge、crypto envelope
  export-format/       .jianyuan 格式与迁移
  testkit/             Memory adapters、invariant fixtures
  design-tokens/       色彩、字号、间距；不共享完整页面
adapters/
  sqlite/  browser-db/  sync-http/  ai-openai/  ai-compatible/
tooling/
  migrations/  release/  contract-tests/
```

Prisma/PostgreSQL 先保留给现有 Web Demo 和可选云端服务。不要强迫 Prisma 成为设备端 SQLite 抽象；设备本地 persistence 应以 repository ports 为接口，选择经过原生端验证的 SQLite 驱动和显式 SQL migration。具体驱动需要 spike 后定版。

## 5. Local-first 数据架构

### 数据所有权与真源

每台设备都有可独立工作的本地数据库。本地提交立即成功，网络、账号、同步服务器和 AI 都不是写入前提。云端是密文副本与设备交换站，不是唯一真源。

数据分四类：

| 类别 | 内容 | 默认位置 | 可变性 |
|---|---|---|---|
| 原始个人事实层 | Record、原话、时间语义、provenance、Evidence Unit、lineage | 本地加密库 | 原始内容追加后不可静默改写；修订产生新版本 |
| 推导层 | Relation Claim、Hypothesis、Discovery、模型审计 | 本地加密库 | 可失效、重算、归档，必须保留生成版本与来源 |
| 用户意义层 | Reflection、user position、Directive、主题暂停 | 本地加密库 | 通过 supersede/revoke 表达变化 |
| 设备层 | UI 偏好、密钥句柄、同步游标、通知调度、崩溃日志 | 仅本设备为主 | 可覆盖；敏感日志默认不上传 |

### Persistence strategy

- Mobile/Desktop：SQLite，WAL 模式，短事务；敏感生产库启用 SQLCipher 或经过安全审计的等价加密实现。
- Web：IndexedDB/OPFS repository adapter；Record 正文、Reflection、Provider 配置等敏感载荷用 WebCrypto 加密后存储。浏览器存储可能被系统清理，UI 必须明确提示并提供加密导出/同步。
- 搜索：本地索引。中文全文检索先验证 SQLite FTS5 tokenizer 质量；若不可接受，使用共享分词器生成规范化 token 表。搜索索引可由真源重建，不进入备份真源。
- 附件：独立 content-addressed blob store，数据库只保存 hash、MIME、大小和引用。附件默认不送 AI。
- 每次写入同一事务追加 `ChangeOp` 与审计元数据；崩溃后以事务日志和未完成 operation journal 恢复。
- 所有表带 `schemaVersion` 或由数据库 migration version 管理；推导产物另带 `ruleVersion`、`modelId`、`promptVersion`。

### 加密与密钥

- 数据库主密钥随机生成，不从账号密码直接派生；
- 设备上由 iOS Keychain、Android Keystore、macOS Keychain、Windows Credential Manager/DPAPI 包装；
- 导出与恢复使用单独恢复口令，经现代 KDF 派生 key-encryption-key；参数写入文件头，口令不写入文件；
- 锁屏后是否再次要求生物识别作为用户可选设置；
- Web 无法提供与原生系统密钥库完全相同的保证，产品必须如实说明；
- 数据库加密、备份加密、同步端到端加密是三件独立的事，均需独立测试。

### 导入、导出与备份

统一格式 `.jianyuan`：版本化容器，包含 manifest、加密数据快照、附件、校验和、迁移最低版本；默认加密。另提供用户可读的 Markdown/JSON 导出，但明确提示其可能是明文。

导入流程为：只读检查 -> 展示来源、版本、条目数与冲突 -> 在临时库迁移和校验 -> 原子合并/替换。自动备份使用轮换快照，并实际执行恢复演练；“写出了文件”不等于“可恢复”。

## 6. 多端同步

### 方案 A：E2EE 变更日志同步，推荐

设备将每个已提交业务变化编码为不可变 `ChangeOp`，以 vault key 加密后上传。同步服务只认识：`vaultId`、`deviceId`、密文、序号、hash、ack cursor、tombstone retention；它看不到 Record 正文和 AI 结果。新设备通过恢复密钥或已授权设备配对取得 vault key。

优点：符合私人数据边界；服务端简单；未来可迁移自托管；离线天然成立。缺点：客户端 merge、密钥恢复、压缩快照和删除语义需要自己承担。

### 方案 B：托管数据库同步层

使用成熟的 Postgres-to-client sync 产品或自建行级同步，客户端仍保留 SQLite。优点是查询、增量同步和运维工具更快落地；缺点是服务通常能看到明文，E2EE 与领域级冲突规则不自然，并带来供应商与协议约束。若采用此方案，必须先验证许可证、离线写入、删除传播、端侧加密和可迁移性，不能把“支持 SQLite”当成“满足见渊隐私要求”。

### 可选方案 C：加密快照到用户自有存储

把 `.jianyuan` 加密快照保存到 WebDAV/iCloud Drive/用户目录。实现最少、云端最弱，但多设备并发合并体验差。适合作为 V0.1 备份，不作为 V1.0 主同步。

### 推荐协议规则

- 身份：`vaultId + deviceId + device public key`，本地模式无需账号；
- 顺序：每设备单调序号 + operation id；不能依赖设备墙钟决定全部胜负；
- 原始 Record：追加不可变；编辑生成 revision/supersedes；
- Reflection/意义：沿现有 supersession 模型合并，不覆盖历史；
- Directive：新增和 revoke 都是事件；并发有效指令按现有 resolution 取交集，即更限制性的权限获胜；
- UI 偏好：逐字段 last-write-wins，并显示来自哪台设备；
- 删除：先写 tombstone，同步到所有已知设备并保留宽限期；“删除全部”轮换 vault key、撤销设备并清理服务端密文；
- 冲突：无法自动合并的原文修订保留两个版本，交给用户选择；禁止静默丢数据；
- 版本：客户端声明可读/可写 schema 范围；旧端遇到未知 operation 只存储转发，不错误解释；
- 压缩：服务端保存加密 snapshot + snapshot 之后的 ops；客户端验证 hash 后才丢弃旧日志；
- 附件：分块、内容寻址、单独加密；支持断点续传与配额提示。

## 7. 用户设置与 Directive Architecture

设置分为三种，不混在一个 preference 对象里：

1. `DeviceUiPreferences`：本设备显示方式；
2. `ReflectionPreference`：影响 Application 的交互策略；
3. `Directive` / `PrivacyPolicy`：拥有否决权的用户主权规则。

```text
Settings UI
  -> UpdatePreferenceCommand / CreateDirectiveCommand
  -> SettingsPolicy validates scope and consequences
  -> repositories persist versioned value or directive event
  -> use case reads EffectivePolicy at execution time
  -> decision audit stores applied setting/directive ids
```

| 设置 | 进入底层的位置 | 实际行为 |
|---|---|---|
| 主题/字号/密度/动画/刘看山/首页布局 | Presentation | 只改变 view model 与渲染；不进入证据、判断或身份数据 |
| 主动提醒频率 | NotificationPolicy + scheduler | 决定候选提醒的预算、安静时段和最短间隔；不能提高 Discovery 证据等级 |
| 是否允许追问 | Reflection Application | 在生成追问前检查；关闭时 follow-up budget 为 0 |
| 线索呈现强度 | Presentation gating | 只能收窄主动呈现范围，不能放宽 Hard Gate 或把 Hypothesis 变成事实 |
| 暂停主题 | 显式范围的 Directive | 禁止该 scope 的分析/被动呈现/主动呈现中的用户所选项；范围不能由 AI 自动扩大 |
| 自动推荐外部参考 | External Reference Application | 仅允许生成候选；外部内容仍被 Gate 2 隔离 |
| 重复提醒 | NotificationPolicy + presentation history | 依据 stable discovery id 和冷却期去重 |
| 对某类线索反馈 | Target-scoped StateAssignment / explicit scope | 更新 user position 或创建用户明确选择的 Directive；绝不修改 evidence score |
| 数据保存位置/备份 | Persistence/Backup ports | 执行迁移前检查空间、写临时副本、校验、原子切换 |
| AI 数据授权/永不上传 | AIRequestPolicy | 在 Provider 调用之前硬阻断；`neverUploadRecords` 优先级最高 |

优先级固定：`Privacy/Directive deny > 主题级 Directive > ReflectionPreference > UI 默认值`。设置生效必须有 Application 测试，不能只测试 toggle 是否显示。

## 8. AI Provider Architecture

现有 `SemanticJudgmentPort` 应保留作为领域需要的“语义判断接口”。在其外再增加 Provider 层，避免领域接口被供应商的模型、流式输出、重试和计费概念污染。

```ts
export interface AIProvider {
  readonly id: string;
  capabilities(): Promise<{
    structuredOutput: boolean;
    streaming: boolean;
    localOnly: boolean;
    contextLimit?: number;
  }>;
  invoke(request: ProviderRequest, signal: AbortSignal): Promise<ProviderResult>;
  healthCheck(): Promise<ProviderHealth>;
}

export interface AIRequestPolicy {
  authorize(input: {
    task: AITaskKind;
    providerId: string;
    candidateRecordIds: readonly string[];
    requestedFields: readonly DataField[];
  }): Promise<AuthorizedPayload | Denial>;
}
```

调用链：

```text
Application use case
 -> SemanticJudgment module
 -> AIRequestPolicy: directive + privacy + provider destination + task purpose
 -> DataMinimizer: 只取获准字段，附件默认排除，标识符本地替换
 -> Provider adapter
 -> schema validation + epistemic hard gates
 -> audit record（发了哪些字段类型，不默认保存完整 prompt）
```

### Provider 支持

- `OpenAIAdapter`；
- `DeepSeekAdapter`；
- `QwenAdapter`；
- `OpenAICompatibleAdapter`，允许用户填 base URL、model、key；
- `LocalModelAdapter`，未来连接本机兼容端点。

API key 只存在设备安全存储；托管代理仅在用户选择“由见渊代管 Provider”时使用。自定义 endpoint 必须明确显示数据将发送到哪个 host，防止把“兼容 API”误认为 OpenAI。

### 数据发送策略

- 默认逐任务授权，而不是安装时一次性全盘授权；
- 发送前可预览：目的、Provider、记录数量、字段类型、是否含原文；
- 优先发送最小片段；时间语义和 provenance 标签随片段发送，不能只发脱离上下文的正文；
- External Reference 与个人 Record 分区标记，不允许 Provider 输出绕过 Gate 2；
- `永不上传记录` 开启后，远程 Provider 得不到任何个人 Record，即使其他开关为开；本地模型仍可由用户单独允许；
- Provider 不得直接访问 repository、同步密钥、Directive 或数据库。

### 无 AI 与故障 fallback

无 Provider 时保留 Capture、浏览、Timeline、Search、手工标签、用户主动 Reflection、Directive、提醒、导入导出、备份和同步。AI 专属功能显示“当前不可生成”，不伪造 Relation/Hypothesis。

Provider 超时或结构化输出不合法时：有限重试 -> 换备用 Provider需用户事先授权 -> 标记 `needs_retry/unavailable`。绝不把缺失分数补成默认分数，也不因 Provider 不可用阻塞原始记录落库。

## 9. Information Architecture

正式产品不采用线性的 Demo 流程。一级信息架构：

```text
Home / Today
  Quick Capture, 待回看, 最近记录, 同步/备份异常
Capture
  Text, voice transcript confirmation, share/import, capture history
Records
  Timeline, calendar, sources, tags, filters, record detail, revision history
Awareness
  Discoveries, Relations, Hypotheses(on request), archived/suspended
Reflection
  Invitations, active reflection, saved user meanings, superseded meanings
References
  Saved external references, source detail, relation-to-self response
Search
  Full text, date, source, entity type, saved filters
Settings
  Appearance, interaction, directives, privacy, AI, sync/devices, backup, data, notifications, updates, diagnostics
```

每个 Discovery 详情必须能回答：原始记录是什么、时间是什么语义、哪些是系统判断、哪些是用户确认、怎样暂停/归档/反对。External Reference 永远有明显来源标识，不能混入“关于你的发现”列表。

Onboarding 只做必要决策：本地创建资料库 -> 是否设应用锁 -> 数据与 AI 边界 -> 通知选择 -> 可选同步。跳过同步和 AI 后产品仍完整可进入。

## 10. Mobile UX

- 全局主操作是底部拇指区的 Capture；启动后可在一次点击内进入输入。
- 输入先本地落草稿；提交只做必要校验，分析异步且可取消。
- 语音先转写并让用户确认，保存“用户确认后的原话”；音频是否保留另行征得选择。
- 系统分享可接收文本/URL；导入外部内容时明确显示“外部参考”，不默认为个人事实。
- 通知只携带最少敏感文本；锁屏默认显示中性提示，打开应用后再呈现内容。
- Reflection 一次只处理一个问题，支持“稍后”“暂停此主题”“不要再提醒”；不得用连续追问制造压力。
- 关键按钮在下半屏，常用动作不依赖横向精细手势；列表手势必须有可见替代入口。
- 碎片时间首页只显示少量待处理项；Timeline/Search 不塞进首页。
- 离线状态不阻止记录；同步、AI、外部抓取分别显示状态，不能合成一个含糊的“处理中”。

## 11. Desktop UX

Desktop 存在的理由不是“屏幕更大”，而是承担高认知密度与数据主权操作：

- 三栏工作区：Timeline/搜索结果 -> 原始 Record -> Relation/Hypothesis/Reflection 详情；
- 多选、批量标签、来源清理、重复项审查和大文件导入；
- 证据审计：并排查看原话、time semantics、provenance、Evidence Unit 和生成版本；
- 意义历史：当前与已 supersede 的用户表达并列，但不替用户判定哪个“更真实”；
- 完整备份、恢复演练、导出、数据目录迁移、设备撤销；
- Provider 测试、发送预览、用量记录和失败诊断；
- 键盘快捷键、系统菜单、多窗口只在真实提高效率时提供。

默认仍保持安静、工作型界面。刘看山可在空状态、保存反馈或轻提示中出现；关闭后不能影响任何功能或结果。

## 12. Privacy Architecture

| 通道 | 可以包含 | 默认行为 | 禁止事项 |
|---|---|---|---|
| 本地数据 | 全部个人记录与推导 | 本地加密、离线可用 | 未解锁时暴露正文；把日志当遥测上传 |
| 云同步 | E2EE 后的 ops/snapshot/附件块 | 关闭；用户启用后上传密文 | 服务端持有解密钥或把云副本当唯一真源 |
| AI 调用 | 用户授权任务的最小片段 | 每个 Provider/用途可控，可预览 | 全库默认上传、用外部观点定义用户、附件默认上传 |
| 外部引用 | 原文、URL、作者/时间/抓取元数据 | 独立分区与来源标识 | 成为个人 Evidence、影响身份判断、拿热度当置信度 |
| 产品遥测 | 崩溃类型、版本、性能等非内容信息 | opt-in，先做字段白名单 | Record/Reflection 正文、搜索词、Provider key |

删除分三个动作清楚呈现：删除本设备副本、从同步资料库删除、删除全部并撤销恢复能力。产品不能声称已从第三方 AI Provider 删除已发送数据；其保留政策由相应 Provider 决定，用户需自行核实。

威胁模型至少覆盖：设备遗失、恶意同步服务、Provider 泄露、日志带出正文、浏览器存储被清理、旧设备重新上线、损坏备份、供应链依赖与恶意导入文件。每个发布版本做权限清单和数据流审查。

## 13. Packaging & Distribution

| 平台 | 构建与发布 | 必要工作 |
|---|---|---|
| Windows | Tauri 生成 MSIX/MSI 或安装器 | 代码签名、增量/整包更新、WebView2 前置检查、卸载保留数据选项 |
| macOS | `.app` + DMG/PKG | Developer ID 签名、notarization、universal build、Keychain 权限说明 |
| iOS | Expo/EAS 或自有 CI 构建原生包 | Apple 签名、TestFlight、App Store 隐私清单、通知与后台权限 |
| Android | AAB/APK | Play signing、内部测试轨道、Keystore、备份规则、通知权限 |
| Web | Next.js 构建部署 | PWA manifest、CSP、离线壳、持久存储请求、浏览器数据丢失提示 |

Cloudflare Pages 可以继续承载静态/边缘 Web 能力，但是否支持届时 Next.js 版本所需的全部运行特性必须按发布版本验证；它不是不可替换前提。同步 relay 和 AI proxy 若存在，应是独立、最小、可自托管的服务。

发布工程还必须包括：分渠道版本号、签名密钥保管、SBOM/依赖扫描、数据库 migration 测试、自动更新回滚、崩溃恢复、隐私政策、数据导出/删除说明。商店费用、证书价格和政策经常变化，本文件不写死数字，发布前以 Apple、Google、Microsoft 官方页面核实。

## 14. 从当前仓库迁移

坚持绞杀式演进，不做大爆炸重写。

### 阶段 0：冻结与刻画当前行为

- 以 `ENGINEERING_CONTRACT.md` 和现有 invariant 测试为准；
- 为 Capture -> Ingestion -> Reflection 建 application contract tests；
- 记录当前 Prisma schema、导出样本和 UI 依赖；
- 不改领域含义，不先重做视觉。

### 阶段 1：提取可发布的 Shared Core

- 建 pnpm workspace；
- 移动 `src/domain`、`src/application`、Memory adapters 到 packages，保持导入兼容；
- Next Demo 继续运行并消费 workspace packages；
- 增加 Node、React Native bundler、browser 三种构建兼容检查。

### 阶段 2：本地 persistence 垂直切片

- 选一个最小切片：Capture + Record list；
- 实现 SQLite repository、transaction 和 migration ports；
- 先在 Desktop spike 验证加密、FTS、备份恢复、崩溃中断；
- Prisma adapter 继续存在，不一次替换全部。

### 阶段 3：Mobile 日常闭环

- Expo development build；
- 完成 Capture、Timeline、单次 Reflection、设置与本地通知；
- 在无网络、无账号、无 Provider 的真机上验收；
- 再接 Relation/Hypothesis/Discovery 读取与任务队列。

### 阶段 4：Desktop 深度客户端

- Tauri 壳、SQLite、系统密钥库、导入导出、搜索与审计工作区；
- 建签名与更新流水线；
- 用同一批 repository/application contract tests 验证 Mobile/Desktop。

### 阶段 5：可选同步与 Web local-first

- 先实现加密导出/导入，再实现单向上传恢复，再开放双向同步；
- 进行双设备、离线并发、删除、旧版本、密钥丢失测试；
- Web 改为 browser persistence + sync，Server Action 不再是本地写入前提。

### 阶段 6：Provider 市场与生产加固

- 接入两个真实远程 Provider 加一个 deterministic/no-AI adapter，证明接口真实存在；
- 增加发送预览、host 显示、审计和本地模型实验；
- 做安全评审、恢复演练、商店测试与渐进发布。

每一阶段都保留可运行产品和向前迁移路径；只有新路径通过数据恢复和合同测试后，才删除旧路径。

## 15. V0.1 / V0.5 / V1.0

### V0.1：可信的本地个人工具

包含：Mobile 优先的 Capture/Timeline/Search 基础、Desktop 技术预览、本地 SQLite 加密、手工 Reflection、Directive/Privacy 设置、加密导出与恢复、无 AI 模式、一个可选 Provider。

不包含：多端实时同步、Web 全功能客户端、自动外部推荐、长期后台分析、复杂附件、团队/社交、Level 3 主动推送。

### V0.5：跨设备 beta

包含：Mobile + Desktop 日常可用、E2EE 双向同步、设备管理、通知、完整 Awareness 流、版本化 AI adapters、外部引用手工导入、备份轮换、迁移与崩溃恢复。Web 提供轻量 Capture/搜索/回看。

不包含：协作空间、公开社区、自动抓取大量外部数据、服务端读取个人明文、不可解释的个性化模型。

### V1.0：可长期托付的数据产品

包含：五个平台稳定发布、经验证的恢复与删除、多 Provider/本地模型选择、可审计的数据发送、成熟的冲突处理、无障碍与本地化、更新回滚、隐私与安全评审、支持工具和明确的数据可迁移承诺。

不包含：心理诊断、人格标签、AI 伴侣人格、用同意/反对修改证据强度、外部内容转化为个人事实、默认全量云存储。

## 16. 主要风险

| 风险 | 为什么可能致命 | 控制措施 |
|---|---|---|
| 为三端复用而共享 UI | 三端都变得不自然，迭代互相阻塞 | 只共享 Core/contracts/tokens，端侧独立设计 |
| 同步先于本地数据与导出 | 云端成为事实真源，删除和恢复无法解释 | 先 SQLite、导出恢复，再单向恢复，最后双向 |
| 自研同步低估复杂度 | 丢数据会直接摧毁信任 | immutable ops、tombstone、恢复演练、长时间双设备 soak test |
| 加密只停留在“有 AES” | 密钥、日志、备份或 Web 明文仍泄露 | 分层威胁模型、密钥生命周期、独立安全评审 |
| AI 接口名义可替换、实际 prompt 绑定一家 | Provider 切换失败或结果语义漂移 | task schema、capability negotiation、两家真实 adapter 合同测试 |
| 无 AI 模式被做成空壳 | 产品价值被 Provider 可用性绑架 | V0.1 把 Capture/Search/Reflection/backup 作为独立验收 |
| 推导结果跨版本失真 | 新模型让旧结论像永久事实 | 保存 rule/model/prompt version，允许失效和重算 |
| 设置只影响 UI | 用户以为已关闭，底层仍分析或上传 | EffectivePolicy 单入口，deny 优先，application tests |
| Web 被宣传为与原生同等私密可靠 | 浏览器清理、后台限制、密钥能力造成预期落差 | 明示能力差异，鼓励备份/同步，敏感载荷应用层加密 |
| 自动提醒造成情绪负担 | 用户离开产品，甚至产生伤害 | 默认克制、预算/冷却、主题暂停、一次追问上限 |
| 刘看山越过 Presentation | 角色权威化，违背最终解释权属于用户 | package dependency lint：角色模块不能被 Domain/Application 导入 |
| 一开始拆微服务和上大量云 | 成本和运维吞噬产品验证 | 模块化单体；只有同步 relay 和可选 proxy 可独立部署 |
| 旧 Demo 数据无法迁移 | 最早用户和测试资产被丢弃 | 版本化 importer、样本 fixture、每版向前迁移测试 |
| 商店和签名工作推迟 | “能跑”但不能真正发布 | V0.1 即建立 TestFlight/内部轨道/签名安装流水线 |

## 17. 技术负责人现在的第一步

**第一步不是创建三个客户端，而是做一个“Shared Core + 本地加密 SQLite”的可运行垂直切片。**

用 2-3 周完成：

1. 把现有 Domain、Application、Memory testkit 提取到 workspace packages，Next Demo 继续全绿；
2. 定义 `TransactionPort`、本地 repository contract、migration contract 和 `.jianyuan` v0 格式；
3. 在 Tauri spike 中跑通 `Capture -> encrypted SQLite -> restart -> Search -> encrypted export -> destructive test database -> restore`；
4. 同一套测试在无 AI、无网络、无账号条件下通过；
5. 输出实测证据：安装包、数据库重启一致性、导出 hash、恢复后的记录数与关键 invariant 结果。

这个切片一次验证最关键的未知项：现有核心能否脱离 Next/Prisma、local-first 是否真实、数据能否恢复、Tauri 是否适合。通过后再启动 Expo Mobile；如果失败，也能在很小的成本内决定换 Electron 或调整 SQLite 适配器，而不用推翻领域核心。

## 18. 已核实来源与待核实项

以下建议结合了当前仓库实现与截至 2026-09-13 查阅的官方资料：

- [Tauri 官方：What is Tauri](https://v2.tauri.app/start/)：官方说明覆盖主要桌面和移动平台、使用系统 WebView、支持任意 Web 前端；
- [Electron 官方：Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)：官方说明其继承 Chromium 多进程架构，主进程运行 Node.js，渲染进程使用 Web 技术；
- [Expo 官方：Create a project](https://docs.expo.dev/get-started/create-a-project/)：官方将 Expo 定义为简化 Android/iOS 开发的 React Native framework，并提供原生模块与发布路径；
- [Next.js 官方：App Router](https://nextjs.org/docs/app)：官方说明 App Router 使用 Server Components、Suspense、Server Functions 等 React 能力；
- [SQLite 官方：Appropriate Uses](https://www.sqlite.org/whentouse.html)：官方将 SQLite 定位为应用与设备本地存储，并明确其适合桌面应用文件、手机和断网继续工作的客户端缓存。

下列项目不能仅凭架构文档定案，必须通过 spike 或发布时官方政策核实：具体 SQLite/SQLCipher 驱动及许可证、Expo/Tauri 插件在目标 OS 版本上的稳定性、中文 FTS 质量、Cloudflare 对届时 Next.js 功能的支持、商店费用/审核政策/隐私清单、代码签名和自动更新细节。

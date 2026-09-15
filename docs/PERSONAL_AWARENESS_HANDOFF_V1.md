# 见渊 Personal Awareness 项目交接文档 V1

文档状态：交接基线
产品名称：见渊（Jianyuan / Personal Awareness）
编写日期：2026-09-13
适用范围：从知乎黑客松 Demo 向正式 Personal Awareness 产品演进

## 阅读说明

本文是独立的交接材料，用于新的 AI 开发环境接手当前项目。它记录已完成阶段、已确认的架构边界、尚未完成的目标，以及下一阶段的开发顺序。

当前工作区包含未提交的产品化变更和审计/Spike 文件。不要使用 git reset、git clean、强制 checkout 或其他会覆盖现有工作的操作。本文不代表已经完成正式 Core 拆包、SQLite、同步或三端发布。

## 1. 项目当前定位

### 产品与阶段

见渊（Jianyuan / Personal Awareness）正在从知乎黑客松 Demo 转向可以长期使用、离线运行、跨端演进和正式发布的软件产品。比赛版本只提供历史背景，不是正式产品的产品定义、界面定义或部署定义。

### 核心理念

- 从用户自己的原话开始，保留原始表达和来源语境。
- 系统只提出值得回看的可能性，不把可能性伪装成事实。
- 外部观点只能作为 External Reference，不能成为用户身份、个人事实或证据。
- AI 是可替换的辅助能力，不是产品运行的唯一前提。
- 最终解释权属于用户；用户的回应不会被自动升级成永久偏好或人格结论。
- local-first 是默认方向：个人记录、反思和长期历史首先属于用户自己的设备与控制范围。
- 没有 AI Provider 时，产品仍应能记录、浏览、搜索、反思、管理 Directive、导入导出、备份和进行同步。

### 当前产品边界

见渊不是心理诊断工具、人格分析工具或替用户作决定的 Agent。核心链路是：

Record → Evidence Unit → Relation → Hypothesis → Discovery → Reflection

Directive 横向约束主动呈现、被动呈现、追问、重复提醒、主题暂停、外部推荐和 AI 数据使用等行为权限。

## 2. 已完成阶段

### Phase 1：知乎依赖隔离与 Presentation 去比赛化

相关记录：

- docs/ZHIHU_DECOUPLING_AUDIT.md
- 当前工作区中的 archive/demo/

已完成或已确认：

- 刘看山角色、相关图片和比赛专用展示资产已归档，不再作为正式入口的一部分。
- Demo Dashboard、Demo Capture、Demo Reflection 和 demo fixture 已归档，保留用于历史回顾，不删除。
- 正式首页已经改为 Personal Awareness 空状态入口，面向首次使用者展示欢迎、创建第一条记录、最近记录空状态和 Reflection 空状态。
- 正式入口不再展示固定知乎内容、比赛示例数据、刘看山或知乎品牌元素。
- Zhihu External Reference adapter、数据集和相关文档仍属于历史/Provider 边界，不能进入正式 Core。
- Git 历史中的比赛提交和 tag 没有被修改；历史保留与运行时解耦是两件事。

Phase 1 的结论是：当前最大知乎耦合位于 Presentation、Demo 资产和历史资料；Domain 与 Application 没有知乎运行时直接调用。

### Phase 2：Core 边界审计

相关记录：

- docs/CORE_PRODUCTIZATION_AUDIT.md

已确认：

- src/domain 基本是平台无关的 Personal Awareness 领域代码，可作为 packages/core 的主要迁移来源。
- src/application 的主要服务编排可以进入 Shared Core，但需要把构造、持久化、时钟、ID、文件、通知、同步和 AI 传输放到 Ports 之后。
- src/infra/prisma、src/lib/prisma.ts、Prisma schema 和 migrations 属于具体持久化/部署实现，不能进入 Domain 或正式 Core 的领域部分。
- src/app/actions、React 组件、Next.js 路由和页面是 Web Presentation/transport，不应被 Mobile 或 Desktop 复用为核心逻辑。
- SQLite local-first 应位于 packages/storage，通过 Repository、transaction、search 和 migration ports 被 Application 使用。
- AI 应沿 SemanticJudgmentPort 接入，由 Provider 实现；Core 不依赖模型 SDK。
- 当前 Record、Evidence Unit、Relation、Hypothesis、Discovery、Reflection、Directive 模型不需要推翻重写，主要工作是拆包、补齐契约和明确持久化/同步语义。

### Phase 2.1：Shared Core Boundary Spike

相关记录：

- docs/CORE_SPIKE_REPORT.md
- packages/core-spike/index.ts
- packages/core-spike/core-spike.test.ts
- packages/core-spike/tsconfig.json
- packages/core-spike/vitest.config.ts

Spike 只建立了实验性、内存中的边界验证，没有接入正式路由，也没有移动或替换生产文件。

验证链路：

Record → 内存状态 → RelationClaim → Discovery candidate/projection → Reflection invitation/response → Directive permission resolution

验证结果：

- 可以创建 Record，并将状态保存到内存 Map。
- 可以建立 RelationClaim，并由现有 Domain 规则评估证据支持等级。
- 可以生成 Discovery candidate/projection；attention 和 presentation 是读时行为，不自动变成永久事实。
- 可以创建 Reflection invitation、接收用户回应并完成 Reflection routing。
- Directive 可以影响 passive presentation 等行为权限；按钮式同意/反对/暂缓不制造新证据。
- Core 可以脱离 Next.js、React、Prisma、PostgreSQL、Cloudflare、AI SDK、Zhihu、网络和 Provider secret 独立运行。

已记录的验证结果：

- npx tsc -p packages/core-spike/tsconfig.json --noEmit：通过。
- npx vitest run --config packages/core-spike/vitest.config.ts：1 个 test file、2 个 tests 通过。
- 此前正式测试：35 个 test files、784 个 tests 通过。

Spike 证明的是边界可行，不等于 packages/core 已经建立，也不等于 SQLite、同步、加密和真实 Provider 已经验证。

## 3. 当前目录状态

当前主要结构：

    src/
      app/
      application/
      domain/
      infra/
      lib/
      server/

    packages/
      core-spike/

    archive/
      demo/

    docs/

### 正式代码

- src/domain：当前正式领域实现，包含核心实体、值对象、规则、gates、lineage、state 和 ports。
- src/application：当前正式用例服务，包括 Ingestion、Relation、Hypothesis、Discovery、Reflection、Directive 和 External Reference 服务。
- src/infra/prisma：当前 Prisma/PostgreSQL 持久化适配器，属于具体基础设施，不是 Shared Core。
- src/app：当前 Next.js Web Presentation、页面、Server Actions 和 UI 组件。其正式入口已完成去比赛化，但仍在现有 src/ 结构内。

### 实验代码

- packages/core-spike：Phase 2.1 的最小内存验证工具。它只用于证明 Core 边界，不应直接作为生产 Core，也不应把实验 facade 逐字复制成最终 API。

### 归档代码

- archive/demo：比赛 Dashboard、Capture/Reflection 展示流程、demo fixture、刘看山组件和相关视觉资源。它们保留用于历史回顾，不得被正式路由重新引用。

### 文档与资料

- docs/PRODUCT_ARCHITECTURE_V1.md：正式产品总体架构基线。
- docs/ZHIHU_DECOUPLING_AUDIT.md：知乎耦合点审计与隔离结论。
- docs/CORE_PRODUCTIZATION_AUDIT.md：Shared Core 边界审计。
- docs/CORE_SPIKE_REPORT.md：Phase 2.1 Spike 验证报告。
- docs/architecture.md、ENGINEERING_CONTRACT.md、HANDOFF_PHASE_9.md：架构、工程契约和阶段交接资料，使用前应先确认其适用范围和当前版本。
- docs/zhihu-*、docs/product-submission-plan.md 等仍包含 Provider 或比赛历史语境，不应被当作正式产品入口说明。

## 4. 当前架构目标

目标结构：

    packages/
      core
      storage
      providers
      sync
      export-format
      testkit

    apps/
      web
      desktop
      mobile

### packages/core

拥有平台无关的 Domain、Application、contracts、policies、ports、commands、queries、events、错误码和 schema version。Core 不读取环境变量，不打开文件，不创建数据库连接，不访问浏览器或原生 API，不导入 Next.js、React、Prisma、SQLite、PostgreSQL、Cloudflare 或 Provider SDK。

### packages/storage

实现 Repository、atomic transaction、SearchPort、change log、tombstone、迁移、备份和本地加密存储适配器。设备端优先使用加密 SQLite；Web 可使用 IndexedDB/OPFS；Memory adapter 用于测试。具体存储类型不泄漏进 Domain。

### packages/providers

实现可替换的 AI Provider 和 External Reference Provider。可以有 providers/ai/openai、providers/ai/deepseek、providers/ai/qwen、providers/ai/compatible-http、providers/ai/local，以及 providers/external-reference/zhihu。Zhihu 只能在这里存在，Core 只认识通用 External Reference contract。

### packages/sync

实现可选的端到端加密变更日志、设备身份、游标、幂等、冲突和删除/tombstone 协议。同步服务不是个人事实的权威来源，云端只保存同步所需的密文和元数据。

### packages/export-format

定义可验证、带 schema version 的见渊导入导出格式，支持备份、恢复、迁移和用户可读的导出。导入必须保留原话、provenance、time semantics、lineage 和删除语义，不把外部引用导入成个人 Evidence。

### packages/testkit

提供 Memory Repository、deterministic judgment double、clock、ID/hash double 和跨端 contract/invariant tests。它不是生产数据层，也不是 AI Provider。

### apps/web

Next.js Presentation、Web transport、浏览器存储适配和可选的云端 composition。Web 是轻量跨设备入口，不能让 Server Action 成为 Core 工作的唯一条件。

### apps/desktop

Tauri 2 + React 客户端，承担完整本地产品、深度历史浏览、复杂搜索、批量导入导出、备份恢复、Provider/同步诊断和大屏 Reflection。业务规则仍来自 Shared Core，不搬到 Rust。

### apps/mobile

Expo/React Native 客户端，承担日常快速 Capture、离线记录、系统通知、短 Reflection、今日/最近线索、分享入口和单手操作。它不应只是 Desktop 页面的缩小版。

依赖方向必须保持：apps 调用 Core；storage/provider/sync 实现 Core ports；Core 不反向依赖任何 app、数据库或 Provider。

## 5. 核心模型

### Record

用户主动留下的原始记录。必须保留原话、创建时间和时间语义、来源/provenance、source fingerprint、导入信息和对应 Evidence Unit identity。Record 是个人材料的起点，不是人格标签。

### Evidence Unit

从 Record 中可追踪的证据单元。它必须能回到原始记录和原始表达。Evidence Unit 不等于 source fingerprint；fingerprint 用于来源/去重，Evidence Unit 表示可被后续关系引用的证据粒度。

### Relation

两个或多个 Evidence Unit 之间的描述性关系候选，例如重复、对照、时间相邻或语义相似。Relation 不是因果证明，也不自动说明用户的稳定特征。评估应保留证据维度、支持等级和 provenance。

### Hypothesis

基于关系提出的待检验可能解释。Hypothesis 不是事实、诊断、人格结论或概率分数；它可以被保留、否定、暂停或失效。任何呈现都必须让用户知道这是可能性。

### Discovery

对关系/假设的稳定身份和读时投影，用于让用户回看。排序、attention、presentation 强度和主动提醒不是永久个人事实，不能把当前 priority 写成用户本身的属性。

### Reflection

Reflection Episode 是一次系统邀请和用户回应的过程；UserReflectionRecord 是用户真正写下的自由文本。只有用户自由文本可以产生新的 Record。点击同意、反对、暂缓等按钮只形成 user position，不自动制造 Evidence，不提高关系支持，也不生成永久偏好。

### Directive

用户主权规则，控制主动/被动呈现、追问、重复提醒、主题暂停、外部推荐和 AI 数据授权等行为。Directive 不是简单 UI toggle；Application 层必须通过确定性权限解析将设置映射为可审计的 effective permissions，并保留 appliedDirectiveIds。

## 6. AI 架构原则

AI 不进入 Domain。Core 只定义结构化任务、输入/输出 contract、权限裁剪策略和 SemanticJudgmentPort；具体 Provider 位于 packages/providers/ai，由端侧 composition root 选择和注入。

Provider 不得直接写入 Record、Evidence Unit、Relation、Hypothesis、Discovery 或 Directive，也不得授予权限、决定展示等级或替用户提交意义。AI 输出必须作为候选或任务结果经过 Core 规则和用户边界处理。

禁止：

- 自动人格分析。
- 心理诊断或临床判断。
- 替用户下结论。
- 把 AI 输出变成身份或永久性格事实。
- 用用户同意/反对按钮提高证据支持。
- 把 AI SDK、模型专用类型或 Provider secret 带入 Core。

允许发送给 Provider 的数据必须按任务最小化裁剪，并由用户授权控制。默认不发送全量个人数据库、sourceFingerprint、evidenceUnitId、内部 lineage、未授权 Reflection/Directive、附件和无关历史。应用应向用户说明任务、数据范围、Provider、保留策略和失败处理，并记录授权/撤销事件。

无 Provider 时，Capture、浏览、Search、Reflection、Directive、导入导出、备份和同步仍可运行。AI 失败应返回 unavailable 或 needs retry，不伪造结果，不阻塞本地记录。

## 7. 下一阶段任务：Phase 3

### 正式 Core Package Boundary 建立

目标是从 packages/core-spike 演进出 packages/core，保持现有 Domain/Application 语义，不进行大规模重写，不在同一阶段同时开发完整三端 UI、完整同步、真实 AI Provider 和新数据库。

必须建立的内容：

#### contracts

- versioned commands 和 queries。
- 稳定的 read models、分页/cursor 和空状态语义。
- 稳定错误码和可跨端序列化的结果。
- schema version。
- import/export/sync serialization contract。
- AI task request/result contract。

#### ports

- Repository 和 atomic transaction。
- SearchPort。
- Clock、ID generator、Hash。
- SecureKeyStore。
- ChangeLog/ChangeOp、tombstone 和设备身份。
- Backup/Export。
- Notification decision。
- SemanticJudgmentPort。
- ExternalReferenceProvider。

#### events

- Record captured。
- Relation evaluated/admitted。
- Hypothesis admitted/invalidated。
- Discovery projected。
- Reflection responded。
- Directive created/revoked。
- Import/export completed。
- Sync accepted/rejected/conflicted。
- AI task requested/completed/failed。

推荐迁移顺序：

1. 建立 packages/core skeleton、package entrypoint 和禁止外部依赖的 import lint。
2. 迁移 src/domain 为 packages/core/domain，先保持兼容导出，避免一次性改掉所有调用方。
3. 迁移 src/application 为 packages/core/application，连同请求/结果类型、错误码和 contract tests。
4. 将 src/server/container.ts 拆为 Core factory 与各端 composition root；Prisma 只留在 Web/具体 adapter。
5. 将 Memory 和 deterministic judgment double 放入 packages/testkit。
6. 将 Web Server Actions 改为薄 transport，只负责 DTO 转换、调用 Core command/query 和刷新端侧状态。
7. 用现有测试与新增 contract tests 验证无 DATABASE_URL、无 Next route、无 Provider secret、无网络时的 Core 行为。
8. 边界稳定后，再进行 packages/storage/sqlite spike，单独验证加密、迁移、恢复和全文搜索。

SQLite 的位置：packages/storage，由 Mobile/Desktop composition root 注入；SQLite schema、SQL、驱动 API 和加密实现不得进入 Domain/Application。AI 的位置：packages/providers/ai，通过 packages/core 的 SemanticJudgmentPort 和 task contracts 注入；Provider 选择、密钥、安全策略和网络策略由端侧负责。

## 8. 开发约束

后续开发必须遵守：

- 不恢复知乎依赖，不把 Zhihu adapter 或 dataset 引入 Core。
- 不恢复比赛 Demo 流程，不让 archive/demo 被正式路由引用。
- 不重新接入刘看山作为产品向导、Agent、人格、推理来源或用户身份解释者；它若存在，只能是 Presentation Layer 视觉元素。
- 不把 AI SDK、数据库实现、SQL、Prisma、SQLite、IndexedDB、PostgreSQL 或 Cloudflare API 写进 Domain。
- 不让数据库实现写进 Application；Application 通过 ports 工作。
- 不用记录数量代替 Evidence Unit 数量。
- 不把 Hypothesis 当事实，不把 Discovery priority 当永久事实。
- 不删除用户原话、来源、意义历史或可追溯链路。
- 不把用户同意/反对/暂缓按钮当作证据。
- 不默认上传全量数据，不默认 OAuth、账号、云端或网络。
- 不因无 AI Provider 而阻塞本地核心工作。
- 不在未确认前删除旧代码、移动正式文件、修改 Prisma schema、创建数据库迁移或提交 Git。

## 9. 给下一位开发者的第一步

第一步应执行：Core Package Boundary Migration，而不是直接开发 UI。

建议启动检查：

1. 先阅读本文、docs/CORE_PRODUCTIZATION_AUDIT.md 和 docs/CORE_SPIKE_REPORT.md，再阅读 ENGINEERING_CONTRACT.md。
2. 检查当前未提交变更，确认没有 reset、clean 或覆盖用户工作的必要。
3. 建立 packages/core skeleton、入口导出和 import lint。
4. 以兼容导出迁移 src/domain，并在无数据库、无 Next.js、无 Provider secret、无网络的条件下运行 contract tests。
5. 再迁移 src/application 和 composition root；完成后才评估 SQLite storage spike。

验收底线：没有 DATABASE_URL、没有 Next route、没有 Provider secret、没有网络时，Core 仍能创建 Record、保存/读取状态、执行 Directive、生成 Discovery projection，并完成 Reflection routing。

## 10. 当前已知未完成项

以下内容在当前交接时没有被正式验证，不得对外宣称已完成：

- 正式 packages/core 尚未建立。
- SQLite 驱动、数据库级加密、密钥库、迁移和恢复尚未验证。
- IndexedDB/OPFS Web storage 尚未验证。
- 多端同步、冲突、删除/tombstone、设备身份和端到端加密尚未验证。
- 真实 OpenAI、DeepSeek、Qwen、兼容 API 或本地模型 Provider 尚未验证。
- 中文全文检索、移动端后台通知、桌面自动更新、应用签名、崩溃恢复和各端正式发布尚未验证。
- 当前正式 Web 代码仍在 src/，目标 apps/web 等目录只是架构目标，不应被误认为已经存在。

## 11. 交接后的判断标准

每次架构决策都应回答四个问题：

1. 这段代码是否仍然可以在无 UI、无数据库、无 AI、无网络时运行？
2. 它是否保留用户原话与可追溯来源，而没有把推测升级为事实？
3. 它是否让用户通过 Directive 控制呈现、追问、上传和外部引用？
4. 它是否适合按端自然交互，而不是为了复用而制造万能 UI？

只要答案不清楚，就先补充 contract、port、审计记录或测试，不要直接扩大基础设施和云端依赖。

---

本交接文档只新增文档，不代表任何代码、数据库、Git 历史或部署状态已经改变。

# 见渊 Core Productization Audit

阶段：Phase 2：Core 边界审计
日期：2026-09-13
范围：只审计，不修改代码、不移动文件、不重构、不创建 commit
产品：见渊（Jianyuan / Personal Awareness）

## 结论

当前仓库已经有一套可演进为跨端 Shared Core 的领域内核，但还不是可以直接被 Mobile、Desktop、Web 共同消费的包。

1. src/domain 基本满足平台无关要求，可以作为 packages/core 的主要迁移来源。
2. src/application 的服务编排大多可以进入 Shared Core，但构造、ID、时钟、文件、通知、同步和 AI 传输必须继续留在 Ports 之后。
3. src/infra/prisma、src/lib/prisma.ts 和当前 src/server/container.ts 绑定 PostgreSQL/Prisma，不能直接进入 Core。
4. src/app/actions、React 组件和 Next.js 路由属于 Web Presentation/transport adapter，不能进入 Core。
5. SQLite local-first 应实现为 packages/storage 的设备端适配器，通过 Repository/transaction ports 被 Application 使用；SQLite 类型和 SQL 不应泄漏到 Domain。
6. AI 已经有正确入口：SemanticJudgmentPort。Provider registry、权限裁剪、结构化 schema、审计和 fallback 应围绕它建设，而不是让 Core 依赖某个模型 SDK。

没有发现必须推翻现有 Domain 模型的根本问题。需要做的是拆包、补齐端口、明确持久化和同步语义，而不是重写 Record 到 Reflection 链路。

## 1. 当前边界

### Domain

src/domain 包含 Record、Evidence Unit、RelationClaim、Hypothesis、Discovery、ReflectionEpisode、UserReflectionRecord、Directive、External Reference、Ingestion、Lineage、State 和共享值对象。

Domain 没有导入 Next.js、React 或 Prisma。repositories.ts 和 semantic-judgment.ts 是依赖反转点。Domain 注释中仍有少量知乎示例文字，但没有 Provider 运行时依赖；后续可单独做去平台化清理。

### Application

src/application 包含 IngestionService、RelationService、HypothesisService、DiscoveryService、ReflectionService、DirectiveService 和 ExternalReferenceService。

Application 没有直接调用知乎，也没有导入 Next.js/React。它可以迁移进 Shared Core，但当前服务实例由 src/server/container.ts 构造，迁移时要把请求/结果类型、错误码和用例测试一起迁移。

### Infrastructure

| 位置 | 作用 | Shared Core 结论 |
|---|---|---|
| src/infra/memory | 内存 Repository、测试和离线双 | 移到 packages/testkit 或 storage-memory，不进 Core |
| src/infra/prisma | Prisma 映射、PostgreSQL Repository、事务提交 | Web/cloud adapter，不进 Core |
| src/infra/external | Zhihu HTTP/dataset adapter | packages/providers/zhihu，Core 不依赖 |
| src/infra/fake | 确定性 SemanticJudgmentPort double | packages/testkit，不是生产 AI Provider |
| src/infra/ids、src/infra/hash.ts | ID 和 hash 具体实现 | 接口/纯算法可进 Core，随机源实现留在 adapter |

### Presentation / Web transport

src/app/page.tsx、各 route page、React 组件和 CSS 只能留在 apps/web 或各端应用。

src/app/capture/capture-form.tsx 使用 useState、useActionState、FormData 和 DOM。
src/app/actions/*.ts 使用 use server、FormData、Next Server Action、revalidatePath 和 Web 表单协议。
src/app/layout.tsx 负责 HTML shell、metadata 和导航。
src/app/settings/page.tsx 是 Server Component 读写方式。

这些模块应调用 Core command/query facade，但不能直接访问 Prisma 或 Repository。移动端和桌面端需要自己的 transport、导航、通知、文件选择和错误呈现。

## 2. Shared Core 候选

### 可以进入 packages/core

- src/domain/** 的实体、值对象、gates、状态机、时间语义、lineage 和 Evidence Unit 规则；
- repositories.ts 中与业务持久化能力对应的接口；
- semantic-judgment.ts 中的结构化 AI 端口；
- src/application/** 的服务、请求/结果类型和确定性错误分类；
- 不依赖平台的 hash 算法与 ID 接口；
- 统一 command/query/event DTO、schema version、导入导出模型和同步 operation 模型（当前尚未完整实现，需要作为 Core 扩展）；
- 现有 invariant tests 作为跨端 contract suite 的来源。

Core 不应读取环境变量、打开文件、创建数据库连接或访问浏览器 API。

### 仍依赖 Next.js 或 Web transport

| 文件/区域 | 依赖 | 迁移方式 |
|---|---|---|
| src/app/actions/capture.ts | use server、FormData、Server Action 返回约定 | 转成 CaptureCommand；Next action 只做 DTO 转换 |
| src/app/actions/directives.ts | revalidatePath、FormData | 转成 Directive command；刷新交给端侧 store |
| src/app/actions/reflection.ts | revalidatePath、FormData | 转成 reflection commands |
| src/app/actions/preferences.ts | revalidatePath、FormData | 转成 settings command |
| src/app/**/page.tsx | Next App Router、Server Component | 留在 apps/web |
| src/app/capture/capture-form.tsx | React hooks、DOM、浏览器 FormData | 留在端侧 Presentation |
| src/app/layout.tsx | HTML shell、metadata、链接导航 | 留在 apps/web |

### 仍依赖数据库实现

| 文件/区域 | 依赖 | 迁移方式 |
|---|---|---|
| src/infra/prisma/*.ts | Prisma generated client、PostgreSQL 行结构 | Web/cloud persistence adapter |
| src/lib/prisma.ts | @prisma/adapter-pg、DATABASE_URL | Web/cloud composition root |
| src/server/container.ts | 同时导入 Application、Memory、Prisma、ID 和 hash 实现 | 拆成 Core wiring 与每端 composition root |
| prisma/schema.prisma、prisma/migrations | PostgreSQL/Prisma schema | 保留 Web/cloud 历史；SQLite 单独版本化 migration |
| src/infra/memory/** | 内存状态和测试生命周期 | testkit，不是真正生产持久化 |

### 仍依赖 UI 或展示语境

- src/app/page.tsx 和 src/app/globals.css：布局、文案、导航和 CSS；
- archive/demo/**：比赛 Demo、fixture、刘看山资源，不能被生产包导入；
- references、reflection、settings 页面：应显示 Core query/read model，不自行决定领域状态。

## 3. 现有模型是否足够

| 模型 | 已有能力 | 审计判断 |
|---|---|---|
| Record | 原话、provenance、time semantics、source fingerprint、Evidence Unit、多 epistemic roles | 语义足够；后续补版本/编辑和附件引用 |
| Evidence Unit | 独立证据身份、继承规则、显式新证据决定 | 足够守住 no-double-counting；同步/修订必须保留身份 |
| Relation / RelationClaim | 比较轴、描述性关系、六维评分、gates、审计理由 | 足够；DTO 不应把评分误当排序或事实 |
| Hypothesis | 解释、anchors、竞争解释、预测、加强/削弱条件，无概率字段 | 足够符合产品哲学；可补 model/rule provenance，不能添加人格置信度 |
| Discovery | 稳定身份，注意力和呈现级别按读时计算 | 足够；同步稳定身份和状态，不同步临时 priority |
| Reflection | Episode 与 UserReflectionRecord 分离，意义可 supersede、时间化、保留历史 | 足够；需补跨端 read model 和离线幂等键 |
| Directive | 四个独立权限、显式 scope、可撤销 | 足够作为主权层；还需映射到 UI/通知/AI/上传策略 |

语义上足够，产品基础设施契约尚未完整。需要补命令/查询 DTO、写入幂等、版本与修订、删除 tombstone、SearchPort、ChangeOp、设备密钥、通知决策、AI 审计元数据和 Provider registry。这不是重写理由。

## 4. 推荐目标结构与迁移顺序

建议结构：

packages/core       domain + application + contracts + policies
packages/storage    ports + sqlite + browser + memory
packages/providers  external-reference + ai + optional zhihu
packages/sync       change log and merge
packages/testkit    memory adapters and contract fixtures
apps/web            Next.js + browser/cloud composition
apps/desktop        Tauri + React
apps/mobile         Expo/React Native
archive/demo        historical presentation only

依赖方向：apps 依赖 core；storage/provider 实现依赖 core ports/contracts；core 不依赖 app、Prisma、Next.js、React 或 provider SDK。

迁移顺序：

1. 建立 workspace/package boundaries 和禁止导入规则，不改变行为。
2. 将 src/domain 暴露为 packages/core，保持导出兼容，先跑现有测试。
3. 将 src/application 和 DTO 迁入 Core；把 server/container 的装配拆为 Core wiring 与 Web Prisma wiring。
4. 将 Memory 实现移到 testkit，将 Prisma 实现标记为 Web/cloud adapter。
5. 实现 packages/storage 的 SQLite adapter 和 schema/migration contract，再接 Desktop/Mobile；Web 使用 browser adapter 或现有云端 adapter。
6. 将 SemanticJudgmentPort 抽到 provider-neutral contract，先接 deterministic fallback，再接一个真实 Provider。
7. 将 External Reference abstraction 与 Zhihu 实现拆开，Zhihu 仅放 providers/zhihu。
8. 将 Web Server Actions 改成 Core commands 的薄 transport，再分别建设 Desktop/Mobile UI。
9. 最后加入同步、加密导出、设备密钥、删除/tombstone 和恢复演练。

## 5. SQLite local-first 插入层

SQLite 位于 packages/storage，作为 Core Repository、transaction、search、change-log 和 migration ports 的设备端实现。Mobile/Desktop composition root 负责选择和注入它。

不应放进 Domain，因为 Domain 不应知道 SQL、表名、WAL、SQLite driver 或 FTS tokenizer。不应放进 Application，因为 Application 只要求原子提交、查询和搜索能力。不应由页面直接执行 SQL。

当前 Prisma schema 是 PostgreSQL 历史，不能直接当作移动端 SQLite schema。设备端应有独立、可版本化、可测试的 SQLite migration。SQLite adapter 负责本地真源、WAL、短事务、崩溃恢复、数据库加密、SecureKeyStore 包装、Repository、全文索引、ChangeOp 同事务提交、导入临时库和原子恢复。

Web 可用 IndexedDB/OPFS adapter，保持相同 ports 和序列化契约。浏览器存储可能被清理，必须提供加密导出和可选同步，不能宣称与原生端相同的存储保证。

## 6. AI Provider 插入层

当前 semantic-judgment.ts 已是合适入口：它返回候选、可比性、抽象上限、证据维度和假设阶段的结构化结果；Domain 负责 gates、算术、权限和证据身份。

推荐分层：packages/core 提供 SemanticJudgmentPort、AI task contracts 和 permission policy；packages/providers/ai 实现 OpenAI、DeepSeek、Qwen、兼容 HTTP 或本地模型；apps composition root 负责 provider selection、key store 和 network policy。

Provider adapter 可以依赖 HTTP/SDK，但不能依赖 Prisma、Presentation 或直接写 Record。它只接收已裁剪的 RecordView/任务 DTO，返回结构化结果，再由 Application 和 Domain gates 判断是否可用。

默认不发送全量个人数据库、sourceFingerprint、evidenceUnitId、内部 lineage 身份、未授权 Reflection/Directive/附件/外部引用全文和无关历史记录。发送前由 Core policy 做字段裁剪。

用户应能选择 Provider、模型、是否联网、是否允许发送原话和永不上传记录。密钥放在端侧安全存储或 Web 受控服务端，不写入 Domain 数据。记录 provider、model、schema/prompt version、授权摘要、失败原因和响应校验结果。

无 AI 时仍可 Capture、浏览、搜索、导入导出、Directive、Reflection、提醒和同步。超时、拒绝、额度耗尽或结构化结果无效时返回显式 unavailable/needs retry，不伪造分数。

## 7. 风险与推荐第一步

主要风险：把 server/container 当成 Core；为了复用 UI 把页面塞进共享包；把 Prisma schema 直接变成 SQLite schema；让 AI SDK 渗入 Domain；把 AI 结果直接当事实；同步只复制最终行；以记录数代替 Evidence Unit 数；混淆 Web 与原生存储保证；为跨端重写 Domain；Provider/知乎再次进入 Core。

现在最应该做的是 Core package boundary spike，而不是先接 SQLite、AI 或重写 UI：

1. 创建临时 workspace/package 结构和 import lint。
2. 将 src/domain、src/application、ports 以最小改动暴露为 packages/core。
3. 设计 Core wiring 与 Web Prisma wiring 的分离。
4. 用现有 Memory repositories 跑完整 contract tests，证明 Core 不需要 Next.js、Prisma、知乎、网络或 AI key。
5. 边界稳定后，再做 SQLite adapter spike，验证加密、FTS、migration、崩溃恢复和导入恢复。

验收标准：没有 DATABASE_URL、Next.js route、Provider secret 和网络时，仍能实例化 Core，并完成 Capture、Directive、Discovery/Reflection 的纯规则测试。

## 审计限制

本文件依据当前仓库静态代码、目录、导入和 schema 检查生成。没有执行目录迁移、数据库迁移、SQLite 性能测试、设备加密验证或真实 AI Provider 网络调用；这些属于后续 spike，不应在本阶段宣称已经验证。

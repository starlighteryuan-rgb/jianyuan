# 见渊知乎依赖隔离审计

审计阶段：正式产品化第一阶段  
审计日期：2026-09-13  
审计状态：仅审计，等待确认；本阶段不删除、不移动、不重构、不修改数据库、不修改 Git 历史  
仓库基线：分支 phase-9-freeze，最近提交 49895de docs: finalize public release hygiene

## 1. 结论

当前仓库的核心领域逻辑已经基本完成知乎运行时隔离，但正式产品入口仍然明显带有黑客松 Demo 语境，且知乎实现、数据集、展示资产和比赛文档仍与正式入口并置。

结论分三层：

1. Domain：运行时边界基本合格，文本和示例仍需去平台化。src/domain 没有导入知乎 adapter，也没有把知乎字段建模为个人事实；但 external-reference.ts 的注释直接写入 Zhihu 示例，测试和注释仍用 zhihu 作为默认例子。
2. Application：没有直接调用知乎，当前通过统一 External Reference 类型进入。ExternalReferenceService 依赖 RetrievedExternalReference 和 IngestionService，而不是 ZhihuExternalAdapter；但 Application 注释中仍出现“别再给我看知乎的东西”。
3. Presentation / 文档：仍然是比赛 Demo。首页、Capture、References、Reflection 由 demo-* 组件和固定知乎内容驱动；刘看山资产直接位于展示路径；README、提交计划和 Cloudflare 部署文档仍以竞赛发布为主。

最终判断：当前不是“知乎已经进入 Core”的根本架构事故，而是“Core 的通用抽象已存在，但正式产品外壳尚未脱离比赛资产”的产品化阻塞项。执行阶段应先切断正式入口对 Demo fixtures 的依赖，再移动 provider 代码，最后处理历史文档和测试命名。

## 2. 审计范围与方法

已检查全仓文件名和内容、src/domain、src/application、src/app、src/infra、Prisma schema、全部 migrations、package scripts、tests、README、docs、ARCHITECTURE_PROPOSAL.md、ENGINEERING_CONTRACT.md、CLAUDE.md，以及隐藏 Git 元数据中的 tag/ref（只读）。

搜索关键词：zhihu、知乎、moltbook、刘看山、ZhihuAdapter、dataset、hackathon，并额外检查 demo、fixture、seed、external。

搜索事实：

- 找到知乎/知乎中文命中，分布在 Domain 注释、Application 注释、Presentation、Infra adapter、tests、README 和 docs。
- 没有找到 moltbook 命中。
- 没有名为 src/zhihu 的目录；知乎实现目前位于 src/infra/external/。
- 没有发现 Prisma seed 脚本；prisma/migrations/ 没有知乎或比赛数据内容。
- .git/refs/tags/v0.1.0-zhihu-demo 和 Git reflog 中存在历史比赛标记。本阶段不修改 Git 历史。

## 3. 分类规则

### A. 必须删除或移出正式产品入口

比赛专用展示 shell、固定 Demo fixtures、刘看山品牌/角色资产、竞赛首页路径和只为评委说明流程存在的组件。若需保留历史材料，应放到 archive/competition/ 或独立归档仓库，不应被正式构建、正式导航或生产 package import。

### B. 必须隔离

知乎 HTTP adapter、本地知乎 dataset adapter、dataset profiler、知乎专属测试和映射文档。它们可以作为未来 External Reference Provider，但不能被 Domain/Application Core 直接依赖，也不能成为正式产品启动、Capture、Search 或 Reflection 的前提。

### C. 可以保留

Record、EvidenceUnit、RelationClaim、Hypothesis、Discovery、ReflectionEpisode、UserReflectionRecord、Directive、ReflectionPreference、Lineage、Provenance、Time Semantics、Gate 2 quarantine，以及平台无关的 External Reference abstraction。

## 4. 当前耦合点总表

| 编号 | 文件/目录 | 层 | 当前发现 | 分类 | 是否删除 | 是否隔离 | 修改建议 |
|---|---|---|---|---|---|---|---|
| C-01 | src/infra/external/zhihu-external-adapter.ts | Infra | 知乎开放平台 HTTP endpoint、Bearer secret、URL 校验、响应映射 | Provider 实现 | 否 | 是，P0 | 移到 providers/zhihu/ 或 integrations/zhihu/；只实现通用 ExternalReferenceProvider |
| C-02 | src/infra/external/zhihu-external-dataset-adapter.ts | Infra | 本地知乎 JSON dataset 读取、manifest、去重、冲突诊断 | 比赛数据 Provider | 不进入正式构建，建议归档 | 是，P0 | 与在线 adapter 分开；产品不打包 dataset，保留为开发/迁移工具 |
| C-03 | scripts/profile-zhihu-dataset.mjs | Tooling | 默认读取 data/raw/zhihu_search 并生成知乎 profile | 比赛工具 | 正式产品删除，历史可归档 | 是 | 移到 tooling/providers/zhihu/ 或归档仓库 |
| C-04 | src/app/_components/demo-fixtures.ts | Presentation | 固定 Discovery 和 zhihu-demo-* References 数据 | 比赛 fixture | 是，P0 | 否 | 从正式产品入口移除；若保留，移到 examples/competition/，不得被正式 Web 导入 |
| C-05 | src/app/_components/demo-dashboard.tsx | Presentation | 首页比赛路径、固定快照、知乎参考、刘看山控制 | 黑客松展示代码 | 是，P0 | 否 | 用正式 Home/Today 页面替换 |
| C-06 | src/app/_components/demo-capture-journey.tsx | Presentation | sessionStorage 临时 Capture 和 Demo 文案 | 黑客松展示代码 | 是，P0 | 否 | 接入真实 Capture Application/use case |
| C-07 | src/app/_components/demo-reflection-journey.tsx | Presentation | 固定 Discovery、页面内临时 Reflection、Demo only 状态 | 黑客松展示代码 | 是，P0 | 否 | 接入真实 ReflectionService |
| C-08 | src/app/_components/liukanshan-character.tsx | Presentation | 刘看山图片路径、角色状态和展示组件 | 比赛品牌/角色 | 是，P0（正式入口） | 可选 Presentation plugin | 默认从正式产品移除；若保留，单独放 presentation/mascot |
| C-09 | characters/刘看山/、public/characters/liukanshan/ | Assets | 三视图和 6 个动态 GIF | 比赛视觉资产 | 是，P0（正式发布包） | 可选 Presentation assets | 从生产 app assets 移出；归档前确认授权和许可证 |
| C-10 | src/app/references/page.tsx | Presentation | 直接导入 DEMO_EXTERNAL_REFERENCES | 正式入口对比赛 fixture 的依赖 | 页面概念可保留 | 否 | 改为读取 Application 查询；无 provider 时显示空状态 |
| C-11 | src/app/page.tsx、capture/page.tsx、reflection/page.tsx | Presentation | 直接装配 Demo Dashboard/Capture/Reflection Journey | 比赛路由装配 | 当前装配方式删除 | 否 | 路由名称可保留，组件替换为正式 view model |
| C-12 | src/app/layout.tsx | Presentation | 注释和 footer 写明 Competition demo | 比赛品牌文案 | 文案删除 | 否 | 改成正式产品 shell |
| C-13 | src/app/globals.css | Presentation | 大量 demo-*、journey-*、companion-* 样式 | 比赛 UI 样式 | 正式 UI 替换后删除 | 否 | 以正式页面迁移为前提清理 |
| C-14 | src/domain/external/external-reference.ts | Domain | 核心类型通用，但注释多次以 Zhihu 说明规则 | Domain 文本耦合 | 否 | 否 | 保留 abstraction；示例改为 provider A，平台事实移到 provider 文档 |
| C-15 | src/application/external-reference-service.ts | Application | 使用通用类型，但注释示例为“别再给我看知乎的东西” | Application 文本耦合 | 否 | 否 | 改为通用 provider scope 示例；运行时没有直接调用知乎 adapter |
| C-16 | src/application/*、src/server/container.ts | Application/Composition | 未发现 ZhihuExternalAdapter import；ExternalReferenceService 通过 ingestion 进入 | 已有隔离 | 否 | 保持 | 增加 architecture lint，禁止 Core/Application import providers/zhihu |
| C-17 | tests/zhihu-external-adapter.test.ts | Tests | 在线 adapter HTTP contract 测试 | Provider 测试 | 否 | 是，P0 | 移到 providers/zhihu 测试目录 |
| C-18 | tests/zhihu-external-dataset-adapter.test.ts | Tests | dataset manifest、文件读取、冲突和知乎 identity 测试 | Provider 测试 | 否 | 是 | 与在线 adapter 分开，不进入 Core 默认测试 |
| C-19 | tests/external-reference.test.ts | Tests | 通用 quarantine，但 fixture/provider 写死 zhihu | Core 测试中的平台 fixture | 否 | 部分 | 改为 provider-a；知乎 URL 留在 provider tests |
| C-20 | tests/directive-resolution.test.ts | Tests | 用 source: zhihu 测试 source scope | 通用 scope 的平台样例 | 否 | 否 | 改为 provider-a 或 external-source-a |
| C-21 | tests/ingestion.test.ts、tests/prisma-mappers.test.ts | Tests | 用 zhihu:answer:* 作为 sourceRef 样例 | 通用 provenance fixture | 否 | 否 | 改为 provider-a:item:* |
| C-22 | tests/source-fingerprint.test.ts | Tests | 用 zhihu:answer:* 验证 fingerprint 变化 | 通用 identity fixture | 否 | 否 | 改为 external-a:item:* |
| C-23 | prisma/schema.prisma | Data | 只有通用 EXTERNAL_REFERENCE enum；没有 Zhihu 字段 | 可保留 | 否 | 不需移动 | 不新增 zhihu* 列；provider 放在通用 source/provenance 数据中 |
| C-24 | prisma/migrations/* | Data | 未发现知乎、dataset 或 seed 内容 | 可保留 | 否 | 不需移动 | 继续保持迁移链 provider-neutral |
| C-25 | package.json、prisma/ | Data/Tooling | 未发现 seed script，也未声明知乎运行依赖 | 已有隔离 | 否 | 保持 | provider 使用独立 script，不能加入默认启动 |
| C-26 | README.md | Docs | 产品介绍、架构、知乎、竞赛 Demo 和公开 URL 混合 | 正式入口文档污染 | 不删除整体 | 需重写/分拆 | README 改为正式产品当前状态，比赛说明归档 |
| C-27 | docs/product-submission-plan.md | Docs | 竞赛提交、知乎生态契合度、评委展示和固定快照 | 比赛提交文档 | 正式产品不保留在主 docs | 是，P0 | 移到 archive/competition/ |
| C-28 | docs/cloudflare-pages-deployment.md | Docs | 面向比赛发布，含公开 Demo、知乎 secret 禁止项和竞赛路由 | 比赛部署说明 | 不作为正式发布说明 | 是 | 重写为正式 Web 发布文档，比赛版本归档 |
| C-29 | docs/zhihu-*.md | Docs | adapter mapping、dataset profile、runtime result、import validation | Provider 技术资料和历史验证 | 否 | 是，P0 | 移到 providers/zhihu/docs/；主 docs 只保留 provider registry 链接 |
| C-30 | docs/architecture.md、ARCHITECTURE_PROPOSAL.md | Architecture Docs | 正式架构有 Zhihu 专章；proposal 有 hackathon 语境 | 架构原则 + provider 历史混合 | 不删除核心架构 | 分层 | 保留产品原则、External Reference quarantine、Gate 2；实现细节迁出 |
| C-31 | ENGINEERING_CONTRACT.md | Contract | §28 是知乎边界，§40 写 hackathon MVP | 产品约束含历史提供方示例 | 不删除 | 后续审阅 | 保留外部内容不能定义用户；平台事实改为通用 provider 约束或历史附录 |
| C-32 | .git/refs/tags/v0.1.0-zhihu-demo、Git logs | Git history | 历史 tag 和提交信息包含知乎黑客松版本 | 历史元数据 | 否 | 不处理 | 本阶段不改 Git 历史；未来发布不用该 tag 作为正式基线 |

## 5. 分层审计

### 5.1 Domain Layer

结论：运行时隔离基本通过，命名/注释去平台化未完成。

已确认：src/domain 没有导入 src/infra/external/zhihu-*；RetrievedExternalReference.provider 是通用 string；ExternalReference 的固定角色是 external_reference，Gate 2 负责拒绝其进入个人证据判断；Domain 没有知乎专属数据库字段，也没有把平台 author、metrics、ContentID 当作个人证据。

问题：external-reference.ts 的注释直接将 Zhihu answers 作为规范例子；“知乎主要是 External Reference Layer”写进通用 Domain 文件；核心测试使用知乎 URL 和 zhihu provider，削弱了平台无关信号。

建议：保留通用 External Reference abstraction、quarantine、provenance 和 Gate 2；例子改为 provider-a；知乎合规、字段映射和 API 事实移到 provider package；增加 domain/** 不得 import providers/品牌模块的依赖规则。

### 5.2 Application Layer

结论：当前没有发现直接调用知乎，属于已有的正确方向。

ExternalReferenceService 依赖通用 RetrievedExternalReference，然后调用 IngestionService；没有 import ZhihuExternalAdapter，也不构造知乎 HTTP 请求。知乎适配器当前停留在 src/infra/external/，未进入 Application service wiring。

需要处理的非结构性耦合：external-reference-service.ts:124 用知乎作为 Directive scope 例子；provider scope 虽是通用字段，但核心注释使用知乎作为默认语义，可能导致新功能写死 zhihu。

目标形式：Application -> ExternalReferenceProvider interface -> selected provider adapter（可选） -> RetrievedExternalReference -> ExternalReferenceService -> IngestionService。

Application 不应知道 provider 的 HTTP endpoint、Access Secret、dataset manifest 或 provider-specific author/metrics 字段。

### 5.3 Presentation Layer

结论：这是当前最高优先级的正式产品阻塞点。

首页 src/app/page.tsx 直接渲染 DemoDashboard。该 dashboard 同时展示固定 Discovery、固定知乎 External Reference、刘看山状态切换、Competition fixture 数量和演示快照，以及比赛导览式 Capture -> Awareness -> References -> Reflection。

/references 直接读取 DEMO_EXTERNAL_REFERENCES，而不是 Application 查询真实外部参考；/capture 和 /reflection 仍使用 demo-* 组件和 sessionStorage。

正式产品处理顺序：建立正式 Application query/command；切换真实 view model；删除 production 对 demo fixture/刘看山的 import；再删除或归档 Demo 组件、角色资产和 Demo CSS；无数据时显示真实空状态。

刘看山如果未来保留，只能作为独立 Presentation plugin：presentation/mascot/assets 和 presentation/mascot/renderer。依赖方向必须是 presentation -> mascot，不能出现 domain/application -> mascot。

### 5.4 Data Layer

结论：数据库结构没有知乎依赖，当前主要风险在展示 fixture 而不是 Prisma。

检查结果：prisma/schema.prisma 只有通用 EXTERNAL_REFERENCE 角色和通用 provenance/source 字段；全部 migrations 没有知乎列、知乎 seed、dataset 导入；package.json 没有 seed script；仓库没有 prisma/seed.*。Demo fixtures 虽不是数据库 seed，但在产品体验上起到了“静态 seed”的作用。

正式产品要求：Prisma/PostgreSQL 保持 provider-neutral；不得新增 zhihu* Core 列；dataset 只作为隔离开发导入工具；Core contract tests 不使用知乎 URL 作为默认 fixture。

### 5.5 Documentation

结论：当前文档混合了产品理念、现行架构、比赛提交说明和 provider 验证记录。

保留在正式主线：产品理念、用户最终解释权、核心流水线、Directive、External Reference abstraction、Gate 2 quarantine 和平台无关的部署/数据/隐私原则。

迁移到 provider 文档：docs/zhihu-adapter-mapping.md、docs/zhihu-external-adapter.md、docs/zhihu-dataset-profile.md、docs/zhihu-dataset-runtime-result.md、docs/zhihu-external-reference-import-runtime-result.md 以及 profiler 使用说明。

迁移到历史归档：docs/product-submission-plan.md、Cloudflare 文档中的比赛发布部分、ARCHITECTURE_PROPOSAL.md 中只服务于 hackathon 的表述，以及 README 的比赛 Demo/评委/公开 URL/固定 fixture 说明。

ENGINEERING_CONTRACT.md 是当前产品逻辑最高约束，不能在本阶段直接删除或随意改写。后续需单独走合同文本去 provider 化变更，保留 External Reference 的认识论边界，只把知乎改成历史示例或 provider-specific 附录。

## 6. 推荐目标结构

当前关键问题：src/app 中正式路由与比赛 Demo 混在一起；src/infra/external 中知乎 adapter 与通用 infra 同层；tests 中 Core 测试与知乎 provider 测试混在一起；docs 中产品架构、比赛提交和知乎验证混在一起；刘看山资产位于仓库根部。

推荐结构：

apps/
  web/                         正式 Next.js Web 入口
  desktop/                     未来 Tauri 外壳
  mobile/                      未来 Expo 外壳
packages/
  core-domain/                 Record/Evidence/Relation/Hypothesis/Discovery/Reflection
  core-application/            Capture/Ingestion/Directive/Reflection/Search/Timeline
  contracts/                   通用 commands、queries、events、schemas
  external-reference/          ExternalReferenceProvider interface + quarantine DTO
  testkit/                     generic provider fixtures + invariant tests
providers/
  zhihu/                       Zhihu HTTP adapter、dataset adapter、provider tests
  future-provider-a/           其他外部参考提供方
integrations/
  sync/                        可选同步
  ai/                          可选 AI Provider
tooling/
  migrations/
  import-export/
  providers/zhihu/             dataset profiler 和 provider-only scripts
archive/
  competition/                 黑客松提交说明、Demo snapshot、历史说明
docs/
  product/                     产品理念和正式架构
  providers/                   provider registry 与接入契约
  operations/                 正式发布、备份、恢复、迁移

目标不是机械改名，而是建立依赖约束：apps/* -> packages/core-application -> packages/core-domain；providers/* -> packages/external-reference + packages/contracts；Core packages 不得反向依赖 providers；archive 不得被 production package import。

## 7. Provider Interface 目标

当前代码已经有 RetrievedExternalReference，但正式产品应显式定义 provider seam：

ExternalReferenceProvider {
  id: string;
  displayName: string;
  search(input: ExternalReferenceSearchRequest): Promise<RetrievedExternalReference[]>;
}

约束：provider id 是 provider 标识，不是个人证据身份；输出只能是待选择候选；选择、Directive 检查、存储和 Gate 2 仍由 Application/Domain 完成；provider 不能创建 Record、Evidence Unit、Relation、Hypothesis 或 Discovery；provider-specific metadata 不进入 Core 语义；provider 不可用时 References 页面显示空状态，不阻塞 Capture、Search、Reflection。

## 8. 风险分析

| 风险 | 当前证据 | 影响 | 控制措施 |
|---|---|---|---|
| 正式首页继续依赖 Demo fixtures | page.tsx -> DemoDashboard -> demo-fixtures.ts | 用户看到比赛演示，真实数据链路无法验证 | P0 替换正式 view model，删除 production import |
| Provider adapter 被未来 Application 直接 import | adapter 与 infra 同层且缺少显式 interface | Core 重新被单一平台绑死 | 建 package boundary、dependency lint、Provider interface |
| 角色资产被误认为产品人格/Agent | liukanshan-character.tsx 和状态控制在首页 | 违背 Presentation only 和最终解释权 | 从正式默认包移除；独立可选插件 |
| Core 测试被 zhihu fixture 污染 | directive/ingestion/mappers/fingerprint tests | 迁移到其他 provider 时隐藏耦合 | 全部 genericize；知乎只留 adapter tests |
| 文档把知乎当产品价值证明 | submission plan 的知乎生态契合度 | 产品战略继续围绕单一平台 | 主 docs 只描述 External Reference |
| dataset 被误打包或误初始化 | profiler 默认 data/raw/zhihu_search | 版权、体积、隐私和发布风险 | dataset 只留 tooling/archive；CI 检查 release artifact |
| 误删历史验证导致无法追溯 | 多份 runtime result 和 adapter mapping | 难以解释旧测试/数据来源 | 归档而非直接删除 |
| 只改目录不改依赖 | src/app 仍直接导入 demo | 看似隔离，实际仍耦合 | 以 import graph 和 production build 验收 |
| 把“没有知乎”误做成“不能有外部参考” | Domain External Reference 被误删 | 产品能力和认识论边界一起丢失 | 保留通用 abstraction、Gate 2 和 provider-neutral tests |
| 旧文档与新产品状态冲突 | README、Cloudflare、submission plan 不一致 | 发布和后续开发误读 | 建正式 docs 入口，历史文档标记 archived |
| 修改 Git 历史以清理名称 | 历史 tag/ref 存在 | 破坏可追溯性且超出本阶段 | 不改历史，从新版本开始使用正式命名 |

## 9. 推荐执行顺序（等待确认后执行）

### P0：先切断正式入口对比赛内容的依赖

1. 建立正式 Web 页面骨架和 Application query/command。
2. 替换 page.tsx、capture/page.tsx、references/page.tsx、reflection/page.tsx 的 demo-* import。
3. 用真实空状态和真实 repository 读取替代固定 Discovery/知乎内容。
4. 删除或归档 demo-dashboard、demo-capture-journey、demo-reflection-journey、demo-fixtures。
5. 移除首页和 footer 的 competition 文案。

### P1：建立 provider seam，再移动知乎实现

1. 定义通用 ExternalReferenceProvider interface。
2. 给 ExternalReferenceService 增加 provider-neutral contract test。
3. 将两个知乎 adapter 移到 providers/zhihu/。
4. 将在线 adapter 测试和 dataset 测试随 provider 移动。
5. 通过 import graph 确认 Core 不依赖 providers/zhihu。
6. provider 未配置时，正式产品仍可启动。

### P2：去平台化 Core 测试与 Domain/Application 注释

1. external-reference.ts 和 external-reference-service.ts 的例子改为 generic provider。
2. external-reference、directive、ingestion、mappers、fingerprint 中的 zhihu fixture 改为 provider-a。
3. 保留知乎 URL、ContentID、dataset manifest 只在 provider tests。
4. 增加禁止 Domain/Application 出现 ZhihuAdapter/liukanshan import 的静态检查。

### P3：文档分流

1. README 改为正式产品当前状态。
2. docs/product-submission-plan.md 移到比赛归档。
3. docs/zhihu-*.md 移到 provider docs。
4. Cloudflare 文档拆为正式 Web 发布说明与历史比赛部署记录。
5. 审阅 ENGINEERING_CONTRACT.md 和 docs/architecture.md，只保留平台无关规则在主文档。

### P4：正式构建验收

- Core package 在无知乎 adapter、无 dataset、无刘看山资产时可构建。
- Web 在无 provider secret、无网络、无 dataset 时可启动。
- Capture -> Record、Awareness 读取、Reflection、Directive 和 Search 不依赖知乎。
- release artifact 不包含知乎 dataset 和比赛角色资产。
- packages/core-* 无 zhihu、知乎、liukanshan、hackathon 命中。
- provider package 单独测试通过。
- 历史数据和测试报告仍可通过归档路径追溯。

## 10. 验收标准

- [x] 已扫描关键词和主要目录。
- [x] 已确认没有 moltbook 命中。
- [x] 已确认 Prisma schema/migrations 没有知乎字段或 seed。
- [x] 已确认 Application 没有直接 import ZhihuExternalAdapter。
- [x] 已列出 Presentation、Infra、Tests、Docs 和 Git 历史耦合点。
- [x] 已区分删除、隔离、保留。
- [x] 已给出目标结构、风险和执行顺序。
- [x] 尚未执行任何删除、移动、代码修改、数据库修改或 Git 历史修改。
- [ ] 等待用户确认后再进入执行阶段。

## 11. 当前不确定项

以下事项仅凭静态扫描无法最终决定：刘看山素材的版权/授权范围；知乎 dataset 是否需长期保留；ENGINEERING_CONTRACT.md 的 §28/§40 是否直接去平台化；正式 Web 是否继续使用当前 Next.js app 作为迁移宿主；ExternalReferenceProvider interface 版本和 registry 位置；比赛归档留在同一仓库还是独立 archive 仓库。

本报告不对以上问题猜测结论。

## 12. 待确认事项

审计阶段到此结束。下一阶段需要用户确认具体执行范围，尤其是：是否批准删除正式入口中的 Demo/刘看山资产；是否批准将知乎 adapter、dataset adapter、脚本和文档迁移到 provider/integration/archive 目录；是否批准将 Core 测试中的知乎样例替换为 generic provider；是否批准同步更新 README、现行架构文档和工程合同。

在收到确认前，不执行任何上述变更。


# 见渊 Shared Core Boundary Spike Report

阶段：Phase 2.1
日期：2026-09-13
范围：实验性边界验证；未修改正式路由、Domain、Application、Prisma schema 或数据库迁移
状态：Spike 通过

## 结论

当前 Personal Awareness 的核心语义可以在脱离 Next.js、React、Prisma、PostgreSQL、Cloudflare、AI SDK 和 Zhihu 的环境中运行。

本次 spike 在 packages/core-spike/ 中建立独立内存 harness，只导入现有 src/domain 的纯 TypeScript 模块，验证了 Record、内存状态、RelationClaim、Discovery projection、Reflection invitation/response 和 Directive permission resolution。

没有把实验代码接入正式应用，也没有移动现有生产文件。

## Spike 文件

- packages/core-spike/index.ts：实验性内存状态和最小 facade。
- packages/core-spike/core-spike.test.ts：2 个测试。
- packages/core-spike/tsconfig.json：实验性类型检查配置。
- packages/core-spike/vitest.config.ts：独立测试配置。

## 已验证行为

### Record

使用现有 PersonalRecord 类型，保留原话、user_expression、provenance、time semantics、source fingerprint 和 Evidence Unit identity，并写入 Map，不需要数据库或 ORM。

### Relation

使用 RelationClaimCandidate、buildStoredClaim 和 assessEvidence。比较轴、六个证据维度、numeric score 和 support level 均由现有 Domain 代码计算，不需要 AI Provider。测试得到实际 Domain 结果 observed，没有人为提高等级。

### Discovery

使用 projectSubject 生成 Discovery identity。Attention 和 Presentation 是读时计算值，Relation 支持等级不参与 Discovery 排序，passive permission 可以独立控制。

### Reflection

使用 buildInvitation 和 routeFeedback。Invitation 包含三个退出选项；只有自由文本触发 Reflection Record；按钮响应只形成 user position，不制造证据；meaning commitment 保持 tentative。

### Directive

使用 resolveEffectivePermissions。无 Directive 时使用系统基线；全局 Directive 可以关闭 passive presentation；权限字段保持独立并返回 appliedDirectiveIds。

## 测试结果

类型检查：npx tsc -p packages/core-spike/tsconfig.json --noEmit，已通过。

测试：npx vitest run --config packages/core-spike/vitest.config.ts，1 个 test file、2 个 tests 通过。

默认 Vitest 只收集 tests/**/*.test.ts，因此 spike 使用独立配置，没有修改正式测试配置。

## 可以直接迁移

src/domain/record、relation、hypothesis、discovery、reflection、directive、ingestion、lineage、state、shared、ports 均没有导入 Next.js、React 或 Prisma，可作为 packages/core/domain 的主要来源。纯函数、值对象、实体类型、状态规则、gates、Evidence Unit 规则和 SemanticJudgmentPort 适合作为 Shared Core 基础。

src/application 的 IngestionService、RelationService、HypothesisService、DiscoveryService、ReflectionService、DirectiveService 和 ExternalReferenceService 的 provider-neutral 部分可进入 packages/core/application，但应同时迁移请求/结果类型、错误码和 contract tests。

## 需要重构

1. src/server/container.ts 同时知道 Application、Memory、Prisma、ID、hash 和 judgment，是最大的装配耦合点。应拆成 Core factory 与各端 composition root。
2. src/app/actions/*.ts 把 FormData、Server Action 和 revalidatePath 绑定在一起。应转为 versioned command DTO 的薄 transport。
3. 跨端需要稳定 query/read-model contract、分页/游标、空状态、权限裁剪和 schema version；当前没有统一包。
4. 正式 local-first 还需 SearchPort、ChangeOp、tombstone、设备身份、加密信封、恢复协议和离线幂等。
5. packages/core-spike/index.ts 是验证工具，不应直接成为生产 Core；正式 Core 仍应通过 Application service + ports 运行。

## 需要替换的依赖

| 当前依赖 | 替换方向 |
|---|---|
| Next Server Actions / revalidatePath | Core commands/queries，端侧刷新机制 |
| React hooks / DOM / FormData | 各端 Presentation adapter |
| Prisma Client / PostgreSQL | packages/storage ports；SQLite、IndexedDB 或 Web/cloud adapter |
| src/server/container.ts | 每端独立 composition root |
| deterministic judgment double | packages/testkit；生产仍使用 SemanticJudgmentPort |
| Zhihu adapter | packages/providers/zhihu；Core 只保留通用 External Reference contract |
| AI SDK | packages/providers/ai 实现 SemanticJudgmentPort |

## 推荐 packages/core 结构

packages/core/
  src/domain/          record, relation, hypothesis, discovery, reflection, directive, ingestion, lineage, state, shared, ports
  src/application/     ingestion, relation, hypothesis, discovery, reflection, directive services
  src/contracts/       commands, queries, read-models, errors, schema-version
  src/policies/        ai-data-minimization, notification, directive, sync
  src/index.ts

相关包：packages/storage（ports、sqlite、browser、memory）、packages/providers（ai、external-reference、zhihu）、packages/testkit、apps/web、apps/desktop、apps/mobile。

依赖方向：apps 依赖 core；storage/provider 实现依赖 core ports/contracts；core 不依赖 app、Prisma、Next.js、React 或 provider SDK。

## SQLite 与 AI 的位置

SQLite 应位于 packages/storage，作为 Core Repository、transaction、search、change-log 和 migration ports 的设备端实现，由 Mobile/Desktop composition root 注入。SQLite 不应进入 Domain、Application 或页面；当前 Prisma PostgreSQL schema 不能直接当移动端 SQLite schema。

AI 应沿现有 SemanticJudgmentPort 接入。packages/core 提供 task contracts 和权限裁剪策略，packages/providers/ai 实现 OpenAI、DeepSeek、Qwen、兼容 HTTP 或本地模型，apps composition root 负责 Provider 选择、密钥和网络策略。Provider 只能接收裁剪后的 RecordView/任务 DTO，不能直接写 Record。

默认不发送全量个人数据库、sourceFingerprint、evidenceUnitId、内部 lineage、未授权 Reflection/Directive/附件和无关历史。无 AI 时仍可 Capture、浏览、搜索、导入导出、Directive、Reflection、提醒和同步；失败时返回 unavailable/needs retry，不伪造分数。

## 未验证内容

本次没有验证 SQLite 驱动、数据库加密、IndexedDB/OPFS、多端同步、冲突、删除/tombstone、系统密钥库、真实 AI Provider、中文全文检索、移动/桌面发布或恢复迁移。

## 推荐下一步

得到确认后，先建立正式 packages/core 边界和 import lint；以兼容导出迁移 src/domain，再迁移 src/application；拆分 server/container；让 Memory repositories 运行 contract tests。边界稳定后再做 packages/storage/sqlite spike。

验收标准：没有 DATABASE_URL、Next.js route、Provider secret 和网络时，Core 仍能创建 Record、读取状态、执行 Directive、生成 Discovery projection，并完成 Reflection routing。

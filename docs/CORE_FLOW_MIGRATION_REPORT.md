# 见渊 Phase 3.5：核心闭环迁移报告

日期：2026-09-13

## 结论

Phase 3.5 已完成。正式 Web 的 Capture、Record Query、Discovery 展示、
Relation Reflection 详情与 Reflection 写入，以及它们依赖的 Directive 和
ReflectionPreference，现已统一从同一个 Composition Root 获取
`packages/core` Application modules，并共享一个
`packages/storage/memory` adapter 实例。

默认链路为：

```text
Web Presentation
  -> src/server/capture-composition-root.ts
  -> packages/core Application
  -> Core Storage Ports
  -> packages/storage/memory
```

旧 `src/domain`、`src/application`、`src/server/container.ts` 和 Prisma adapters
均未删除。设置 `JIANYUAN_CAPTURE_COMPOSITION=legacy` 时，整个请求改走旧 graph；
系统不会在一次写入失败后跨 adapter 重试。

## 审计结果

### Relation

- 当前没有 Relation 专用页面或 Server Action。
- 旧 Relation 流程只通过 `src/server/container.ts` 装配
  `src/application/relation-service.ts`，主要由测试和内部调用使用。
- 它依赖 Record、RelationClaim、StateAssignment、Directive repositories，
  并通过 `SemanticJudgmentPort` 获取结构化判断。
- Phase 3.5 将同一业务能力装配为 Core `RelationService` + `RelationEngine`，
  使用同一个 Memory adapter 的对应 ports。

### Discovery

- Phase 3.4 后首页和 `/reflection` 都仍显示静态空状态，没有查询 Discovery。
- 旧 `DiscoveryService.listStream()` 由旧 container 装配，依赖 Discovery、
  FocusContext、StateAssignment、Directive、Record、RelationClaim 和 Hypothesis
  repositories。
- Phase 3.5 后首页和 `/reflection` 均调用同一 Core graph 的
  `DiscoveryService.listStream()`；Presentation 不访问 repository。

### Reflection

- `/reflect/[targetRef]` 原来直接通过旧 container 查询 RelationClaim repository。
- `submitPosition`、`submitLeaveForNow`、`submitProse` 原来调用旧
  `ReflectionService`，并在 Server Action 内构造 episode。
- Settings 原来直接访问旧 Directive 与 ReflectionPreference repositories。
- Phase 3.5 新增 Core `ReflectionFlowService`，负责目标解析、邀请 episode
  持久化、反馈路由和 Reflection Record 创建。详情页和三个 actions 只调用
  这个 Application interface。
- Directive 列表与 ReflectionPreference 更新也进入 Core Application，避免
  Relation/Discovery 读取的 graph 与 Settings 写入的 graph 分叉。

## 新 Composition Root

`createCoreCaptureComposition(storage, options)` 现在要求完整
`CoreStoragePorts`，并在一次构造中建立：

- `IngestionService`
- `RecordQueryService`
- `DirectiveService`
- `RelationService` / `RelationEngine`
- `HypothesisService` / `HypothesisEngine`
- `DiscoveryService`
- `ReflectionService`
- `ReflectionFlowService`

所有 modules 接收同一个 storage adapter 的 ports 和同一个 ID generator。
`getCoreComposition()` 缓存的是整个 graph，而不是分别缓存各个流程。

原来的 `getCaptureComposition()`、`createCoreMemoryCaptureComposition()` 和
`asCaptureComposition()` 继续保留，避免破坏 Phase 3.3/3.4 调用方。

## Provider 状态

Relation Core 仍通过 `SemanticJudgmentPort` 工作。新增
`packages/providers/deterministic` 作为无网络、无 AI SDK 的 adapter：

- Web 默认返回零候选，不凭空生成 Relation。
- 测试可显式注入候选，验证完整 application pipeline。
- 未来 AI provider 可替换此 adapter，不需要修改 Core 或 storage。

这不表示已接入 AI。

## 完整闭环验证

`tests/capture-composition-root.test.ts` 新增同一 graph 的闭环用例：

1. Capture 两条原话，创建两个独立 Record。
2. Record Query 读回第一条 Record。
3. Core RelationService 对两条 Record 运行 gates、scoring，并保存 Relation。
4. Core DiscoveryService 从该 Relation 生成并保存 Discovery identity。
5. Core ReflectionFlowService 打开 invitation 并保存一条用户 Reflection。
6. Record Query 再读回 Reflection Record 及其 meaning history。

整个用例只使用一个 `MemoryStorageAdapter`，没有 Prisma、SQLite、Next repository
访问或 AI 调用。

## 已迁移模块

- Capture 写入
- Record 最近列表、单条查询、Reflection context 查询
- Relation Application 装配与持久化
- Discovery Application 装配、首页与 Reflection 页读取
- Relation Reflection target 查询
- Reflection position、defer、prose 写入
- Directive 创建、撤销、列表读取
- ReflectionPreference 读取与更新

## 未迁移模块

- SQLite adapter：未开始。
- AI provider：未接入；当前只有确定性离线 adapter。
- Relation 的用户可见触发入口：此前不存在，本阶段未新增 UI 或自动分析策略。
- Hypothesis 的用户可见生成入口：本阶段仅完成 graph 装配，未增加产品流程。
- External Reference：不属于本次核心闭环迁移范围。
- 三端、同步、后台任务：均未开始。
- 旧 Domain/Application/container/Prisma adapters：保留为 fallback。

## 修改文件

### Core

- `packages/core/application/directive-service.ts`
- `packages/core/application/reflection-service.ts`
- `packages/core/application/reflection-flow-service.ts`
- `packages/core/application/index.ts`

### Provider

- `packages/providers/deterministic/index.ts`
- `packages/providers/deterministic/package.json`
- `packages/providers/deterministic/tsconfig.json`
- `packages/providers/deterministic/README.md`

### Composition 与 fallback

- `src/server/capture-composition-root.ts`
- `src/server/legacy-core-composition-adapter.ts`

### Web Presentation / Server Actions

- `src/app/page.tsx`
- `src/app/reflection/page.tsx`
- `src/app/reflect/[targetRef]/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/actions/reflection.ts`
- `src/app/actions/directives.ts`
- `src/app/actions/preferences.ts`

### Tests 与报告

- `tests/capture-composition-root.test.ts`
- `tests/directive-action.test.ts`
- `tests/reflection-action.test.ts`
- `docs/CORE_FLOW_MIGRATION_REPORT.md`

## 架构变化

此前 Web 同时存在两个状态图：Capture/Record Query 使用 Core Memory，
Reflection/Settings 使用旧 container。它们即使接口相似，也不会共享数据。

现在正式 Web 页面和 actions 都从 `getCoreComposition()` 取得同一个 graph。
Web 扫描未发现对 `@/server/container`、`@/domain`、`@/application` 或
`repositories.*` 的直接访问。旧 graph 的映射集中在
`legacy-core-composition-adapter.ts`，不会扩散到 Presentation。

## SQLite 前的状态

进入 SQLite adapter 前，核心业务所需 ports 已在一个完整 graph 中被实际使用：

- Record、Role、Lineage、IngestionCommit
- Directive、RelationClaim、StateAssignment
- Discovery、FocusContext、Hypothesis
- ReflectionPreference、ReflectionEpisode、UserReflectionRecord

下一阶段只需实现相同 `CoreStoragePorts` 并替换 composition root 的 adapter。
SQLite 迁移仍需补充：

- Ingestion 原子事务；
- source fingerprint 与 Discovery stable key 唯一约束；
- Record recency、Relation record refs、Reflection meaning history 索引；
- Date 与 branded ID 的 mapper；
- 冷启动、重启恢复、迁移升级、并发去重测试。

## 当前问题

1. Memory adapter 是进程内状态，重启和多实例之间不持久、不共享。
2. Web 默认确定性 provider 不产生候选，因此不会自动分析 Capture；这是避免在
   没有 AI/provider 和明确触发策略时伪造 Relation 的保守行为。
3. Relation 尚无用户可见的触发入口。Core pipeline 已可运行，但何时分析仍是
   后续产品/application 决策，本阶段没有擅自新增交互。
4. Legacy fallback 仍依赖旧 Prisma graph 与 `DATABASE_URL`；它只用于显式回退。
5. Core 与旧 Domain 当前是两套重复类型，fallback adapter 需要隔离映射；删除
   重复代码应等 SQLite adapter 和迁移验证完成后再单独执行。
6. Discovery read 会确保 stable identity，因此是带幂等写入的查询；SQLite 实现
   必须为该 upsert 提供事务和唯一约束。

## 验证结果

- `npm --prefix packages/core test`：通过，3 files / 6 tests。
- `npm --prefix packages/storage/memory test`：通过，3 files / 3 tests。
- `npm run typecheck`：通过。
- `npm test`：通过，37 files / 790 tests。
- `npm run build`：通过；8 条 routes，5 个动态 routes。
- Core、Memory Storage、Deterministic Provider package typecheck：通过。
- 未执行 Git commit。

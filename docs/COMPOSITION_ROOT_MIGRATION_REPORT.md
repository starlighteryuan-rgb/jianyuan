# 见渊 Phase 3.3：Composition Root Migration Spike Report

阶段：Phase 3.3  
日期：2026-09-13  
状态：完成  
迁移范围：Capture → Ingestion → Storage

## 结论

现有 Web Capture Server Action 已不再直接调用旧 `src/server/container.ts`。
默认装配链路现在是：

```text
Web Capture Form
→ submitCapture Server Action
→ Capture composition root
→ packages/core IngestionService
→ packages/core Storage Ports
→ packages/storage/memory MemoryStorageAdapter
```

旧 container 和旧 `src/domain`、`src/application`、`src/infra/memory`、Prisma
实现均保留。未迁移流程仍按原方式运行。

UI 组件、表单字段、返回状态、错误码和用户可见文案没有修改。未接入 SQLite
或 AI，也没有执行 Git commit。

## 当前装配方式分析

### Server Actions

迁移前四组 Server Actions 都直接调用 `getServices()`：

- `capture.ts`：调用 `getServices().ingestion.ingest()`；
- `directives.ts`：调用 Directive Application module；
- `preferences.ts`：读写 ReflectionPreference Repository；
- `reflection.ts`：调用 Reflection Application module。

Settings、Reflection detail 等 Server Component 也直接读取旧 container 暴露的
repositories。

### container

`src/server/container.ts` 是旧的全量 composition root，同时知道：

- 旧 `src/application` 的七个 Application modules；
- Relation/Hypothesis engines；
- 13 个 Repository/commit ports；
- 旧 Memory adapters；
- Prisma/PostgreSQL adapters；
- ID 与 hash 实现；
- deterministic semantic judgment；
- `DATABASE_URL` 和 process-wide service cache。

`getServices()` 默认选择 Prisma graph；`createMemoryServices()` 主要用于测试和无
数据库运行。所有 Application modules 通过构造参数获得 Repository interfaces，
但这些 interfaces 和 modules 仍来自旧 `src` 副本。

### Repository 注入

旧 `createServices(repositories)` 是唯一全量装配函数。Prisma 和旧 Memory 两套
Adapter 都先组成 `Repositories`，再注入 Ingestion、Directive、Relation、
Hypothesis、Discovery、Reflection 和 ExternalReference modules。

这个方式本身保留了依赖反转，但 Web 仍依赖旧 `src/domain` 和
`src/application`，没有进入 Phase 3.1 建立的正式 package seam。

## 新装配方式

新增 `src/server/capture-composition-root.ts`，只负责 Capture 所需的最小图：

```text
CaptureStoragePorts
├── RecordRepository
├── RecordEpistemicRoleRepository
├── LineageRepository
├── DirectiveRepository
└── IngestionCommitRepository

CaptureStoragePorts
→ packages/core IngestionService
→ CaptureIngestionPort
→ Web Capture use case
```

核心工厂 `createCoreCaptureComposition(storage)` 只依赖从
`CoreStoragePorts` 选出的五个窄 Port，不依赖具体 Memory 类。当前默认 convenience
factory 使用 `MemoryStorageAdapter`；未来 SQLite 可以实现相同 Ports 后直接替换。

SHA-256 与 UUID 由 Web/Node composition root 提供。它们不进入 Core，也不复用
带有旧 Domain 类型依赖的 `src/infra/hash.ts` 或旧 ID generator。

`src/server/capture-use-case.ts` 保存固定 transport mapping：

- `origin = user_reported`；
- `actor = user`；
- `time.semantic = capture_time`；
- `epistemicRoles = [user_expression]`；
- `derivation = null`；
- Directive scope 不推断 topic 或 relation axis；
- 原话不修改。

Server Action 仍负责 FormData、submission envelope 和输入验证；Core
`IngestionService` 仍负责权限、指纹、去重、Evidence Unit 和 commit。

## Legacy fallback

旧链路没有删除。

- 默认：`core-memory`；
- 显式 fallback：设置 `JIANYUAN_CAPTURE_COMPOSITION=legacy`；
- Core graph 如果在任何写入开始前构造失败，也会加载旧 graph；
- Core 写入已经开始后发生错误时，不会自动改向旧 storage 重试，避免部分成功时
  产生跨 Adapter 双写或重复 Record。

Legacy container 使用动态 import，默认 Core Memory 路径不会初始化 Prisma 或旧
Application graph。

## 已迁移流程

仅迁移：

```text
Capture Form
→ submitCapture
→ executeCapture
→ packages/core IngestionService
→ packages/core storage ports
→ packages/storage/memory
```

已验证：

- 新 Record 保存；
- 相同 submission 重试去重；
- 原话保持不变；
- `user_expression` role 保持不变；
- Action 成功、拒绝和 storage failure 返回契约保持不变；
- 相同 `executeCapture` use case 可运行于旧 Memory graph 与新
  `MemoryStorageAdapter`，无需修改 use case。

## 未迁移流程

以下仍使用旧 `getServices()` 和旧 Domain/Application：

- Directive actions；
- Reflection actions；
- ReflectionPreference actions；
- Settings read path；
- Reflection detail read path；
- Relation evaluation；
- Hypothesis evaluation；
- Discovery projection/stream；
- External Reference import；
- Prisma repositories 和默认全量 graph。

本阶段没有把全量 container 改写为 packages/core，也没有移动页面或 UI。

## SQLite 接入准备情况

当前准备程度：接口和替换点已具备，持久化实现尚未具备。

已经具备：

1. `CaptureStoragePorts` 是 Core-owned ports 的窄集合；
2. `createCoreCaptureComposition(storage)` 不绑定 Memory 实现；
3. Capture use case 已从 Adapter 中分离；
4. 同一 use case 的双 Adapter contract test 已通过；
5. Ingestion 原子写入集中在 `IngestionCommitRepository`。

SQLite 接入时应：

1. 在 `packages/storage/sqlite` 实现相同五个 Capture ports；
2. 用 SQLite transaction 实现 `IngestionCommitRepository`；
3. 复用 Phase 3.2 storage contract suite 和本阶段 Capture replaceability test；
4. 增加 source fingerprint、Evidence Unit 与 lineage 唯一约束；
5. 完成 migration、崩溃恢复、并发写入和备份恢复测试后，再把默认 Adapter 从
   Memory 切到 SQLite；
6. 不直接转换或复用 PostgreSQL Prisma schema。

## 当前发现的问题

1. **读写 graph 暂时分离。** Capture 默认写入新的 process-wide Memory Adapter，
   其他 Web 读取和流程仍使用旧 container。新 Capture Record 暂时不会自动出现在
   旧 graph 的 Stream、Relation 或 Reflection 流程中。继续扩大用户流程前必须迁移
   对应读取路径，或让新旧 composition root 共享同一正式 storage adapter。
2. **Memory 不是持久化存储。** 进程重启、serverless 冷启动或多实例部署会丢失或
   分裂 Capture 数据，因此当前结果是 migration spike，不是生产存储结论。
3. **Legacy 模式仍依赖旧 Prisma 默认。** 设置 `legacy` 后，`getServices()` 在没有
   `DATABASE_URL` 时仍会按旧行为报告 storage unavailable。
4. **package resolution 仍是仓库相对路径。** 当前没有 npm workspace；Web root
   通过相对路径引用 `packages/core` 和 `packages/storage/memory`。独立构建 package
   前仍需建立 workspace resolution。
5. **只有 Capture 被迁移。** 全量 `AppServices` 还没有正式 packages/core
   composition factory；此时直接迁移其他 Action 容易造成更多 split graph。
6. **fallback 不能解决写入期故障。** 这是有意限制：自动跨 storage 重试存在双写
   风险。未来应由事务、幂等键和明确的部署切换处理，而不是 catch 后换库。

## 建议下一步

下一阶段应先迁移 Capture Record 的读取路径，使 Capture 写入和显示共享同一个
storage graph；随后再迁移 Reflection，因为它复用 Ingestion。不要在 split graph
尚未消除时接入 SQLite 或扩大到 Relation/Hypothesis。

## 验证命令

```text
npm --prefix packages/core test
npm --prefix packages/storage/memory test
npm test
npm run build
```

## 最终验证结果

- Core tests：2 个文件、3 个测试通过。
- Storage tests：3 个文件、3 个测试通过。
- Web/全量 tests：36 个文件、786 个测试通过。
- Capture Action 与 composition root 定向测试：9 个测试通过。
- Next.js production build：通过，8 个路由成功生成。
- Git commit：未执行。

# 见渊 Phase 3.4：Record Read Path Migration Report

阶段：Phase 3.4  
日期：2026-09-13  
状态：完成  
范围：Capture Record 的读写闭环

## 结论

Capture 写入与 Record 读取现在共享同一个 Core graph 和同一个
`MemoryStorageAdapter`：

```text
Capture Write
Web → Capture composition root → Core IngestionService
    → Core Storage Ports → MemoryStorageAdapter

Record Read
Web → Capture composition root → Core RecordQueryService
    → Core Storage Ports → 同一个 MemoryStorageAdapter
```

首页最近记录和 History 页面已改为调用 Core-owned `RecordQueries`，不直接访问
Repository、Prisma 或数据库实现。Capture 成功后会 revalidate `/` 和 `/history`。

没有接入 SQLite 或 AI，没有删除旧 `src`，没有修改 CSS 或页面视觉结构，也没有
执行 Git commit。

## 当前 Record 读取路径审计

### 首页最近记录

迁移前首页的“最近记录”是静态空状态，没有调用旧 container，也没有查询
Repository。它并非已存在但绑在旧 container 的查询，而是尚未实现读取。

迁移后首页通过 `getCaptureComposition().records.listRecent({ limit: 3 })`
读取同一 Memory graph。页面改为动态渲染，空状态文案和现有样式保留。

### History 页面

迁移前 History 也是静态空状态，没有真实查询。

迁移后通过同一个 `RecordQueries.listRecent` 获取最多 100 条记录，保持
`RecordRepository.listRecent` 的 `createdAt` 降序语义。页面没有直接取得
Repository。

### Reflection 输入来源

当前 `/reflection` 仍是静态空状态，没有把 Record 作为 Reflection 输入。
`/reflect/[targetRef]` 查询的是旧 container 中的 RelationClaim 和
ReflectionPreference，不是 Record。

本阶段新增 `RecordQueries.getReflectionContext(recordId)`，返回：

- 一个 `RecordReadModel`；
- 该 Record 对应的 `UserReflectionRecord` meaning history read models。

该 Query 已完成 Core 测试和 composition root 集成，但没有强行接入现有 Reflection
UI，因为当前 UI 的 target 是 RelationClaim。把它改成 Record-driven Reflection
会改变产品流程，超出本阶段范围。

### Record 读取 Server Actions

当前没有直接读取 Record 的 Server Action。Capture Action 只执行写入；Reflection
Actions 通过旧 ReflectionService 写入状态或用户原话，没有直接调用
`RecordRepository.findById/listRecent`。

## Core Query interface

新增：

- `packages/core/contracts/records.ts`；
- `packages/core/application/record-query-service.ts`。

公开 interface：

```text
RecordQueries
├── listRecent({ limit })
├── getById(id)
└── getReflectionContext(recordId)
```

UI 只接收 storage-neutral read models：

- `RecordReadModel`；
- `ReflectionMeaningReadModel`；
- `RecordReflectionContextReadModel`。

Read model 不暴露 Repository instance、Prisma row、SQL 字段或数据库 client。
`listRecent` 对无效/非正整数返回空列表，并将最大数量限制为 100。

## Composition Root 更新

`CaptureComposition` 现在同时暴露：

```text
ingestion: CaptureIngestionPort
records: RecordQueries
```

`createCoreCaptureComposition(storage)` 从同一个 storage object 构造
`IngestionService` 和 `RecordQueryService`。因此写入后 Query 立即读取同一个
Record，不再存在 Phase 3.3 的 Capture 内部读写 split graph。

默认 process-wide Core Memory graph 在开发热重载和同一进程请求之间复用，避免每次
查询重新创建空 Adapter。

## Legacy fallback

旧链路继续保留：

- `JIANYUAN_CAPTURE_COMPOSITION=legacy` 显式选择旧 graph；
- Core graph 构造失败时，在任何写入开始前 fallback；
- `legacy-record-query-adapter.ts` 把旧 Repository 实体投影为相同
  `RecordQueries` read models；
- UI 不需要知道当前是 Core Memory 还是 legacy。

写入期错误仍不会自动切换 Adapter，避免双写。

## 已验证流程

同一个 Core Memory composition 已验证：

1. `executeCapture` 创建 Record；
2. `RecordQueries.getById` 读取同一 Record；
3. `RecordQueries.listRecent` 返回该 Record；
4. `RecordQueries.getReflectionContext` 返回该 Record 和空 meaning history；
5. 相同 submission 再次执行时正确 deduplicate；
6. legacy Memory graph 与新 Memory Adapter 都能运行相同 Capture use case 和
   `RecordQueries.getById`。

## SQLite 接入准备情况

准备程度：Capture 读写所需 interface 和 composition seam 已具备，SQLite 实现尚未
开始。

SQLite Adapter 需要实现的现有 ports：

- `RecordRepository`；
- `RecordEpistemicRoleRepository`；
- `LineageRepository`；
- `DirectiveRepository`；
- `IngestionCommitRepository`；
- `UserReflectionRecordRepository`。

实现后把同一 Adapter 传给 `createCoreCaptureComposition(storage)`，不需要修改页面、
Capture use case、IngestionService 或 RecordQueryService。

在切换默认 Adapter 前仍必须验证 transaction、source fingerprint 唯一约束、
Evidence Unit/Lineage 一致性、稳定排序、migration、崩溃恢复和备份恢复。当前
PostgreSQL Prisma schema 不能直接作为 SQLite migration。

## 当前发现的问题

1. **全应用仍未共享一个 graph。** Capture 写入、首页和 History 已统一；Relation、
   Discovery、Reflection action/detail 和 Settings 仍使用旧 container。
2. **Memory 仍是进程内状态。** 重启、冷启动和多实例会丢失或分裂数据，不能作为
   生产持久化结论。
3. **Reflection UI 尚未消费 Record context。** Query interface 已存在，但当前产品
   流程以 RelationClaim 为 Reflection target，不能在本阶段擅自替换。
4. **legacy projection 有临时重复。** 旧实体到 read model 的映射与 Core Query
   mapping 各有一份；legacy 移除前需要 contract test 防止漂移。
5. **最近记录没有 cursor/pagination。** 当前 limit 上限为 100，适合 spike，不适合
   长期 History。
6. **Record 类型过滤尚未定义。** `listRecent` 返回该 storage graph 中的所有 Records。
   将来 External Reference 与 Product Event 进入同一 storage 时，需要 Core-owned
   query policy，不能让 UI 临时按 role 过滤。
7. **读取失败暂时显示原有空状态。** 这是为了不修改 UI 设计，但会把“没有数据”和
   “storage unavailable”显示成同一状态；后续需要明确的 read error contract。
8. **同时间记录缺少稳定次排序。** Memory `listRecent` 只按 `createdAt`，SQLite
   contract suite 应要求相同时间时再按稳定 ID 排序。

## 建议下一步

下一阶段应优先让 Relation/Reflection 的 composition 使用同一个
`MemoryStorageAdapter`，消除剩余全应用 split graph；然后补分页和 read error
contract。完成这些以后，再开始 SQLite Adapter。

## 验证命令

```text
npm --prefix packages/core test
npm --prefix packages/storage/memory test
npm test
npm run build
```

## 最终验证结果

- Core tests：3 个文件、6 个测试通过。
- Storage tests：3 个文件、3 个测试通过。
- 全量 tests：36 个文件、786 个测试通过。
- Capture/Query 定向测试：9 个测试通过。
- Next.js production build：通过。
- 首页和 History 已确认为 dynamic server-rendered routes。
- Git commit：未执行。

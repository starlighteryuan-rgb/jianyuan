# 见渊 Phase 3.2：Memory Storage Adapter Report

阶段：Phase 3.2  
日期：2026-09-13  
状态：完成  
范围：验证 `packages/core` 与可替换 storage adapter 的正式 seam

## 结论

`packages/storage/memory` 已实现 `packages/core/contracts` 当前声明的全部
storage ports。Core Application 通过注入的 Port 使用 Memory Adapter，不依赖
Next.js、React、Prisma、PostgreSQL、SQLite、AI SDK 或知乎。

本阶段没有修改 Web，没有修改旧 `src/domain`，没有删除旧代码，也没有接入
SQLite 或 AI。

## Adapter 结构

```text
packages/storage/memory/
├── memory-storage.ts
├── memory-record-repository.ts
├── memory-epistemic-role-repository.ts
├── memory-lineage-repository.ts
├── memory-ingestion-commit-repository.ts
├── memory-directive-repository.ts
├── memory-state-assignment-repository.ts
├── memory-discovery-repository.ts
├── memory-relation-claim-repository.ts
├── memory-hypothesis-repository.ts
├── memory-focus-context-repository.ts
├── memory-reflection-preference-repository.ts
├── memory-reflection-episode-repository.ts
├── memory-user-reflection-record-repository.ts
├── tests/
│   ├── storage-contract.ts
│   ├── memory-storage.test.ts
│   ├── storage-replaceability.test.ts
│   └── dependency-boundary.test.ts
├── index.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

`MemoryStorageAdapter` 是 composition root 可见的聚合 Adapter。它实现
`CoreStoragePorts`，内部持有细粒度 Repository Adapter。Application 模块仍只
接收自己需要的窄 Port，不需要认识整个聚合对象。

依赖方向：

```text
Core Application
        ↓
Core-owned Storage Port
        ↓
Memory Storage Adapter
```

Memory Adapter 不反向导入 Web、旧 `src` 或数据库实现。

## Port 对接情况

| Core Port | Memory Adapter | 验证 |
|---|---|---|
| `RecordRepository` | `MemoryRecordRepository` | 保存、按 ID 查询、指纹查询、Evidence Unit 查询、最近记录 |
| `RecordEpistemicRoleRepository` | `MemoryEpistemicRoleRepository` | 角色查询与追加，不改变 Evidence Unit |
| `LineageRepository` | `MemoryLineageRepository` | 直接父节点查询与保存 |
| `IngestionCommitRepository` | `MemoryIngestionCommitRepository` | Record、Role、Lineage 的快照回滚式原子提交 |
| `DirectiveRepository` | `MemoryDirectiveRepository` | 查询、活动列表、保存、撤销 |
| `StateAssignmentRepository` | `MemoryStateAssignmentRepository` | target-scoped 查询与保存 |
| `DiscoveryRepository` | `MemoryDiscoveryRepository` | ID/stable key 查询与幂等 ensure |
| `RelationClaimRepository` | `MemoryRelationClaimRepository` | 保存、ID/Record/support level 查询、完整列表 |
| `HypothesisRepository` | `MemoryHypothesisRepository` | 保存、ID/anchor 查询、完整列表 |
| `FocusContextRepository` | `MemoryFocusContextRepository` | 保存、活动列表、结束 context |
| `ReflectionPreferenceRepository` | `MemoryReflectionPreferenceRepository` | 当前偏好读取与覆盖 |
| `ReflectionEpisodeRepository` | `MemoryReflectionEpisodeRepository` | 保存 |
| `UserReflectionRecordRepository` | `MemoryUserReflectionRecordRepository` | 保存、按 Record 查询意义历史 |

## 已验证链路

### Record

测试通过 `IngestionService` 注入 storage ports，执行 Capture 后由
`IngestionCommitRepository` 写入 Record、Epistemic Role 和可选 Lineage，再通过
`RecordRepository.findById` 读回原话。

### Relation

测试使用 Core Domain 建立带完整六维 Evidence Assessment 的
`StoredRelationClaim`，通过 `RelationClaimRepository.save` 保存，再按 ID 读回。

### Reflection

测试使用 `ReflectionService.invite/respond`。自由文本先经过
`IngestionService` 成为新的 `user_expression` Record，随后通过
`UserReflectionRecordRepository` 保存意义记录，并通过 `listByRecord` 读回。
按钮状态同时通过 `StateAssignmentRepository` 保存，没有把按钮点击制造成新证据。

### Adapter 可替换性

`storage-contract.ts` 定义一个不认识具体 Adapter 的 Core use case。相同函数未经
修改，分别运行在：

1. 正式 `MemoryStorageAdapter`；
2. 测试内独立实现的 array/map storage contract double。

两个 Adapter 返回完全一致的 Record、Relation 和 Reflection 可观察结果。这证明
当前 seam 的替换不要求修改 Core use case。

## 后续 SQLite 迁移方案

SQLite Adapter 应放在 `packages/storage/sqlite`，实现同一个
`CoreStoragePorts`，不修改 Domain 或 Application：

1. 为每个 Repository Port 建立 SQLite 实现，领域类型与 SQL row 映射仅存在于
   Adapter 内部。
2. 用 SQLite transaction 实现 `IngestionCommitRepository.commit`，同一事务提交
   Record、Roles 和 Lineage，替换 Memory 的快照回滚。
3. 将当前 `storage-contract.ts` 提升为 storage adapter contract suite，让 Memory
   与 SQLite 运行完全相同的用例。
4. 为 `sourceFingerprint`、`evidenceUnitId`、stable key 和 target-scoped state 建立
   唯一索引；索引只保证确定性约束，不重新解释领域语义。
5. 单独版本化 SQLite migrations；不要复用或直接转换当前 PostgreSQL Prisma
   schema。
6. 增加崩溃恢复、事务回滚、并发写入、migration upgrade/downgrade、备份恢复和
   确定性排序测试。
7. SQLite 验证通过后，由 Desktop/Mobile composition root 注入；Web 是否迁移应
   作为独立阶段处理。

## 当前发现的问题

1. `packages/storage/memory` 与旧 `src/infra/memory` 暂时存在实现副本。旧代码必须
   保留，但在 Web 正式迁移前有双处修改造成漂移的风险。
2. `ReflectionEpisodeRepository` 当前只有 `save`，没有读取方法。因此本阶段可验证
   `ReflectionService` 完成写入且 UserReflectionRecord 可读回，但不能通过该 Port
   单独做 Episode round-trip 查询。
3. Memory Repository 返回已存对象本身，没有 defensive copy。调用者若绕过
   readonly 类型做运行时修改，可能改变内存中的已存值；SQLite 天然不会共享对象
   引用。
4. `listRecent`、`listAll`、`listActive` 在时间完全相同时没有第二排序键。SQLite
   实现必须补稳定的 ID 次排序，并确认是否回补 Memory，以避免跨 Adapter 顺序差异。
5. dedup Lineage 修复路径在 Memory commit 内部调用 `new Date()`。这使该边缘路径
   不是完全可控时钟；后续应由 Core plan 携带明确时间，或给 Adapter 注入 Clock。
6. 仓库尚未启用 npm workspace；storage package 当前通过仓库内相对路径依赖
   Core。若后续独立构建或发布，需要建立 workspace/package resolution，而不是把
  旧 `src` 加回依赖。
7. 当前 ports 尚未覆盖 Search、ChangeOp、tombstone、migration、备份恢复和加密。
   这些属于后续 storage/sync 能力，不应塞入现有 Repository 方法中。

## 验证命令

```text
npm --prefix packages/core test
npm --prefix packages/storage/memory run check
npm --prefix packages/storage/memory test
npm test
```

## 最终验证结果

- Core tests：2 个文件、3 个测试通过。
- Memory Storage 类型检查：通过。
- Storage tests：3 个文件、3 个测试通过。
- 全量 tests：35 个文件、784 个测试通过。
- Web TypeScript 检查：通过。
- 依赖检查：Memory Adapter 未导入 Next.js、React、Prisma、PostgreSQL 或旧
  `src`。
- Git commit：未执行。

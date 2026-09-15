# 见渊 Phase 4：SQLite Local-first 报告

STATUS: completed

## 结论

Phase 4 已完成并通过自审。正式 Web composition root 默认使用同一个
SQLite-backed Core graph；Memory Adapter 与旧链路仍保留。Core 与 Presentation
都不知道 SQLite 实现细节，没有双写，也没有在运行时失败后切换到第二个
Storage Adapter。

## 实现结构

```text
Web Presentation
  -> src/server/capture-composition-root.ts
  -> packages/core Application
  -> Core Storage Ports
  -> packages/storage/sqlite
  -> local SQLite file
```

- 默认数据库：`.jianyuan/jianyuan.sqlite`
- 可通过 `JIANYUAN_SQLITE_PATH` 指定文件。
- 可通过 `JIANYUAN_STORAGE=core-memory` 使用 Memory Adapter。
- 可通过 `JIANYUAN_STORAGE=legacy` 使用旧 container fallback。
- fallback 只发生在 composition graph 创建失败时；业务写入失败不会跨
  adapter 重试，避免重复写入或 split graph。

## SQLite driver 选择

使用当前 Node.js 运行时提供的 `node:sqlite` / `DatabaseSync`，没有引入 Prisma、
Next.js、React 或厂商数据库 SDK。当前验证运行时为 Node.js v24.18.0；SQLite
package 声明最低 Node.js `>=22.13.0`。

该驱动是同步 API，适合当前单用户、本地优先 MVP；高并发或 UI 主线程环境不是
本阶段目标。未来进入 Desktop / Mobile runtime 时必须重新验证运行时支持、性能和
打包行为。

## Schema 与 migration

Schema version 1 包含：

- `records`
- `record_roles`
- `lineage_edges`
- `directives`
- `state_assignments`
- `relation_claims` / `relation_record_refs`
- `hypotheses` / `hypothesis_anchor_refs`
- `discoveries`
- `focus_contexts`
- `reflection_preferences`
- `reflection_episodes`
- `user_reflection_records`
- `_jianyuan_migrations`

Migration 在事务中执行，并记录已应用版本。重复创建 adapter 会读取已有版本，
不会重复执行同一 migration；高于当前支持版本的数据库会被拒绝。

## 持久化与查询

SQLite Adapter 实现现有 `CoreStoragePorts` 的完整闭环：Record、epistemic role、
lineage、Directive、Relation、Hypothesis、Discovery、state、focus context 和
Reflection。Record Query 新增最小文本搜索 port，支持最近记录、单条记录、
Reflection context 与按原文的字面量包含搜索。

搜索会转义 SQL `LIKE` 的 `%`、`_` 和 `\`，第一版不引入全文搜索引擎。

## 事务与一致性

- Ingestion 的 Record、role 与 lineage 写入处于同一事务。
- Relation 及其 record refs 处于同一事务。
- Hypothesis 及其 anchor refs 处于同一事务。
- Restore 的清空和恢复处于同一事务。
- 外键约束开启；测试用缺失 parent 制造失败，验证 Record 与 roles 均回滚。

Reflection 当前沿用 Core 已有的逐 repository 调用边界；SQLite Adapter 对单次
repository 写入保持原子性。本阶段没有扩大 Core transaction contract。

## Export 与 Restore

`SqliteStorageAdapter.exportData()` 生成带格式名和 schema version 的逻辑 JSON
导出；Date 使用显式 tag 编码。`restoreData()` 只接受当前格式与 schema version，
在一个事务中恢复固定白名单表，不接受调用方提供任意表名。

已验证：创建完整数据 -> export -> clear -> restore -> Record、Relation、
Discovery、Reflection 全部可读取。

当前只提供 adapter API，没有新增导出/恢复 UI，也没有把备份发送到网络。

## Restart persistence

集成测试使用真实临时文件完成：

```text
Capture x2
  -> Relation
  -> Discovery
  -> Reflection
  -> close DatabaseSync
  -> recreate Core + SQLite graph
  -> Query/Search/Relation/Discovery/Reflection context
```

重启后所有断言通过。

## Encryption seam

已建立 `SqliteEncryptionController` 与可报告的 encryption status。它允许未来 runtime
在 migration 前配置数据库，但当前实现明确报告未验证设备级加密。

本阶段没有伪称完成 SQLCipher、系统密钥库或设备级 SQLite encryption。真实加密
仍需在 Desktop / Mobile runtime 中验证。

## Phase 4 自审 A-L

| 检查 | 结果 |
| --- | --- |
| A. Core 不依赖 SQLite | 通过；仅 Core storage seam 注释提到 SQLite |
| B. SQLite 只位于 Storage Adapter | 通过 |
| C. Memory Adapter tests | 通过，3 tests |
| D. SQLite Adapter tests | 通过，5 tests |
| E. Restart persistence | 通过 |
| F. Export -> clear -> restore | 通过 |
| G. 无双写 / split graph | 通过；每次请求选择一个 graph |
| H. 核心闭环共享同一 SQLite graph | 通过 |
| I. Presentation 不直接访问 SQLite | 通过 |
| J. 未引入知乎 / Hackathon 运行时依赖 | 通过 |
| K. Transaction semantics | 通过；含失败回滚测试 |
| L. Migration 可重复验证 | 通过；同一文件 reopen 测试覆盖 |

Core 中保留的 Zhihu 字样只用于说明 External Reference 的隔离规则和依赖边界测试，
不是运行时 provider 或产品入口。

## 验证结果

- Core typecheck：通过
- Core tests：通过，3 files / 6 tests
- Memory Storage typecheck：通过
- Memory Storage tests：通过，3 files / 3 tests
- SQLite Storage typecheck：通过
- SQLite Storage tests：通过，2 files / 5 tests
- 全量 tests：通过，38 files / 791 tests
- Web typecheck：通过
- Production build：通过，Next.js 15.5.25
- `git diff --check`：无 whitespace error；仅现有 Windows line-ending warning

## 尚未实现与风险

- 未实现真实设备级 SQLite encryption，只建立 seam。
- 未实现导出/恢复 UI。
- 未实现 FTS；当前是小规模字面量 `LIKE` 搜索。
- `node:sqlite` 的同步执行模型在更高并发环境需要重新评估。
- 数据库 schema 目前只有 version 1；未来每次演进必须追加 migration，不得改写已发布版本。
- 当前构造失败会回退旧 container；部署时应记录可观测但不含用户数据的故障状态，
  以免长期无声停留在 legacy。

Phase 4 没有 BLOCKING 问题，可以进入 Phase 5。

# 见渊 Mobile Phase M2 · Functional Parity Report

日期：2026-09-15
分支：`phase-9-freeze`
基线：M1 提交 `05378de`（Mobile Phase M1 iOS foundation）
范围：`apps/mobile/**`、`.github/workflows/ios-unsigned.yml`

## 结论

Mobile M2 的“功能完整、视觉朴素”目标已经落地：Record、Awareness、AI Observation、用户回应、User Reflection、Core Gate、Relation / Evidence、Understanding、Exploration、AI Provider、API Key、Directive、Settings、持久化、Export / Restore、Degraded Mode 都有真实代码路径。

需要如实说明的边界：本机是 Windows，无法生成和编译 iOS 原生工程。M2 代码、SQLite、Provider 契约、Core Gate 和页面级测试已在本地真实运行；真正的 `iphoneos Release` 编译、unsigned IPA 打包与结构审计必须在 GitHub Actions 的 `macos-latest` runner 上执行。

## 状态汇总

```text
MOBILE IMPORT: PASS
SQLITE: PASS
RESTART PERSISTENCE: PASS
NAVIGATION: PASS
THEME: PASS
SECRETSTORE SKELETON: PASS
IOS PREBUILD: FAIL（本机 Windows 无法生成原生工程）
UNSIGNED IPA WORKFLOW: PASS（定义层；真实执行待 GitHub Actions）
ROOT REGRESSION: PASS
```

M2 追加：

```text
AWARENESS: PASS
AI OBSERVATION TRANSIENT: PASS
USER REFLECTION: PASS
CORE GATE: PASS
RELATION / EVIDENCE: PASS
UNDERSTANDING: PASS
EXPLORATION: PASS
AI PROVIDER: PASS
DIRECTIVE: PASS
EXPORT / RESTORE: PASS
DEGRADED MODE: PASS
```

## FUNCTIONAL PARITY MATRIX

| 能力 | Desktop 现状 | Mobile M2 | 说明 |
|------|--------------|-----------|------|
| Record 创建 / 时间线 / 搜索 | 有 | MOBILE COMPLETE | Mobile 保留 M1 闭环，新增运行时读模型 |
| Awareness 显式觉察 | 有 | MOBILE COMPLETE | 只有用户点击“开始一次觉察”才调用 Provider |
| AI Observation 临时候选 | 有 | MOBILE COMPLETE | 只存在内存，15 分钟 TTL，不写 Relation |
| 用户快捷回应 | 有 | MOBILE COMPLETE | 快捷选择不进入 Core；`not_my_experience` 直接丢弃 |
| User Reflection 自由文字 | 有 | MOBILE COMPLETE | 接入现有 `ReflectionFlowService` |
| Core Gate / Relation / Evidence | 有 | MOBILE COMPLETE | 直接调用现有 Core，不在 Mobile 重写规则 |
| Understanding | 有 | MOBILE COMPLETE | 读取持久化 Reflection，用户原话为主体 |
| Exploration | 有 | MOBILE COMPLETE | 只读通过 Core Gate 的 Persistent Relation |
| Directive / 使用规则 | 有 | MOBILE COMPLETE | 创建 / 撤销 / 生效读取，复用现有 Core |
| AI Provider 配置 | 有 | MOBILE COMPLETE | 复用 `OpenAICompatibleProvider` |
| API Key | Desktop keychain | MOBILE COMPLETE | `expo-secure-store`，不进入 SQLite |
| Export / Restore | 有 | MOBILE COMPLETE | 复用逻辑备份格式，iOS 文件系统 + 分享 |
| Diagnostics | 有 | MOBILE COMPLETE | DB 位置、schema、SecureStore、AI、版本 |
| External Reference | 有 | DESKTOP ONLY / 暂不移植 | M2 明确范围外，未在 Mobile 引入外部数据适配器 |
| Windows sidecar / Credential Manager | Desktop 专属 | DESKTOP ONLY | 不应移植 |
| Cloud Sync / Push / Widget / RAG | 无 | M2 明确不做 | 与当前阶段边界一致 |

## Record

保留 M1 能力：

- 输入原话 → `MobileRuntime.capture` → `IngestionService` → Core → Mobile SQLite。
- Record 写入真实 SQLite 文件；完全关闭再打开后仍存在。
- 保存 Record 不调用 AI Provider，Provider 方法被替换为会抛错的 tripwire 后仍能保存。
- 时间线读取真实存储，不把内存数组当作数据源。
- 原文保持不变，包括模态词。

## Awareness

页面打开只读取 Record；不调用 AI。

用户点击“开始一次觉察”后：

1. 读取当前 Record 与近期可用 Record。
2. 解析 Directive 权限。
3. 调用共享 `OpenAICompatibleProvider`。
4. 返回临时 AI Observation。
5. 展示可能联系、相关记录、一种可能解释、不确定性、可继续思考的问题。

AI Observation 在用户写出自由文字之前不产生 Relation / Evidence。

## AI Observation

- 临时候选只存在 `RelationCandidateRegistry` 内存中，带 15 分钟 TTL。
- App 重启后未确认观察消失。
- Provider 响应会经过现有边界检查；身份 / 诊断 / 心理推断类文案被拒绝。
- 测试覆盖候选临时性、拒绝路径、过期路径与畸形响应。

## User Reflection

- 快捷选择只是立场表达，不创建 Record、Relation 或 Evidence。
- `not_my_experience` 丢弃临时观察并写入空结果。
- 自由文字通过现有 `ReflectionFlowService.respondToRelation` 持久化。
- 用户自己的原话来自持久化 Record，不复制到 Mobile-only 表。

## Core Gate / Relation / Evidence

- Mobile 不重新实现 Gate。
- 自由文字提交后调用现有 `RelationService.evaluate` 和 `ReflectionFlowService`。
- Relation 是否成立、Evidence 维度与支持级别全部由 Core 判断。
- 测试验证：AI 候选阶段 Relation / Evidence 为 0；自由文字后才可能形成持久化结构。

## Understanding

- 读取已经持久化的 User Reflection。
- 页面主体是用户自己的原话。
- 来源 Record、联系方向、当时问题作为辅助上下文。
- App 重启后 Understanding 数据仍可读取。

## Exploration

- 只展示 `kind: 'relation'` 且已通过 Core Gate 的 Persistent Relation。
- 页面打开不调用 AI Provider。
- 可追溯 Relation → Evidence → User Reflection → Source Record。
- 不把 Exploration 做成新的 AI inference session。

## Directives

- Settings 支持创建“允许 AI 回看 / 不允许 AI 回看”规则。
- 支持撤销。
- 生效读取复用现有 `DirectiveService`，撤销后立即生效。
- 一次 Reflection feedback 不会自动变成永久 Directive。

## AI Provider

- Mobile Composition Root 使用共享 `OpenAICompatibleProvider`。
- 复用现有请求格式、响应解析、错误语义、超时 / abort 行为。
- Screen Component 不直接 fetch Provider API。
- 支持 Provider、Base URL、API Key、Model、连接验证、模型发现。

## SecretStore

- API Key 只通过 `expo-secure-store` 写入 iOS Keychain。
- API Key 不进入 `jianyuan.sqlite`。
- SecretStore 失败降级为 `unavailable`，App 不崩溃。
- 测试直接读取 SQLite 文件字节，确认测试 key 不在数据库或 WAL 中。

## SQLite

- Mobile 使用自己的异步 adapter，不复用 Desktop `node:sqlite` 实现。
- Schema 语义与 Desktop 一致：14 张表、列、约束、索引、`STRICT` 类型、schema version。
- `mobile-schema-parity.test.ts` 比较两边真实 schema，防止漂移。
- Record、Reflection、Relation、Evidence、Directive、Discovery、Focus、Hypothesis 均通过同一 Core storage seam 持久化。

## Migrations

- Mobile 自己维护 migration ledger 与版本化迁移。
- migration 以原子事务执行，失败会回滚。
- 当前 schema version 为 1。
- M2 未新增破坏性迁移。
- 后续 schema 变更应新增 migration，不得 drop database 重建。

## Export / Restore

- 复用 Desktop 的逻辑备份格式：`jianyuan.sqlite.logical-export` v1。
- 导出包含所有 Core 表的逻辑行，不绑定 Windows 路径。
- 恢复前完整校验格式与表结构，整个恢复在一个事务中执行。
- 备份文件通过 iOS 文件系统写入，再交给系统分享面板。
- 恢复通过系统文档选择器读取文件。
- 页面只调用 runtime 与 backup adapter，不接触 SQL。

## Settings

M2 Settings 覆盖：

- AI 服务
- Base URL
- API Key
- Model
- 连接验证 / 模型发现
- Directive / 使用规则
- Appearance
- Export / Restore
- Mobile runtime diagnostics
- App version

Desktop-only 诊断（Windows AppData、Node sidecar、Windows Credential Manager）没有搬到 Mobile。

## Degraded Mode

- AI 网络失败：Record 仍可保存。
- API Key 不存在：App 正常启动。
- API Key 无效：只有 AI feature 失败。
- AI 响应畸形：不产生 Relation / Evidence。
- SecureStore 不可用：local-first 功能仍可使用。
- SQLite 打开失败：App 显示可恢复的 fatal state，不静默丢数据。

## Tests

Mobile：

- 9 个测试文件 / 75 个测试通过。
- 类型检查通过。

覆盖：

- Record create / reload。
- Awareness 打开不调用 AI。
- 显式动作调用 AI。
- Observation transient before reflection。
- reject path discards。
- quick choice 不创建持久化结构。
- free text 使用现有 flow。
- no user text → no Relation / Evidence。
- eligible reflection → existing Core logic。
- Understanding 读取持久化 Reflection。
- Exploration 读取持久化 Relation 且打开不调用 Provider。
- SecretStore set / get / delete 与失败降级。
- Provider success / auth failure / malformed response。
- SQLite schema parity。
- Export / Restore roundtrip。
- Navigation isolation。

根仓库：

- 47 个测试文件 / 856 个测试通过。
- 根类型检查通过。

## iOS Native Build

本机为 Windows。实测：

```text
npx expo prebuild --platform ios --no-install
```

Expo 明确提示必须在 macOS 或 Linux 上生成 iOS 原生工程。因此本机没有声称生成 `ios/`、workspace、scheme、entitlements 或真实 IPA。

真实原生值由 `.github/workflows/ios-unsigned.yml` 在 `macos-latest` 上记录并审计。

## UNSIGNED IPA WORKFLOW

- 触发方式：`workflow_dispatch`
- runner：`macos-latest`
- 不使用 EAS。
- 不使用 Apple certificate、provisioning profile 或 Team。
- 不使用任何 secret。
- 构建：`iphoneos Release`
- 签名开关：`CODE_SIGNING_ALLOWED=NO`、`CODE_SIGNING_REQUIRED=NO`、`CODE_SIGN_IDENTITY=""`、`EXPANDED_CODE_SIGN_IDENTITY=""`
- 产物：`Jianyuan-iOS-unsigned.ipa`、`Jianyuan-iOS-unsigned.app.zip`、`SHA256SUMS.txt`

CI 门禁：

- `embedded.mobileprovision` 不存在。
- 主 App 无 `_CodeSignature`。
- 无有效 Apple 签名身份。
- 嵌套 framework / appex / dylib 已审计。
- 无残留 `CodeResources`。
- 只有 `UNSIGNED IPA CHECK: PASS` 才上传 artifact。

## REAL DEVICE ACCEPTANCE PLAN

M2 完成后，在重新签名并安装到真实 iPhone 上执行：

1. 创建 Record A。
2. 创建 Record B。
3. 打开 Awareness。
4. 点击“开始一次觉察”。
5. 确认收到 AI Observation。
6. 写自己的 Reflection 自由文字。
7. 提交后确认 Understanding 出现这条 Reflection。
8. 确认 Exploration 出现符合条件的 Relation。
9. 完全杀掉 App。
10. 重新打开，确认 Record / Reflection / Relation 仍存在。
11. 在设置中导出备份，确认系统文件流程可用。
12. 从备份恢复，确认数据恢复且 App 不崩溃。

设备级验收必须以真实 iPhone 结果为最终依据；本地测试只能证明代码链路和 SQLite 语义。

## ANDROID READINESS

- M2 仍以 iOS 为先。
- 新增业务逻辑放在共享 runtime / Core，不依赖 iOS-only API。
- 文件系统、Keychain、分享面板等平台差异隔离在 adapter 中。
- Android 后续主要是原生构建与平台适配验证，不需要重写产品逻辑。

## KNOWN LIMITATIONS

1. 未签名 IPA 不能直接安装到普通 iPhone；真机安装需要重新签名。
2. 本报告没有声称在真实 iPhone 上完成过 M2 全流程验收。
3. `expo prebuild --platform ios` 和真实 `xcodebuild` 尚未在本机执行，需 GitHub Actions runner。
4. unsigned / re-signed 环境下 Keychain 行为存在不确定性，已按降级状态处理。
5. External Reference 属于 Desktop 当前能力，M2 未移植。
6. M2 视觉仍是功能优先，不是最终移动端设计。

## 验证结果

| 检查 | 结果 |
|------|------|
| Mobile tests | 9 files / 75 tests PASS |
| Mobile typecheck | PASS |
| Root tests | 47 files / 856 tests PASS |
| Root typecheck | PASS |
| iOS prebuild config | PASS（resolved config） |
| iOS 原生工程生成 | 未在本机执行（Windows 不支持） |
| 未签名 IPA 真实构建 | 待 GitHub Actions 手动触发 |
| Secret scan（Mobile） | PASS |
| YAML 校验 | PASS |

## 下一步

1. 提交并推送 M2 变更。
2. 在 GitHub Actions 手动触发 `iOS Unsigned Build`。
3. 下载并审计 `Jianyuan-iOS-unsigned.ipa` 与 `SHA256SUMS.txt`。
4. 重新签名后执行 REAL DEVICE ACCEPTANCE PLAN。
5. 把 macOS runner 的真实 workspace、scheme、bundle identifier、entitlements 和 SHA256 回填到本报告。

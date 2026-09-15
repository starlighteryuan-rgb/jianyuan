# 见渊 Phase 6.1 Settings Report

日期：2026-09-14  
阶段：AI-native Product Surface / Settings  
状态：完成

## 1. 结论

正式 Settings 页面已经接入现有 Core、SQLite Storage、AI Provider 与 Model Discovery 能力。此次工作只增加产品层入口和装配，不修改 Domain、Core interface、Storage contract、SQLite schema 或 AI Provider contract。

当前交互路径：

    Settings Presentation
    ├─ AI Provider form
    │  └─ Server Action
    │     └─ stable AISettingsRuntime facade
    │        └─ existing AwarenessAIProvider / SemanticJudgmentPort
    │           └─ DisabledAIProvider | OpenAICompatibleProvider
    ├─ AI Permission form
    │  └─ Server Action
    │     └─ Core DirectiveService / ReflectionService
    │        └─ active Core Storage graph
    └─ Local Data form
       └─ Server Action / Export Route
          └─ existing SqliteStorageAdapter exportData / restoreData

## 2. 修改文件

### 产品界面

- src/app/settings/page.tsx：正式 Settings workbench，包含 Provider、权限与本地数据。
- src/app/globals.css：追加 Settings 样式，复用 tokens.css。
- .hallmark/preflight.json、.hallmark/log.json：记录现有设计系统和 Workbench 结构。

### Product Server Actions / Routes

- src/app/actions/ai-settings.ts：Provider 配置、Refresh Models、Connection Test、Model Selection。
- src/app/actions/data-settings.ts：Restore 文件、20 MB 上限和明确确认校验。
- src/app/api/settings/export/route.ts：输出不可缓存的 SQLite 逻辑 JSON 备份。
- src/app/actions/directives.ts：接收用户明确填写的 DirectiveScope.kind/value，不推断“相似”。
- src/app/actions/preferences.ts：将 Reflection Invitation 映射到 ReflectionPreference.interventionLevel。

### Product Runtime / Composition

- src/server/ai-settings-runtime.ts：稳定对象身份的产品层 facade，只委托现有 DisabledAIProvider 或 OpenAICompatibleProvider，Snapshot 不含 API Key。
- src/server/capture-composition-root.ts：默认 AI runtime 改为共享 facade，使 Settings 与正式 Core graph 使用同一个 Provider / Semantic Judgment 引用。
- src/server/data-settings.ts：将 SQLite adapter 的已有运行状态、exportData 和 restoreData 投影给产品层。

### 测试

- tests/ai-settings-runtime.test.ts
- tests/ai-settings-action.test.ts
- tests/data-settings.test.ts
- tests/preferences-action.test.ts
- tests/directive-action.test.ts

## 3. 使用的已有接口

### AI

- AwarenessAIProvider：listModels、getManualModelId、suggestRelations、createReflectionPrompt
- SemanticJudgmentPort
- DisabledAIProvider
- OpenAICompatibleProvider
- ModelDiscovery
- ProviderModel

Settings 不调用 AI SDK，也没有复制 Provider 的 HTTP、鉴权、错误归一化或模型列表解析逻辑。

### Core Permission

- DirectiveService.create / listActive / revoke
- DirectiveScope
- ReflectionService.preference / updatePreference

### Storage

- SqliteStorageAdapter.databasePath
- SqliteStorageAdapter.schemaVersion
- SqliteStorageAdapter.encryptionStatus
- SqliteStorageAdapter.exportData()
- SqliteStorageAdapter.restoreData()

以上均为 SQLite adapter 已有公开能力；CoreStoragePorts 没有变化。

## 4. 新增 UI

### AI Provider

- AI 启用开关
- Provider ID、Base URL、API Key
- Provider 状态与 Connection Test
- Model Discovery 状态与 Refresh Models
- 发现模型下拉选择
- 手工 Model ID fallback

Provider 状态包括 disabled、needs_configuration、ready、connected、error。

### AI Permission

- Active Directives 列表与撤销入口
- 四个独立权限维度
- 明确的数据范围类型和值
- “未来同范围资料”显式开关
- Reflection Invitation 当前偏好开关

### Local Data

- Storage mode、SQLite schema version、数据库路径
- 应用层 Encryption controller 与 Device-level verification 状态
- JSON Export
- 有确认步骤的 Restore

## 5. 设置如何映射到 Core

| Settings 表面 | 既有 Core 状态 | 映射 |
|---|---|---|
| Relation Suggestion | Directive.allowAnalysis | 开关作为独立权限写入 Directive |
| AI 可访问的数据范围 | Directive.scope | 用户明确选择 topic_tag、source、relation_axis 或 user_selected 并填写值 |
| 未来同范围资料 | Directive.appliesToFutureSimilar | 只有存在明确 scope 时 Core 才接受 |
| Reflection Invitation | ReflectionPreference.interventionLevel | 允许 = standard；不允许 = minimal |
| 保存与呈现 | Directive 的其他三个布尔字段 | 与 allowAnalysis 相互独立 |

Provider 仍要求明确的 selectedRecordIds，并校验传入上下文必须与选择集合完全一致。Settings 没有增加绕过 Core 权限或 Provider privacy boundary 的通道。

## 6. 数据安全与恢复行为

- API Key 不进入页面 Snapshot、SQLite 或日志。
- 页面填写的 Provider 配置只保存在当前服务进程中。
- 页面重新导航时共享 runtime 保持配置；服务重启后重新读取环境变量。
- Export 响应设置 Cache-Control: no-store。
- Restore 只接受用户选定的 JSON 文件，要求明确确认，并限制为 20 MB。
- 备份格式与 schema version 继续由 SQLite adapter 校验。
- Restore 由现有 adapter 在事务中清空并重建；解析、版本或写入失败时回滚。

## 7. 验证结果

### Typecheck

    npm run typecheck
    PASS

### Tests

    npm test
    Test Files  44 passed (44)
    Tests       807 passed (807)
    PASS

新增验证覆盖：Disabled AI 不发起连接、Snapshot 不泄露 API Key、Model Discovery、稳定 facade 切换、表单到既有接口的映射、Directive 显式 scope、Reflection Invitation Preference 映射、SQLite 状态 / Export / Restore，以及 composition 不可用时的降级展示。

### Build

    npm run build
    Compiled successfully
    /settings              Dynamic
    /api/settings/export   Dynamic
    PASS

### UI / Responsive

已做本地实际渲染检查。320、375、414、768 CSS px 四个目标宽度均未出现横向溢出；桌面布局为左侧运行状态索引、右侧设置工作区，窄屏自动合并为单列。

## 8. 未完成事项

1. **Provider 配置持久化**  
   当前只在进程内生效。持久化 API Key 需要另行确定本机 secret store / keystore；本阶段不能修改 SQLite schema，也不应把明文 Key 放入业务数据库。

2. **Restore 预览与差异检查**  
   现有 adapter 只提供完整逻辑备份的事务式 Restore，没有 dry-run / diff contract。本阶段只提供明确警告与确认。

3. **设备级加密确认**  
   页面诚实展示 deviceLevelVerified；没有把“已配置 controller”误报为“设备级加密已验证”。

4. **AI 自动流程产品入口**  
   本阶段只建立 Provider 和权限表面，没有新增 Relation / Reflection 自动触发行为，也没有修改 Core 流程。

## 9. 边界确认

- 未修改 packages/core。
- 未修改 packages/storage。
- 未修改 packages/providers。
- 未修改旧 src/domain。
- 未修改 SQLite schema。
- 未直接调用 AI SDK。
- 未新增 Desktop/Mobile、云同步或新架构层。
- 未删除旧代码。
- 未执行 Git commit。

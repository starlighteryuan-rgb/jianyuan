# 见渊 Phase 9.6：Product Flow Validation Report

STATUS: completed

## Flow 1 · 记录

进入记录空间后可以创建记录并在时间线看到原话。保存动作只经过既有 Capture/Application/Core 路径，不自动启动 AI，也不会被觉察内容打断。

## Flow 2 · 觉察

用户从已有记录主动开始一次觉察，观察卡展示相关记录、可能解释、不确定性和回看问题。快捷选择不触发长期保存；没有自由文字时不会进入 Core Gate。选择“这不是我的体验”会丢弃临时观察；只有用户自由文字进入现有 ReflectionFlow 后，才可能形成长期联系与证据。

## Flow 3 · 理解

理解空间读取已经保存的用户理解并按时间呈现，详情页以用户原话为主体，同时保留来源记录和回看上下文。AI 文案不会替代用户表达。

## Flow 4 · 探索

探索空间只展示已经形成的长期联系、来源记录和对应用户理解，不在页面打开时调用 Provider 生成新结论。

## Flow 5 · 设置与降级

设置独立承载 AI 服务、凭据、模型列表、使用规则、本地数据和导出/恢复。AI 未配置、超时、认证失败或服务不可用时，记录、时间线、搜索、理解历史、已有探索和导出/恢复仍通过各自既有路径可用；觉察显示暂时不可用或空状态。

## 验证结果

- 根项目全量测试：47 个文件、856 个测试通过。
- Core：6 个测试通过，类型检查通过。
- SQLite Storage：5 个测试通过，类型检查通过。
- AI Provider：15 个测试通过，类型检查通过。
- Desktop：4 个测试通过，类型检查通过。
- 根项目 typecheck：通过。
- Web production build：通过。
- Desktop renderer/runtime build：通过，包含现有 bundled Node runtime preparation。
- 已有 Tauri Windows release executable 位于 `apps/desktop/src-tauri/target/release/jianyuan-desktop.exe`；本次托管环境没有 `cargo/rustc`，无法重新执行 native build，Tauri CLI 诊断已记录该环境限制。
- `git diff --check`：通过（仅保留既有 LF/CRLF 转换提示）。

## 自审

产品闭环保持“记录 → 觉察 → 理解 → 探索”，AI 只属于觉察层。未修改 Core 语义、SQLite schema、Provider contract 或 Relation/Evidence 生成规则。

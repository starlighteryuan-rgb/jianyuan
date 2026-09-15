# 见渊 Phase 9.5：Product Language & Accessibility Report

STATUS: completed

## 语言审计

主要 Web 与 Desktop 用户可见文案已统一到产品语言：记录、觉察、理解、探索、AI 服务、长期联系、我的理解、使用规则、导出与恢复。普通用户路径不再显示 Candidate、Hypothesis、Relation suggestion、Evidence Unit、Core Gate、AI Provider、Directive 等内部术语；保留的 `AppData`、SQLite 和数据库路径只出现在设置中的运行诊断区域。

关键措辞遵循：AI 观察到的一种可能联系、相关记录、一种可能解释、AI 也不确定、一个可以继续思考的问题、你的理解。否定路径明确说明不会形成长期联系。

## 可访问性检查

- 主导航使用真实链接或按钮，并提供 `aria-label` / `aria-pressed` 状态。
- 记录、觉察、理解、设置表单控件具有关联 label；按钮显式声明 `type`。
- AI 回看结果仅将状态消息标记为 `role=status`，不把包含交互控件的整张观察卡误标为状态区域。
- 空状态、加载状态、失败状态均有可读文本；窄屏使用底部导航并保持记录 → 觉察 → 理解 → 探索的阅读顺序。
- 用户原话在理解详情与探索 provenance 中保持可读、可回看，不由 AI 文案替代。

## 自审

本阶段只调整 Presentation 文案、状态呈现和可访问性标记。没有改变 Core 语义、Storage/Provider contract、SQLite schema、关系生成规则或运行架构。代码中的类型名、导入名和历史注释仍可保留为内部工程语言，不会出现在普通用户页面。

## 已知限制

尚未引入大型 UI framework 或自动化屏幕阅读器矩阵；后续可在真实 Windows Tauri 会话补充键盘与高对比度人工检查。

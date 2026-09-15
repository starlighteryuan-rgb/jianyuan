# 见渊 Phase 9.4：Reflection / Exploration Separation Report

STATUS: completed

## 理解空间

`/understanding` 通过现有 `DiscoveryStream` 与 `ReflectionFlowService.getRelationTarget` 读取已经持久化的用户理解，按时间展示用户原话、来源记录、回看问题和详情入口。详情页将“我的理解”放在 AI 回看背景之前，用户文字是主内容。

## 探索空间

`/exploration` 只读取已经通过既有 Core Gate 的长期联系，并展示联系问题、相关记录、来源与对应用户理解。页面不调用 Provider，不在打开时生成新的观察或用户画像。

## 边界

- AI Observation 仍是一次性的背景，不被当作用户属性。
- User Reflection 与 Persistent Relation 分开呈现；探索中的联系必须能回到来源记录和用户理解。
- 继续接受当前 target-bound Reflection 的物理存储设计，没有修改 Core 或 SQLite schema。

## 自审与验证

理解页的视觉阅读顺序为用户原话优先，探索页保留 provenance。无长期联系时显示空状态，不制造结论。根项目和 Desktop 的测试、typecheck、production/renderer build 已在连续迁移中通过。

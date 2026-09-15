# 见渊 Phase 9.3：Observation Experience Report

STATUS: completed

## 目标

把 AI 回看从记录保存流程移到觉察空间。记录保存只确认用户原话已经写入；AI 观察必须由用户进入觉察后主动发起。

## 已完成

- `/records` 和 `/capture` 的保存表单不再请求 AI，也不会在保存后弹出观察。
- `/awareness` 提供记录选择与“开始一次觉察”按钮，只有显式操作才调用既有回看 Application action。
- 观察卡固定展示 AI 注意到、相关记录、可能解释、不确定性和回看问题。
- 观察继续使用现有临时候选通道；没有用户自由文字时不会进入 Core Gate，也不会形成长期联系或证据。
- 用户选择“这不是我的体验”时只结束并丢弃临时观察；自由文字才提交到现有 ReflectionFlow。
- Provider 不可用或上下文不足时，觉察显示可理解的降级/空状态，记录仍然可用。

## 自审

记录层、观察层和用户理解层在 UI 中分开。快捷选择被明确说明不是批准，AI 观察没有被写入长期数据。未修改 Core、SQLite schema、Provider contract 或 target-bound Reflection 存储。

## 验证

- 现有 AI awareness、relation-candidate、SQLite flow 测试覆盖临时观察、无文字、否定观察和自由文字路径。
- Web 与 Desktop typecheck/build 在本阶段验证通过。

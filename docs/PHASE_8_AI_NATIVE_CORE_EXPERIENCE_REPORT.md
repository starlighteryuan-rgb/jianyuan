# 见渊 Phase 8：AI-native Core Experience

日期：2026-09-14  
状态：完成本阶段范围内的最小 AI 核心体验闭环（未提交 Git）。

## 1. AI Core Flow

当前链路为：

```text
Capture Record
  → 用户显式点击“看看有没有值得回看的线索”
  → Context Selection（Core Query + Directive）
  → AwarenessAIProvider.suggestRelations
  → 瞬时 Relation Candidate read model
  → 用户决策
  → worth_reviewing 时调用 RelationService / Core gates
  → Discovery
  → AI reflection invitation（问题）
  → 用户自由文本
  → ReflectionFlowService / User Reflection Record
```

`src/server/ai-core-experience.ts` 是 Web Composition Root 使用的应用编排入口；Desktop 继续通过自己的 Composition Root 和 `DesktopRuntime` 访问同一 Core、Storage 与 Provider Ports。Presentation 没有直接访问 SQLite 或 OpenAI HTTP。

## 2. Context Selection

- 当前 Record 必须存在并优先进入上下文。
- 历史上下文通过 `RecordQueryService` 获取，最多 5 条 Record。
- 每条发送给 Provider 的原话最多 2,000 字符，总上下文最多 8,000 字符。
- 只发送有 `user_expression` 角色且有可显示原话的 Record。
- Directive 在发送前按 Record 重新解析；被 `user_selected` 或其他适用范围禁止分析的历史 Record 会被排除。当前 Record 被禁止时整个请求拒绝。
- Provider authorization 的 `selectedRecordIds` 与实际发送的 Record IDs 严格相等。

## 3. Candidate semantics

Provider 输出经过既有结构化 JSON schema 校验。候选必须引用至少两条已选 Record；未知 ID、空引用、缺失比较轴或其他 malformed output 会被拒绝。

Candidate 只包含：Record 引用、可能的比较问题/维度、关系类型和谨慎的回看说明。它不是 Evidence、Relation fact、用户身份或用户结论；Candidate registry 仅保存在进程内，带 15 分钟 TTL 和 50 条上限。

## 4. User confirmation boundary

确认前不调用 `RelationService`，不写 `RelationClaim`、Evidence 或 Discovery。用户可选择：

- 值得回看：交给现有 Core gates 评估；
- 不确定：丢弃瞬时候选；
- 暂时不适用：丢弃瞬时候选；
- 稍后再看：丢弃瞬时候选。

旧客户端仍可提交 `ignore`，它仍只表示放弃候选，不会写长期关系数据。值得回看之后的持久化完全由 Core/Application 语义完成。

## 5. Reflection flow

Core 通过后才生成 Discovery。AI invitation 只返回一个问题，并明确不是用户 Reflection 或结论；展示 invitation 不会创建 Record。用户自由文本继续经过 `ReflectionFlowService`，原文作为 User Reflection Record 保存。AI disabled 或 invitation 失败时，用户仍可直接写自己的 Reflection。

## 6. Permission / Directive

分析权限在请求前解析，Provider 也会再次校验 authorization。未知 scope 的分析拒绝保持保守；禁止历史 Record 不会被“换成别的记录”或通过 UI 绕过。Directive 仍由 Core 的可撤销、按读取时解析规则负责。

## 7. Error handling

AI disabled、配置不完整、401、429、超时、404、5xx 和 malformed response 都降级为安全状态，不回显上游响应体，不影响已经保存的 Record。候选请求使用按 Record 的 in-flight guard 合并并发重复调用；没有后台扫描、队列或 scheduler。

每次实际 Insight Provider 调用记录最小内存审计 metadata：timestamp、provider、model、input Record IDs、outcome 和可选 error type。审计不保存 API key、secret、prompt 或用户全文；当前没有为它新增 SQLite schema，进程退出后不保留该 metadata。

## 8. Desktop minimal UI

Desktop 保留现有单页 Spike UI，仅补齐：保存 Record 后的显式“看看有没有值得回看的线索”入口、候选四种决策、确认后 invitation 和“写下你的理解”输入。AI 状态仍显示 `unconfigured / connected / unavailable`；AI 不可用时 Capture、History、Search、Export、Restore 与既有 Reflection 不受阻塞。

## 9. Tests

已补充并验证：

- 当前 Record 进入 AI flow；
- 上下文数量/字符上限；
- 特定 Directive 禁止的历史 Record 不进入请求；
- 并发请求 guard；
- Fake Provider 的候选→Core gates→Discovery→invitation→user Reflection 与 SQLite restart persistence；
- malformed / unknown ID / timeout / 401 / 429 / 500 的 Provider 错误边界；
- AI disabled 时基础 Capture 与 Reflection 仍可用；
- Web Action 接受“不确定/暂时不适用/稍后”瞬时决策；
- Desktop runtime tests 覆盖 Provider discovery/cache 与 Core graph persistence。

本次验证命令：根目录 `npm test`（46 files / 820 tests passed）、根目录 `npm run typecheck`、`npm run build`、Desktop `npm test`（3 tests passed）、Desktop `npm run typecheck`、Desktop `npm run build`、Core package tests/check（6 tests）、AI Provider package tests/check（15 tests）、SQLite adapter tests/check（5 tests）、Memory adapter tests/check（3 tests）；另执行 `git diff --check`。结果均以最终命令输出为准，未执行 Git commit。Tauri 原生 `cargo check`/`tauri build` 也已尝试，但当前托管 shell 的 Cargo shim 是 0 字节占位文件；直接使用已安装 toolchain 的 Cargo 时，crates.io TLS 返回 `SEC_E_NO_CREDENTIALS`，无法在本次环境完成新的 native build。

## 10. 未完成事项

1. 没有真实商业 Provider API Key，因此本阶段的完整链路使用 Fake Provider；不能据此声称真实网络模型调用成功。
2. AI 审计目前是进程内 bounded log，不是持久化审计表；新增 schema 不在本阶段范围内。
3. Desktop sidecar 仍是随应用发布的 Node runtime；没有重写为 Rust，也没有扩大 packaging 范围。
4. SQLite 设备级加密仍未完成；AppData 路径不等于加密。
5. Candidate registry 是瞬时状态，刷新/重启后候选会过期；已经确认的 Relation、Discovery 和 Reflection 仍持久化。
6. 本次代码改动未能重新产出 Tauri native executable，原因是托管执行环境的 Cargo/网络凭据阻塞；已有 Phase 7 Windows native executable 不受此次 TypeScript/Renderer 改动影响，但需在具备有效 Cargo 与 crates.io 凭据的 Windows 用户环境重新执行 native build。

## 11. 下一步最值得做的一件事

在用户配置自己的 Provider 后，用同一套手动触发链路做一次真实网络 smoke，并核对真实模型返回仍通过结构化 schema、未知 ID 拒绝、Directive 边界和 Core gates；不要先扩大为 Chat、后台扫描或新的领域模型。

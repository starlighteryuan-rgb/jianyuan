# 见渊 Phase 8.2：First Real AI Experience Validation

日期：2026-09-14  
状态：完成第一次 AI Awareness 体验验证；未提交 Git。

## 1. 验证边界

本阶段复用 Phase 8 / 8.1 的 Core、Storage、AI Provider 和 Composition Root，没有新增领域模型、Agent、RAG、Vector DB 或新的运行时架构。

由于当前环境没有用户的真实商业 API Key，本次没有声称真实模型网络调用成功。AI 请求使用既有 Fake Provider / HTTP fixture 验证，真实 Provider smoke 仍需用户在 Desktop 中配置自己的凭据。

## 2. 配置流程体验

Desktop 配置入口覆盖：

1. Base URL；
2. API Key（通过现有系统 SecretStore bridge，页面不回显值）；
3. Model ID（可手工输入）；
4. Fetch Models / Model Discovery；
5. 选择已发现模型；
6. Connection Test。

Connection Test 只调用既有 Provider 的 `/models` discovery，不发送 Record、Reflection 或完整 Prompt。状态继续区分 `not_configured`、`connected`、`authentication_failed`、`endpoint_invalid`、`model_unavailable`、`timeout`、`rate_limited` 与 `provider_error`。

## 3. 体验链路

通过 fixture 验证了完整路径：

```text
Record
  → 用户显式请求 AI 回看
  → 选择有限上下文
  → AI Provider
  → Relation Candidate
  → 用户选择“值得回看”
  → Core gates / Discovery
  → 可选 Reflection invitation
  → 用户自己的 Reflection
```

Candidate 在用户确认前仍是瞬时、可放弃的可能性，不是 Relation、Evidence、事实或用户结论。`uncertain`、`not_applicable`、`later` 都不会写入长期关系数据。

## 4. 发现的问题与最小调整

### Candidate 展示

发现 Desktop 候选原先只显示 AI 问题和说明，没有同时显示候选引用的 Record 原话，用户难以判断 AI 正在比较什么。

已做最小修正：在候选下方显示对应 Record 原话；若来源暂时不可读，显示安全的不可读提示，不暴露内部 ID。说明文案改为“AI 提出的可能性，不是事实或 Evidence”。Web 候选标签也改为“AI 提出的可能联系”。

### 空 Candidate

Provider 返回 `{"suggestions":[]}` 时保持合法成功结果，不创建 Candidate、Relation 或 Evidence。Desktop 空结果提示改为“这次没有发现适合回看的联系。Record 已保存”，明确说明空结果不是错误，且 Record 不受影响。

同时增加了应用编排测试，确认并发请求在返回空 Candidate 时仍只发起一次 Provider 请求，并返回 `no_candidate`。

### 诊断式语言

Prompt 继续明确禁止诊断、人格/身份判断、隐藏动机和替用户下结论。Provider 结构化输出校验会拒绝明显的诊断或身份式候选/邀请；相关拒绝测试继续通过。

### Reflection invitation

确认 Relation 后的邀请仍只返回问题，不写入 Reflection。Desktop 标签改为“一个可选的回看问题”，并补充“这是问题，不是结论。只有你写下的内容才会成为 Reflection”，让邀请与用户自己的 Reflection 边界更自然。

## 5. 验证结果

- 根目录全量测试：46 files / 822 tests passed；
- Core：6 tests passed；
- SQLite adapter：5 tests passed；
- Memory adapter：3 tests passed；
- AI Provider：15 tests passed；
- Desktop：3 tests passed；
- Root/Desktop typecheck passed；
- Root Web build passed；
- Desktop renderer/runtime build passed；
- `git diff --check` passed（仅显示既有 CRLF 转换提示，无 whitespace error）。

未执行 Git commit。

## 6. 未解决问题

1. 尚未使用用户真实 API Key 完成真实商业 Provider 网络 smoke，因此模型实际质量、延迟和配额行为仍需真实 Desktop 会话验证。
2. Candidate registry 仍是进程内瞬时状态；刷新或重启后未确认的候选会过期，这是当前设计边界。
3. SQLite 仍为明文，数据库级加密尚未完成；AppData 位置不等于加密。
4. 当前 Tauri 原生 Cargo build 仍受托管环境 Cargo/TLS 凭据限制；本次只验证了 TypeScript/Desktop renderer 与 runtime 构建，没有绕过该限制。

下一步建议：用户在真实 Desktop 中配置自己的 Provider，执行一次 Connection Test，再用两条不含敏感内容的 Record 完成“候选 → 值得回看 → invitation → 自己的 Reflection” smoke；若模型返回空 Candidate，应将其视为正常结果。

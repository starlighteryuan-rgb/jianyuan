# 见渊 Phase 8.1：Real AI Activation

日期：2026-09-14  
状态：完成 Provider 激活层的最小补齐；未提交 Git。

## 1. Provider wiring

Desktop 继续使用既有 Composition Root：

```text
Tauri renderer
  → local Desktop runtime HTTP
  → DesktopRuntime
  → DesktopAIService
  → AwarenessAIProvider / SemanticJudgmentPort
  → OpenAICompatibleProvider
```

Record、Context Selection、Core gates、Discovery 和 Reflection 没有复制领域模型。UI 没有直接访问 SQLite 或 OpenAI HTTP。

## 2. Secret handling

Desktop renderer 只把用户输入交给 Tauri command；Windows 下 API Key 由现有 Windows Credential Manager bridge 保存和读取，启动 sidecar 时仅注入进程内内存。非 secret 的 `providerId`、`baseUrl` 和 `model` 才写入 Desktop 配置文件。

没有把 API Key 写入 SQLite、localStorage、源码或日志。本阶段不把 Web 端的进程内设置 facade 宣称为操作系统凭据存储；真实 OS SecretStore 结论仅适用于 Desktop Tauri runtime。

## 3. Model discovery

继续复用 `OpenAICompatibleProvider.listModels`：

- Base URL + SecretStore API Key → `/models`；
- `refresh=true` 强制刷新；
- 非 refresh 使用既有 cache；
- provider/base URL/API Key 身份变化会清空 cache；
- 端点不支持 `/models` 时保留 manual Model ID fallback；
- Model selection 仍只写入非 secret 配置。

## 4. Connection test

Connection Test 只执行 model discovery 请求，不发送用户 Record、Reflection、完整 prompt 或其它个人数据。

在不修改 Provider contract 的前提下，新增产品层 `AIConnectionStatus` 映射：

| Provider 结果 | 产品状态 |
| --- | --- |
| 成功且选中模型可用 | `connected` |
| 401 / 403 | `authentication_failed` |
| Base URL / 404 / 405 / 501 / 配置无效 | `endpoint_invalid` |
| 已发现列表但选中 Model ID 不存在，或未选择模型 | `model_unavailable` |
| 超时 | `timeout` |
| 429 | `rate_limited` |
| 其它 Provider / malformed response | `provider_error` |
| 未启用或尚未配置 | `not_configured` |

旧的 runtime `status` 字段保持兼容；新增 `connectionStatus` 供 Desktop/Web 设置面板显示。

## 5. Prompt V1

Relation Candidate 继续使用既有结构化 Prompt：只要求描述选定 Record 之间的 tentative relation，明确禁止诊断、人格/身份判断、隐藏动机和替用户下结论；允许合法返回 `{"suggestions":[]}`。

Reflection Prompt 只要求一个问题，不生成用户答案。Provider 侧对身份/诊断式候选与 invitation 文本做保守拒绝。

## 6. Structured output

Provider 继续校验 JSON 结构、非空字段、Record ID 白名单和至少两条不同引用；新增拒绝重复 Record refs，以及明显的诊断/身份类措辞。Malformed output 不进入 Core，也不写 SQLite。

## 7. Candidate semantics

AI Candidate 仍不是 Relation、Evidence、用户身份或用户结论。用户确认前没有 Relation/Evidence 写入；确认后由现有 `RelationService` 和 Core gates 决定是否产生 Discovery。真实 AI 只负责候选与问题，不自动完成 Reflection。

## 8. Error handling

Timeout、401、429、500、malformed response 均返回安全 Provider error；已保存 Record 不回滚、不丢失，SQLite 不因 AI 失败产生候选事实。AI 不可用时 Capture、History、Search、Export、Restore 与已有 Reflection 继续可用。

## 9. Real API 是否实际调用

本阶段没有可用的真实商业 API Key，因此没有声称真实模型网络调用成功。配置入口、SecretStore 读取、`/models` discovery、manual model fallback、Connection Test 状态映射和完整 AI orchestration 均由 Fake Provider/HTTP fixture 验证。真实 API smoke 需要用户在 Desktop 中配置自己的 Provider 后执行。

## 10. Tests

已验证：

- 根目录全量 tests：46 files / 822 tests passed；
- Core package：6 tests passed，typecheck passed；
- Storage adapters：SQLite 5、Memory 3 tests passed，typecheck passed；
- AI Provider：15 tests passed，typecheck passed；
- Desktop：3 tests passed，typecheck passed；
- Connection Test 不发送用户数据；
- 认证失败与模型不可用状态可区分；
- Model Discovery refresh/cache/manual fallback；
- malformed、unknown/duplicate Record ID、禁止性输出、timeout、401、429、500；
- Fake Provider 完整链路：Capture → Candidate → Core gates → Discovery → Reflection invitation → User Reflection。

根目录 `npm run build`、Desktop `npm run build` 和 `git diff --check` 均通过。Tauri 原生 Cargo build 在当前托管环境仍受 Cargo shim / crates.io TLS 凭据限制，未绕过该环境问题。

## 11. 未完成事项

1. 尚未使用用户真实 API Key 完成真实 Provider 网络 smoke；不能据 Fake Provider 结果推断真实模型质量或可用性。
2. Desktop sidecar 仍依赖随应用发布的 Node runtime；本阶段不重构 packaging。
3. SQLite 仍为明文，数据库级加密尚未完成；AppData 位置不等于加密。
4. AI Insight metadata 仍是进程内 bounded audit，不是持久化审计表。
5. Web 设置 facade 仍是进程内 API Key；Desktop 的 Windows Credential Manager 才是本阶段实际验证的系统级 SecretStore。

下一步只需由用户在真实 Desktop 会话配置 Provider，执行一次少量真实 smoke（连接测试、明显联系、无关记录），并保留候选/空候选与错误状态证据；不扩展到 Chat、RAG、后台扫描或新领域模型。

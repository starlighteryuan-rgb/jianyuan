# 见渊 Phase 8.3：Human-Centered AI Reflection Layer

日期：2026-09-14  
状态：完成体验语义重构；未提交 Git。

## 1. 本阶段结论

AI 在展示层被重新定位为“AI 观察到的一种可能联系”，而不是替用户定义意义的分析者。现有 Core、SQLite schema、AI Provider contract 和稳定的数据流均保持不变。

用户体验链路现在是：

```text
Record
  → AI Observation（进程内临时）
  → 用户理解
  → 现有 Core gates
  → Relation / Evidence / Discovery
```

Observation 可以展示或丢弃；在用户写下自己的理解之前，不会调用 Core，也不会创建 Relation、Evidence 或长期意义数据。

## 2. Observation 展示

Web Capture 与 Desktop 观察卡统一提供五个部分：

1. **AI 注意到**：只呈现 Provider 对 Record 结构的描述；既有 Provider 校验继续拒绝明显的诊断、人格、身份和隐藏动机式输出。
2. **相关记录**：展示 AI 实际参考的 Record 原话，并明确说明这些记录不是已经形成的事实关系。
3. **一种可能解释**：使用“ 一种可能是……但也可能存在其他解释 ”的非确定性表述。
4. **AI 也不确定**：明确说明无法判断是长期模式还是偶然相似。
5. **一个可以继续思考的问题**：把原有比较问题作为邀请，而不是结论。

Provider contract 没有新增字段；Presentation / orchestration 从既有 `evidenceSummary` 与 `comparisonAxis` 映射出上述安全展示结构。

## 3. User Reflection 语义

新增“你的理解”区域，快捷选择为：

- 这和我的经历有联系；
- 有一点关联，但我的理解不同；
- 这不是我的体验。

这些选项表达是否愿意继续理解观察，不表示“AI 正确”。

- 前两项没有自由文本时只返回 `reflection_required`，不触发 Core。
- “这不是我的体验”丢弃瞬时 Observation，不保存 Relation、Evidence 或 Reflection。
- 只有自由文本才进入现有 Core Gate 与 `ReflectionFlowService`，并保存用户原话。

当前 Reflection API 是 target-bound。因而语义上先要求用户写下理解，再进入 Core；物理持久化仍由现有流程在 Relation target 建立后写入 ReflectionRecord。本阶段没有为改变这一既有 Storage 顺序而修改 Core 或 schema。

## 4. 空状态与降级

没有明显联系时显示：

> 暂时没有发现明显联系。  
> 这并不代表没有模式，只是当前记录不足以支持进一步观察。

AI 失败仍只影响观察区域；Capture、History、Search、Export、Restore 和既有 Reflection 不受阻塞。

## 5. 实施范围

- `src/server/ai-core-experience.ts`：增加 Presentation Observation read model 与用户理解 orchestration；保留旧 transport 类型以兼容现有调用。
- `src/app/actions/relation-candidates.ts`：新增用户理解 Server Action；旧候选 action 不再能在没有文字理解时越过反思边界。
- `src/app/capture/relation-candidate-review.tsx`、`src/app/capture/capture-form.tsx`：改为 Observation 展示与用户理解交互。
- `apps/desktop/runtime/desktop-runtime.ts`、`apps/desktop/runtime/server.ts`、`apps/desktop/src/App.tsx`：Desktop 复用同一语义门槛，禁止 `/relations/admit` 无 Reflection 直通 Core。
- Web/Desktop CSS：提高用户输入区域的视觉权重，降低临时 AI 观察的权威感。

没有修改 Core/domain 语义、SQLite schema、Provider contract，也没有引入 Agent、RAG、Vector DB 或新的领域模型。

## 6. 测试结果

- 根目录全量：46 files / 825 tests passed；
- Core package：6 tests passed，package check passed；
- AI Provider：15 tests passed；
- SQLite adapter：5 tests passed；
- Memory adapter：3 tests passed；
- Desktop：3 tests passed；
- 根目录 typecheck passed；
- Desktop typecheck passed；
- Web production build passed；
- Desktop renderer/runtime build passed；
- `git diff --check` passed（仅有既有 CRLF 转换提示，无 whitespace error）。

新增覆盖包括：Observation 不创建 Relation、空文本不触发 Core、快捷选择不持久化、“这不是我的体验”丢弃 Observation、自由文本进入现有 ReflectionFlow，以及 Observation 五段展示结构。

Tauri 原生 `tauri build` 在当前托管环境仍因 `cargo` 不可用而无法重新产出 Windows native executable；这不影响本阶段 TypeScript/Desktop runtime 验证，已有 Phase 7 native executable 状态保持不变。

## 7. 未解决问题

1. 没有真实商业 API Key，因此真实模型网络质量、延迟和内容质量仍需用户 Desktop 会话验证；本阶段测试使用既有 Fake Provider / fixture，不能据此声称真实网络调用成功。
2. Observation registry 仍是进程内瞬时状态，刷新或重启后未提交的观察会过期。
3. SQLite 当前仍为明文，数据库级加密尚未完成；AppData 路径不等于加密。
4. 既有 target-bound Reflection API 导致 Relation 物理写入早于 ReflectionRecord；本阶段通过 orchestration 保证“无用户文字不进 Core”，没有扩展 Storage 设计。

未执行 Git commit。

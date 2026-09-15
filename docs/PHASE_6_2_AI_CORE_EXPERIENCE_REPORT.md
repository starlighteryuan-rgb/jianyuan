# 见渊 Phase 6.2：AI-native Core Experience 报告

日期：2026-09-14
阶段：AI-native Product Experience（Capture → Relation Suggestion → Discovery → Reflection Invitation）
状态：完成（本次为续接收尾）

## 1. 结论

第一条用户可见的 AI 产品链路已在真实浏览器中端到端跑通，四条核心约束（A/B/C/D）全部成立，测试矩阵全绿。

需要先纠正一处 checkpoint 偏差：交接说明称“TypeScript 类型检查已通过”，但仓库真实状态是**类型检查失败**。失败点只有一个文件，是上一个会话被额度截断留下的半成品编辑：`src/app/reflect/[targetRef]/page.tsx` 里存在重复的 import 块和重复的 `let aiInvitation` 声明，共 6 个错误（TS2300 ×4、TS2451 ×2）。本次工作从修复这个真实断点开始，而不是重新设计。

本次会话在 Phase 6.2 范围内做了两类事：

1. 修复被截断的编辑，恢复可编译状态。
2. 修复一个浏览器验证中实测出来的产品缺陷：AI 请求被串在 `submitCapture` 内部，导致 Provider 慢或不可达时，表单在整个往返期间被锁死并显示“正在保存……”，而 Record 其实早已落库。这违反“AI failure 不能阻塞基础记录能力”。

其余已完成并通过验证的部分未重做。

## 2. 本次会话修改的文件

| 文件 | 改动 |
| --- | --- |
| `src/app/reflect/[targetRef]/page.tsx` | 删除重复 import 块与重复 `let aiInvitation` 声明，保留一份带降级兜底的 invitation 调用 |
| `src/app/actions/capture.ts` | `submitCapture` 在持久化确认后即返回；新增独立 action `loadRelationCandidates(recordId)`；`CaptureActionState.success` 不再携带 `aiRelation` |
| `src/app/capture/capture-form.tsx` | AI 区块改为自有 `aiLoading` / `aiRelation` 状态；加入单调递增 request token，防止旧请求覆盖最新 Record 的区块 |
| `src/app/globals.css` | 追加 `.ai-candidate-loading` 与脉冲 keyframes，并在 `prefers-reduced-motion` 下关闭动画 |
| `tests/capture-action.test.ts` | 3 处断言同步到新契约；新增“保存不等待 AI”守卫与 `loadRelationCandidates` 的 3 个用例 |

Phase 6.2 既有文件（`src/server/ai-core-experience.ts`、`src/app/capture/relation-candidate-review.tsx`、`src/app/actions/relation-candidates.ts` 等）本次未改动，除上表外没有其他文件被触碰。

## 3. 最终完成的用户链路

```text
A. Capture
   → IngestionService（校验/权限/身份/去重）
   → SQLite Record 已确认保存，表单立即解锁
   → loadRelationCandidates（独立 action）
      → Directive 权限解析 → AwarenessAIProvider.suggestRelations
      → RelationCandidateRegistry（瞬时、TTL 15 分钟、上限 50 条）
      → Candidate UI（值得回看 / 暂时不确定 / 忽略）
   → 用户点“值得回看”
      → RelationService.evaluate（Core gates：comparability / abstraction ceiling / evidence dimensions）
      → DiscoveryService.listStream
      → Discovery + 跳转链接

B. Discovery (/reflect/[targetRef])
   → createAIReflectionInvitation（仅生成问题）
   → 用户三个独立表单：位置按钮 / 暂时离开 / 自由文本
   → submitProse → ReflectionFlowService → Reflection Record（verbatim 原样保存）

C. AI disabled / 5xx
   → Capture、SQLite 写入、用户 Reflection 全部正常，仅 AI 区块降级

D. Directive 禁止 Relation Suggestion
   → AI 请求数为 0，Record 照常保存
```

## 4. AI 参与位置

AI 只出现在两个位置，且都在 Core gates 之外提出、之内裁决：

1. `suggestRelationsAfterCapture`：Capture 成功落库后，把用户明确选择范围内的记录交给 Provider，产出 Relation Candidate。该函数不调用 `RelationService`，不能写 RelationClaim、Evidence 或 Discovery。
2. `createAIReflectionInvitation`：为已存在的 Discovery 生成一个回看问题。只产出 question，不产出 Reflection Record。

此外，用户确认 Candidate 后由 Core 通过 `SemanticJudgmentPort`（同一 Provider 实例）执行 comparability / abstraction ceiling / evidence dimensions 判定——这一步属于既有 Core gates，不是 Phase 6.2 新增。

AI 输出始终只是 Suggestion / Invitation：不等于 Evidence，不等于用户身份，不等于用户结论。

## 5. 用户控制点

- Capture 文本由用户输入，表单不推断 topic / relation axis。
- Candidate 三个决策按钮：值得回看、暂时不确定、忽略；后两者不写任何长期数据。
- Settings 的 Directive：`allowAnalysis` / `allowStorage` / 被动呈现 / 主动呈现四项独立，可配显式 scope 与是否适用于未来同范围资料。
- Settings 的 Reflection Invitation 偏好（映射到 `interventionLevel`）。
- Reflection 页三个分离表单：位置按钮（立场）、暂时离开（不表态）、自由文本（唯一能形成 Record 的入口）。

## 6. Failure / degraded mode

| 情形 | 表现 |
| --- | --- |
| AI disabled | “AI 当前未启用。Record 已保存，你仍可继续记录。” |
| Provider 5xx / 不可达 | “Provider 暂时不可用。Record 已保存。”（不回显上游响应体） |
| 配置不完整 | “AI 配置还不完整。Record 已保存，可在 Settings 中检查。” |
| 超时 / 限流 / 401 / 404 | 各自对应的安全文案，均声明 Record 已保存 |
| Directive 不允许分析 | “Record 已保存。当前 Directive 不允许 Relation Suggestion。” |
| 上下文不足两条 | “Record 已保存。至少有两条可用记录后，AI 才会提出联系候选。” |
| 瞬时候选过期 | “这个瞬时候选已过期。它没有写入你的数据。” |
| 等待 AI 返回 | “Record 已保存。正在查看可能值得回看的联系……”（`role="status"`，表单不锁） |

所有路径都满足：AI 问题只降级 AI 区块，不让已保存的 Record 看起来像保存失败。

## 7. 浏览器验证结果

工具：Codex 内置浏览器（含 Playwright locator API + viewport 能力）。
被测服务：`next dev` (localhost:3100)，Storage 为 SQLite。
AI 后端：本地 OpenAI 兼容替身（`127.0.0.1:8791`，脚本放在 `%TEMP%`，不进仓库），会记录每一次到达的 AI 请求。**未创建 `.env`**，AI 是通过 Settings UI 在进程内启用的。

链路 A：
- 首条记录：显示上下文不足文案，未发出 suggest 请求。
- 第二条记录：Candidate 真实渲染（dimension、question、当前记录 + 相关记录、explanation、三个按钮）。
- 确认前 SQLite：`relation_claims=0`、`discoveries=0`、`state_assignments=0`。
- 点“值得回看”后：`relation_claims=1`、`discoveries=1`；替身日志依次出现 `suggest_relations → comparability → abstraction_ceiling → evidence_dimensions`，证明 Core gates 确实执行。
- 全程 `user_reflection_records=0`，Presentation 没有自行制造 Reflection。

链路 B：
- Invitation 正确显示问题与“不是你的 Reflection，也不是结论”声明；显示后 `user_reflection_records=0`、`reflection_episodes=0`。
- 点位置按钮（uncertain）：`reflection_episodes=1`，但 `user_reflection_records=0`，Record 数不变 → 点击是立场，不是表达。
- 提交自由文本：`user_reflection_records=1`，Record 数 +1，verbatim 原样保存（按 `length()` 逐字核对为 32 字），episode 为 `elicitationMode=prompted`。

链路 C：
- AI disabled（新进程、环境变量默认）：连续两条记录均保存，应用发出的 AI 请求 0 次。
- Provider 5xx：Record 已保存、`fieldset.disabled=false`、降级文案正确、上游响应体未泄露；Reflection 页降级为“你仍可直接写自己的 Reflection”，用户表达照常保存。
- 新增回归（本次修复的核心）：把替身延迟调到 6 秒，AI 仍在途时——保存确认立即可见、`fieldset.disabled=false`、AI 区块显示独立的进行中提示；第一条 AI 请求未返回时第二条记录已成功提交；候选区块始终绑定最新保存的 Record（token 生效）。

链路 D：
- 先记录一个必须澄清的语义点：第一次尝试用**全局** Directive（`scope: null`）且未勾选“适用于未来”，AI 仍发出 1 次请求。这是**正确行为**，不是缺陷：按 §26 与 `appliesTemporally`，未勾选时 Directive 只约束它创建之前已存在的资料；而 `appliesToFutureSimilar=true` 必须带显式 scope（域规则拒绝“全局 + 未来”，因为那等于让系统猜“相似”）。Settings 里该选项的标签正是“全局（仅当前已有资料）”。
- 正确配置（`source: capture_ui` + 适用于未来）后：Record 照常保存，界面显示“当前 Directive 不允许 Relation Suggestion”，替身日志 **0 字节 = 0 次 AI 请求**。
- 同一 Directive 下：Reflection Invitation 显示“当前 Directive 无法安全解析这次上下文，因此没有发送记录”，用户 Reflection 仍能保存，日志仍为 0 字节。

交互与稳定性：
- “暂时不确定”“忽略”均正常，文案明确声明未写入长期数据。
- 刷新后 `/history` 完整列出所有持久化记录，`/reflection` 列出该 Discovery。
- 控制台无 error / warn。

响应式（320 / 375 / 414 / 768）：
- 覆盖 home、capture、history、reflection、reflect、references、settings，共 24 组：`scrollWidth - clientWidth = 0`，越界元素 0。
- 修复后的代码重测 capture 页：loading 态与候选态均 0 溢出；决策按钮高度 41px 且都在视口内（320/375/414 竖排满宽，768 横排 87/101/59px）。
- 截图确认 320px 下候选卡片与 AI loading 态排版干净、无重叠、无横向滚动条。

## 8. 完整测试结果

| 套件 | 结果 |
| --- | --- |
| 根 `vitest run`（Core / Storage / AI / Web / Integration） | 46 files，**815 tests passed**（修复前为 812） |
| `packages/core` | 3 files / 6 tests passed |
| `packages/providers/ai` | 2 files / 14 tests passed |
| `packages/storage/memory` | 3 files / 3 tests passed |
| `packages/storage/sqlite` | 2 files / 5 tests passed |
| `packages/core-spike` | 1 file / 2 tests passed |
| 根 `tsc --noEmit` | exit 0 |
| 各包 `tsc -p tsconfig.json --noEmit`（core / providers-ai / providers-deterministic / storage-memory / storage-sqlite） | 全部 exit 0 |
| `next build` | 成功，9 条路由，无类型/lint 错误 |
| `next start` 冒烟（:3101） | `/`、`/capture`、`/reflection`、`/settings`、`/history`、`/references`、`/reflect/[targetRef]` 全部 200 |
| `git diff --check` | 干净（仅仓库既有的 CRLF 提示） |

以上数字均为本次实测输出，可复现；不涉及外部权威来源，无需另行核实。

## 9. 环境清理

- dev server、production server、AI 替身全部停止，端口 3100 / 3101 / 8791 已释放。
- 第二阶段验证改用 `%TEMP%\jianyuan-p62-verify\db\verify.sqlite`，测试数据没有落进项目库。
- 第一阶段写入 `.jianyuan/jianyuan.sqlite` 的验证数据，已用事先建立的命名备份恢复到接手时的空库状态（全表计数为 0，已核对）。备份保留：`.jianyuan/jianyuan.sqlite.p62-backup`、`.jianyuan/jianyuan.sqlite-wal.p62-backup`（该目录在 `.gitignore` 内）。
- 未创建 `.env`；未执行 `git commit` / `push`。
- 工作区中其他 `D`（删除）与 `M`（修改）项为接手前既有改动，未被触碰或回退。

## 10. 仍存在的明确限制

1. 浏览器验证使用本地 OpenAI 兼容替身，不是真实商业 Provider。真实网络与 Provider 的验证在 Phase 5 报告中已单独完成；本次不覆盖真实输出质量、真实延迟分布与真实错误比例。
2. `/reflect/[targetRef]` 刷新后不回显此前已提交的 Reflection 文本（输入框为空）。已核对这是既有行为：HEAD 版本同样没有回显逻辑，`getReflectionContext` / `meaningHistory` 在 `src/app` 下未被使用。数据确实已保存并可在 `/history` 看到。属 Phase 6.2 范围外，未改动。
3. Reflection 保存没有显式成功提示，反馈是输入框清空 + 路径刷新（`submitProse` 返回 void）。既有行为，未改动。
4. AI Provider 配置只存在于进程内，重启后回到环境变量默认（Settings 页面已如实标注）。因此每个新进程默认 AI disabled，需重新在 Settings 配置。
5. Candidate 存放在进程内 `RelationCandidateRegistry`（TTL 15 分钟、上限 50 条）。刷新或重启后再点决策会得到“瞬时候选已过期”。这是设计意图——Candidate 从不持久化——但对用户而言意味着决策需要在同一会话内完成。
6. AI 区块的瞬时结果同理：导航离开后候选展示消失，但已确认的 Discovery 会持久保留并出现在 `/` 与 `/reflection`。
7. `packages/providers/ai/vitest.config.ts` 缺少 `root` 设置（`packages/core` 的有）。因此从仓库根用 `--config` 指向它会误收根目录 `tests/`，表现为大量 `@/server/...` 解析失败。从包目录内运行（即包自身 `npm test` 的 cwd）则全绿。既有配置问题，本阶段未扩张修改。

## 11. 范围声明

本次未开始：Tauri、Desktop packaging、Mobile、React Native / Expo、云同步、账号系统、OAuth、新 Provider、Agent、Chat UI、大规模 UI 重设计、Core 架构重构、SQLite schema 重构。未执行 git commit。Phase 6.2 到此收尾，不进入下一 Phase。

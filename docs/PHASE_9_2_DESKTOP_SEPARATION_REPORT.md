# 见渊 Phase 9.2：Semantic Page Separation Report

STATUS: completed

## 1. 目标与边界

本阶段将主要页面按单一认知任务分层。改动只发生在 Web/Desktop Presentation 与既有 Application read path；没有修改 Core/domain、SQLite schema、Provider contract 或 Relation/Evidence 生成规则。

## 2. 记录空间

- `/records` 现在同时提供新建记录与 Record 时间线。
- 首页保留轻量的记录入口和最近记录，并只提供进入觉察的次级链接。
- CaptureForm 只提交用户原话；保存后留在记录空间。
- 记录空间不显示 AI 观察、长期联系、画像、AI 配置或运行诊断。
- 旧 `/capture`、`/history` 路由继续保留，作为兼容入口。

## 3. 觉察空间

- `/awareness` 提供主动回看入口。
- 用户先选择一条已有记录，再显式请求 AI Observation。
- Observation 展示由现有 `RelationCandidateReview` 提供：AI 注意到、相关记录、可能解释、不确定性、回看问题和“你的理解”。
- Observation 仍是临时对象；没有用户自由文字时不会进入 Core Gate。
- AI 未配置、权限不足、上下文不足或 Provider 失败时，显示可理解的降级状态，记录不受影响。

## 4. 理解空间

- `/understanding` 通过现有 `ReflectionFlowService.getRelationTarget` 读取用户已经写下的理解。
- 用户原话、时间、来源 Record 和对应回看上下文作为主体内容。
- 没有可集中展示的理解时，提供从觉察开始的空状态入口。
- 没有新增 Reflection 模型，也没有改变 target-bound 的存储方式。

## 5. 探索空间

- `/exploration` 读取现有 Discovery stream，只呈现已形成的 relation 项。
- 每条联系同时显示来源记录和可读取的用户理解，作为 provenance。
- 页面不调用 Provider，不生成临时 AI 结论，也不生成用户画像。
- 没有联系时显示“还没有可回看的长期联系”的空状态。

## 6. 设置空间

Desktop 的本地状态、SQLite 状态、AI 服务配置、Model Discovery、SecretStore 状态和 Export/Restore 均归入设置视图。它们不再与记录表单和观察内容在同一主内容区域纵向堆叠。

## 7. Desktop 自审

Desktop 主内容通过导航状态分层显示：

```text
记录：Capture + 历史/搜索
觉察：主动回看 + 临时 Observation
理解：用户理解入口与历史提示
探索：持久联系及来源
设置：运行状态 + AI 服务 + 导出/恢复
```

同一时刻只显示一个空间的内容；侧边导航和窄屏底部导航继续使用 Phase 9.1 的结构。

## 8. 验证（阶段自审）

- 根项目 typecheck：通过。
- Desktop typecheck：通过。
- 根项目测试：47 个测试文件、856 个测试通过。
- Desktop 测试：2 个测试文件、4 个测试通过。
- Web production build：通过，新增记录/觉察/理解/探索入口均可编译。
- Desktop renderer/runtime build：通过。
- `git diff --check`：通过；仅有既有 LF/CRLF 转换提示。

## 9. 兼容项（后续阶段已完成主流程收口）

- 旧 `/reflection` 仍可作为觉察兼容入口。
- 具体联系的 `/reflect/[targetRef]` 继续承载 target-bound 回看详情；全局理解索引已在 `/understanding` 接入现有 read path，Phase 9.4 已补齐用户理解优先的详情顺序，Phase 9.5 已完成可见文案审计。
- 本阶段没有引入新的路由框架或 UI framework。

## 结论

记录、觉察、理解、探索和设置已经在主内容层面分离。记录保存不会启动 AI；AI 观察只在觉察空间主动触发；持久联系和用户理解分别进入探索与理解空间，且所有调用仍经过既有 Application/Core 边界。

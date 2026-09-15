# 见渊 Phase 9：Personal Awareness Information Architecture Design

状态：设计完成，待下一阶段实施

本阶段只完成产品信息架构设计。没有修改 Core、Storage、Provider、SQLite schema、路由、组件、样式或测试。

## 1. 当前 UI 问题分析

当前 Web 入口和 Desktop 入口都能访问已经完成的能力，但信息层级仍以“一个页面承载所有事情”为主：

- Web 首页同时承载开始记录、最近记录、历史、AI 入口和反思入口。
- Capture 页面虽然以记录为主，但保存后的 AI 观察仍紧接着嵌在 Capture 流程中，记录事实与解释容易被看成同一个步骤。
- History 主要是记录列表；Reflection 页面当前同时承担发现/关系列表与反思入口，用户不容易区分“我写下的理解”和“系统保存的联系”。
- Settings 在 Web 上是独立路由，但 Desktop 仍把本地状态、记录、搜索、AI 配置、观察、导出/恢复纵向堆叠在同一页面。
- 当前页面和历史文案中仍可见 Capture、History、Reflection、AI Provider 等技术或英文标签；Candidate、Relation、Evidence、Hypothesis、Core Gate 等内部概念不应成为用户导航或主要文案。

由此产生四个体验问题：

1. AI 太接近第一主入口，容易被理解为“先问 AI”。
2. Record、AI Observation、User Reflection、Relation/Evidence 的事实层、观察层、理解层和长期层没有明确视觉分区。
3. AI 输出容易被当成待批准的结论，而不是可丢弃的临时观察。
4. 设置和诊断信息会打断日常的记录与回看流程。

本设计保留现有 Core boundary：UI 只能通过已有 Application/orchestration 调用能力，不能直接写 SQLite，也不能直接调用 AI HTTP API。

## 2. 正式产品信息架构

产品主线是：

```text
记录 Record
  → 觉察 Awareness
  → 理解 Reflection
  → 探索 Exploration
```

正式导航树：

```text
见渊
├─ 记录
│  ├─ 新建记录
│  ├─ 我的时间线
│  ├─ 记录详情 / 编辑
│  └─ 搜索记录
├─ 觉察（回看）
│  ├─ 待回看的可能联系
│  ├─ AI 观察详情
│  ├─ 相关记录
│  └─ 暂无明显联系 / 已放下的观察
├─ 理解
│  ├─ 我的理解
│  ├─ 反思时间线
│  └─ 理解详情
├─ 探索
│  ├─ 已形成的长期联系
│  ├─ 时间变化
│  └─ 联系详情
└─ 设置
   ├─ AI 服务
   ├─ 数据与隐私
   ├─ 指令与权限
   ├─ 导出 / 恢复
   └─ 同步（当前为配置入口）
```

五个层级的回答分别是：

| 层级 | 用户要回答的问题 | 内容边界 |
| --- | --- | --- |
| 记录 | 我经历了什么？ | 用户原话、时间、编辑和时间线 |
| 觉察 | 过去记录中有什么值得重新观察？ | 临时 AI 观察、相关记录、不确定性、回看邀请 |
| 理解 | 我如何理解这些经历？ | 用户自己的 Reflection、补充说明和反思历史 |
| 探索 | 长期来看有哪些值得关注的联系？ | 已通过 Core Gate 的 Relation/Evidence、来源和时间变化 |
| 设置 | 我如何控制服务、数据和隐私？ | Provider、SecretStore、Directive、导出/恢复与同步配置 |

视觉和语义优先级固定为：

```text
用户理解 > AI 观察 > 原始 AI 输出
```

## 3. 页面结构与职责

| 页面 | 页面目标 | 用户进入原因 | 用户可以完成什么 | 不应出现什么 | Core / Application 对应 |
| --- | --- | --- | --- | --- | --- |
| 开始 / 今日 | 让用户立刻留下第一条记录 | 打开应用、准备记录 | 创建记录、查看最近记录、进入记录时间线 | AI 分析、画像、关系数量、结论卡片 | Capture/Application 入口；只读最近 Record |
| 记录 | 管理事实层 | 查看或补充自己的经历 | 新建、编辑、搜索、按时间回看记录 | AI 判断、模式解释、人格标签 | Capture、RecordQuery、Record storage |
| 记录详情 | 查看一条事实 | 从时间线打开某条记录 | 阅读、编辑、查看时间和来源 | 把 AI 解释混进原文 | Record 查询与更新 |
| 觉察 / 回看 | 帮助用户重新观察已有记录 | 主动寻找值得回看的内容 | 选择上下文、查看 AI 观察、查看相关记录、不确定性、打开理解表单、丢弃观察 | “发现你的本质”、评分、确定性诊断、自动 Relation/Evidence | AI observation orchestration、现有 Provider、临时 Candidate/Observation registry |
| 观察详情 | 呈现一次临时观察 | 从觉察列表打开 | 阅读“AI 注意到”、相关记录、可能解释、AI 不确定什么和回看问题 | Candidate、Hypothesis、Relation suggestion 等内部标题 | AIObservationView；不得直接持久化 |
| 理解 | 保存和回看用户自己的意义 | 用户想查看曾经写下的理解 | 阅读、补充、按时间/主题回看 Reflection | AI 代写结论、把快捷选择显示为 AI 正确 | ReflectionFlowService、ReflectionService、User Reflection storage |
| 理解详情 | 让用户看到自己的原话及其背景 | 从理解时间线打开 | 编辑自己的理解、回看来源记录和关联观察 | 用 AI 文字替换用户原话 | Reflection record 与来源引用 |
| 探索 | 回看已形成的长期联系 | 用户想理解长期变化 | 查看联系、来源记录、用户理解和时间变化 | 人格报告、心理画像、AI 总结“你是谁” | RelationService、DiscoveryService、Evidence/Discovery read path |
| 联系详情 | 展开一条已确认联系 | 从探索列表打开 | 查看来源、时间、用户理解，重新进入反思 | 自动新增联系、强制解释 | 持久 Relation/Evidence + Reflection provenance |
| 设置 | 管理服务和数据控制 | 配置 AI、隐私或数据操作 | Base URL、API Key、Model、连接测试、导出/恢复、Directive | 记录时间线、AI 工作台、未经请求的观察 | DesktopAIService、SecretStore、Directive、Export/Restore |

“开始 / 今日”不是第六个语义层，而是进入“记录”的轻量落点。它不能重新变成混合型 Dashboard。

## 4. Desktop IA

### 4.1 侧边栏

Desktop 使用固定侧边栏，顺序如下：

1. 记录
2. 觉察 / 回看
3. 理解
4. 探索
5. 分隔线
6. 设置

“新建记录”是“记录”区域内最明显的主操作，而不是 AI 操作。用户可以在记录页使用 `记录一句话` 或同义主按钮。

侧边栏底部可以放：

- 本地运行状态（例如“本地数据已连接”）。
- AI 服务状态小标签：未配置、已连接、暂时不可用。
- 帮助或诊断入口。

这些状态不能占用主内容区，也不能变成主导航入口。详细诊断放在次级抽屉或设置中。

### 4.2 主内容区

同一时刻只显示一个主要信息层：

- 记录页只处理事实和时间线。
- 觉察页才显示 AI Observation 与用户理解邀请。
- 理解页让用户自己的文字成为视觉主体。
- 探索页展示已形成联系的来源与变化。
- 设置页处理服务、隐私和数据控制。

允许使用上下文侧栏，但侧栏必须属于当前层：

- 觉察详情的侧栏显示 AI 参考的原始记录。
- 理解详情的侧栏显示来源记录，主区域显示用户原话。
- 探索详情的侧栏显示联系的来源与时间，不能显示新的 AI 结论。

不保留“记录、AI、历史、设置全部纵向堆叠”的 Desktop 单页作为正式产品结构。现有运行状态或诊断信息可迁移到设置中的诊断抽屉。

## 5. Mobile IA

Mobile 使用四个底部主导航：

```text
记录 | 觉察 | 理解 | 探索
```

设置通过个人菜单、右上角菜单或“更多”入口进入，不与四个主信息层竞争。若产品后续需要独立的“更多”标签，只放设置、导出/恢复和帮助，不放 AI 工作台。

移动端优先级：

1. 留下和查看自己的记录。
2. 主动打开一次 AI 回看。
3. 写下自己的理解。
4. 浏览已形成的长期联系。
5. 管理设置和数据。

记录页提供固定的主操作，例如 `记录一句话`。AI 不自动弹窗、不作为首屏问答入口。每个屏幕只表达一个信息层；同层内容可以上下滚动，但不能把 AI 观察卡和原始记录卡伪装成同一种内容。

## 6. 核心用户流程

### Flow 1：第一次使用

```text
打开应用
  → 进入“记录”或“今天”
  → 写下第一条 Record
  → 保存
  → 留在记录时间线查看自己的原话
```

第一次保存不自动打开 AI，也不要求用户配置 AI。觉察入口作为次要提示保留，避免把产品理解成“先问 AI”。

### Flow 2：AI 觉察到用户理解

```text
已有多条 Record
  → 用户主动打开“觉察 / 回看”
  → 选择要回看的上下文和指令
  → Provider 返回临时 AI Observation
  → 展示：AI 注意到、相关记录、可能解释、AI 不确定什么、回看问题
  → 用户进入“你的理解”
       ├─ 写下自己的理解 → 进入现有 Core Gate
       ├─ 选择“有一点关联，但我的理解不同”并补充文字 → 以用户文字进入 Core Gate
       ├─ 选择“这不是我的体验” → 丢弃 Observation，正常结束
       └─ 没有文字输入 → 不进入 Core Gate，Observation 可丢弃
  → 只有通过现有 Core Gate 才形成持久 Relation / Evidence
  → 用户自己的理解出现在“理解”中
```

快捷选择本身不是“批准 AI”，也不能单独产生长期数据。AI Observation 在用户参与前始终是临时、可丢弃的对象。

### Flow 3：长期回看

```text
多个用户 Reflection
  → 打开“理解”时间线
  → 选择一条自己的理解
  → 查看来源 Record 和相关历史
  → 进入“探索”查看已经形成的长期联系
  → 用户重新理解、补充或修正过去经验
```

探索展示的是用户参与后形成的联系，不负责生成“你是什么样的人”的总报告。

## 7. 数据层映射

| 信息架构层 | 允许读取 / 触发的现有能力 | 持久化边界 |
| --- | --- | --- |
| 记录 | Capture、RecordQuery、记录编辑与搜索 | 保存用户 Record；不保存 AI 解释 |
| 觉察 | Context selection、现有 AI Provider、`AIObservationView`、临时 candidate/observation orchestration | Provider 输出只作为临时 Observation；用户没有文字前不得写 Relation、Evidence、Insight 或画像 |
| 理解 | `ReflectionFlowService`、ReflectionService、用户理解表单与历史查询 | 保存用户 Reflection 和必要来源；用户原话优先于 AI 文案 |
| 探索 | `RelationService`、`DiscoveryService`、Relation/Evidence/Discovery 查询 | 只展示已经通过 Core Gate 的长期联系；不从展示页面直接生成结论 |
| 设置 | Desktop composition root、AI 配置、SecretStore、Directive、Export/Restore | 保存配置、凭据和数据控制；不混入 Record 或 Reflection 内容 |

语义顺序必须保持：

```text
Record
  → AI Observation（临时）
  → User Reflection
  → Core Gate
  → Relation / Evidence
```

当前 Reflection API 的 target-bound 物理写入顺序可以保持。信息架构只向用户表达上述语义顺序，不暴露内部存储顺序，也不要求修改 Core 或 SQLite schema。

## 8. UI 术语规范

### 8.1 用户可见替换

| 内部 / 旧称 | 用户可见称呼 | 使用说明 |
| --- | --- | --- |
| Capture | 记录 / 记录一句话 | 事实输入入口 |
| History | 记录 / 时间线 | 用户自己的经历 |
| Awareness | 觉察 / 回看 | 重新观察已有记录的空间 |
| AI Observation | AI 观察到的一种可能联系 | 观察而非结论 |
| Candidate | 不显示 | 可用“可能联系”或上面的统一称呼 |
| Hypothesis | 一种可能解释 | 必须带“但也可能存在其他解释” |
| Relation | 已形成的长期联系 | 仅在用户参与并通过 Core Gate 后使用 |
| Evidence | 支持这条联系的记录 | 需要解释时使用，避免孤立的技术标签 |
| User Reflection | 我的理解 | 用户自己的意义表达 |
| Core Gate | 不显示 | 用户文案可写“继续理解这段经历” |
| AI Provider | AI 服务 | 设置中的服务配置 |
| Directive | 数据与 AI 使用规则 | 设置中的控制项 |
| Export / Restore | 导出 / 恢复 | 数据操作 |

### 8.2 Observation 固定文案结构

觉察页的 AI 内容使用以下层次：

1. **AI 注意到**：只描述记录中可见的结构，不描述用户是什么样的人。
2. **相关记录**：展示 AI 参考的 Record 原文，并注明“这些记录只是 AI 观察时参考的信息，不代表已经形成事实关系”。
3. **一种可能解释**：以“一种可能是……”开头，并保留“但也可能存在其他解释”。
4. **AI 也不确定**：说明记录不足或无法判断之处。
5. **一个可以继续思考的问题**：邀请回看，不是诊断或命令。

避免以下表达：

- “发现你的……”
- “你就是……”
- “你的本质是……”
- “你害怕成功 / 你有某种人格问题”等诊断式语言。

所有表达优先使用“可能、暂时、我无法判断、由你决定、与你的体验接近吗”等低权威语言。

## 9. 跨页面边界规则

1. **记录页**只读写 Record；不得在保存后强制跳到 AI 观察。
2. **觉察页**可以在用户明确发起回看后调用 Provider，但不能直接写 Relation、Evidence 或长期画像。
3. **理解页**接收用户自己的文字；快捷选择不是批准动作，没有文字时不触发 Core Gate。
4. **探索页**只读已经持久化的 Relation/Discovery/Evidence，并显示其来源和用户理解；不得在展示时临时生成新的 AI 结论。
5. **设置页**只管理 Provider、SecretStore、Directive、隐私和数据操作；不得承载日常记录。
6. 所有页面通过 Application/orchestration 与 Core、Storage、Provider 交互；禁止 UI 直接访问 SQLite 或 OpenAI-compatible HTTP API。

## 10. 空状态与降级状态

### 记录为空

```text
还没有记录。
先写下此刻发生的一件事。
```

主操作是记录，不是配置 AI。

### 觉察为空

```text
暂时没有发现明显联系。
这并不代表没有模式，只是当前记录不足以支持进一步观察。
```

不显示失败评分、关系数量或“AI 不够聪明”的提示。

### AI 未配置或暂时不可用

记录、历史、理解和探索继续可用。觉察页说明“AI 回看暂时不可用”，提供进入设置的入口，但不阻断 Capture、搜索、导出、恢复或已有 Reflection。

## 11. 后续实施建议

后续按以下顺序实施，每一步都保持现有 Core、Storage、Provider contract 和 schema 不变：

1. **Phase 9.1：导航壳层**
   - 建立记录、觉察、理解、探索、设置的 Desktop/Web 导航入口。
   - 先移动页面边界，不改变业务服务和数据模型。
2. **Phase 9.2：Desktop 分层**
   - 将当前 Desktop 单页拆为导航视图。
   - 把本地运行状态与诊断移到次级区域。
3. **Phase 9.3：Observation 展示迁移**
   - 将 Capture 内嵌的 AI 观察迁移到觉察详情。
   - 保留现有 orchestration 和 Core Gate，确保 Observation 仍是临时对象。
4. **Phase 9.4：理解与探索分离**
   - 将用户 Reflection 时间线与 Relation/Discovery 列表分开。
   - 在探索详情中显示来源 Record 和用户理解，而非 AI 报告。
5. **Phase 9.5：术语与可访问性审计**
   - 扫描用户可见文案，移除 Candidate、Hypothesis、Core Gate 等内部词。
   - 验证键盘导航、空状态、错误状态和移动端单层阅读顺序。
6. **Phase 9.6：真实设备验证**
   - 分别验证记录、觉察、理解、探索和设置的导航闭环。
   - 验证 AI 不可用时的降级路径，以及用户否定观察后的无持久化结果。

本阶段不建议同时做 UI 大重构、移动端实现、数据库迁移、Provider 协议调整或新的 AI 能力建设。

## 12. 当前未决事项

- 现有 `/reflection` 路由同时承担发现列表和反思入口，下一阶段需要按本 IA 拆分展示职责，但不需要改变底层数据模型。
- Desktop 当前有运行状态、AI 配置、导出/恢复等诊断性内容；它们应进入设置或次级抽屉，而不是继续堆在记录主流程。
- “同步”属于设置层的未来配置入口；当前产品仍以本地优先为准，不应暗示云端同步已经存在。
- SQLite 文件位置与加密状态属于运行时设置/隐私说明，不应在探索或记录页面中制造安全承诺。

## 结论

正式产品结构应让用户沿着自己的生活经验前进：先记录事实，再主动回看可能联系，再写下自己的理解，最后在长期探索中查看已经形成的联系。AI 只出现在觉察层，且始终是暂时、可反驳、可丢弃的观察；用户理解是进入 Core Gate 和长期数据的必要前提。


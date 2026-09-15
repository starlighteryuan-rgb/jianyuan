# 见渊 Phase 9.1：Navigation Shell Migration Report

状态：完成

本阶段只迁移导航壳层和页面入口。没有修改 Core/domain 语义、SQLite schema、Provider contract、Relation/Evidence 生成规则，也没有新增 AI 架构。

## 1. 迁移目标

将原先“一个页面纵向堆叠记录、历史、AI、回看和设置”的入口，迁移为五个正式产品空间：

```text
记录 → 觉察 → 理解 → 探索
                 ↘ 设置（次级入口）
```

这一步只改变 Presentation 层的入口和可见结构。既有 Application / orchestration 调用继续复用。

## 2. Web 导航壳层

新增 `ProductNavigation` 展示组件，并接入根布局：

- Desktop 宽度显示左侧主要导航。
- 移动宽度显示底部主要导航。
- 设置与四个主要认知空间分隔，在 Desktop 侧边栏作为次级入口，在移动端通过“更多”进入。
- 当前路径会显示为 active 状态，并提供 `aria-current` 与键盘 focus 样式。

主导航顺序固定为：

1. 记录
2. 觉察
3. 理解
4. 探索
5. 分隔线
6. 设置

首页右上角的主操作仍然指向“记录一句话”，没有把 AI 变成首屏入口。页脚链接也改为五个产品空间的用户可见称呼。

## 3. Web 页面入口与旧功能映射

新增正式入口：

| 产品空间 | 路由 | Phase 9.1 映射 |
| --- | --- | --- |
| 记录 | `/records` | 复用现有 History 时间线与本地 Record 查询 |
| 觉察 | `/awareness` | 暂时复用现有 Reflection 发现/回看队列 |
| 理解 | `/understanding` | 新增页面入口与空状态；全局 Reflection 索引留给 Phase 9.2/9.4 |
| 探索 | `/exploration` | 读取现有 Discovery stream，仅展示已形成的 relation 项 |
| 设置 | `/settings` | 保留现有 Provider、Directive、数据导出/恢复设置页 |

为避免破坏既有链接，以下旧入口仍然保留：

- `/capture`：记录创建页。
- `/history`：记录时间线旧地址。
- `/reflection`：旧的发现/回看地址，导航 active 状态归入“觉察”。
- `/reflect/[targetRef]`：具体联系的回看地址，导航 active 状态归入“理解”。

旧入口的保留是兼容策略，不改变底层数据流。

## 4. Desktop 导航壳层

Desktop `App` 现在以本地 Presentation state 切换五个空间：

- 记录：Capture 与历史/搜索。
- 觉察：现有 AI Observation 与用户理解表单。
- 理解：新增“你的理解”空状态入口，提醒用户从觉察开始写下自己的话。
- 探索：从现有 Discovery stream 显示已形成的长期联系。
- 设置：本地运行状态、AI 服务、Export / Restore。

现有业务函数（Capture、Model Discovery、Connection Test、Observation 提交、Export / Restore）没有被重写，只由导航状态控制显示位置。

本地运行状态和 AI 服务状态不再与记录表单并列作为主流程步骤；它们位于侧边栏状态提示或设置空间。AI 状态仅显示“未配置、已连接、暂时不可用”等状态，不改变记录功能的可用性。

## 5. Mobile 结构

Web 与 Desktop 的窄屏布局均提供四个主要底部入口：

```text
记录 | 觉察 | 理解 | 探索 | 更多
```

“更多”进入设置，不把设置和四个认知层混在同一语义顺序中。窄屏底部导航保留安全区间距，按钮满足可触控的最小高度，并支持键盘 focus。

## 6. 空状态

本阶段新增或统一了入口级空状态：

- 理解：还没有可以集中展示的理解，提示从觉察中写下自己的话。
- 探索：还没有可回看的长期联系，提示先形成自己的理解。
- 记录、觉察、设置继续沿用现有空状态和降级状态。

空状态不显示 AI 评分、人格画像或“AI 失败”的暗示。AI 暂时不可用时，记录和历史入口仍然可用。

## 7. 边界检查

本阶段保持以下边界：

```text
Presentation
  → Application / Orchestration
  → Core
  → Storage / Provider
```

- Web/Desktop UI 没有直接访问 SQLite。
- Web/Desktop UI 没有直接调用 AI HTTP API。
- AI Observation 仍是临时观察；本阶段没有改变 Core Gate 或 Relation/Evidence 产生规则。
- 导航不会因为打开“觉察”而自动创建 Relation、Evidence 或长期意义。
- 没有修改 SQLite schema、Provider contract 或 Core/domain 语义。

## 8. 验证结果

执行结果：

- 根项目 typecheck：通过。
- Desktop typecheck：通过。
- 根项目测试：47 个测试文件、856 个测试通过。
- Desktop 测试：2 个测试文件、4 个测试通过。
- Web `next build`：通过；包含新增 `/records`、`/awareness`、`/understanding`、`/exploration` 路由。
- Desktop renderer/runtime build：通过。
- `git diff --check`：通过；Git 仅报告工作区既有的 LF/CRLF 转换提示，没有空白错误。

## 9. 尚未完成事项

以下内容明确留给后续阶段，没有在 9.1 中提前实现：

- Phase 9.2：把每个页面的业务职责和数据展示进一步分离。
- Phase 9.3：把 Capture 内的 AI Observation 体验迁移为独立的觉察工作流。
- Phase 9.4：建立全局用户 Reflection 时间线，并彻底分离“理解”与“探索”。
- Phase 9.5：全面清理用户可见的内部术语，并完成 Loading、错误状态、移动端阅读和键盘导航审计。
- Phase 9.6：真实用户流程、AI 关闭/失败和否定观察场景的完整产品验证。

目前 `/understanding` 的全局历史为空状态是已知的过渡状态；具体联系的既有用户理解仍可从 `/reflect/[targetRef]` 读取。

## 10. 结论

Phase 9.1 已建立正式产品导航骨架：用户从“记录”开始，主动进入“觉察”，再进入“理解”和“探索”；设置被放到次级入口。既有能力仍可用，迁移没有越过 Core、Storage 或 Provider 边界。


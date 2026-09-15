# 见渊 Phase 10 · Visual & Motion Research

STATUS: research-only. No product UI, CSS, dependencies, or product logic changed.

## 1. Visual North Star

《见渊》原有概念视觉作为 Phase 10 的 Visual North Star：

| 概念 | 产品含义 |
|------|---------|
| 点 | 一段经历（Record） |
| 微光 | 某件事被注意到 |
| 圆 / 涟漪 | 一次回看 |
| 轨迹 | 记录之间的可能联系 |
| 稳定轨道 | 用户参与后形成的长期理解 |

核心感受：**安静，但不静止**（Quiet, not static）。

日常产品 UI 是概念视觉世界里的"日常空间"：比概念图更安静、更可读、更长期耐看。概念图的大范围辉光 / 宏大空间 / 高戏剧性只用于品牌视觉（README / 官网 / Splash / Empty State illustration），不进入日常产品界面。

## 2. Theme System

《见渊》不是单一 Dark Theme 产品。正式产品同时提供三套主题，默认跟随系统：

| Theme | 说明 |
|-------|------|
| System | 默认。跟随 `prefers-color-scheme` |
| Light | 浅色主题 · Warm Paper |
| Dark | 深色主题 · Deep Amber |

此前确定的 Deep Warm Black + Quiet Amber + Concentric Rings / Ripples + Subtle Spatial Light，定义为 **Dark Theme · Deep Amber**，不是整个产品唯一的配色。

### 2.1 品牌语言独立于 Theme

见渊真正固定的视觉语言（两个主题都必须遵守）：

- 暖光（不是金色材质）
- 同心圆 / 涟漪（一次回看）
- 轨迹（记录之间的联系）
- 点（一段经历）
- 空间层级
- 克制的琥珀强调
- 人始终位于视觉中心

固定的不是 "黑色 + 金色"。Dark 与 Light 是同一个世界的白天与夜晚。

### 2.2 两个主题的感受基调

| Theme | 一句话感受 | 色彩方向 |
|-------|-----------|---------|
| Dark · Deep Amber | "在黑暗中，一些经历慢慢被看见。" | Deep Warm Black / Quiet Amber / Muted Copper / Warm Ivory Typography |
| Light · Warm Paper | "在安静的纸面上，把经历摊开重新看。" | Warm Ivory / Paper & Mineral White / Graphite Typography / Muted Amber / Soft Copper / Warm Gray |

两个主题共同禁止：刺眼纯白大面积使用；把 Light 做成普通 SaaS 白底后台；把 Dark 做成 Black & Gold luxury。

### 2.3 Semantic tokens（同一 Design System，两套取值）

组件结构、spacing、typography、motion 必须共享；只有 token 取值不同。

| Semantic token | Dark · Deep Amber | Light · Warm Paper |
|----------------|-------------------|--------------------|
| `--bg-canvas` | `#161512` | `#f7f4ed` |
| `--bg-surface` | `#1e1c18` | `#fffdf8` |
| `--bg-elevated` | `#25221d` | `#ffffff` |
| `--text-primary` | `#ece5d8` | `#26231e` |
| `--text-secondary` | `#a9a092` | `#5f5a50` |
| `--text-muted` | `#756c5f` | `#8a8274` |
| `--accent-primary` | `#d4a464` | `#a8814e` |
| `--accent-soft` | `rgba(212,164,100,0.14)` | `#f0e3cd` |
| `--border-subtle` | `#2f2b25` | `#e5dfd2` |
| `--relation-line` | `rgba(212,164,100,0.30)` | `rgba(140,106,74,0.35)` |
| `--awareness-glow` | `rgba(212,164,100,0.08)` radial | `rgba(168,129,78,0.10)` ring/border tint |
| `--reflection-focus` | `#d4a464` | `#a8814e`

原则：

- 琥珀只做微光和焦点标记，不做大面积填充。
- 两个主题的 accent 是同一语义（琥珀），只调整明度/饱和度以维持对比度。
- 深浅两套正文都要过 WCAG AA（目标 4.5:1）。
- `--awareness-glow` 在 Dark 是径向微光，在 Light 退化为极淡的 ring/border tint，不用大面积 glow。

### 2.4 Paired Theme Board（Theme Pair A / B / C）

命名说明：这里的 Theme Pair 是"明暗配对"，与第 12 节的 Visual Direction A-D 是两个维度——Direction 决定布局与动效性格，Theme Pair 只改变 lighting / surface treatment。

每一对都必须满足：同一 Typography、同一 spacing system、同一 component geometry、同一 motion language、同一 semantic accent；只改变明暗与表面处理。要比较的是"同一个见渊世界在白天与夜晚是什么样子"，不是六套随机 UI。

#### Theme Pair A · Deep Amber / Warm Paper（默认方向，最贴近 North Star）

- Dark: 现有 Deep Amber 方向。琥珀微光、暗铜轨迹、骨白正文。
- Light: 暖象牙纸面（`#f7f4ed`），石墨正文，琥珀只出现在焦点与"被注意到"的点上。表面靠纸面色温区分层级，不靠阴影。
- 判断重点: 白天是否"纸感"而非 SaaS 白；夜晚是否仍是熟悉的产品。

#### Theme Pair B · Mineral Night / Mineral Day（更冷静的矿层）

- Dark: 表面偏中性暖灰（比 A 更冷半度），琥珀只作为极小的点/线 accent，几乎不用 glow；层级靠明度差。
- Light: Mineral White（`#f4f2ee`），更冷静的石墨文字，accent 用暗铜 `#8c6a4a`；最不像 "gold" 的一对。
- 判断重点: 是否过于冷淡而失去"暖光"的品牌记忆。

#### Theme Pair C · Ember Night / Linen Day（最暖、最有机）

- Dark: 表面更偏暖棕（ember），铜色成分提高，涟漪/轨道可用略高 opacity。
- Light: Linen（`#f6efe4`），铜色 accent，纸面颗粒感可略强（grain ≤ 3% opacity）。
- 判断重点: 最容易滑向 gold-luxury / 玄学感的一对，琥珀/铜饱和度必须压住。

#### Theme Board 必须展示的屏幕（每对 Dark + Light 各一遍）

1. 记录
2. 觉察
3. 我的理解
4. 探索
5. 左侧 Navigation
6. Observation Card
7. Reflection Focus State

#### Theme Board 判断标准

- 白天是否长期可读（20 分钟以上不疲劳）
- 夜晚是否舒适（低亮度环境不刺眼）
- 两个主题是否一眼认出是同一个产品
- 是否避免 SaaS Dashboard 感
- 是否避免 Black & Gold luxury 感

### 2.5 Light 与 Dark 的 Motion 对应

同一个 semantic transition（Record → Observation → Reflection）在两个主题下必须表达同样意义，只是媒介不同：

| 表达 | Dark · Deep Amber | Light · Warm Paper |
|------|-------------------|--------------------|
| 微光浮现（Observation appears） | `--awareness-glow` 径向微光 + opacity | ring/border tint + opacity + small translate |
| 记录落定（Record saved） | 一次性 `glow.faint` | 边界一次性的 `--accent-soft` tint |
| 用户理解成为主体（Reflection priority） | 背景亮度退 + 用户区微亮 | 背景色调退 + `--reflection-focus` 边界 |
| 稳定轨道（Exploration） | 低 opacity 光环 | 低 opacity 铜/琥珀 ring |

原则：Light 不应大量使用 glow；Light 更多依靠 border、极低强度 shadow、tonal contrast、subtle translate、opacity、空间层级。

### 2.6 Theme Switching 实现方向

- 优先 `prefers-color-scheme` + CSS semantic variables + 用户 override，不维护两份组件。
- 结构：`:root` 定义 Light 默认值；`@media (prefers-color-scheme: dark)` 覆盖为 Dark；`[data-theme="light"]` / `[data-theme="dark"]` 作为用户强制值覆盖两者；设置页存 System / Light / Dark 三态。
- Tauri/WebView2 原生支持 `prefers-color-scheme`；System 状态下跟随 OS 切换无需刷新。
- `prefers-reduced-motion` 独立于 Theme 控制，不与主题绑定（见第 11 节）。

## 3. GitHub / Demo references

所有链接在研究时均可访问（少数 rate-limited 但仓库本身活跃）。

### 3.1 Motion

- 仓库: <https://github.com/motiondivision/motion>
- 文档: <https://motion.dev>
- npm 包名: `motion`（v13.3.0，MIT）
- Stars: 33,604 / pushed: 2026-09-14 / TypeScript / MIT
- 提供 `MotionConfig` + `useReducedMotion` + `useReducedMotionConfig`，是本报告所有 reduced-motion 策略的执行基础。
- Demo: <https://motion.dev/docs/react-animation>
- Demo: <https://motion.dev/docs/react-use-reduced-motion>

**对见渊的意义：** 它是"layout transition / shared layout / spring"的 React 事实标准。`AnimatePresence` + `layout` 属性可以自然处理"记录插入时间线"、"觉察出现"、"页面切换"。
**直接引入？** 建议是。它是完整动画引擎，但也支持小型 spring/opacity；reduced-motion API 完整。`bundle/runtime` 复杂度中等，Tauri WebView 无已知风险。

### 3.2 AutoAnimate

- 仓库: <https://github.com/formkit/auto-animate>
- Demo: <https://auto-animate.formkit.com>
- npm 包名: `@formkit/auto-animate`（v0.10.0，MIT）
- Stars: 13,918 / pushed: 2026-07-10 / TypeScript / MIT / peerDependencies: {}
- 定位是"drop-in"：一行 `useAutoAnimate()` 给列表加进入/退出动画，适合记录列表新增/删除。
- Demo: <https://auto-animate.formkit.com/examples/react>
- Demo: [List example](https://auto-animate.formkit.com/examples/react#list)

**对见渊的意义：** 适合"新 Record 加入历史列表"、"理解时间线新增一条"这种简单插入/移动。不适合表达复杂的空间层级。
**直接引入？** 可选。如果用 Motion，可用 Motion 的 `AnimatePresence` 替代；如果不想引入完整 Motion 引擎，AutoAnimate 是轻量替代。零 peer deps。

### 3.3 Motion Primitives

- 仓库: <https://github.com/ibelick/motion-primitives>
- Demo: <https://motion-primitives.com>
- Stars: 6,293 / pushed: 2026-09-12 / MIT / beta
- 33 个组件全部依赖 `motion` + Tailwind，提供 `animated-group`, `blur-fade`, `animated-list` 等 copy-paste 组件。
- registry: [public/c/registry.json](https://github.com/ibelick/motion-primitives/blob/main/public/c/registry.json)

**对见渊的意义：** 组件实现可作为 motion pattern 参考（`animated-group` 的 stagger 顺序、`text-effect` 的 reveal 节奏、`border-trail` 的边界流动），不需要整包引入。
**直接引入？** 不建议作为 runtime dep。将组件 copy 进 visual-lab 验证 motion 节奏更安全，避免额外 Tailwind / registry 工具链耦合。

### 3.4 Magic UI

- 仓库: <https://github.com/magicuidesign/magicui>
- Demo: <https://magicui.design>
- Stars: 22,281 / pushed: 2026-09-13 / MIT
- 提供 `dot-pattern`, `flickering-grid`, `particles`, `orbiting-circles`, `ripple`, `meteors`, `animated-beam`, `border-beam`, `globe`。
- 组件实现: [apps/www/registry/magicui/](https://github.com/magicuidesign/magicui/tree/main/apps/www/registry/magicui)
- SKILL.md: [skills/magic-ui/SKILL.md](https://github.com/magicuidesign/magicui/blob/main/skills/magic-ui/SKILL.md)
- MCP: [apps/www/content/docs/mcp.mdx](https://github.com/magicuidesign/magicui/blob/main/apps/www/content/docs/mcp.mdx)

**对见渊的意义：**
- `dot-pattern` + `glow` 接近 North Star 的"点 + 微光"。
- `orbiting-circles` / `ripple` 接近"圆 / 涟漪 / 轨道"。
- `animated-beam` 接近"轨迹 / 联系"。
- `particles` 需要极谨慎：默认 Quantity 太高，见渊最多 15-25 个，或只借鉴 `particles.tsx` 的 canvas 呼吸感。
**直接引入？** 不建议整包引入。理由：
  1. Magic UI 的默认 demo 比见渊需要的更炫（aurora-text / meteors / shiny-button 等不适合产品）。
  2. 组件依赖 Tailwind + shadcn CLI 工具链，见渊目前不是 Tailwind 项目。
  3. 更安全的做法：只 copy `dot-pattern.tsx` / `ripple.tsx` / `orbiting-circles.tsx` 到 visual-lab，剥离 Tailwind 依赖，保留 SVG/canvas 实现思路。

### 3.5 shadcn/ui

- 仓库: <https://github.com/shadcn-ui/ui>
- Docs: <https://ui.shadcn.com>
- npm 包名: `shadcn` CLI v4.21.0 / MIT
- Stars: 123,743 / pushed: 2026-09-12
- MCP 文档: [apps/v4/content/docs/mcp.mdx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/mcp.mdx)

**对见渊的意义：** 不是视觉方向来源，但它的"headless 组件 + 完整可编辑代码"模式适合见渊（保留现有组件体系，不引入 runtime dep）。如果未来需要 dialog / popover / tooltip 的可访问性原语，Radix 是事实标准。
**直接引入？** 不建议引入完整 shadcn + Tailwind。只借鉴其"copy-paste, own the code"思路。

### 3.6 react-spring

- 仓库: <https://github.com/pmndrs/react-spring>
- Stars: 29,149 / pushed: 2026-09-14 / MIT
- Spring-physics first。

**对见渊的意义：** 如果要强 spring（例如记录"落定"的一瞬间、拖拽对齐），react-spring 是备选。但 Motion 已覆盖 spring + layout transition，同时引入两个引擎会让 bundle 和 mental model 变复杂。
**直接引入？** 不建议。Motion 一个引擎就够。

### 3.7 其他值得参考但不必引入

- [Radix UI Primitives](https://github.com/radix-ui/primitives) (MIT, 19,267 stars, pushed 2026-08-08): 可访问性原语。未来如果需要 dialog/popover，可按需引入。demo: <https://www.radix-ui.com/primitives>
- [Headless UI](https://github.com/tailwindlabs/headlessui) (MIT, 28,742 stars, pushed 2026-04-13): a11y 原语。
- [vaul](https://github.com/emilkowalski/vaul) (MIT, 8,608 stars, pushed 2025-10-03): drawer/sheet 的 spring motion 参考。
- [sonner](https://github.com/emilkowalski/sonner) (MIT, 12,968 stars, pushed 2026-08-10): toast 的 reduced-motion 处理。

## 4. Agent Skill / MCP references

重点区分："帮助 agent 写 UI 的 skill" vs "runtime dependency"。

| 项目 | Skill / MCP | 类型 | GitHub 链接 | 说明 |
|------|-------------|------|------------|------|
| Magic UI | `skills/magic-ui/SKILL.md` + MCP | Agent skill + MCP | <https://github.com/magicuidesign/magicui/blob/main/skills/magic-ui/SKILL.md> | **帮助 agent 写 UI**，不是 runtime dep。教 agent 如何选择/安装 Magic UI 组件。 |
| Magic UI | `@magicuidesign/mcp` | MCP server | [docs](https://github.com/magicuidesign/magicui/blob/main/apps/www/content/docs/mcp.mdx) | 给 IDE/agent 提供组件 registry。也不是 runtime dep。 |
| shadcn/ui | `shadcn` CLI + MCP | Component registry + MCP | [mcp docs](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/mcp.mdx) | **帮助 agent 写 UI**。CLI 把组件 copy 进项目，MCP 帮 agent 查 registry。 |
| Motion | `.agents/skills/fix/`, `.agents/skills/improve/` | Agent skill | <https://github.com/motiondivision/motion/tree/main/.agents/skills> | 项目维护者自己的 agent workflow skill。不是 runtime dep。 |
| shadcn-ui | `.cursor/rules/*.mdc` | Cursor plugin / rules | <https://github.com/shadcn-ui/ui/tree/main/.cursor/rules> | 帮助 Cursor/agent 理解 registry 对齐。 |
| Anthropic skills | `anthropics/skills` | Public skill collection | <https://github.com/anthropics/skills> | 176,288 stars。包含 `canvas-design`, `brand-guidelines` 等。**帮助 agent 写 UI**。 |
| OpenAI Codex | `.codex/skills/` | Agent skill | <https://github.com/openai/codex/tree/main/.codex/skills> | 124,100 stars。仓库自身 workflow skill。 |
| Claude Code | `plugins/frontend-design` | Agent skill | <https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design/skills/frontend-design/SKILL.md> | 帮助 agent 写 UI。 |

**结论：** Skill / MCP 都是**帮助 agent 写 UI 的开发时工具**，不是 runtime dependency。Phase 10 prototype 阶段可以用 Magic UI 的 skill/MCP 快速试 motion 模式，但正式产品**不要**把 skill 的内容当作 runtime dep。组件应该 copy 进 visual-lab 验证后，只保留必要部分进产品。

### 4.8 Taste Skill（Leonxlnx/taste-skill）

- 仓库: <https://github.com/Leonxlnx/taste-skill>
- 官网: <https://tasteskill.dev>
- 87,097 stars / MIT / pushed 2026-08-24 / not archived
- 结构: 13 个 agent skills（`skill.sh` 注册表）+ `.claude-plugin/`（Claude Code plugin 格式，含 marketplace.json）
- 无 MCP server；全部为 SKILL.md 形式的 agent skill
- 性质: **帮助 agent 写 UI 的开发时 skill，不是 runtime dependency**

关键 skills 与对见渊的适用性：

| Skill | 作用 | 对见渊适用性 |
|-------|------|-------------|
| [taste-skill (design-taste-frontend)](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md) | anti-slop；先读 brief 再设计；redesign audit-first | 方法论适用（先审计再改）。但它明确说 "not for dashboards / multi-step product UI"，见渊是产品 UI，所以只借其 audit 方法与排版纪律，不套其 landing-page 布局。 |
| [redesign-existing-projects](https://github.com/Leonxlnx/taste-skill/blob/main/skills/redesign-skill/SKILL.md) | Scan → Diagnose → Fix，不重写栈 | 与本任务最匹配：诊断当前 "web form / admin 感"（字体层级、卡片滥用、满宽按钮）。适合作为 Visual Board 的审计清单。 |
| [soft-skill (high-end-visual-design)](https://github.com/Leonxlnx/taste-skill/blob/main/skills/soft-skill/SKILL.md) | Awwwards 级；反模式清单（禁 Inter/Roboto、禁硬阴影、禁 linear ease） | 其 "Editorial Luxury"（暖奶油 + grain）接近 Light 方向；"Ethereal Glass" 接近 Dark 方向。但它的 motion 强度远超"安静但不静止"，只借表面/阴影/字体纪律，不借 motion 强度。 |
| [minimalist-ui](https://github.com/Leonxlnx/taste-skill/blob/main/skills/minimalist-skill/SKILL.md) | 暖色单色、超扁平、serif 标题 + sans 正文、无渐变 | 与 Light · Warm Paper 高度兼容，可作为 component geometry 的克制规则。 |
| [brandkit](https://github.com/Leonxlnx/taste-skill/blob/main/skills/brandkit/SKILL.md) | 品牌板/视觉世界图像生成 | 匹配 "Visual Board" 需求（概念图/README/官网用），非 runtime。 |
| [image-to-code](https://github.com/Leonxlnx/taste-skill/blob/main/skills/image-to-code-skill/SKILL.md) | 图像先行 → 分析 → 实现 | 可用于生成 3 个 Theme Pair 的参考图，但实现必须由我们按 semantic tokens 手工做，不让 skill 自由重写 UI。 |
| [gpt-taste](https://github.com/Leonxlnx/taste-skill/blob/main/skills/gpt-tasteskill/SKILL.md) | AIDA + GSAP 滚动叙事的 landing 风格 | 不适用产品 UI。仅其反模式清单（禁 Inter、禁 6 行换行标题）有参考价值。 |

使用建议：

- 本阶段只把 taste-skill 当作**审计透镜和参考原则**（尤其 redesign-existing-projects 的 audit 清单），不安装、不让它自由重写 UI。
- MIT 许可，原则可自由借鉴；全部为 agent skill / 开发时工具，不引入 runtime 依赖。

## 5. Motion Language

### 5.1 记录（Records）

点。一段经历留下后安静存在。

- 保存成功不弹 toast，不闪屏。
- 新记录在时间线里安静出现。
- 时间线是"可以回看的地方"，不是 feed。

### 5.2 觉察（Awareness）

微光。某些事被注意到。

- AI 观察逐渐浮现，不是弹窗。
- 观察有"临时"气质：opacity 较低，进入时可撤回。
- 用户自由文字开始后，观察退到背景。

### 5.3 理解（Reflection）

文字成为主体。

- 用户写下的理解是页面的核心。
- AI 只是背景参考。
- 时间线上按时间排列，不做卡片瀑布流。

### 5.4 探索（Exploration）

稳定轨道。用户参与后形成的联系。

- provenance（来源记录）可见但不高亮。
- 时间作为安静的组织轴。
- 不做成知识图谱炫技。

### 5.5 Navigation

同一个个人空间里逐渐向内走。

- 侧栏导航不是链接到"五个无关页面"。
- 页面切换是同一空间内的焦点移动。
- 记录 → 觉察 → 理解 → 探索是逐渐向内（更个人/更深）。

## 6. Motion Tokens 草案

```text
# duration
duration.instant    = 80ms
duration.fast       = 160ms
duration.normal     = 240ms
duration.slow       = 420ms
duration.ambient    = 1200ms (背景/涟漪循环)

# easing
easing.standard     = cubic-bezier(0.22, 0.61, 0.36, 1)
easing.enter        = cubic-bezier(0.16, 1, 0.3, 1)
easing.exit         = cubic-bezier(0.4, 0, 1, 1)
easing.spring       = Motion spring { stiffness: 180, damping: 22, mass: 0.8 }

# distance
distance.micro      = 4px
distance.small      = 8px
distance.medium     = 16px

# opacity
opacity.hidden      = 0
opacity.temporary   = 0.55   (AI 临时观察)
opacity.ambient     = 0.18   (背景点/圆)
opacity.background  = 0.08   (极弱光晕)
opacity.full        = 1

# layout
radius.card         = 8px
radius.card-lg      = 12px
radius.pill         = 999px

# z / depth
depth.record        = z 0
depth.awareness     = z +1
depth.reflection    = z +2
depth.exploration   = z +1 (回到稳定层)
```

推荐引擎选择：

| Interaction | Engine |
|------------|--------|
| hover / focus / visible border | CSS transition (`duration.fast`) |
| 列表插入/删除 | AutoAnimate 或 Motion `AnimatePresence` |
| 页面切换 | Motion `AnimatePresence` + `layout` |
| 记录"落定" | Motion spring 或 CSS `easing.enter` |
| AI 观察出现 | Motion stagger + opacity + small translate |
| 用户理解优先 | Motion `AnimatePresence` + opacity + scale |
| 探索 timeline | CSS（大多数）+ Motion（新增/删除） |

## 7. Record Saved variants

目标感受："这段经历被安静地留下来了。"

同一内容 + 同一布局，只改 motion。

### Variant A · Settle

- 动画顺序: textarea 清空 → 新记录从 `opacity 0, y +8, scale 0.98` → `opacity 1, y 0, scale 1`
- duration: enter `duration.slow` (420ms)
- easing: `easing.spring`
- opacity: 0 → 1
- translate: `y 8px → 0`
- scale: `0.98 → 1`
- hierarchy: 无变化。新记录安静进入列表顶部。
- reduced-motion: opacity only (120ms)，无 y/scale。

### Variant B · Ink

- 动画顺序: 保存后 textarea 淡出内容 → 新记录文字以 "writing appears" 节奏出现（character/word stagger，或者单行 fade）
- duration: 文字出现 `duration.slow` + 每 word `stagger 15ms`
- easing: `easing.enter`
- opacity: 0 → 0.6 → 1 (两阶段，像墨迹落定)
- translate: `y 4px → 0`
- hierarchy: 新记录正常权重，其他记录无变化。
- reduced-motion: 单次 fade 200ms，无 stagger。

### Variant C · Breath

- 动画顺序: 新记录卡片出现时，卡片左边界出现一次极弱的琥珀光晕（`glow.faint`），1.2s 后消失。同时卡片 fade in。
- duration: glow `duration.ambient` (1200ms), fade `duration.slow`
- easing: `easing.enter`
- opacity: card 0 → 1; glow 0 → 0.18 → 0 (一次性)
- translate: `y 6px → 0`
- hierarchy: 新记录短暂被"照亮"，然后恢复正常。
- reduced-motion: opacity only，无 glow。

## 8. Observation Appears variants

目标感受："记录之间慢慢浮现出一种可能联系。"

### Variant A · Surface

- 顺序: 观察卡背景先出现 (`opacity 0→0.55`, y +10→0, 420ms) → 标题 fade (delay 150ms) → 相关记录 fade (stagger 60ms each) → 行动按钮 fade (delay 500ms)
- easing: `easing.enter`
- opacity: card `opacity.temporary` 0.55
- translate: `y 10px → 0`
- hierarchy: 观察 vs 已有记录之间有明显层级，观察是"叠加在记录之上"。
- reduced-motion: 所有元素同时 fade 200ms，无 stagger。

### Variant B · Trace

- 顺序: 相关记录两点之间出现一条极弱的线 (SVG stroke-dashoffset reveal, 600ms) → 观察卡 fade in (delay 300ms)
- easing: `easing.standard`
- opacity: line 0 → 0.25 → 保持 0.15
- layout: line 连接两点，观察卡出现在两点中间偏下。
- hierarchy: "联系"先于"结论"出现。
- reduced-motion: 线直接以 0.15 opacity 出现，无 reveal 动画；卡片 fade。

### Variant C · Constellation

- 顺序: 观察卡从记录卡后面 fade in（`scale 0.96 → 1`, opacity 0 → 0.55）→ 相关记录短促高亮（边框琥珀 0.15，1s 后回到原样）
- easing: `easing.enter`
- opacity: 观察卡 0.55；记录边框 0.15 一次性高亮。
- scale: 0.96 → 1
- hierarchy: 记录是"被回看"的对象，观察是"浮现"的内容。
- reduced-motion: 卡片 fade，无 scale/边框高亮。

## 9. Reflection Takes Priority variants

最重要 transition：AI 观察退到背景，用户文字成为主体。

### Variant A · Recede

- 顺序: 用户 focus 输入区 → 观察卡 opacity 0.55 → 0.25（420ms），scale 1 → 0.98 → blur(1px)（可选）→ 用户文字区 opacity 0.8 → 1，边界微亮
- duration: 420ms
- easing: `easing.standard`
- opacity: AI `0.55 → 0.25`; user `0.8 → 1`
- hierarchy: 明显两层，AI 是背景，用户是前景。
- reduced-motion: opacity 直变 160ms，无 blur/scale。

### Variant B · Focus Ring

- 开始写 → 观察卡不透明度降 + 左边界从琥珀色淡出 → 用户区左边界从 `border.subtle` 变成 `accent.amber` (160ms)
- duration: 观察退 420ms；用户边界 160ms
- opacity: AI 0.55 → 0.25；user 0.8 → 1
- hierarchy: 用边界颜色变化，不用 blur。
- reduced-motion: opacity + border 直变，无 blur。

### Variant C · Space

- 开始写 → 观察卡 y 轻微上移 (`y 0 → -6`)，opacity 降至 0.25，同时用户区 y 从 +6 → 0 进入
- duration: 420ms
- easing: `easing.enter`
- translate: AI `0 → -6px`，user `+6px → 0`
- hierarchy: 空间位置变化传达"AI 往后退了一步，用户向前"。
- reduced-motion: opacity 直变，无位移。

## 10. Exploration motion ideas

### 10.1 Provenance reveal

长期联系出现时：

- 主体卡片先出现。
- 来源记录（provenance）以小号 + 次级颜色出现，延迟 150ms。
- 时间标签 delay 300ms。
- 联系线 (SVG) delay 400ms，从 0.25 opacity 呈现。

不做知识图谱，不做 3D，不做持续动画。

### 10.2 Timeline connection

- 长期联系列表按时间排列。
- 相邻长期联系之间有极弱的时间轴连接（CSS border 或 SVG path，`opacity.background`）。
- 新增长期联系时，新卡 fade in + y small，时间轴连接线渐次出现。

### 10.3 Stability

- 稳定轨道 = 用户参与后的长期理解。
- 用固定 anchor（左侧小点 + 时间）表达"这件事已经稳定"，不做浮动动画。
- 只有 hover 时轻微 border 颜色变化（`accent.amber-dim`）。

## 11. prefers-reduced-motion 策略

全局原则：**Motion serves meaning. 动画帮助用户理解从哪来、什么变了、什么临时、什么属于用户。**

### 11.1 三层 fallback

1. **全部禁用 transform**。只保留 opacity fade (120-200ms)。
2. **禁用 stagger**。所有元素同时 fade。
3. **禁用循环/ambient**（涟漪、呼吸光晕、粒子）。完全静态。

### 11.2 实现路径

- Motion: `<MotionConfig reducedMotion="user">` + `useReducedMotion()`。
  - Docs: <https://motion.dev/docs/react-use-reduced-motion>
- AutoAnimate: `useAutoAnimate({ duration: 0 })` 或在 reduced-motion 时跳过。
- CSS: `@media (prefers-reduced-motion: reduce) { ... }` 覆盖 `animation` / `transition`。
- 任何 loop/ambient 效果必须检查 `prefers-reduced-motion` 并完全停止。

### 11.3 具体到见渊

| 场景 | Reduced motion fallback |
|------|------------------------|
| Record saved | opacity only |
| Observation appears | 同时 fade，无 stagger |
| Reflection priority | opacity 直变，无 blur/位移 |
| Exploration timeline | 新卡 fade，连接线直现 |
| Navigation | crossfade 200ms，无 shared layout 位移 |
| Empty state | 完全静态，无循环 |

## 12. Visual Direction A/B/C/D

四个方向都是 Visual North Star 的不同"密度"，不是四套不同哲学。

### A. Quiet / Minimal

**一句话感觉：** 安静的深色桌面，琥珀只出现在焦点。

- 参考链接:
  1. <https://github.com/shadcn-ui/ui> - headless 组件 + 可编辑代码，配色由你控制
  1. <https://github.com/radix-ui/primitives> - a11y 原语，无视觉绑定
  1. <https://github.com/motiondivision/motion> - 动画能力储备，不做视觉模板
- 推荐 Motion 技术: CSS transition + Motion `AnimatePresence`（列表插入/页面切换）
- 最适合见渊的页面: 全部页面，尤其是设置、记录。
- 风险: 如果琥珀 + 点/圆/光晕克制不到位，可能像"深色 admin 模板"。

### B. Editorial / Journal

**一句话感觉：** 像一本现代私人手记。强调文字、时间、阅读感。

- 参考链接:
  1. [shadcn-ui/ui calendar](https://ui.shadcn.com/docs/components/calendar) - 时间轴/日期组织
  1. [sonner](https://github.com/emilkowalski/sonner) - toast/notification 的安静处理
  1. [vaul](https://github.com/emilkowalski/vaul) - drawer/sheet 的 spring 参考
- 推荐 Motion 技术: Motion `AnimatePresence` + text reveal（少量 stagger）
- 最适合见渊的页面: 理解（用户理解时间线）、探索（按时间排列）。
- B 不适合: 记录/觉察的"点/圆/涟漪"语言会弱化。
- 风险: 编辑感太强会让 AI 观察的"微光浮现"缺少空间感。

### C. Soft Spatial

**一句话感觉：** 界面有轻微层次、深度和空间过渡，适合"觉察逐渐浮现"。

- 参考链接:
  1. [Magic UI ripple](https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/ripple.tsx) - 圆环渐扩、可控制 opacity
  1. [Magic UI orbiting-circles](https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/orbiting-circles.tsx) - 稳定轨道 / 长期联系的空间语言
  1. [Magic UI animated-beam](https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/animated-beam.tsx) - 记录之间的联系线
- 风险: 深度/光晕/涟漪过量会变成玄学感或金融 luxury。深度必须极弱。

### D. Organic Awareness

**一句话感觉：** 流动、柔和，用克制 motion 表达记录之间产生联系。

- 参考链接:
  1. [Magic UI dot-pattern with glow](https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/example/dot-pattern-with-glow-effect.tsx) - "点 + 微光"直接可参考
  1. [Magic UI particles](https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/particles.tsx) - 有机呼吸感（产品内 Quantity/速度要降到最低）
  1. [Magic UI border-beam](https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/border-beam.tsx) - 边界微光（可选）
- 有机方向风险: 粒子/光晕/有机 motion 过量会变成"AI 生成感"或玄学感。

## 13. 建议进入产品 vs 品牌视觉

### 进入产品

- Semantic tokens 双主题取值（见 2.3）：Dark Deep Amber + Light Warm Paper，默认跟随系统。
- Motion tokens + reduced-motion 三层 fallback。
- Record saved: Variant A Settle 或 C Breath（一次性微光）。
- Observation appears: Variant A Surface 或 C Constellation。
- Reflection priority: Variant A Recede 或 B Focus Ring。
- Exploration: Provenance reveal + timeline connection。
- Navigation: crossfade + subtle layout continuity。
- Magic UI 的 `dot-pattern` / `ripple` / `orbiting-circles` 作为设计参考；正式 UI 用简化自研 SVG/CSS。

### 品牌视觉（官网/README/Splash/Empty State illustration）

- 概念图的大范围辉光、宏大空间、琥珀轨道。
- Magic UI 的 `particles`（但 Quantity 极少）、`meteors`、`aurora-text`、`meteors`、`shiny-button` 等 demo 效果。
- 大面积 `glow.ambient`。

### 禁止进入产品

- Black & Gold luxury style。
- 高饱和金色/金属渐变/大面积 glow。
- 霓虹、大面积粒子、持续运动背景、3D 网络、知识图谱炫技。
- 游戏化反馈（badge/XP/level-up）。

## 14. 技术风险

| 风险 | 说明 | 缓解 |
|------|------|------|
| Tailwind 引入 | Magic UI / motion-primitives / shadcn 都依赖 Tailwind，见渊不是 Tailwind 项目 | 只 copy 组件到 visual-lab，剥离 Tailwind；正式产品用自己的 CSS tokens |
| Motion bundle size | Motion 全量引入增加 bundle | 按需 `import { motion, AnimatePresence } from 'motion/react'`；不引入 Lottie |
| WebView2/Tauri 兼容 | WebView2 152 supports modern CSS/motion | prototype 先在 Tauri dev 验证；重点测试 canvas/blur |
| 深色对比度 | 深色 + 低饱和琥珀可能低于 WCAG AA | 每个 token 在实际背景上测对比度；正文用骨白 |
| reduced-motion | 缺失会让 "安静" 变 "静止" 的反面 | MotionConfig + CSS fallback 双保险 |
| 概念图 vs 产品 | 概念图炫、产品要日常耐看 | 品牌 glow 只在品牌视觉；产品 UI 降 1-2 级强度 |
| Light 主题对比度 | 低饱和琥珀在浅背景上对比度可能不足（按钮/链接不可读） | accent 在 Light 下降低明度提高对比（如 #a8814e）；每个 token 在实际背景上测 WCAG AA |
| Theme Pair 不同源 | 两套主题各自演变，慢慢失去"同一世界"的感觉 | 组件只读 semantic tokens；禁止在组件内硬编码颜色；主题 board 成对评审 |

## 15. 下一步 prototype 建议

### Visual / Motion Lab

在 `apps/desktop/visual-lab/`（非生产，不接入正式路由）做 3 个场景 × 3 个 Variant，并按 2.4 节渲染 Theme Pair 的核心屏幕：

| 场景 | Variant A | Variant B | Variant C |
|------|-----------|-----------|明确 a11y/prefers-reduced-motion fallback。

### 执行顺序

1. 确认 Visual Direction（A/B/C/D 或组合）+ Theme Pair（A/B/C）。两者独立选择。等用户选择后开始。
2. 确认 3 个场景的 Variant 组合。
3. 建 visual-lab，只渲染这 3 个场景 × 3 个 Variant。
4. 用户在 visual-lab 里选择最终 motion + Theme Pair，然后才进入正式产品实现。

## 16. 值得先看的 5-10 个 motion reference

1. [Magic UI ripple](https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/ripple.tsx) - 圆环/涟漪，North Star 直接相关
1. [Magic UI dot-pattern with glow](https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/example/dot-pattern-with-glow-effect.tsx) - "点 + 微光"
1. [Magic UI orbiting-circles](https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/orbiting-circles.tsx) - 稳定轨道 / 长期联系
1. [Magic UI particles](https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/particles.tsx) - 有机点呼吸感（产品内要大幅降级）
1. [Magic UI animated-beam](https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/animated-beam.tsx) - 记录之间的联系线
1. [Magic UI border-beam](https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/border-beam.tsx) - 边界光晕（如果做稳定轨道的边界）
1. [Motion useReducedMotion](https://motion.dev/docs/react-use-reduced-motion) - reduced-motion 执行
1. [AutoAnimate list demo](https://auto-animate.formkit.com/examples/react#list) - 列表插入/删除
1. [motion-primitives animated-group](https://motion-primitives.com/docs/components/animated-group) - stagger 节奏参考
1. [sonner toast](https://github.com/emilkowalski/sonner) - toast 的安静处理参考

> Note: 少数链接在研究时 rate-limited (HTTP 429) 或路径可能变。请以 GitHub 分支当前状态为准。

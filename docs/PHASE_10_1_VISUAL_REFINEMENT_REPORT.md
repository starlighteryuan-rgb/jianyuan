# 见渊 Phase 10.1 · Visual Refinement Report

STATUS: completed (research artifact only)

## 0. 范围声明

本轮是 visual-lab 静态视觉精修，不是产品实现。

- 修改文件：仅 `apps/desktop/visual-lab/theme-boards/board.html`（Phase 10 研究用视觉稿模板），本轮水波语言修正同样只改这一个文件
- 未修改：`apps/desktop/src/**`、`src/**`、`tests/**`、Core、Storage、Provider、SQLite、Phase 9 IA
- 未重新构建 native exe（本轮不涉及产品代码，exe 保持 Phase 9 产物：SHA256 `c62a2fe6d3135a99efb63f1d504ca58f4f606e96abf690f8e1a258a814566752`，2026-09-15 01:41）
- 未安装任何 npm 依赖，未改 package.json
- 未 Git commit

用户消息中提到的"附件截图"未实际送达本会话（无图片、无 pasted-text）。精修基线为上一轮 Pair A board 的 dark/light 两列，它是仓库中唯一的 Deep Amber / Warm Paper 实现。若附件另有指向，请重发后我再对照修正。

## 1. 本轮实际修改的文件

| 文件 | 性质 |
|------|------|
| `apps/desktop/visual-lab/theme-boards/board.html` | 唯一被修改的设计稿文件 |
| `apps/desktop/visual-lab/theme-boards/out/theme-board-{A,B,C}.png` | 重新生成的整板 |
| `apps/desktop/visual-lab/theme-boards/out/crops/*.png` | 重新生成的分屏裁切（13 区域 × 3 组） |
| `apps/desktop/visual-lab/theme-boards/out/wave-panel-{dark,light}.png` | 波动语言细节板 |
| `apps/desktop/visual-lab/theme-boards/out/brand-mark-sizes.png` | 品牌 Mark 16–40px 尺寸测试 |
| `apps/desktop/scripts/*.mjs` | 验证/审计/渲染辅助脚本（研究工具，非产品代码） |
| `docs/PHASE_10_1_VISUAL_REFINEMENT_REPORT.md` | 本报告 |

## 2. 四个精修重点的落地情况

### 2.1 Dark 主正文"去金色化"

- `--text-primary` 从 `#ece5d8`（明显米黄）改为 `#e9e6e0`（近中性骨白）；`--text-secondary` `#a9a092` → `#a8a49b`；`--text-muted` → `#87837c`。正文与次级文字不再泛金。
- 琥珀现在只出现在：活跃导航条与状态点、"已被回看"记录点、分隔/轨迹线、卡片沉降角轮廓、CTA、focus 环、极弱背景涟漪。
- 背景涟漪层（`repeating-radial-gradient` 同心圆）本身是新增的空间结构，opacity 经 `--wave-ring` 控制在 0.055–0.085，且用 mask 避开阅读列；它承担"暖光"的角色，正文不再需要靠颜色变暖。
- 目标感觉核对：安静、克制、可长读，有一点暖光，无 luxury 感。

### 2.2 主按钮收敛

- 新增独立 token `--accent-cta`：Dark `#b98b4f`（比 `--accent-primary` `#d4a464` 暗一档），Light `#7d5e33`。按钮填充不再用最亮的琥珀。
- 实测渲染值：Dark 按钮 `rgb(185,139,79)`，Light 按钮 `rgb(125,94,51)`。
- hover 提亮到 `--accent-primary`，active 回到 cta 色，focus-visible 用 2px accent 环；ghost 按钮边框降为 `--border-subtle`，hover 只升边框与文字，不填充。
- "这不是我的体验"从 ghost 降为新的 `quiet-ai` 档：透明底、muted 文字、hair 边框——AI 相关的否定操作永远比用户自己的动作轻一级。

### 2.3 Light "Warm Paper" 增强

- 背景不再近白：canvas `#f7f4ed` → `#f5f1e8`，surface `#fffdf8` → `#fdfbf5`，elevated `#ffffff` → `#fffcf6`（全板不再有纯白）。
- 新增 `--bg-sunken`（Dark `#121110` / Light `#efe9dc`）：书写区（记录 composer、搜索框）从"白卡片浮起"改为"纸面凹陷"，配 `inset 0 1px 2px rgba(0,0,0,var(--well-shadow))`（Light 仅 0.035，暗部极轻）。
- 边框整体加深半档（`--border-subtle` `#e2dacb` 等），纸的层级靠色温与明度台阶建立，没有纹理、没有拟物。
- Light 涟漪层不用 glow，只用铜棕同心线（`--wave-ring` rgba(139,105,58,0.085)），与 Dark 同一几何。

### 2.4 AI 视觉权重再降

- Observation 卡：从 surface 降到 sunken 表面，边框降为 hair；内边距收窄（26/28 → 22/26）；glow 从 0.10 降到 0.055。
- AI 标签系统全部缩小减重：`obs-kind` 11→10px + opacity .8；`临时观察` pill 11→10.5px + hair 边框；段落小标题 `obs-part h4` 11→10px、weight 500→400、opacity .85；卡内 AI 正文 13.5→13px。
- 卡内唯一保持强度的是"相关记录"引用（用户原话，14px 衬线全亮）——AI 的话在变轻，用户的话没有。
- "一个可以继续思考的问题"从 elevated 亮块降为 surface + 左细线 + secondary 色：它是 AI 递给用户的钩子，不该比用户即将写下的文字更亮。
- Reflection Focus：AI 块整体再降（padding 收窄、sunken 底、左边框降为 subtle），用户块升为全板唯一 elevated 亮面 + `--reflection-focus` 左边框 + 光标。"AI 退后、用户上前"在静态图上成立。
- 探索页：每条长期联系新增 `经你参与后形成` mono 小标（参与感优先于"AI 发现了"），provenance chips 与时间跨度弧线维持克制。

## 3. 附加修正（本轮发现的真实缺陷）

1. **caret 渲染 bug**：原稿把 `<span class="caret">` 写在 `<textarea>` 内部；textarea 内容是纯文本，span 不渲染且其标记会作为字面文字泄漏。已改为 `<p class="focus-user-text">` + 独立 caret span。DOM 断言确认：caret 元素 2 个、均不在 textarea 内、文本尾部无 `时刻时刻` 类重复。
2. **`--shadow-seg: none` 使 Dark 分段控件选中态整条 box-shadow 失效**（`none` 不能作为逗号列表项）。已改为自包含 inset 描边并删除该 token。
3. **对比度回归**：token 调整后复审发现 6 项低于 4.5（muted 文字在 surface/sunken 上、Light accent on canvas）。按"三种背景中最差值 ≥ 4.5"重新求解并写回，最终 6 套 token × 13 项检查全部 PASS（见 §5）。
4. **设置页分段控件两列状态不自洽**（上一轮已修，本轮回归确认）：Dark 列选中"深色"、Light 列选中"浅色"。

## 4. 品牌 Mark（本轮新增需求）

- 母版：`apps/desktop/src-tauri/icons/app-icon.svg`（同心圆环 + 中心实心点）。按"中心点/垂直轴/同心圆/向内观察"的概念提炼 Small Brand Mark，未直接缩小概念图。
- 几何：32 单位 viewBox，外环 r9.2（1.6 stroke, opacity .9）+ 内环 r4.6（1.1 stroke, opacity .5）+ 垂直轴（1.1 stroke, opacity .45）+ 中心实心点 r2.1。单一几何，Dark/Light 仅换 currentColor（`--accent-primary`：Dark `#d4a464` / Light `#8a683a`）。
- 小尺寸 optical simplification：<24px 时轴 opacity 降至 .30、内环降至 .40、中心点增大到 r2.5，防止糊成一团。
- 实测 16/20/24/28/32/40px 双主题渲染（`out/brand-mark-sizes.png`，3x 设备像素）：全部清晰，导航 lockup（28px + 衬线"见渊"）成立。
- 已替换 board 内全部 10 处旧 square-dot mark（DOM 断言：`brandSvgCount 10 / brandOldDotCount 0`，外框 border 已移除）。
- 复用评估（供后续决策，本轮不实施）：同一 SVG 母版可生成 Windows app icon / exe icon / installer icon / favicon / GitHub product icon。现有 `icon.ico` 仍是旧绿色圆环版；替换属于品牌资产决策 + 需要重新 native build，等你确认 Mark 定稿后单独做。小尺寸（16px favicon）建议用 optical simplified 变体，24px+ 用标准变体。

## 5A. 水波语言进入实际页面（本轮补充修正）

上一版把"点/圈/线/曲线"只放在 A-10 规范板上，实际页面背景用的是 `repeating-radial-gradient` 密集同心网格——那正是被否决的地形图/参数网格感。本轮把水波语言真正落进页面，并删掉密集网格。

### 每页的水波分配

| 屏幕 | 水波处理 | 语义 |
|------|---------|------|
| 记录 | **无背景弧线**；仅"已被回看"的记录点带一道定形环（`.rec-ring`，22px，`--accent-soft-strong`） | 最克制。保存/回看用局部涟漪表达，背景不出现水波 |
| 觉察 | 两道同心大圆环（600px / 860px），共圆心于左上，从观察浮现处向外沉降 | "这些记录之间浮现出一个值得回看的可能性" |
| 理解 | 两道曲线自上方分离、向下汇入阅读列（`M120 -20 C 300 160, 330 380, 215 620` 与 `M700 -20 C 560 180, 420 380, 265 620`） | AI 观察沉入用户自己的理解：沉入 / 收束 / 回到自己 |
| 探索 | 背景两道长跨度浅流；关系轴由直线改为对称 S 曲线；时间跨度由直线改为下凹弧 | 长期经验在时间中的延续与交汇 |
| 设置 | 无弧线 | 工具区，不承担叙事 |

### 关键实现决定

1. **涟漪必须是真圆**。首版用 SVG `ellipse` + `preserveAspectRatio="none"`，会把圆拉成椭圆——被拉伸的"同心涟漪"不再是涟漪。改为固定像素 CSS 圆环（`.wave-ring`），实测 `ringSizes: 600x600, 860x860`，`ringsAreCircles: true`。
2. **理解页 mask 从"抹除"改为"压暗"**。首版 mask 是 `transparent 0% → black 55%`，而阅读列约占左侧 71%，等于把两条曲线的汇合点整段遮没——正好藏掉唯一承载语义的部分。改为 `rgba(0,0,0,0.32) 0% → 0.5 46% → black 78%`，文字区压暗但仍可感，汇合点保留。
3. **A-10 规范板与实际页面统一**。规范板当时仍在演示已被否决的密集网格，等于文档在教一套产品不用的语言。已改为同一套稀疏大跨度弧线（每个原点两圈、间距 132/208px）。实测全板 `repeatingRadialMeshLeft: 0`。
4. **rail 曲线曲率实测后修正**。首版 rail 路径在 100px 高度上最大偏移仅 **0.98px**（约 0.56°），视觉与直线不可区分——属于"感觉不到"，不符合"感觉得到但不首先注意到"的标准。加宽视框到 24px 并把振幅提到 **2.58px**，与时间跨度的 4px/150px 同为约 1.5°，两条曲线读作同一族。rail 保持对称 S：两端必须精确接住居中的 orbit 节点，单向弓形会脱节。

### 实测数据（DOM / 路径几何）

| 项目 | Dark | Light |
|------|------|-------|
| 涟漪尺寸 | 600×600 / 860×860 | 同 |
| 探索流线 `d` | `M-40 150 C 240 90, 620 230, 1040 140` | 同 |
| rail 最大偏移 | 2.58px（25%→14.58, 75%→9.42） | 同 |
| span 下凹 | 4px（y 3→6→7→6→3） | 同 |
| 描边 token | `--wave-stroke-a` rgba(212,164,100,0.17) / `-b` 0.095 | rgba(140,106,74,0.22) / 0.13 |
| 微光 | `drop-shadow(0 0 6px rgba(212,164,100,0.05))` | `filter: none` |

`geometryIdentical: true` —— Light 与 Dark 使用完全相同的曲线几何，只换描边 token；Light 不使用任何 glow。

被回看记录才带环：`seenRecords: 4 / recRings: 4 / unseenWithRing: 0`。

### 产物

- 单列全分辨率（2x）：`out/water/{A,B,C}-{records,awareness,reflection,exploration,settings}-{dark,light}.png`，共 30 张，同屏双主题尺寸逐一致（1132×951 / 938 / 560 / 678 / 866）
- 整板与分屏裁切同步重渲染，几何未偏移（13 区域坐标与上一版完全一致）

## 5. 波动语言（"渊"意象，静态稿）

- 记号系统固定为四件套，双主题同一几何：**点**（一段经历）、**圈**（一次回看，双环已定形不流动）、**线**（时间延续，1px 低对比）、**曲线**（向内沉降：探索页时间跨度下凹弧 + 卡片 26px 沉降角）。
- 页面背景涟漪按空间分级（DOM 实测 `--wave-strength`）：记录 0.34（最克制）、觉察 0.72、理解 0.58、探索 0.86、设置 0.18。双原点（右上/左下）同心圆，mask 避开阅读列。
- 明确不做：蓝色海浪、液体特效、水纹贴图、夸张流光、冥想/玄学视觉、持续循环背景动画。
- Motion Intent 已在细节板上**只记录不实现**（保存记录涟漪定形 420ms、Observation 浮现 520ms + 70ms stagger、页面切换 crossfade 240ms + 6px drift、hover/focus 160ms 边界扩散），全部标注 prefers-reduced-motion fallback。等静态确认后进 Motion Lab 做 A/B/C 比较。

## 6. 更新后截图

Dark 五屏 + Light 对照（裁切自同一渲染，路径均在 `apps/desktop/visual-lab/theme-boards/out/crops/`）：

| 屏幕 | Dark | Light |
|------|------|-------|
| 记录（含导航） | `A-01-Navigation-Record-.png` 左列 | 同图右列 |
| 觉察 | `A-02-Awareness-.png` 左列 | 同图右列 |
| 理解 | `A-03-Understanding-.png` 左列 | 同图右列 |
| 探索 | `A-04-Exploration-.png` 左列 | 同图右列 |
| 设置 | `A-05-Settings-.png` 左列 | 同图右列 |
| Observation Card + Reflection Focus | `A-06-...png` 左列 | 同图右列 |
| 波动语言细节板 | `out/wave-panel-dark.png` | `out/wave-panel-light.png` |
| 五屏单列全分辨率（2x） | `out/water/A-{records,awareness,reflection,exploration,settings}-dark.png` | 同名 `-light.png` |
| 探索曲线局部放大 | `out/water/zoom-darkSpanRow1.png` 等 | `out/water/zoom-lightSpanRow1.png` |
| 品牌 Mark 尺寸测试 | `out/brand-mark-sizes.png`（双主题） | |

整板：`out/theme-board-{A,B,C}.png`（2400×8138，B/C 同步获得全部 token/结构修正以保持三组可比）。

几何一致性实测：五屏 × 双列的 mainTop / mainHeight / headTop / headHeight / childCount 完全相同——Dark 与 Light 仍是同一 DOM、同一布局，只有 token 值不同。

## 7. 运行验证结果

| 项目 | 结果 |
|------|------|
| tests（根项目 vitest） | **47 文件 / 856 测试全部通过**（4.30s） |
| typecheck（tsc --noEmit） | **通过，无错误** |
| web build（next build） | **通过**，5 静态页 + Phase 9 全路由，First Load JS 103–108 kB |
| desktop build（npm run build） | **通过**：prepare-node-runtime + vite renderer（19 modules）+ esbuild runtime（156.2kb） |
| git diff --check | **exit 0**，仅既有 LF/CRLF 提示（与 Phase 9.6 基线一致） |
| WCAG 对比度（6 套 token × 13 检查） | **0 项低于阈值**（正文/次级/muted/accent/CTA 全部 ≥4.5，CTA 填充对背景 ≥3） |
| DOM 断言（caret/brand/wave/cta/contour/participation/detail board） | **11 组全部通过** |

注：desktop build 是 renderer/runtime build；未重新执行 Tauri native build（本轮无产品代码变更，无需重建 exe）。

## 8. 遗留与下一步

1. 等你评审三组 board（重点 Pair A）后确认：Theme Pair、页面结构、typography、色彩、卡片表面、导航、Observation/Reflection 层级。
2. 品牌 Mark 定稿后：替换 `icon.ico` / 生成 favicon / installer 图标属于单独的品牌资产任务（需要 native rebuild），不与视觉评审混做。
3. 静态确认后进入 Motion Lab：Record Saved / Observation Appears / Reflection Takes Priority / Navigation Transition 各做 A/B/C variants，含 reduced-motion fallback。
4. 若你能重发那条带截图的消息，我可以对照你的截图再做一轮定向核对。

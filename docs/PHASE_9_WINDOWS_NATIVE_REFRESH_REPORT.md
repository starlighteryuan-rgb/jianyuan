# 见渊 Phase 9 · Windows Native Executable Refresh Report

STATUS: completed

## 结论

Phase 9 分层 UI 现已进入最新 Windows native executable。旧 exe 确认为 stale（早于 9/15 renderer 构建），本次已真实执行 Tauri release build 并重新生成了 exe。

## 原 exe 是否 stale

**是。**

原 exe 信息（本次重建之前记录）：

- 路径：`apps/desktop/src-tauri/target/release/jianyuan-desktop.exe`
- Modified：2026-09-14 17:34:59
- Size：10,380,288 bytes
- SHA256：`80f8b113b516d3a3c5d9ed995d325c3bab5b8f43e70881d2ce83c1c94cf6e3a1`

Desktop renderer 源码最后修改时间为 2026-09-15 01:14（`App.tsx`），renderer 构建输出为 2026-09-15 01:15。原 exe 早于这两者，确认 stale。

## 新 exe 信息（本次构建产物）

- 路径：`apps/desktop/src-tauri/target/release/jianyuan-desktop.exe`
- Modified：2026-09-15 01:41:42
- Size：10,383,360 bytes
- SHA256：`c62a2fe6d3135a99efb63f1d504ca58f4f606e96abf690f8e1a258a814566752`

## Renderer 输出位置

- `apps/desktop/dist/index.html`（2026-09-15 01:40）
- `apps/desktop/dist/assets/index-GFkmYFyM.js`（2026-09-15 01:40，206,255 bytes）
- `apps/desktop/dist/assets/index-DmG8PIxN.css`（2026-09-15 01:40，4,779 bytes）

## Tauri frontendDist

`apps/desktop/src-tauri/tauri.conf.json` 中配置为 `"frontendDist": "../dist"`。

## 实际构建链

1. Desktop source（`App.tsx` 等）→
2. `npm run build:renderer`（vite build）→ `apps/desktop/dist/` →
3. `npm run build:runtime`（esbuild bundle `runtime/server.ts`）→ `apps/desktop/runtime-dist/server.mjs` →
4. `npm run prepare:node-runtime`（copy node.exe → `runtime-dist/node.exe`）→
5. Tauri CLI `beforeBuildCommand: "npm run build"`（重复执行 2-4）→
6. `frontendDist: "../dist"` → Tauri 通过 `generate_context!()` 在编译期内嵌 dist 资产 →
7. `bundle.resources` 将 `runtime-dist/server.mjs` + `node.exe` 放入 resource_dir →
8. Cargo 编译 → `apps/desktop/src-tauri/target/release/jianyuan-desktop.exe`

## 是否真实执行 native build

**是。**

本次会话实测发现：

- `~/.cargo/bin/cargo.exe` / `rustc.exe` 是 0 字节坏代理（Phase 9.6 报告记录"无 cargo"的原因）。
- 但 `~/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/` 内有完整 cargo 1.97.1 / rustc 1.97.1。
- 系统安装了 Visual Studio 18 Community（MSVC 14.51），rustc 链接测试成功。
- 构建日志显示：`Compiling jianyuan-desktop v0.1.0` → `Finished release profile [optimized] target(s) in 42.54s` → `Built application at: ...jianyuan-desktop.exe`。

## 内嵌验证

通过二进制搜索确认新 exe 内嵌了当前 renderer 资产：

- exe 中包含资产键 `index-GFkmYFyM.js`（1 次匹配，与 9/15 dist 一致）。
- 当前 dist JS 包含全部五个 Phase 9 导航空间标签：记录 / 觉察 / 理解 / 探索 / 设置。
- exe 中不包含明文 `DESKTOP_SPACES`（已被 minify + brotli 压缩，符合预期）。

## Runtime resources

Tauri `--no-bundle` 模式下 resource_dir 为 exe 同级目录：

- `target/release/runtime-dist/server.mjs`：2026-09-15 01:40（跟随本次构建刷新）
- `target/release/runtime-dist/node.exe`：2026-06-23 14:21（copy 保留了源 mtime，非 stale）

`lib.rs` 运行时解析优先 `resource_dir()/runtime-dist/server.mjs`，因此新 exe 加载的是 9/15 的 server.mjs。

## Native UI 实际验证

**可视验证方式说明：** 本次托管环境没有交互式桌面，无法对 native 窗口 `CopyFromScreen` 截图。但新 exe 已验证可以启动并创建主窗口（`Responding=True`），且其内嵌资产（`index-GFkmYFyM.js`）与下面的 headless Chrome 渲染结果完全一致。

使用 CDP 驱动 headless Chrome 渲染编译进 exe 的同一份 dist，逐个点击侧边栏导航并截图：

| 空间 | active-space | 可见分区 | 首个标题 |
|------|-------------|---------|---------|
| 记录 | `records` | `["records"]` | 记录 |
| 觉察 | `awareness` | `["awareness"]` | 观察与回看 |
| 理解 | `reflection` | `["reflection"]` | 你的理解 |
| 探索 | `exploration` | `["exploration"]` | 长期联系 |
| 设置 | `settings` | `["settings","settings","settings"]` | 本地运行状态 |

CSS 门控确认每个空间只显示对应分区，不再堆叠。设置层承载 AI 服务、本地运行状态和导出与恢复。

截图位于 `apps/desktop/scripts/probe-out/shots/space-01-records.png` 至 `space-05-settings.png`。

## 未修改的内容

- Core / SQLite schema / Provider contract / Phase 8 AI semantics / Phase 9 IA
- 业务代码 / 产品逻辑 / UI 结构

本次仅新增 `apps/desktop/scripts/` 下的构建/验证辅助脚本和本报告文件。

# 见渊 Phase 7.2：Desktop Native Runtime Functional Closure

验证日期：2026-09-14

## 结论

本轮完成了 Desktop native runtime 的启动诊断、打包 Node runtime、路径修复和可观察性
补强。此前受 Codex managed environment 限制的真实 AppData 业务闭环，已由真实用户
Windows 会话完成最终验证。Windows release exe 能启动 Tauri 窗口，能找到随应用发布
的 `node.exe` 和 `server.mjs`，并且 sidecar 已在真实用户会话中正常运行。

```text
Error: unable to open database file
code: 'ERR_SQLITE_ERROR'
errstr: 'unable to open database file'
```

上面的错误是此前 Codex managed execution environment 对真实用户 AppData 目录的访问
限制；不是 SQLite schema、Core 或 AI Provider contract 的错误。该限制不代表真实用户
桌面运行失败；真实用户会话现已完成 Tauri GUI 中的 Record、Reflection restart 和
Windows Credential Manager 往返验证。

在不使用生产 AppData 的隔离目录中，打包后的 Node sidecar 已完成 Record/SQLite 重启
持久化和 fake AI Provider smoke；真实用户会话进一步确认了真实 AppData 下的 SQLite
创建、Record/Reflection restart persistence、sidecar 启动和 validation cleanup。
现有 DesktopRuntime 测试也覆盖了 Relation、Discovery、Reflection 和重启读回。

本轮没有修改 Core 语义、SQLite schema 或 AI Provider contract，没有执行 Git commit。

真实用户 Windows 会话最终 verify：`sqliteOpened: true`、`recordRecoveredAfterRestart: true`、
`reflectionRecoveredAfterRestart: true`、`credentialRestartRead: true`、
`credentialDelete: true`、`credentialMissingAfterDelete: true`、`sidecarStarted: true`、
`cleanupCompleted: true`、`errors: []`。人工创建的 Record“我似乎总在成功前掉链子”在
完全退出并重启后仍可从 History 读取。

## 1. sidecar 原始失败原因

原始实现的启动链路存在三个可观察失败点：

1. Rust host 在 `spawn` 之前直接传播 `SecretStore.get()` 错误。当前 Codex shell 的
   Windows 凭据会话写入探针返回 `ERROR_NO_SUCH_LOGON_SESSION (1312)`；因此该环境中
   SecretStore 错误可以在 sidecar 启动前结束 setup，造成“没有端口、没有 SQLite”。
2. no-bundle release 的资源路径可能带 Windows extended prefix `\\?\\D:\\...`。Node 24
   在该参数形态下报 `EISDIR: illegal operation on a directory, lstat 'D:'`。
3. 关闭 stderr 后，Node 初始化错误只能表现为 child exit code 1，难以定位。

本轮已逐项处理：SecretStore 读取失败记录为 `secret_read_failed` 并进入无 key 的
degraded mode；release 资源增加 exe 邻接 fallback；传给 Node 的资源路径移除
`\\?\\` 前缀；sidecar stderr 仅记录受控启动错误，敏感 marker 会写成 `redacted`。

路径修复后的最新 release 日志为：

```text
runtime_spawn_prepare node=D:\Hackson\project build\apps\desktop\src-tauri\target\release\runtime-dist\node.exe
runtime_spawned
runtime_stderr Error: unable to open database file
runtime_exited_early status=exit code: 1
```

因此当前 native 失败点已经从“找不到/错误启动 sidecar”收敛到“sidecar 能启动，但
受限环境不能打开真实 AppData 数据库”。

## 2. Node dependency 解决方案

选择了当前架构下最小的 packaged sidecar 方案，没有重写 Core 或 Application：

- `apps/desktop/scripts/prepare-node-runtime.mjs` 使用构建机的 `process.execPath`；
- Windows 构建复制为 `apps/desktop/runtime-dist/node.exe`；
- `tauri.conf.json` 将 `runtime-dist/node.exe` 和 `runtime-dist/server.mjs` 作为资源；
- Rust host 在 release 中只使用随应用资源的 Node executable；开发模式才允许 `node`
  PATH fallback。

最新 release 资源：

```text
target/release/jianyuan-desktop.exe                  10,348,032 bytes
target/release/runtime-dist/node.exe                 92,534,088 bytes
target/release/runtime-dist/server.mjs                  138,947 bytes
```

因此当前 no-bundle release executable 不再要求用户预装系统 Node。`bundle.active` 仍为
`false`，本轮没有扩大到 installer packaging；正式安装包需要单独启用并在干净 Windows
用户环境中验证资源复制。

## 3. packaged runtime 结构

```text
Tauri WebView
  -> Tauri Rust host
     -> bundled runtime-dist/node.exe
        -> runtime-dist/server.mjs
           -> Desktop Composition Root
              -> packages/core
              -> packages/storage/sqlite
              -> packages/providers/ai
```

React renderer 只通过窄 Tauri command 获取随机 bearer-authenticated localhost runtime
连接；没有直接调用 SQLite，也没有直接调用 OpenAI HTTP API。

## 4. SQLite 实际路径

Rust host 使用：

```text
app.path().app_local_data_dir()
  -> jianyuan.sqlite
```

native release 启动诊断记录的实际路径为：

```text
C:\Users\26067\AppData\Local\com.jianyuan.desktop
```

该目录不是项目目录、开发服务器目录或测试目录。此前 Codex managed shell 对该目录
枚举和写入返回 Access denied，并可复现 `ERR_SQLITE_ERROR / errcode 14 / unable to open
database file`；真实用户会话已确认同一路径可打开并创建 SQLite，未使用测试目录冒充
native AppData 结果。

## 5. Record restart persistence

| 验证层 | 结果 |
| --- | --- |
| DesktopRuntime 自动化（SQLite + Core） | PASS；Capture 后关闭并重建 runtime 可读回 Records |
| 打包 Node sidecar 隔离目录 | PASS；两条 Record 经 `shutdown`、同目录重启后完整读回 |
| Windows Tauri exe + 真实 AppData | PASS；真实用户会话创建并重启读回成功 |

## 6. Reflection restart persistence

DesktopRuntime 自动化已通过 Relation → Discovery → Reflection invitation → Reflection
response，并在关闭后重建 runtime 读回 Reflection 内容。

真实用户 Windows Tauri 会话已完成 Reflection 写入、完全退出、重新启动和读回；最终
`reflectionRecoveredAfterRestart: true`。因此 native Reflection restart 为 **PASS**。

## 7. Windows Credential Manager

实现仍为 Tauri Rust host 的 `SystemSecretStore`（Windows Credential Manager，keyring
entry persistence=`local`）。代码路径不把 API key 写入 SQLite、`ai-provider.json`、
localStorage、源码或诊断日志；普通配置文件只保存 provider ID、Base URL 和 model ID。

此前 Codex shell 的探针证据：

- 只读 `CredReadW` 对目标 entry 返回 Win32 `1168`（不存在）；
- 使用测试 secret 的 `CredWriteW` 在当前 Codex shell 返回 `1312`，未留下凭据；
- CUA 当前状态没有 native app surface（`apps: []`），无法在真实交互式 GUI 会话中点击
  write → read → restart → read → delete → missing。

因此不能把 shell 的 1312 误写为 Credential Manager 实现错误。真实用户 Windows GUI
会话现已完成测试 secret 的 write → read → restart read → delete → missing，最终
`credentialRestartRead`、`credentialDelete`、`credentialMissingAfterDelete` 均为
`true`，native Credential Manager round-trip 为 **PASS**。

API key 在 sidecar 启动时通过进程环境传入，当前不会落盘；这是后续生产 hardening 的
进程环境暴露面，不改变本轮“未进入普通文件/SQLite/日志”的结论。

## 8. AI runtime smoke

使用 fake OpenAI-compatible HTTP provider（无真实 API key、无公网成功声明）验证打包
sidecar：

```text
Base URL -> test key -> /v1/models -> fake model discovery
                                  -> model selection
                                  -> test connection = connected
```

结果：`upstream` discovery、缓存命中、model selection 和 connection 状态均 PASS。
未配置或 SecretStore 不可用时，runtime 保持 `unconfigured`/`unavailable` 并允许
Capture、历史、搜索、Export、Restore；新的 AI assistance 会失败而不会阻止本地记录。

本次用户 verify 未调用真实模型 API，因此 native GUI AI smoke 未单独计入最终 PASS；
既有 fake provider discovery/selection smoke 仍为 PASS。

## 9. 最小启动诊断

Rust host 现在写入 `runtime-diagnostics.log`（AppData 可写时）并在无法写入时 fallback
到 `%TEMP%\\jianyuan-desktop-runtime.log`，覆盖：

- `runtime_start` 和 AppData path；
- resource/node/script 选择；
- `runtime_spawned` / `runtime_spawn_failed`；
- `runtime_alive_after_start_check` 或 early exit；
- 受控 stderr 错误；
- `runtime_stopped`。

诊断不记录 API key、Bearer token、Record 正文、Reflection 内容或 secret。当前 fallback
日志已经捕获到 `unable to open database file`，不再是静默 child exit。

## 10. SQLite encryption 状态

状态仍为 **明文，`deviceLevelVerified: false`**。本轮没有把 AppData 位置称为加密，
没有为了 SQLCipher 扩大范围，现有 encryption seam 保持可用。正式方案仍需独立验证
固定版本 SQLCipher/custom Node runtime，包括错误 key、文件 header/WAL、重启、备份恢复
和升级迁移测试。

## 11. Build 状态

- Windows SDK 10.0.19041.0、MSVC v142、`kernel32.lib`、`ucrt.lib`：PASS（Phase 7.1 已解除）；
- `cargo check --offline`：PASS（显式 VS 2019 环境、项目本地 Cargo cache、实际 Rust
  toolchain bin）；
- `cargo fmt --check`：PASS；
- `tauri build --no-bundle`：PASS，生成上述 exe；
- release exe 启动：PASS（Tauri/WebView 窗口进程出现）；sidecar 资源启动及数据库初始化：
  PASS（真实用户会话）；

## 12. Tests

- Desktop typecheck：PASS；
- Desktop tests：PASS（1 file / 1 test）；
- Core、Storage、Provider 及全量 tests：PASS（46 files / 815 tests）；
- root `npm run typecheck`：PASS；
- root `npm run build`（Web build）：PASS；
- `git diff --check`：PASS（仅既有 LF/CRLF conversion warnings）；
- packaged sidecar Record restart：PASS（隔离目录）；
- packaged fake AI discovery/selection：PASS；
- native Record restart：PASS（真实用户会话）；
- native Reflection restart：PASS（真实用户会话）；
- native Credential Manager round-trip：PASS（真实用户会话）；
- validation cleanup：PASS（`cleanupCompleted: true`、`errors: []`）。

## 13. Remaining blocking issues / next step

真实用户会话已经解除此前的 native 业务闭环阻塞：SQLite、Record/Reflection restart、
sidecar 启动和 Credential Manager validation 均为 PASS，未发现剩余的 Phase 7 native
runtime blocking issue。

仍保留为后续独立工作的事项：正式 installer packaging 尚未启用/验证，SQLite 设备级
加密尚未完成，Rust 的 0 字节 cargo/rustc proxy 仍需在普通开发 shell 中修复。这些不
改变 release exe 已携带 Node runtime、且没有修改 Core/Storage/Provider contract 的
结论。

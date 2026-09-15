# 见渊 Phase 7：Desktop Runtime Spike 报告

日期：2026-09-14

## 结论

Phase 7 已建立 `apps/desktop`，并证明现有 Core、SQLite adapter、AI Provider
可以在独立 Desktop Composition Root 中共同运行。React renderer、Node runtime
bundle、Desktop 自动化测试、真实 sidecar 进程、SQLite 关闭/重启持久化均已验证。

但本次结果是 **PARTIAL / NATIVE BUILD BLOCKED**，不能表述为 Windows 桌面应用已经
完整构建或启动。当前机器缺少可用的 Windows SDK：Rust linker 最终报
`LNK1181: 无法打开输入文件 kernel32.lib`。因此以下两项仍未完成实际设备验证：

- Tauri 原生窗口启动与关闭；
- Windows Credential Manager 的真实 set/get/delete 往返。

数据库加密也没有完成。`AppData` 只是正确的存储位置，不等于加密。

本阶段没有修改 Core 语义、AI Provider 基本 contract 或 SQLite schema，也没有创建
第二套 Domain/Application，没有执行 Git commit。

## 1. Tauri 结构

新增结构：

```text
apps/desktop
├── src/                       React 最小界面
├── runtime/                   Node Desktop runtime
│   ├── composition-root.ts    独立 Desktop Composition Root
│   ├── desktop-ai-service.ts  现有 AI Provider V1 的 runtime 包装
│   ├── desktop-runtime.ts     Presentation 可调用的用例边界
│   ├── server.ts              鉴权的 localhost sidecar API
│   └── tests/                 Desktop E2E-style 自动化
└── src-tauri/                 Tauri 2 Rust host
    ├── src/lib.rs             路径、SecretStore、sidecar 生命周期
    ├── capabilities/          最小 core capability
    └── tauri.conf.json        React/Vite 与 runtime resource 配置
```

运行拓扑：

```text
React WebView
  -> Bearer-authenticated 127.0.0.1 runtime API
  -> Node Desktop Composition Root
  -> packages/core
  -> packages/storage/sqlite
  -> packages/providers/ai

Tauri Rust host
  -> app_local_data_dir
  -> OS SecretStore
  -> Node sidecar start / graceful shutdown / kill fallback
```

选择 sidecar 不是架构重做。现有 SQLite adapter 使用 `node:fs`、`node:path` 和
`node:sqlite`，Tauri WebView 不提供 Node runtime。把现有 adapter 保留在 Node
sidecar 中，是当前最小的兼容路径。依据与一手资料见
[Desktop Runtime 安全与运行时研究](./DESKTOP_RUNTIME_SECURITY_RESEARCH.md)。

当前 sidecar JavaScript 会作为 Tauri resource 放入 `runtime-dist/server.mjs`，但仍依赖
主机 `PATH` 中的 Node 24。它适合本地 spike，不是独立安装包的最终形态。没有为了
installer packaging 扩大本阶段范围。

## 2. Desktop Composition Root

`apps/desktop/runtime/composition-root.ts` 直接装配现有：

- Core：`IngestionService`、`RecordQueryService`、`DirectiveService`、
  `RelationService`、`DiscoveryService`、`ReflectionService`、
  `ReflectionFlowService` 等；
- Storage：`createSqliteStorage()`；
- AI：`OpenAICompatibleProvider` / `DisabledAIProvider`。

Desktop UI 不直接调用 SQLite，也不直接发 OpenAI HTTP 请求。Next.js Server Actions
没有被复用。数据库路径由 Tauri host 解析后交给 Desktop Composition Root；Core 不知道
文件路径。

localhost runtime 仅绑定 `127.0.0.1`，每次进程启动生成随机 bearer token；renderer
通过窄 Tauri command 获取连接信息。sidecar 不记录请求体、token 或 API Key。

## 3. SQLite 实际存储路径策略

生产路径策略已实现为：

```text
app.path().app_local_data_dir()
  -> jianyuan.sqlite
```

应用标识为 `com.jianyuan.desktop`。在 Windows 上该 API 使用系统 LocalAppData 语义；
在 macOS 上使用系统 Application Support 语义。没有使用项目工作目录、开发服务器目录
或测试临时目录。

由于原生 Tauri build 被 Windows SDK 阻塞，`app_local_data_dir()` 在本机尚未通过实际
Tauri 进程取值。因此报告不虚构某个已观察到的最终绝对路径。

## 4. Restart persistence 结果

结果分两层：

1. **通过：Desktop runtime 自动化。** 使用同一数据目录创建 Record、Relation、
   Discovery、Reflection，显式关闭 SQLite，重新创建 runtime 后读回 3 条 Record 和
  原有 Reflection。
2. **通过：真实 sidecar 进程。** 启动打包后的 `runtime-dist/server.mjs`，经 localhost
   API 写入 Record，发送 `shutdown` 正常关闭，再以同一目录启动新进程，读回 1 条相同
   Record。随后已删除该隔离 smoke 数据目录。
3. **未验证：原生 Tauri AppData 往返。** 原因是本机 Windows SDK 缺失，原生 host
   无法链接和启动。

Rust host 正常退出时先通过 stdin 请求 sidecar 停止接收请求、关闭
`SqliteStorageAdapter`，最多等待约 1 秒；只有超时才强制结束子进程。

## 5. SecretStore 方案

在 Tauri Rust host 中新增独立 `SecretStore` abstraction，当前实现为
`SystemSecretStore`：

- Windows：`keyring 4.2.0` -> Windows Credential Manager；
- macOS：`keyring 4.2.0` -> Keychain Services；
- Windows entry 显式设置 `persistence=local`，避免默认 Enterprise roaming 语义；
- renderer 只有 `status/store/delete` 三个窄 command，不能读取 API Key 明文。

Stronghold 没有被当作 OS keychain。它是加密 snapshot，不具有与 Windows Credential
Manager / macOS Keychain 相同的系统凭据语义。

## 6. API Key 实际安全状态

当前代码保证：

- 不写入 SQLite；
- 不写入 `ai-provider.json`；
- 不写入 localStorage；
- 不写入源码；
- 不写入日志；
- `ai-provider.json` 只保存 provider ID、Base URL、model ID；
- API Key 在运行时内存中提供给现有 AI Provider。

实际安全状态仍为 **IMPLEMENTED, NATIVE ROUND-TRIP NOT VERIFIED**。由于 Tauri host 未能
构建启动，本机没有完成 Windows Credential Manager 的 set/get/delete 往返，不能称为
已通过真实设备验证。

另一个已知限制是：启动 sidecar 时 Rust 通过子进程环境把 key 传入 Node。它不会持久化
到普通文件，但同一用户下具有进程检查权限的调试工具可能读取运行时环境。这是内存期
暴露面，不等于明文落盘；后续生产化时应改为受控 IPC/bootstrap pipe 传递并清零临时
缓冲。

## 7. AI Provider 接入状态

Desktop 直接复用现有 AI Provider V1，没有重新实现 OpenAI-compatible HTTP 协议，
也没有修改基本 contract。

最小 UI 和 runtime API 已支持：

- Base URL；
- API Key 保存；
- Fetch Models；
- Model Selection；
- Test Connection；
- 状态：`unconfigured` / `connected` / `unavailable`。

没有提供“是否启用 AI”开关。未配置或失败时由 `DisabledAIProvider` / provider error
进入 degraded mode。自动化已验证：无 API Key 重启后仍可 Capture、历史读取、搜索、
Export、Restore、查看已有 Reflection；新的 AI Relation 请求会明确失败。

未使用真实 API Key，也没有对公网 provider 声称连接成功。测试中的连接成功来自明确的
fake OpenAI-compatible fetcher。

## 8. Model Discovery 状态

复用 Provider V1 的完整行为：

- `refresh: true` 从 upstream 获取；
- `refresh: false` 命中 cache；
- 仅切换 model ID 不清空 discovery cache；
- provider ID、Base URL 或 API Key 身份变化时使缓存失效；
- 不支持 `/models` 时保留 manual model ID fallback。

自动化使用 fake provider 验证了 upstream -> cache、model selection 保留缓存、Base URL
变化后重新请求，以及 manual model ID fallback。没有伪称真实网络成功。

## 9. SQLite encryption 状态

状态：**NOT IMPLEMENTED / NOT ENCRYPTED**。

现有 `SqliteEncryptionController` 和 `encryptionStatus` seam 保持不变，Desktop status
明确显示 `deviceLevelVerified: false`。没有修改 schema。

本机探针结果：

- Node：24.18.0；
- 内置 SQLite：3.53.1；
- `PRAGMA cipher_version` 没有返回 SQLCipher 版本；
- compile options 中没有 `SQLITE_HAS_CODEC`。

因此不能通过向当前 `node:sqlite` 简单执行 `PRAGMA key` 来声称 SQLCipher 已启用。
推荐最终方案是在保持现有 adapter ownership 的前提下，验证一个固定版本、链接
SQLCipher 的自定义 Node runtime，并必须通过：`cipher_version`、错误 key 打不开、文件
header/WAL 不含明文、重启、备份恢复和升级迁移测试。若这条路线不可稳定维护，再单独
评估新的 encrypted SQLite adapter；不要在本阶段把 `rusqlite` 直接塞进 UI 或重写 Core。

## 10. Desktop build 状态

已通过：

- React/Vite production build；
- Node runtime esbuild bundle；
- Desktop TypeScript typecheck；
- Rust `rustfmt --check`；
- Cargo manifest/metadata 解析；
- Tauri config/package discovery。

未通过：

- `cargo check`；
- `tauri build --no-bundle`；
- Windows `.exe` 生成与启动。

阻塞证据：

```text
LINK : fatal error LNK1181: 无法打开输入文件“kernel32.lib”
```

`tauri info` 同时报告没有检测到包含 MSVC 和 SDK components 的完整 Visual Studio /
Build Tools 环境。机器上虽然存在 Rust 1.97.1 toolchain 文件和 VS 2019 的部分工具，
但缺少完整 Windows SDK；这不是应用代码可以安全绕过的链接依赖。

## 11. Tests

| 验证 | 结果 |
| --- | --- |
| Core tests | PASS — 3 files / 6 tests |
| Core typecheck | PASS |
| Memory Storage tests | PASS — 3 files / 3 tests |
| Memory Storage typecheck | PASS |
| SQLite Storage tests | PASS — 2 files / 5 tests |
| SQLite Storage typecheck | PASS |
| AI Provider tests | PASS — 2 files / 14 tests |
| AI Provider typecheck | PASS |
| Desktop tests | PASS — 1 file / 1 end-to-end-style test |
| Desktop typecheck | PASS |
| Desktop renderer/runtime build | PASS |
| Desktop sidecar process + restart smoke | PASS |
| Rust format | PASS |
| Cargo metadata | PASS |
| Cargo check | BLOCKED — missing `kernel32.lib` |
| Tauri build | BLOCKED — incomplete MSVC/Windows SDK toolchain |
| 全量现有 tests | PASS — 46 files / 815 tests |
| Web typecheck | PASS |
| Web production build | PASS |
| `git diff --check` | PASS |

所有 AI 网络行为均为 fake。没有有效 API Key，也没有真实 provider 网络成功证据。

## 12. Blocking issues

1. **Windows SDK 缺失。** 阻止 Rust/Tauri link、原生窗口启动、真实 Tauri AppData 路径
   往返和 Windows Credential Manager 运行验证。
2. **sidecar 尚未自包含。** 当前开发/测试运行依赖系统 `node`。正式桌面分发前需固定并
   打包含 `node:sqlite` 的 sidecar runtime，验证目标架构和启动路径。
3. **SQLite 设备级加密未完成。** 当前数据库与逻辑 export 都是明文；AppData 不提供
   数据库级加密保证。
4. **SecretStore 只有代码实现，尚无原生往返证据。** Windows 本机安全状态必须等 SDK
   修复后通过真实 Credential Manager 测试确认；macOS 还需要单独设备验证。
5. **运行时 API 仍是 spike 边界。** localhost token 和 CSP 已限制基础暴露面，但正式
   产品化前仍需完成 threat model、token 生命周期、sidecar crash/restart 和 IPC 输入
   schema 的独立安全审查。

## 13. 下一步推荐

按以下顺序推进，不改变 Core：

1. 在 CI 或当前 Windows 机器安装完整 Visual Studio Build Tools 2022 C++ workload 与
   Windows 10/11 SDK，重新执行 `cargo check`、`tauri build --no-bundle` 和实际启动。
2. 在原生应用中完成一次验收：Credential Manager set/get/delete、LocalAppData 绝对路径、
   Capture -> 关闭 -> 重启 -> Record/Reflection 仍存在。
3. 把 Node runtime 制作为固定版本的自包含 sidecar；确认其包含所需 `node:sqlite`，并
   去除对系统 `PATH` 的依赖。
4. 将 API Key 的 Rust -> sidecar 传递改为一次性受控 pipe/IPC，减少进程环境暴露。
5. 建立 SQLCipher 自定义 Node 可执行文件的独立技术验证；只有全部加密验收通过后才把
   `deviceLevelVerified` 改为 true。
6. 完成 Windows 后，再在 macOS 验证 Keychain、Application Support 路径、sidecar 签名
   与重启持久化。

到此停止。本报告不授权 Mobile、同步、账号、OAuth、支付、自动更新、Telemetry、UI
重设计或 Git commit。

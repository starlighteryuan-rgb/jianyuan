# 见渊 Phase 7：Desktop Runtime 安全与运行时研究

研究日期：2026-09-14

范围：Tauri 2、Node sidecar、应用数据目录、系统级 SecretStore、SQLCipher 与现有 `packages/storage/sqlite` 的兼容性。

边界：本文只记录一手资料调查和本机只读探针结果，不代表生产实现已经完成。

## 结论

1. **Tauri 2 可以作为 Desktop Runtime。** Tauri 2.0 已于 2024-10-02 正式发布；当前稳定线仍是 2.x。React 前端运行在系统 WebView 中，Tauri 不给 WebView 提供 Node.js 运行时。
2. **现有 `packages/storage/sqlite` 不能在 Tauri WebView 中直接运行。** 它导入 `node:fs`、`node:path` 和 `node:sqlite`。若 Phase 7 必须原样消费这个 adapter，最低改动路线是把 Desktop Composition Root 放进随应用分发的 Node sidecar，由 React 通过受限的 Tauri/Rust IPC 调用。
3. **数据库应放在 `app_local_data_dir`，不是当前工作目录，也不建议在 Windows 使用会解析到 Roaming AppData 的 `appDataDir`。** Rust 主进程应解析并创建目录，然后把固定数据库文件路径传给 sidecar。
4. **API Key 的首选落盘方案是 Rust 端调用系统凭据库。** 建立 Desktop `SecretStore` port，在 Windows 使用 Credential Manager，在 macOS 使用 Keychain Services。当前 Tauri 官方插件目录中没有统一的 OS keychain/keyring 插件；可直接使用维护中的 Rust `keyring` 生态，并只暴露窄 Tauri commands。
5. **官方 Stronghold 插件不是 OS Keychain。** 它是密码派生密钥保护的 IOTA Stronghold 加密 snapshot；主密码从哪里来仍需单独解决。它可作为带用户主密码的替代方案，但不能满足“凭据由 Windows/macOS 系统凭据库管理”的同一安全语义。
6. **当前数据库未加密，SQLCipher 不能靠对现有 `node:sqlite` 执行一个 `PRAGMA key` 就启用。** 本机 Node 24.18.0 的内置 SQLite 没有 SQLCipher codec。Phase 7 可以保留现有 encryption seam、完成 Desktop spike，但报告必须继续标记 `deviceLevelVerified: false`。

## 1. Tauri 2 运行模型

[Tauri 2.0 正式发布说明](https://v2.tauri.app/blog/tauri-20/)明确说明：前端是 HTML/JavaScript/CSS，运行于操作系统 WebView，并通过 IPC 与主要由 Rust 编写的应用核心通信。官方 [Process Model](https://v2.tauri.app/concept/process-model/) 与 [Security](https://v2.tauri.app/security/) 文档把 WebView 和 Core 视为不同信任边界。

截至本次调查，官方 crate 文档的稳定版本为 `tauri 2.11.5`；npm 的 `@tauri-apps/api` 页面列出 `2.11.1`。这些包不保证每个 patch 号完全相同，项目应使用兼容的 2.x 版本并提交 lockfile，而不是使用 v3 alpha。[tauri crate 文档](https://docs.rs/tauri/latest/tauri/)；[@tauri-apps/api](https://www.npmjs.com/package/@tauri-apps/api)。

### 前端能运行什么

- 能运行：浏览器兼容、可被 Vite 打包的 TypeScript/JavaScript。当前 `packages/core` 属于这一类；`packages/providers/ai` 使用标准 `fetch`、`URL`、`AbortController`，从 API 形态看也属于浏览器兼容代码。
- 不能直接运行：依赖 `node:*`、Node 原生 addon、Node 进程或文件系统 API 的包。当前 [`packages/storage/sqlite/sqlite-storage.ts`](../packages/storage/sqlite/sqlite-storage.ts) 在第 1-3 行导入 Node 文件/路径/SQLite API，因此不能被 React WebView 当作普通前端依赖执行。

这里的限制不是“npm 包不能用”，而是“包最终需要的运行时 API 必须是浏览器 API”。开发阶段安装 Node.js 只是为了运行前端工具链；Tauri 最终应用不会因此自动携带一个可供 WebView 调用的 Node runtime。

## 2. Node sidecar 可行性与限制

Tauri 官方提供 [Node.js as a sidecar](https://v2.tauri.app/learn/sidecar-nodejs/) 教程，适用于桌面操作系统。官方路线是把 Node 应用打成自包含可执行文件；也允许把 Node runtime 和 JavaScript 资源一起分发，但官方明确指出这样体积更大，JavaScript 资源也更容易被读取。

sidecar 的硬性约束来自 [Embedding External Binaries](https://v2.tauri.app/develop/sidecar/)：

- 在 `tauri.conf.json` 的 `bundle.externalBin` 注册二进制；
- 每个目标平台/架构必须准备带 `-$TARGET_TRIPLE` 后缀的产物；
- 通过 shell plugin 启动时必须显式授予 `shell:allow-execute` 或 `shell:allow-spawn`；
- 参数权限应静态限定或正则限定，不能开放任意 shell 参数；
- 长期进程可用 stdin/stdout、本地 socket 或 localhost 通信，但每种方式都要单独做鉴权、边界和关闭流程验证。

### 对见渊的最低改动拓扑

```text
React WebView
  -> 窄 Tauri command / capability
  -> Rust host（路径、SecretStore、sidecar 生命周期）
  -> Node sidecar Desktop Composition Root
  -> packages/core
  -> packages/storage/sqlite
  -> packages/providers/ai
```

这条路线保留现有 Core、Storage Ports、SQLite adapter 和 AI Provider。不要把 `@tauri-apps/plugin-sql` 接到 UI；那会形成另一套 storage adapter，并使 UI 可以直接操作数据库，偏离 Phase 7 边界。

### 尚需在实际 spike 中验证

- 官方教程采用 `@yao-pkg/pkg` 作为示例，但现有包要求 Node `>=22.13.0`，且使用 `node:sqlite`。必须实际构建并运行一次自包含 sidecar，不能仅凭教程推断打包器所带 Node 目标一定包含所需模块。
- [Node 24.18.0 的官方文档](https://nodejs.org/download/release/v24.18.0/docs/api/sqlite.html)把 `node:sqlite` 标记为 Stability 1.2（Release candidate）；它在 Node 22.13.0 时虽然不再需要实验开关，但当时仍是 experimental。Desktop 构建应固定并记录实际 sidecar Node 版本。
- sidecar 关闭必须由 Rust host 管理，确保先停止接收命令、关闭 `SqliteStorageAdapter`，再结束子进程；强杀只能是超时兜底。

## 3. SQLite 实际存储路径策略

Tauri JavaScript 的 [`appDataDir()`](https://v2.tauri.app/reference/javascript/api/namespacepath/#appdatadir) 解析为 `${dataDir}/${bundleIdentifier}`。Tauri Rust 的 [`PathResolver::app_data_dir`](https://docs.rs/tauri/latest/tauri/path/struct.PathResolver.html#method.app_data_dir) 具有同样语义。

关键平台差异：

| API | Windows | macOS | 适合见渊数据库 |
| --- | --- | --- | --- |
| `app_data_dir` / `appDataDir()` | `FOLDERID_RoamingAppData/{bundleIdentifier}` | `~/Library/Application Support/{bundleIdentifier}` | Windows 不优先，可能参与 roaming |
| `app_local_data_dir` / `appLocalDataDir()` | `FOLDERID_LocalAppData/{bundleIdentifier}` | `~/Library/Application Support/{bundleIdentifier}` | **推荐** |

这些解析规则来自 Tauri [`PathResolver`](https://docs.rs/tauri/latest/tauri/path/struct.PathResolver.html) 官方 crate 文档。

推荐策略：

```text
Rust app.path().app_local_data_dir()
  + /jianyuan.sqlite3
```

- 路径只由 Rust Desktop host 解析；Core 不知道路径。
- Rust host 创建应用目录，并将规范化后的固定路径传给 Node composition root。
- sidecar 不从 `cwd`、dev server 目录、环境变量或 UI 输入推导数据库路径。
- 开发与发布构建使用同一个 bundle identifier，否则会得到不同的应用目录并造成“数据丢失”的假象。
- `AppData` 只是系统约定的数据目录，**不等于加密**。

## 4. SecretStore 调查

### 4.1 推荐：Rust `keyring` + 系统原生 store

截至 2026-09-14，Tauri [官方插件目录](https://v2.tauri.app/plugin/) 和 [官方 plugins-workspace](https://github.com/tauri-apps/plugins-workspace) 列出 Stronghold，但没有统一封装 Windows Credential Manager/macOS Keychain 的 keychain/keyring 插件。因此需要在 Tauri Rust host 内直接集成原生 crate，或自行写很薄的插件。

上游 [`keyring` 4.2.0](https://docs.rs/keyring/latest/keyring/) 是正式 semver 版本。其默认 `v1` feature 提供统一的 set/get/delete 接口，并明确映射：

- macOS -> Keychain Services；
- Windows -> Windows Credential Manager；
- Unix -> Secret Service。

更精确的上游实现文档：

- [`windows-native-keyring-store 1.1.0`](https://docs.rs/windows-native-keyring-store/latest/windows_native_keyring_store/)：每个 entry 映射为 Windows Credential Manager 的 generic credential；
- [`apple-native-keyring-store 1.0.2`](https://docs.rs/apple-native-keyring-store/latest/apple_native_keyring_store/)：macOS 可使用 legacy Keychain 或 macOS 10.15+ 的 protected data store，后者对 sandbox/provisioning 有额外条件。

系统安全语义由平台提供：Apple 将 Keychain 描述为用于小型秘密的加密数据库，[Keychain Services](https://developer.apple.com/documentation/security/keychain-services)；Windows Credential Management 支持应用定义的 generic credential，[Kinds of Credentials](https://learn.microsoft.com/en-us/windows/win32/secauthn/kinds-of-credentials)。

实施建议：

- 在 Desktop Runtime 建立 `SecretStore` port，只暴露 `set/get/delete/status` 给 composition root；不要放入 Core Domain。
- 使用固定且唯一的 service，例如 `com.jianyuan.desktop.ai`，account 使用规范化 provider ID。
- WebView 最好只得到“未配置/已配置/不可用”状态，不得到 API Key 明文。AI 请求若在 sidecar 执行，由 Rust 读取 secret 后通过受控进程通道传给 sidecar 内存。
- Windows 应显式选择 `Local` persistence，而不是上游 Windows store 当前默认的 `Enterprise`。Microsoft 对 [`CREDENTIAL.Persist`](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentiala) 的定义说明：`LOCAL_MACHINE` 只在同一设备的后续登录会话可用；`ENTERPRISE` 可能随同一用户漫游到其他设备。
- 同一个 secret 的并发 set/get/delete 要串行化；Windows store 上游文档明确记录同一 entry 跨线程的顺序不能可靠保证。
- `keyring 4.2.0` 的 Cargo manifest 要求 Rust 1.88.0，接入前应检查 CI 和开发机 toolchain。
- API Key 在调用 Provider 时必然短暂存在于进程内存；“OS 安全存储”只证明静态存储安全级别，不等于进程被攻陷时仍不可读。现有 `OpenAICompatibleProvider` 的 config 也会在对象生命周期中持有 key，应确保错误、日志、IPC trace 和 crash report 不打印参数。

### 4.2 官方 Stronghold：可用但不等价

Tauri 官方 [`Stronghold` 指南](https://v2.tauri.app/plugin/stronghold/)把它定义为使用 IOTA Stronghold 加密数据库与安全运行时保存 secrets/keys。官方发布索引当前列出正式版 `2.3.1`，[Tauri Ecosystem Releases](https://v2.tauri.app/release/)；不是 alpha/beta。

但它与系统凭据库不同：

- snapshot 文件仍位于应用数据目录；
- `Stronghold.load(path, password)` 需要 vault password；
- 初始化要求把 password 派生为恰好 32 字节的 key，官方提供 Argon2 builder；
- `Store` 中的值可以读回；`Vault` 主要通过 procedure 使用秘密，二者不能混为一谈；
- 若 vault password 硬编码、写配置文件或留在 localStorage，保护目标没有达成。

Tauri 2.0 发布说明还明确指出：官方插件不都具有 Core 同级稳定性，插件 API 可能在 minor 版本变化；严格稳定需求应只允许 patch 更新。另有 Tauri 官方仓库维护者在 2026-04 的[讨论回复](https://github.com/orgs/tauri-apps/discussions/7846)称 Stronghold 已不再推荐，并计划在 v3 弃用/移除；这不是 v2 正式移除公告，但属于应纳入决策的维护信号。

因此，Phase 7 若目标明确是 Windows/macOS 系统级凭据存储，首选 native keyring；只有在 native keyring 被真实构建/签名问题阻塞时，才把 Stronghold 作为降级候选，并如实报告它是“加密应用 vault”，不是 OS Keychain。

## 5. SQLCipher 与当前 `node:sqlite`

### 5.1 仓库事实

- [`packages/storage/sqlite/package.json`](../packages/storage/sqlite/package.json) 要求 Node `>=22.13.0`。
- [`packages/storage/sqlite/sqlite-storage.ts`](../packages/storage/sqlite/sqlite-storage.ts) 直接构造 `node:sqlite` 的 `DatabaseSync`。
- [`packages/storage/sqlite/encryption.ts`](../packages/storage/sqlite/encryption.ts) 已保留 `SqliteEncryptionController.configure(DatabaseSync)` seam。
- adapter 在第一次 migration/业务 SQL 之前调用 controller，这是未来 SQLCipher 设置 key 的正确时机；但当前状态对象始终是 `deviceLevelVerified: false`。
- [`packages/storage/sqlite/README.md`](../packages/storage/sqlite/README.md) 已明确声明默认数据库未加密。

### 5.2 本机只读探针

在当前环境使用内存数据库执行：

```powershell
node -e "const { DatabaseSync } = require('node:sqlite'); /* query versions and PRAGMAs */"
```

结果：

```json
{
  "node": "v24.18.0",
  "sqlite": "3.53.1",
  "cipherVersion": [],
  "hasCodec": false
}
```

即 `PRAGMA cipher_version` 没有返回 SQLCipher 版本，`PRAGMA compile_options` 也没有 `SQLITE_HAS_CODEC`。这只验证当前机器的 Node 二进制，不代表所有自定义 Node 构建。

### 5.3 为什么不能把 `PRAGMA key` 当作完成

[SQLCipher 上游仓库](https://github.com/sqlcipher/sqlcipher)说明它是 SQLite 的独立 fork，提供数据库页级 AES 加密、HMAC 和密钥派生。[SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/)要求在第一次数据库操作前通过 `PRAGMA key` 或 `sqlite3_key()` 设置 key，并通过读取 `sqlite_master` 验证 key。

标准 SQLite 对未知 PRAGMA 可以不报错，因此“`PRAGMA key` 执行没有异常”不是加密证据。必须至少同时满足：

1. `PRAGMA cipher_version` 返回预期 SQLCipher 版本；
2. 设置正确 key 后可以读写；
3. 错误 key 无法读取 schema；
4. 文件十六进制检查不能看到 `SQLite format 3` header 或已知明文；
5. 重启后使用系统凭据库中的同一 key 能打开数据库；
6. WAL/SHM、备份、restore、升级和 key rotation 都经过验证。

Node 官方 [`node:sqlite`](https://nodejs.org/download/release/v24.18.0/docs/api/sqlite.html) 的 `loadExtension()` 只是 `sqlite3_load_extension()` 包装；Node 官方源码默认把 `deps/sqlite/sqlite3.c` 构建成静态库，[sqlite.gyp](https://github.com/nodejs/node/blob/main/deps/sqlite/sqlite.gyp)。结合 SQLCipher 是替代 SQLite engine、并要求 SQLCipher 的 `sqlite3_key`/codec 这一上游事实，可以得出：**不能把普通 SQLCipher Community library 当作一个运行时 extension 加载进已打开的标准 `node:sqlite` 连接。**

### 5.4 可行路线

#### 路线 A：自定义 Node sidecar 链接 SQLCipher

Node 的官方 [`configure.py`](https://github.com/nodejs/node/blob/main/configure.py)提供 `--shared-sqlite`、`--shared-sqlite-includes`、`--shared-sqlite-libname` 和 `--shared-sqlite-libpath`。理论上可为 Windows/macOS 分别构建链接 SQLCipher 的 Node runtime，然后继续使用 `DatabaseSync` 和现有 encryption seam。

优点：Core、Storage Ports、schema 和大部分 adapter 不变。

代价：需要维护每个平台/架构的自定义 Node + SQLCipher 构建、动态库定位、签名、公证和升级；普通 `@yao-pkg/pkg` 产物不会自动变成这个自定义 runtime。必须先做独立构建验证，不能直接作为 Phase 7 完成项。

#### 路线 B：Rust `rusqlite` + SQLCipher

上游 [`rusqlite 0.40.2` features](https://docs.rs/crate/rusqlite/latest/features)明确提供 `bundled-sqlcipher` 和 `bundled-sqlcipher-vendored-openssl`。这在 Tauri Rust host 内是一条可构建的 SQLCipher 路线。

但它会把数据库所有权移到 Rust，并要求重新实现/桥接当前 TypeScript `CoreStoragePorts`；若直接采用，就不再是 Phase 7 要证明的“消费现有 `packages/storage/sqlite`”。因此它是后续架构决策候选，不应在本 spike 中悄悄替换现有 adapter。

#### 路线 C：SQLCipher-capable Node binding

可以保持 Node sidecar 和 TS storage boundary，同时把 `DatabaseSync` 驱动替换为明确链接 SQLCipher 的 Node binding。但这会修改 adapter driver，且各候选包的维护、预编译目标、SQLCipher 版本、许可证和签名状态需要单独一手资料审计。本研究没有找到由 Node 或 Zetetic 官方提供、可直接替换 `node:sqlite` 的通用 Node 包，因此不把任何第三方包标记为已验证方案。

### 本阶段建议

Desktop Runtime Spike 不应被 SQLCipher 阻塞：

- 保留现有 `SqliteEncryptionController` / key-management seam；
- 当前构建继续准确报告 `configured: false` 或 `deviceLevelVerified: false`；
- 数据库放入 `app_local_data_dir`，但绝不把 AppData 位置称为加密；
- 下一阶段先做路线 A 的 Windows/macOS 最小构建实验；若跨平台维护成本不可接受，再明确评审路线 B 或 C；
- SQLCipher key 最终必须来自 OS SecretStore，不能与数据库文件放在同一目录。

## 6. Phase 7 实施验收清单

### Runtime / sidecar

- [ ] React WebView 没有直接导入 `packages/storage/sqlite`。
- [ ] Desktop Composition Root 在 Node sidecar 内消费现有 Core、Storage、AI Provider。
- [ ] sidecar 是应用资源，不要求最终用户预装 Node。
- [ ] Rust 端限制 sidecar 名称和参数，并管理 graceful shutdown。
- [ ] 真实 build 中记录 Tauri、Node、SQLite 版本。

### Local data

- [ ] Rust 解析 `app_local_data_dir`，数据库路径不依赖 `cwd`。
- [ ] 创建 Record 和 Reflection 后关闭 adapter/应用，第二次启动仍可读取。
- [ ] 报告实际解析路径，但不输出用户 secret。

### SecretStore

- [ ] API Key 不进入 SQLite、localStorage、源码、普通配置文件或日志。
- [ ] Windows Credential Manager 写入/读取/删除/重启验证通过。
- [ ] Windows 使用本机 persistence，避免 Enterprise roaming。
- [ ] macOS Keychain 写入/读取/删除/重启及签名后访问验证通过。
- [ ] WebView 只看到配置状态；如因 spike 需要返回明文，必须明确报告实际暴露面，不能宣称 secret 从未离开安全存储。

### Encryption

- [ ] 当前报告明确为“未加密”。
- [ ] 后续 SQLCipher 构建检查 `cipher_version`、wrong-key failure、文件 header/WAL、restart 和备份恢复。
- [ ] 只有上述验证全部通过后，才能把 `deviceLevelVerified` 改为 true。

## 7. Blocking issues 与建议顺序

当前没有证据表明 Tauri 2 与 Core 或 AI Provider 存在 blocking 冲突。已确认的硬边界只有一个：现有 SQLite adapter 需要 Node runtime，所以必须使用 sidecar，或另行批准 storage driver/adapter 改造。

建议顺序：

1. 先完成未加密但真实落在 `app_local_data_dir` 的 Node sidecar Desktop spike，并验证 restart persistence。
2. 同时实现 Rust `SecretStore` port；Windows 先用 native keyring 做真实设备验证，macOS 必须在实际签名/目标环境补验。
3. AI Provider 在 sidecar 内读取仅驻内存的 key；UI 只操作配置状态与测试连接命令。
4. 把 SQLCipher 作为独立验证项，不改变 Core 语义和 SQLite schema。

## 来源

### Tauri 官方

- [Tauri 2.0 Stable Release](https://v2.tauri.app/blog/tauri-20/)
- [Process Model](https://v2.tauri.app/concept/process-model/)
- [Security](https://v2.tauri.app/security/)
- [Capabilities](https://v2.tauri.app/security/capabilities/)
- [Node.js as a sidecar](https://v2.tauri.app/learn/sidecar-nodejs/)
- [Embedding External Binaries](https://v2.tauri.app/develop/sidecar/)
- [JavaScript path API](https://v2.tauri.app/reference/javascript/api/namespacepath/)
- [Rust PathResolver](https://docs.rs/tauri/latest/tauri/path/struct.PathResolver.html)
- [Official plugin catalog](https://v2.tauri.app/plugin/)
- [Stronghold guide](https://v2.tauri.app/plugin/stronghold/)
- [Tauri ecosystem releases](https://v2.tauri.app/release/)

### 系统凭据库与上游 Rust crates

- [`keyring 4.2.0`](https://docs.rs/keyring/latest/keyring/)
- [`keyring::v1`](https://docs.rs/keyring/latest/keyring/v1/index.html)
- [`windows-native-keyring-store 1.1.0`](https://docs.rs/windows-native-keyring-store/latest/windows_native_keyring_store/)
- [`apple-native-keyring-store 1.0.2`](https://docs.rs/apple-native-keyring-store/latest/apple_native_keyring_store/)
- [Apple Keychain Services](https://developer.apple.com/documentation/security/keychain-services)
- [Microsoft Credentials Management](https://learn.microsoft.com/en-us/windows/win32/secauthn/credentials-management)
- [Microsoft CREDENTIAL persistence](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentiala)

### Node / SQLite / SQLCipher 上游

- [Node 24.18.0 `node:sqlite`](https://nodejs.org/download/release/v24.18.0/docs/api/sqlite.html)
- [Node bundled SQLite build](https://github.com/nodejs/node/blob/main/deps/sqlite/sqlite.gyp)
- [Node shared SQLite configure options](https://github.com/nodejs/node/blob/main/configure.py)
- [SQLCipher upstream repository](https://github.com/sqlcipher/sqlcipher)
- [SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/)
- [`rusqlite` SQLCipher features](https://docs.rs/crate/rusqlite/latest/features)

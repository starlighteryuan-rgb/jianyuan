# 见渊 Phase 7.1：Windows Native Runtime Unblock & Validation

诊断日期：2026-09-14

## 结论

Windows SDK 安装后，原始 `kernel32.lib` 阻塞已解除。x64 MSVC 环境现在能找到
`kernel32.lib` 和 `ucrt.lib`；此前在完整 Cargo 缓存中已完成 `cargo check`、`cargo build`
与 `tauri build --no-bundle`，并生成可执行文件。

本次在用户侧启动了生成的 exe。此前受限执行环境只能观察到
`jianyuan-desktop.exe` 和随后的 WebView2 进程；随后真实用户 Windows 会话已完成
可见 Tauri UI、sidecar、AppData SQLite、Record/Reflection restart 和 Credential
Manager validation，Phase 7 native runtime 验证最终为 PASS。

本轮只补充了 Tauri 构建必需的最小 `icon.ico` resource，没有修改 Core、SQLite schema、
AI Provider contract 或产品架构，也没有执行 Git commit。

## 1. 原始阻塞原因

修复前的可重复反馈命令：

```powershell
VsDevCmd.bat -arch=x64 -host_arch=x64
cargo check --offline --manifest-path apps/desktop/src-tauri/Cargo.toml
```

该命令稳定进入 MSVC linker，并在构建 Rust dependency build script 时找不到
`kernel32.lib`。这证明问题发生在最基础的 Windows import library 解析阶段，早于见渊
Rust/Tauri 业务代码编译。

修复前诊断分类：

- MSVC 未安装：否；
- `link.exe` 不存在：否；
- Rust target 错误：否；
- Windows SDK 已安装但环境未加载：否；
- Windows SDK / UCRT import libraries 未安装：**是**（已修复）。

## 2. 修复方法

### 已执行的最小管理员操作

用户已安装 Windows 10 SDK 10.0.19041.0 和 Windows Universal CRT SDK，并重新打开
验证环境。

现有 VS 2019 已具备 MSVC v142 x64/x86，因此最小修复不需要重装 IDE。若 VS Installer
不再向该实例提供 Windows 10 SDK，可改为完成现有但未完成的 Visual Studio Community
2026 安装，并确保以下组件全部选中：

- `Microsoft.VisualStudio.Workload.NativeDesktop`；
- `Microsoft.VisualStudio.Component.VC.Tools.x86.x64`；
- `Microsoft.VisualStudio.Component.Windows11SDK.26100`；
- `Microsoft.Component.VC.Runtime.UCRTSDK`。

Tauri 官方 Windows prerequisites 要求 Microsoft C++ Build Tools，并选择 Desktop
development with C++；该工作负载仍需要实际安装 Windows SDK。参考：
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) 和
[Microsoft Visual Studio workload/component IDs](https://learn.microsoft.com/en-us/visualstudio/install/workload-component-id-vs-community?view=visualstudio)。

### 安装后的环境状态

当前 `C:\Users\26067\.cargo\bin\rustc.exe` 和 `cargo.exe` 仍是异常的 0 字节 proxy；
实际 toolchain 二进制完整存在。它不是 `kernel32.lib` 根因，但普通 shell 仍会因此
误报 Rust 未安装。

SDK 安装后应使用 `rustup` 官方安装流程修复这两个 proxy，或在验证 shell 中把实际
toolchain bin 放到 `PATH` 最前面。不要把 0 字节 proxy 问题和 Windows SDK 缺失混为
同一个原因。

## 3. Windows SDK / MSVC 状态

### Rust

| 项目 | 当前值 |
| --- | --- |
| rustc | 1.97.1 (`8bab26f4f`, 2026-07-14) |
| cargo | 1.97.1 (`c980f4866`, 2026-06-30) |
| default host | `x86_64-pc-windows-msvc` |
| active toolchain | `stable-x86_64-pc-windows-msvc` |
| installed targets | MSVC、GNU、gnullvm x86_64 Windows targets |
| rustc/cargo proxy | 0 字节；本轮使用实际 toolchain bin 验证 |

### Visual Studio / MSVC

| 安装 | 状态 |
| --- | --- |
| Visual Studio Community 2019 | 16.11.59 / 16.11.37530.7；完整、可启动 |
| MSVC | v142 / 14.29.30133；x64/x86 tools 已安装 |
| x64 `cl.exe` | 存在于 `Hostx64\x64` |
| x64 `link.exe` | 存在于 `Hostx64\x64` |
| Desktop C++ workload | 已选择 |
| Visual Studio Community 2026 | 18.10.0；安装未完成、不可启动，安装状态带 `canceled=1` |

### Windows SDK / UCRT

| 检查 | 结果 |
| --- | --- |
| `KitsRoot10` registry | `C:\Program Files (x86)\Windows Kits\10\` |
| Windows SDK v10 registry | ProductVersion `10.0.19041` |
| SDK versions | `10.0.10240.0`, `10.0.19041.0` |
| x64 `kernel32.lib` | `...\10.0.19041.0\um\x64\kernel32.Lib`，300,468 bytes |
| x64 `ucrt.lib` | `...\10.0.19041.0\ucrt\x64\ucrt.lib`，285,588 bytes |
| Windows SDK component | Installed and loaded by `VsDevCmd` |
| Universal CRT environment | `UniversalCRTSdkDir=C:\Program Files (x86)\Windows Kits\10` |
| Windows Kits 8.1 | 仅残留目录，未用于 build |

### 环境变量

普通 Codex shell 仍未初始化 MSVC；它还解析不到 0 字节 proxy。

执行 VS 2019 `VsDevCmd.bat -arch=x64 -host_arch=x64` 后：

- `cl.exe`、`link.exe`：正确解析到 `Hostx64\x64`；
- `VCToolsInstallDir`：14.29.30133；
- `WindowsSDKVersion=10.0.19041.0`；
- `UniversalCRTSdkDir=C:\Program Files (x86)\Windows Kits\10`；
- `INCLUDE` 包含 `ucrt`、`shared`、`um`、`winrt`、`cppwinrt`；
- `LIB` 包含 `10.0.19041.0\ucrt\x64` 和 `10.0.19041.0\um\x64`；
- `PATH` 包含 x64 MSVC tools。

在该环境执行 `tauri info` 时，MSVC、rustc 1.97.1、cargo 1.97.1 和 WebView2 均显示
为可用；仅 rustup/toolchain discovery 因 0 字节 proxy 仍显示 warning。

## 4. Tauri native build 结果

状态：**PASS — 已生成 Windows executable**。

- `cargo check --offline`：PASS（使用项目专用 Cargo cache）；
- `cargo build --offline`：PASS；
- `tauri build --no-bundle`：PASS；
- 产物：`apps/desktop/src-tauri/target/release/jianyuan-desktop.exe`，10,313,216 bytes；
- resource：`target/release/runtime-dist/server.mjs` 已生成。

构建前补充了 Tauri Windows resource 必需的最小 `icons/icon.ico`；没有进行 UI 或品牌
重设计。

WebView2 152.0.4191.66 已存在。Tauri 2 JavaScript/Rust package 状态沿用 Phase 7；
native build 的系统阻塞已解除。当前仍需修复 rustup proxy 以恢复普通 shell 中的工具
发现；本次显式 VS 环境下的 `tauri info` 仅因 0 字节 rustup proxy 报告 rustup/toolchain
discovery warning。此前受限执行环境只能取得 exe/WebView2 进程证据，无法取得可见窗口
句柄；真实用户会话已完成后续可见 UI 操作验证。

## 5. 实际 AppData SQLite 路径

状态：**PASS — 真实用户会话已创建并使用 SQLite**。

观察到的目录为：

```text
C:\Users\26067\AppData\Local\com.jianyuan.desktop
```

该目录符合 `app.path().app_local_data_dir()` 的代码路径，真实用户会话确认数据库位于
该目录下的 `jianyuan.sqlite`。没有使用项目目录、开发服务器目录或测试临时目录替代
生产数据库位置。

## 6. Restart persistence 结果

状态：**PASS — 真实用户 Windows Tauri 会话已完成跨进程验证**。

最终 validation verify 结果：

```text
sqliteOpened: true
recordRecoveredAfterRestart: true
reflectionRecoveredAfterRestart: true
sidecarStarted: true
cleanupCompleted: true
errors: []
```

另外，人工创建的 Record“我似乎总在成功前掉链子”在完全退出并重启 Windows Tauri
应用后仍可从 History 读取。

## 7. Windows Credential Manager 验证

状态：**PASS — 真实用户 Windows GUI 会话完成测试 secret 往返**。

此前只读 shell 探针曾返回 Win32 `1168`（目标不存在）和
`1312` (`ERROR_NO_SUCH_LOGON_SESSION`)；这只反映受限 shell 会话。真实用户 GUI 会话
使用专用测试 secret 完成：

```text
write -> read -> restart -> read -> delete -> missing
```

最终 `credentialRestartRead`、`credentialDelete`、`credentialMissingAfterDelete` 均为
`true`。未使用真实 API key。

此前受限 shell 探针未创建 secret；本次真实用户验证使用的是 Harness 专用测试 secret，
验证完成后已删除，未进入 SQLite、普通配置、日志或 Git。

## 8. Sidecar / Node dependency 状态

当前 release Tauri host 使用随应用发布的 `runtime-dist/node.exe` 启动 JavaScript
sidecar；真实用户 verify 已确认 `sidecarStarted: true`，不要求用户预装系统 Node。
`bundle.active` 仍为 `false`，因此正式 installer packaging 的资源复制和干净机器验证
仍是独立后续事项，不影响本次 release executable 的 native runtime PASS。

## 9. SQLite encryption 状态

状态仍为 **明文 / `deviceLevelVerified: false`**。

真实用户会话已完成 native 业务交互；本次没有新增重复的文件探针。现有 encryption seam
未修改。AppData 位置不被视为加密，也没有为了 SQLCipher 扩大范围。

## 10. 剩余 blocking issue

1. 正式 installer packaging 尚未启用/验证，需在干净 Windows 用户环境中确认资源复制。
2. SQLite 仍为明文；SQLCipher/数据库级加密尚未完成，不得将 AppData 路径视为加密。
3. 普通开发 shell 的 0 字节 rustc/cargo proxy 仍需单独修复，但不阻塞已验证的 release
   executable。

## 本轮验证状态

native 构建门禁已经打开，真实用户 Windows 会话已完成以下 native runtime 验证：

| 验证 | 本轮状态 |
| --- | --- |
| `cargo check` | PASS |
| `cargo build` / Tauri native build | PASS |
| Windows app 进程 / 可见窗口 | PASS — 真实用户会话启动并操作成功 |
| sidecar | PASS — `sidecarStarted: true` |
| Native AppData | PASS — `C:\Users\26067\AppData\Local\com.jianyuan.desktop` |
| Native SQLite / Record restart | PASS — `sqliteOpened: true`、`recordRecoveredAfterRestart: true` |
| Native Reflection restart | PASS — `reflectionRecoveredAfterRestart: true` |
| Credential Manager restart/delete/missing | PASS — 三项均为 `true` |
| Validation cleanup | PASS — `cleanupCompleted: true`、`errors: []` |
| Desktop/Core/Storage/Provider/full tests | PASS — Desktop 1；Core 6；Memory 3；SQLite 5；Provider 14；full 815 |
| Web build | PASS |
| `git diff --check` | PASS（仅有既有 LF/CRLF 警告） |

停止点：Phase 7 native Windows runtime 已由真实用户会话完成最终验证。剩余事项仅为
正式 installer packaging 和 SQLite 数据库级加密；当前 SQLite 仍为明文，数据库加密
尚未完成。

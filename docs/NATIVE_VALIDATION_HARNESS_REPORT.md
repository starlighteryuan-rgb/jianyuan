# 见渊 Phase 7.3：Local Native Validation Harness

验证日期：2026-09-14（checkpoint 协议修复）

## 结论

已增加一个显式触发、两阶段、用户会话专用的 Native Validation Harness。它不在普通
启动时运行，不依赖项目外 Node，不修改 Core 语义、SQLite schema 或 AI Provider
contract。

Harness 通过现有 Desktop Composition Root 使用真实 Tauri
`app.path().app_local_data_dir()` 和现有 SQLite adapter；Credential Manager 使用
独立的测试 entry，不会覆盖生产 API key entry。真实用户 Windows 会话已完成两阶段
native 验证，最终 verify 结果为全项通过且 `errors: []`。Codex managed environment
仍不能直接读取该 AppData，但这不影响用户会话已经取得的 native 证据。

本次问题定位：Rust host 已正确解析 `--native-validation --phase=prepare`，并将同一
`app_local_data_dir` 与 phase 通过环境变量传给 packaged sidecar。旧 launcher 只看
exe 最终退出码；prepare 的单步失败会被 harness 记录到结果文件、清理已创建的部分
validation 数据，但不会让宿主进程以失败码退出，因此旧 launcher 仍会打印
“Prepare finished”。这不是成功 prepare 后被 verify 提前清理：成功路径不执行 cleanup。
现在 launcher 会检查真实 AppData checkpoint（以及结果文件），checkpoint 写入也会
在返回前完成 flush、原子改名和存在性确认。

## 1. validation mode 入口

Rust host 只在以下显式条件满足时启用模式：

```text
--native-validation --phase=prepare
--native-validation --phase=verify
```

或：

```text
JIANYUAN_NATIVE_VALIDATION=1
JIANYUAN_NATIVE_VALIDATION_PHASE=prepare|verify
```

缺少或非法 phase 会直接给出启动错误；普通 `jianyuan-desktop.exe` 启动不会运行
harness。

实现位置：

- Rust host：解析 mode/phase、解析真实 AppData、执行 Credential Manager 测试；
- `apps/desktop/runtime/native-validation.ts`：复用 `DesktopRuntime`、Core Application
  services 和 SQLite adapter；
- `apps/desktop/runtime/server.ts`：只在 validation env 明确开启时调用 harness。

## 2. 用户如何运行

在仓库的 `apps/desktop` 目录中执行（脚本会定位 `src-tauri/target/release`）：

```cmd
run-native-validation.cmd prepare
```

等待应用打开并完成 prepare，然后完全退出应用。再次从同一 Windows 用户会话执行：

```cmd
run-native-validation.cmd verify
```

脚本只启动已打包的 `jianyuan-desktop.exe`，不调用 Node。prepare 阶段只有在真实
AppData 中确认 `native-validation-checkpoint.json` 存在时才会打印 “Prepare finished”；
verify 阶段只有在结果文件存在时才会打印完成。也可以直接执行：

```cmd
jianyuan-desktop.exe --native-validation --phase=prepare
jianyuan-desktop.exe --native-validation --phase=verify
```

不要在过程中输入真实 API key；Credential Manager 测试使用 harness 内置的专用测试
entry。

## 3. Result file 路径与内容

默认结果文件：

```text
<app_local_data_dir>\native-validation-result.json
```

当前 Windows 应用标识对应的预期路径为：

```text
C:\Users\26067\AppData\Local\com.jianyuan.desktop\native-validation-result.json
```

如果该目录不可写（例如当前 Codex managed sandbox），harness 使用明确的用户临时路径：

```text
%TEMP%\native-validation-result.json
```

结果只包含状态字段、phase、时间、AppData 路径、清理状态和已清理的错误码/短消息：

```json
{
  "phase": "verify",
  "timestamp": "...",
  "appDataPath": "...",
  "sqliteOpened": true,
  "recordWritten": true,
  "recordRecoveredAfterRestart": true,
  "reflectionWritten": true,
  "reflectionRecoveredAfterRestart": true,
  "credentialWrite": true,
  "credentialRead": true,
  "credentialRestartRead": true,
  "credentialDelete": true,
  "credentialMissingAfterDelete": true,
  "sidecarStarted": true,
  "cleanupCompleted": true,
  "errors": []
}
```

结果文件不包含 Record 正文、Reflection 正文、API key、测试 secret 或 Bearer token。

## 4. prepare / verify 机制

### prepare

1. Rust host 获取真实 `app_local_data_dir()`；
2. 在 Windows Credential Manager 的专用 validation entry 写入测试 secret，并只在内存中
   比较 read 结果；
3. sidecar 构造现有 `DesktopRuntime`，打开真实 SQLite；
4. 通过现有 `IngestionService` 写入一条 validation marker Record；
5. 通过现有 `ReflectionService.recordSpontaneous` + `respond` 写入一条 validation
   Reflection；
6. 将生成的 Record/episode/reflection IDs 写入
   `native-validation-checkpoint.json`。该 checkpoint 只含 ID，不含正文。写入使用
   临时文件、`fsync` 和原子改名，并在返回前再次确认最终文件存在；已有 checkpoint
   不会被覆盖；
7. 写 prepare 结果并保持 app 正常运行，等待用户完全退出。

### verify

1. 用户重新启动同一 exe，Rust host 在新进程中读取专用 Credential Manager entry；
2. sidecar 重新打开同一个 SQLite；
3. 按 checkpoint ID 验证 Record marker；
4. 按 episode ID 和 reflection record ID 验证 Reflection 及其底层 Record marker；
5. Rust host 删除测试 credential，再次 read 并要求 missing；
6. SQLite adapter 只按 checkpoint 中的 Record/episode IDs 和随机 targetRef 清理；
7. 删除 checkpoint 和诊断 credential-state 文件；
8. 写最终结果文件。若 checkpoint 缺失，verify 立即返回
   `native_validation_checkpoint_missing`，不会误报成功或提前清理。

prepare 与 verify 是两个独立进程。单进程 `close()` / reopen 不会被当作 native restart
证据。

## 5. SQLite 验证方式

Harness 使用现有路径和组合根：

```text
Tauri app_local_data_dir()
  -> jianyuan.sqlite
  -> createDesktopComposition()
  -> packages/core + packages/storage/sqlite
```

新增的 `removeNativeValidationArtifacts` 是 SQLite adapter 的 validation-only helper，
不属于 Core storage port；它按精确 IDs 删除 validation 记录、reflection episode 和
对应状态，不执行全库 clear，不按 marker 扫描用户数据。

Desktop 自动化测试已验证：普通用户 Record 在 validation prepare/verify 后仍保留，
validation-only entities 被清理。

## 6. Credential Manager 验证方式

生产 API key entry 保持：

```text
com.jianyuan.desktop.ai / openai-compatible
```

Harness 使用独立 entry：

```text
com.jianyuan.desktop.native-validation / phase-7-3
```

因此 prepare 不会覆盖用户真实 API key。验证顺序为：

```text
write test secret
-> read and compare in memory
-> app/process restart
-> read and compare in memory
-> delete
-> read must be missing
```

任何结果、日志和异常都不会输出 secret value。此前 Codex shell 的
`ERROR_NO_SUCH_LOGON_SESSION (1312)` 仅代表受限 shell 会话；真实用户 GUI 会话已完成
Credential Manager 的 write → read → restart read → delete → missing 往返。

## 7. 安全清理机制

- checkpoint 使用随机 `native-validation-target:<uuid>`，避免与用户 target 冲突；
- cleanup 只使用 checkpoint 中的 Record IDs、episode ID 和 targetRef；
- 不调用现有全库 `clear()`；
- 不删除用户已有 Record、Reflection、配置或生产 credential entry；
- 测试 secret 从未写入 SQLite、localStorage、普通配置或结果文件；
- 结果错误经过 marker/secret/API key/授权字段清理并限制长度；
- sidecar stderr 仅记录受控启动错误，敏感 marker 写为 `redacted`。

## 8. 当前验证结果

| 项目 | 状态 |
| --- | --- |
| Harness 两阶段逻辑 | PASS（Desktop test 跨两个 runtime 实例） |
| prepare checkpoint 存在性断言 | PASS（写入后自动检查 + launcher 检查） |
| verify 缺失 checkpoint 错误 | PASS（`native_validation_checkpoint_missing`） |
| validation-only cleanup 保留用户数据 | PASS |
| `--native-validation` / env 入口 | PASS（release exe 已识别 prepare phase） |
| 结果文件无敏感内容 | PASS（单元测试 + sanitized writer） |
| 真实用户 AppData SQLite | PASS；使用真实 `app_local_data_dir()` |
| 真实用户 Record restart | PASS；`recordRecoveredAfterRestart: true` |
| 真实用户 Reflection restart | PASS；`reflectionRecoveredAfterRestart: true` |
| 真实用户 Credential Manager round-trip | PASS；restart read/delete/missing 全部为 true |
| sidecar 与 validation cleanup | PASS；`sidecarStarted: true`、`cleanupCompleted: true` |

真实用户会话最终 `verify` 结果：

```text
sqliteOpened: true
recordRecoveredAfterRestart: true
reflectionRecoveredAfterRestart: true
credentialRestartRead: true
credentialDelete: true
credentialMissingAfterDelete: true
sidecarStarted: true
cleanupCompleted: true
errors: []
```

另外，人工创建的 Record“我似乎总在成功前掉链子”在完全退出并重启 Windows Tauri
应用后仍可从 History 读取。

## 9. 当前仍未完成的项目

真实用户会话已完成本 Harness 要求的 SQLite、Record、Reflection 和 Credential Manager
跨进程验证。当前仍未完成的项目为：

1. 正式 installer 安装后的资源复制（当前只构建并验证 release executable）；
2. SQLite 设备级加密（仍为明文，`deviceLevelVerified=false`）。

## 10. Build / tests

- Desktop typecheck：PASS；
- Desktop tests：PASS（2 files / 3 tests）；
- Core、Storage、Provider、全量 tests：PASS（46 files / 815 tests）；
- root `npm run typecheck`：PASS；
- root `npm run build`：PASS；
- `cargo check --offline`：PASS；
- `cargo fmt --check`：PASS；
- `tauri build --no-bundle`：PASS；
- `git diff --check`：PASS（仅已有 LF/CRLF warnings）。

没有执行 Git commit。

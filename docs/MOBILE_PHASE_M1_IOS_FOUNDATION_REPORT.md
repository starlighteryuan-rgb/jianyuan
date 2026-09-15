# 见渊 Mobile Phase M1 · iOS Foundation Report

日期：2026-09-15
分支：`phase-9-freeze`
基线 HEAD：`69fa9e9`（本报告对应本次 Mobile M1 变更）
范围：`apps/mobile/**`、`.github/workflows/ios-unsigned.yml`

## 结论

M1 的代码链路已经打通并通过本地验证：Mobile 可以真实导入共享 Core，Record 可以写入真实 SQLite 文件，完全关闭后再打开仍能读到；四个 Bottom Tab 与独立 Settings 入口已经建立；Pair A 主题、SecretStore skeleton、iOS 未签名构建工作流都已落地。

需要如实说明的边界：本机是 Windows，无法生成和编译 iOS 原生工程。真正的 `expo prebuild --platform ios`、`xcodebuild` 和未签名 IPA 产出，必须在 GitHub Actions 的 `macos-latest` runner 上完成。工作流已写好并通过静态校验，但在推送到 GitHub 并手动触发之前，不能声称“真实 iOS 二进制已验证”。

## 状态汇总

```text
MOBILE IMPORT: PASS
SQLITE: PASS
RESTART PERSISTENCE: PASS
NAVIGATION: PASS
THEME: PASS
SECRETSTORE SKELETON: PASS
IOS PREBUILD: FAIL（本机 Windows 无法生成原生工程，尚未在 macOS 上真实执行）
UNSIGNED IPA WORKFLOW: PASS（工作流已建立并通过静态校验，尚未在 GitHub Actions 真实运行）
ROOT REGRESSION: PASS
```

| 项目 | 结果 |
|------|------|
| MOBILE IMPORT | PASS |
| SQLITE | PASS |
| RESTART PERSISTENCE | PASS |
| NAVIGATION | PASS |
| THEME | PASS |
| SECRETSTORE SKELETON | PASS |
| IOS PREBUILD | 未验证（需 macOS runner） |
| UNSIGNED IPA WORKFLOW | PASS（定义层；真实执行待触发） |
| ROOT REGRESSION | PASS |

## 架构与边界

- 没有修改根 `package.json` 的 workspace 结构。
- Mobile 通过 `apps/mobile/metro.config.js` 的 `watchFolders` 和 `nodeModulesPaths` 解析仓库根目录的共享包。
- 没有复制 Desktop 的 `node:sqlite` adapter；Mobile 自己实现异步 SQLite adapter。
- 没有修改 Core contract、Record/Relation/Evidence/Reflection 语义、桌面 SQLite schema 或桌面 runtime。
- 没有修改任何已有 tag；`v0.2.0-alpha` 和 `v0.2.0-alpha.1` 均未被移动或重建。

## M1-A · Runtime Foundation

### Metro 与 Core 导入

`apps/mobile/metro.config.js` 将仓库根目录加入 `watchFolders`，并把 `apps/mobile/node_modules` 与仓库根 `node_modules` 同时加入解析路径。Metro 真实打包验证成功：

- `npx expo export --platform ios --output-dir .expo-export-check --clear`
- 结果：`iOS Bundled ... (703 modules)`
- 临时导出目录已删除，未进入提交。

### Mobile SQLite Adapter

- 使用 `expo-sqlite`，通过窄接口 `SqlDriver` 隔离平台绑定。
- 生产路径：`openMobileSqlDriver` → `expo-sqlite` → iOS app sandbox `Documents/SQLite`。
- 测试路径：`node:sqlite` driver 替身，执行的是同一套 adapter SQL、迁移、事务和 codec。
- Schema 与 Desktop 语义一致：相同 14 张表、列、约束、索引、`STRICT` 类型和 schema version 1。
- Mobile 自己负责 migration/bootstrap；未读取任何 Desktop 用户数据库。
- 修复了同毫秒写入时“最新在前”被静默反转的问题：排序使用 `ORDER BY created_at DESC, rowid DESC`。
- 主题偏好不进入 `jianyuan.sqlite`；它使用独立的 `ExpoSQLiteStorage` 文件。

### Composition Root

`createMobileComposition` 是唯一的依赖装配点。React 组件不自己 `new` repository、service 或 adapter。

明确分离：

- Core：`packages/core`
- Mobile SQLite Adapter：`src/storage`
- Mobile Provider：`packages/providers/ai`（M1 使用 `DisabledAIProvider`）
- Mobile SecretStore：`src/runtime/secret-store`

### Record 闭环

真实链路：

输入原话 → `MobileRuntime.capture` → `IngestionService` → Core → Mobile SQLite → Record timeline

验证覆盖：

- 保存 Record 成功。
- 完全关闭 runtime，再用新 adapter 打开同一 SQLite 文件，Record 仍然存在。
- 空输入被拒绝且不写入。
- 原文保持不变，包括“可能 / 好像”等模态词。
- 保存 Record 不调用 AI Provider；Provider 方法被替换为会抛错的 tripwire 后仍能保存。
- 没有 API key、Keychain 不可用时，Record 仍能保存。

## M1-B · Mobile Shell

- 四个 Bottom Tab：记录、觉察、理解、探索。
- Settings 使用独立入口，不放进 Bottom Tab。
- 导航隔离是结构性的：`renderActiveSpace` 只返回当前空间的一个元素，非活动空间不会被构造。
- 回归测试断言：每个 tab 切换后，只有当前空间的 testID 存在，其他空间完全不在渲染树中。

## M1-C · Pair A Theme

- 支持 System / Light / Dark，默认 System。
- Dark 使用 Deep Amber，Light 使用 Warm Paper。
- 基础 token 覆盖背景、surface、主色、正文、弱化文字、边框、强调色、成功/危险色、间距、圆角和字号。
- M1 未加入复杂 Motion / 水波动画。
- 外观偏好属于展示层，不进入 Core、不进入 `jianyuan.sqlite`。
- Settings 中的主题选择通过独立的 `expo-sqlite/kv-store` 持久化。

## M1-D · SecretStore Skeleton

- 接口已可接入，优先使用 `expo-secure-store`。
- API key 只允许进入 Keychain，不进入 SQLite。
- SecretStore 失败会降级为 `unavailable`，不会导致 App 崩溃，也不影响 Record。
- 测试会直接读取 SQLite 文件字节，确认测试 key 不出现在数据库和 WAL 中。

### Entitlement 审计

当前 `app.json` 只启用 `expo-sqlite` 和 `expo-secure-store` 插件。按当前插件源码核对：

- 没有 `aps-environment`。
- 没有 App Groups。
- 没有显式声明 `keychain-access-groups`。
- `expo-secure-store` 插件只处理 `NSFaceIDUsageDescription` 和 Android backup rules，不会自动创建 keychain access group。

风险：未签名或重新签名构建下，Keychain 可能因签名身份、app identifier 或 entitlement 不匹配而不可用。代码已把这种情况处理为降级状态，但 M1 不承诺未签名构建下 Keychain 一定可用。

## M1-E · Tests

Mobile 测试：8 个文件 / 68 个测试全部通过。

覆盖：

1. Mobile 能 import Core。
2. Record create 成功。
3. Save Record 不调用 AI Provider。
4. SQLite adapter contract。
5. repository reopen 后 Record 仍可读取。
6. 空数据库正常。
7. inactive navigation space 不渲染。
8. theme preference 不进入 Core / `jianyuan.sqlite`。
9. SHA-256 与 `node:crypto` 一致。
10. Mobile codec 与 Desktop codec 一致。
11. Mobile schema 与 Desktop schema 一致。
12. SecretStore 降级与 key 不落 SQLite。

`expo-sqlite` 无法在 Node test runtime 加载，因此采用“窄 driver seam + contract test + 真实 SQLite 文件”的方案，没有为了测试修改 Core。

## M1-F · iOS Native Build

本机为 Windows。实测 `expo prebuild --platform ios` 会被 Expo 跳过，并提示必须在 macOS/Linux 上运行。因此：

- 本机已验证：`npx expo config --type prebuild --json` 能正确解析 `app.json`、插件和 iOS bundle identifier。
- 本机已验证：Metro 可以真实生成 iOS bundle（703 modules）。
- 本机未生成：`ios/` 原生工程、Xcode workspace、scheme、真实 entitlements 文件。
- 真实原生工程值只能在 macOS runner 上产出并记录。

已知命名事实：应用名“见渊”经 Expo 的 `sanitizedName` 处理后结果为 `app`，因此工作流不硬编码工程名，而是在打包阶段统一放入 `Payload/Jianyuan.app`。

`app.json` 当前值：

- name：见渊
- slug：`jianyuan-mobile`
- version：`0.2.0`
- iOS bundleIdentifier：`com.jianyuan.personalawareness`
- buildNumber：`1`
- supportsTablet：false
- userInterfaceStyle：automatic
- icon：`./assets/icon.png`，1024×1024、无 alpha 通道

## M1-G · GitHub Actions 未签名 IPA

工作流：`.github/workflows/ios-unsigned.yml`

- 触发方式：`workflow_dispatch`
- runner：`macos-latest`
- Node：24（与本机验证一致，`node:sqlite` 测试需要）
- 不使用 EAS。
- 不使用任何 Apple certificate、profile 或 Team。
- 不使用任何 secret。
- 构建：`iphoneos Release`
- 签名开关：`CODE_SIGNING_ALLOWED=NO`、`CODE_SIGNING_REQUIRED=NO`、`CODE_SIGN_IDENTITY=""`、`EXPANDED_CODE_SIGN_IDENTITY=""`
- 从真实 `Release-iphoneos/*.app` 手工打包为 `Payload/Jianyuan.app`。
- 产物：`Jianyuan-iOS-unsigned.ipa`、`Jianyuan-iOS-unsigned.app.zip`、`SHA256SUMS.txt`。
- CI 门禁：`UNSIGNED IPA CHECK: PASS` 才上传 artifact。

门禁检查：

- `embedded.mobileprovision` 不存在。
- 主 App 没有 `_CodeSignature`。
- 主 App 没有有效 Apple 签名身份。
- 嵌套 framework / appex / dylib 逐个执行 `codesign` 审计。
- 没有残留 `CodeResources`。

工作流 YAML 已通过 Python `yaml.safe_load` 校验：1 个 job、17 个 step。

## 验证结果

| 检查 | 结果 |
|------|------|
| Mobile tests | 8 files / 68 tests PASS |
| Mobile typecheck | PASS |
| Metro iOS bundle | PASS（703 modules） |
| Root tests | 47 files / 856 tests PASS |
| Root typecheck | PASS |
| iOS prebuild config | PASS（resolved config） |
| iOS 原生工程生成 | 未在本机执行（Windows 不支持） |
| 未签名 IPA 真实构建 | 待 GitHub Actions 手动触发 |
| Secret scan（Mobile） | PASS |
| YAML 校验 | PASS |

## 已知限制

1. 未签名 IPA 不能直接安装到普通 iPhone；它主要用于验证原生工程可编译、结构可审计。真机安装需要重新签名。
2. 本报告没有声称在真实 iPhone 上完成过启动验证。M1 用户故事的“写入 → 退出 → 重启后仍在”是通过真实 SQLite 文件在本机测试中验证的，设备级验证需要等 macOS runner 产出并重新签名后再做。
3. Keychain 在未签名或重签名构建下的行为存在不确定性，已按降级状态处理。
4. 当前工作流尚未在 GitHub Actions 上真实执行；触发后应把 runner 输出的 workspace、scheme、bundle identifier、entitlements 和 SHA256 回填到本报告。

## 下一步

1. 提交并推送 `apps/mobile/**` 与 `.github/workflows/ios-unsigned.yml`。
2. 在 GitHub Actions 手动触发 `iOS Unsigned Build`。
3. 下载 `Jianyuan-iOS-unsigned.ipa` 和 `SHA256SUMS.txt`。
4. 如要真机验证，使用个人签名重新签名后安装。
5. 把 macOS runner 的真实原生配置和 SHA256 回填到本报告。

# Jianyuan v0.2.2 · Functional Foundation Release Report

Generated: 2026-09-16 (Asia/Shanghai)

## RELEASE COMMIT

- Release preparation commit: `7400976e62b3ae21431a4ce53faaf766781872aa`
- Commit subject: `chore(release): prepare v0.2.2`
- Author / committer: `starlighteryuan-rgb <327797796+starlighteryuan-rgb@users.noreply.github.com>`
- Branch: `phase-9-freeze`
- The final annotated tag points to the release-report commit that follows this
  preparation commit and contains only this report update.

## TAG

- Tag: `v0.2.2`
- Status: to be created locally after this report is committed and pushed
- Type: annotated

## VERSION SOURCES

Release version: `0.2.2`

| Source | Version |
|--------|---------|
| `package.json` | `0.2.2` |
| `apps/desktop/package.json` | `0.2.2` |
| `apps/desktop/src-tauri/tauri.conf.json` | `0.2.2` |
| `apps/desktop/src-tauri/Cargo.toml` | `0.2.2` |
| `apps/desktop/src-tauri/Cargo.lock` | `0.2.2` |
| `apps/mobile/package.json` | `0.2.2` |
| `apps/mobile/app.json` | `0.2.2` |
| `packages/core/package.json` | `0.2.2` |
| `packages/providers/ai/package.json` | `0.2.2` |
| `packages/providers/deterministic/package.json` | `0.2.2` |
| `packages/storage/memory/package.json` | `0.2.2` |
| `packages/storage/sqlite/package.json` | `0.2.2` |
| `package-lock.json` | `0.2.2` |
| `apps/desktop/package-lock.json` | `0.2.2` |
| `apps/mobile/package-lock.json` | `0.2.2` |

## TEST RESULTS

| Suite | Result |
|-------|--------|
| Root tests | 47 files / 857 tests PASS |
| Root typecheck | PASS |
| Mobile tests | 15 files / 115 tests PASS |
| Mobile typecheck | PASS |
| Desktop tests | 4 files / 16 tests PASS |
| Desktop typecheck | PASS |
| `git diff --check` | PASS |

## DESKTOP BUILD

Command run from `apps/desktop` with the validated stable Rust toolchain:

```powershell
$env:CARGO_HOME='D:\Hackson\project build\.cargo-home-desktop'
$env:PATH='C:\Users\26067\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin;C:\Program Files\nodejs;D:\Hackson\project build\apps\desktop\node_modules\.bin;' + $env:PATH
node.exe '.\node_modules\@tauri-apps\cli\tauri.js' build
```

Result: PASS. The build re-ran the renderer, bundled Node runtime, Rust release
binary, and NSIS installer. Output paths:

- `D:\Hackson\project build\apps\desktop\src-tauri\target\release\jianyuan-desktop.exe`
- `D:\Hackson\project build\apps\desktop\src-tauri\target\release\bundle\nsis\见渊_0.2.2_x64-setup.exe`

| Asset | Size (bytes) | Modified | SHA256 |
|---|---:|---|---|
| `jianyuan-desktop.exe` | 10,458,112 | 2026-09-16 15:01:58 +08:00 | `1669E81EE585CC7931CD58AE7D460CA3A594BC7FE977E216A68C35C50BDC520A` |
| `见渊_0.2.2_x64-setup.exe` | 25,580,485 | 2026-09-16 15:01:58 +08:00 | `AAB8AE71703C2B4653AAF8AC9029147EDD012F461A0FB8C052198FB26189015B` |

## DESKTOP SMOKE TEST

BUILD/STARTUP validation: PASS.

- Latest `jianyuan-desktop.exe` launched with a real main window titled `见渊`.
- Main process stayed alive and responding.
- Bundled `node.exe` sidecar started as a child process.
- Window close exited gracefully; no project `jianyuan-desktop.exe` or bundled
  `node.exe` process remained afterward.
- The release binary uses `windows_subsystem = "windows"` in release builds.
- The sidecar spawn path uses Windows `CREATE_NO_WINDOW` (`0x08000000`) while
  retaining piped stdin/stderr and captured runtime diagnostics.

Native validation harness: PASS.

- `sqliteOpened`: `true`
- `recordRecoveredAfterRestart`: `true`
- `reflectionRecoveredAfterRestart`: `true`
- `credentialRestartRead`: `true`
- `credentialDelete`: `true`
- `credentialMissingAfterDelete`: `true`
- `sidecarStarted`: `true`
- `cleanupCompleted`: `true`
- `errors`: `[]`

MANUAL UI validation: not performed in this release pass. The adaptive
Awareness source and bundle were verified, but no claim is made about a
human-observed end-to-end UI session.

## IOS ACTIONS RUN

- Workflow: `iOS Unsigned Build`
- Run: `35068138038`
- URL: `https://github.com/starlighteryuan-rgb/jianyuan/actions/runs/35068138038`
- Head SHA: `7400976e62b3ae21431a4ce53faaf766781872aa`
- Trigger: `workflow_dispatch`
- Runner: `macos-latest`
- Result: PASS in 5m 24s.

The workflow completed mobile dependency installation, typecheck, mobile tests,
Expo prebuild, CocoaPods installation, `iphoneos` Release compilation,
unsigned IPA packaging, signature audit, hashing, and artifact upload.

## IOS UNSIGNED VALIDATION

- `IOS PREBUILD: PASS`
- `iphoneos Release: PASS`
- `UNSIGNED IPA CHECK: PASS`
- Workspace: `app.xcworkspace`
- Scheme: `app`
- Bundle identifier: `com.jianyuan.personalawareness`
- Main executable: `app`
- `embedded.mobileprovision`: ABSENT
- `_CodeSignature`: ABSENT
- Apple signing identity: NONE
- Nested signature artifacts: `0`
- CodeResources artifacts: `0`

The downloaded artifact hashes match the workflow log exactly. This is an
unsigned development/test IPA, not an App Store or notarized distribution
package.

## ASSETS

- Windows installer: `见渊_0.2.2_x64-setup.exe`
- Windows portable binary: `jianyuan-desktop.exe`
- iOS unsigned IPA: `Jianyuan-iOS-unsigned.ipa`
- iOS unsigned app archive: `Jianyuan-iOS-unsigned.app.zip`
- Checksums: `SHA256SUMS.txt`

The iOS assets are downloaded from GitHub Actions run `35068138038` and were
re-hashed locally before being listed below.

## SHA256

```text
AAB8AE71703C2B4653AAF8AC9029147EDD012F461A0FB8C052198FB26189015B  见渊_0.2.2_x64-setup.exe
1669E81EE585CC7931CD58AE7D460CA3A594BC7FE977E216A68C35C50BDC520A  jianyuan-desktop.exe
06CEC04D8278295A3403EFA4119F023689F4040C0B3463E1F0707608DEC2CC42  Jianyuan-iOS-unsigned.ipa
2E64B357CEB78BB92D88D0EE0E2200A4F47A7513E0FC55806F29CA598CC35858  Jianyuan-iOS-unsigned.app.zip
```

## SECRET SCAN

- Source scan excluding the intentional fake test key: PASS.
- Renderer and runtime text artifact scan: PASS.
- Binary prefix scan of EXE and installer: PASS after contextual review.
- The installer contained a single three-byte `sk-` sequence at offset
  `14358298` inside compressed/random binary data. Context inspection showed no
  complete token, no `sk-must-not-be-in-sqlite` test key, no GitHub token, no
  private-key marker, and no user database filename.
- Full token-pattern searches for `sk-...`, `ghp_`, `gho_`, `ghu_`, `ghs_`,
  `github_pat_`, `AKIA...`, `xoxb-`, and private-key headers returned no
  complete credential.
- No SQLite database, user Record database, API key, provisioning profile, or
  signing certificate was found in the release assets.

## KNOWN LIMITATIONS

- Mobile Reflection presentation state may occasionally lag behind a successful
  persistence result; this is a UI state issue, not evidence of data loss.
- Exploration has not received sufficient real-device coverage because
  persistent Relation data is still limited.
- Desktop does not implement the Mobile Automatic Awareness Inbox.
- SQLite is not fully encrypted at rest.
- Windows installer is unsigned.
- The iOS IPA is unsigned and requires the user's own signing or re-signing
  environment.

## GITHUB RELEASE

- Tag: `v0.2.2` (annotated), created locally after this report commit.
- Release title: `见渊 v0.2.2 — Functional Foundation`.
- GitHub Release creation and asset upload are performed only after the final
  report commit and tag are pushed.
- The existing `v0.2.0-alpha` and `v0.2.0-alpha.1` tags, releases, assets, and
  publication timestamps are preserved unchanged.

## NEXT PHASE

M3 Mobile UI / UX & Motion under v0.3.0 development.

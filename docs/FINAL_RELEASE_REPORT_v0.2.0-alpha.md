# Jianyuan v0.2.0-alpha · Final Release Report

Generated: 2026-09-15

## Release Commit

- Hash: `0289b93`
- Message: `release: v0.2.0-alpha early preview`
- Branch: `phase-9-freeze`
- Files changed: 336
- Insertions: 44,743 / Deletions: 1,360
- Working tree after commit: clean

## Local Tag

- Tag: `v0.2.0-alpha`
- Type: annotated
- Points to: `0289b93`
- Push status: NOT pushed (credential isolation; see GitHub commands below)

## Installer

| Field | Value |
|-------|-------|
| Path | `apps/desktop/src-tauri/target/release/bundle/nsis/见渊_0.2.0-alpha_x64-setup.exe` |
| Size | 25,584,478 bytes (24.40 MB) |
| SHA256 | `8A4FC8E961CD0AC057C78FEF3EA94722121F43B8368B622F8120AE6EF5080DAD` |
| Built at | 2026-09-15 09:26:41 |
| Target | Windows x64 NSIS |
| Bundle type | NSIS installer (double-click, no terminal required) |

## Desktop Executable

| Field | Value |
|-------|-------|
| Path | `apps/desktop/src-tauri/target/release/jianyuan-desktop.exe` |
| Size | 10,458,624 bytes |
| SHA256 | `75DC4CFCEB42E0E61778DEFBC1F20BC10A7C7610FCC1B1BE080C23DB7BA61F96` |
| Built at | 2026-09-15 09:25:56 |
| Rust toolchain | stable-x86_64-pc-windows-msvc (cargo 1.97.1) |
| UI version | Pair A production styles + theme preference + water geometry |

## Secret Scan

| Check | Result |
|-------|--------|
| API key patterns (sk-, ghp_, github_pat_, glpat_, AIza, AKIA, xox) | PASS - none found |
| Private key blocks (RSA/EC/DSA/OpenSSH) | PASS - none found |
| `.env` file tracked in git | PASS - not tracked |
| `.env` in `.gitignore` | PASS - confirmed |
| Database files (`*.sqlite`, `*.db`) tracked | PASS - none |
| Binary artifacts (`*.exe`, installers) tracked | PASS - none |
| Placeholder-only `.env.example` | PASS - confirmed |

## Release Notes

- File: `RELEASE_NOTES_v0.2.0-alpha.md`
- Committed in release commit: YES
- Ready for `gh release create --notes-file`: YES

## Version Unification

| Location | Version |
|----------|---------|
| `package.json` | `0.2.0-alpha` |
| `apps/desktop/package.json` | `0.2.0-alpha` |
| `apps/desktop/src-tauri/tauri.conf.json` | `0.2.0-alpha` |
| `apps/desktop/src-tauri/Cargo.toml` | `0.2.0-alpha` |
| `packages/core/package.json` | `0.2.0-alpha` |
| `packages/storage/memory/package.json` | `0.2.0-alpha` |
| `packages/storage/sqlite/package.json` | `0.2.0-alpha` |
| `packages/providers/ai/package.json` | `0.2.0-alpha` |
| `packages/providers/deterministic/package.json` | `0.2.0-alpha` |

## Test Evidence

| Suite | Status |
|-------|--------|
| Root full tests | 47 files / 856 tests PASS |
| Desktop unit tests | 3 files / 13 tests PASS |
| Core package tests | 3 files / 6 tests PASS |
| Storage memory tests | 3 files / 3 tests PASS |
| Storage SQLite tests | 2 files / 5 tests PASS |
| Provider AI tests | 2 files / 15 tests PASS |
| Core spike tests | 1 file / 2 tests PASS |
| SQLite + AI SQLite focused | 2 files / 3 tests PASS |
| Root typecheck | PASS |
| Desktop typecheck | PASS |
| Web production build | PASS (Next.js 15) |
| Desktop renderer build | PASS (Vite 8) |
| Desktop runtime build | PASS (esbuild) |
| Tauri release build | PASS |
| NSIS installer build | PASS |
| git diff --check | PASS |
| Browser validation (Light/Dark/System + 5 spaces + ring geometry) | PASS |

## GitHub Release - Commands for Authenticated CMD

The following commands were NOT run in this session because GitHub CLI credentials
are isolated from this agent environment. Run them in your authenticated CMD window.

```cmd
cd /d "D:\Hackson\project build"

git push origin phase-9-freeze
git push origin v0.2.0-alpha

gh release create v0.2.0-alpha --title "见渊 v0.2.0-alpha · Early Preview" --notes-file RELEASE_NOTES_v0.2.0-alpha.md --prerelease "apps/desktop/src-tauri/target/release/bundle/nsis/见渊_0.2.0-alpha_x64-setup.exe"
```

The demo download link becomes available at:

`https://github.com/starlighteryuan-rgb/jianyuan/releases/download/v0.2.0-alpha/%E8%A7%81%E6%B8%8A_0.2.0-alpha_x64-setup.exe`

(URL-encoded Chinese filename: 见渊_0.2.0-alpha_x64-setup.exe)

## Release Target

- Product: 见渊
- Version: `0.2.0-alpha`
- Stage: Early Preview / Alpha
- Platform: Windows Desktop (x64)

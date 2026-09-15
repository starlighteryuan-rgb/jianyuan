# Jianyuan v0.2.0-alpha · Navigation / Console Hotfix Report

Date: 2026-09-15
Commit: `d5d6757`

## Navigation Regression

ROOT CAUSE:
Phase 10 `styles.css` rewrite removed the Phase 9 section visibility rules
(`main[data-active-space] > [data-space]`). `App.tsx` renders all sections
in the DOM and relies entirely on CSS to show only the active space, so all
sections remained visible while the heading and active nav still changed.

FILES CHANGED:
- `apps/desktop/src/styles.css`: restored the 5-space visibility gating rules.
- `apps/desktop/src/tests/navigation.test.tsx`: new regression test.
- `apps/desktop/vitest.config.ts`: jsdom for `.test.tsx`.
- `apps/desktop/package.json` / lockfile: jsdom + testing-library dev deps.
- `apps/desktop/src-tauri/src/main.rs`: Windows GUI subsystem (console fix).
- `apps/desktop/src-tauri/src/lib.rs`: `CREATE_NO_WINDOW` for sidecar spawn.

REGRESSION TEST:
- `src/tests/navigation.test.tsx` (2 tests, PASS)
- Asserts stylesheet contains `display: none` gating for all five spaces.
- Asserts each nav click changes `main[data-active-space]` and that only
  matching `data-space` sections exist in the active state.

DESKTOP UI SMOKE (renderer, real Chromium click-through):
- 记录: active=records, visible=[records, records], PASS
- 觉察: active=awareness, visible=[awareness], PASS
- 理解: active=reflection, visible=[reflection], PASS
- 探索: active=exploration, visible=[exploration], PASS
- 设置: active=settings, visible=[settings, settings, settings, settings], PASS

## Console Window Fix

CONSOLE WINDOW SOURCE:
1. `main.rs` lacked `windows_subsystem = "windows"`, so the release Tauri exe
   allocated a visible console.
2. The bundled Node sidecar was spawned via `std::process::Command` without
   `CREATE_NO_WINDOW`, creating a second console behind the sidecar.

FIX:
1. `main.rs` now declares:
   `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`
   Debug builds still keep the console for developer logs.
2. Windows-only spawn path sets `CREATE_NO_WINDOW (0x08000000)` through
   `CommandExt::creation_flags` before spawning the bundled Node runtime.
   `stdin/stdout/stderr` piping and diagnostics behaviour are unchanged.

SIDEcar STILL RUNNING: PASS
- Sidecar starts and stays alive while the app runs.
- After the main window closes, the sidecar exits cleanly (verified twice).
- Diagnostics log shows `runtime_spawned` and `runtime_stopped`.

EXTRA CONSOLE WINDOW: ABSENT
- Enumerated all top-level windows owned by the release exe process.
- Only `Tauri Window` (`见渊`), IME, and framework helper windows exist.
- No `ConsoleWindowClass` / terminal window is created.

## Validation

| Check | Result |
|-------|--------|
| Desktop tests | 4 files / 15 tests PASS |
| Root full tests | 47 files / 856 tests PASS |
| Desktop typecheck | PASS |
| Root typecheck | PASS |
| Desktop renderer build | PASS |
| Web production build | PASS |
| git diff --check | PASS |
| Real Tauri release build | PASS |
| NSIS installer build | PASS |
| Secret scan (tracked files) | PASS |
| Renderer bundle secret scan | PASS |
| Real native startup | PASS (main window + sidecar alive) |
| Sidecar cleanup on exit | PASS |
| Extra console window | ABSENT |

## Artifacts

### Desktop Executable

| Field | Value |
|-------|-------|
| Path | `apps/desktop/src-tauri/target/release/jianyuan-desktop.exe` |
| Size | $exeSize bytes |
| Built | $exeTime |
| SHA256 | `$exeHash` |

### Windows Installer (replacement for v0.2.0-alpha asset)

| Field | Value |
|-------|-------|
| Path | `apps/desktop/src-tauri/target/release/bundle/nsis/见渊_0.2.0-alpha_x64-setup.exe` |
| Size | $installerSize bytes |
| Built | $installerTime |
| SHA256 | `$installerHash` |

## GitHub Asset Replacement

The current `v0.2.0-alpha` release still contains the old installer with both
regressions. Run these commands in an authenticated CMD to replace it:

```cmd
cd /d "D:\Hackson\project build"

gh release delete-asset v0.2.0-alpha "见渊_0.2.0-alpha_x64-setup.exe" --yes

gh release upload v0.2.0-alpha "apps/desktop/src-tauri/target/release/bundle/nsis/见渊_0.2.0-alpha_x64-setup.exe"
```

Do not create a new release version.

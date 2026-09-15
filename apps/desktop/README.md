# Jianyuan Desktop Runtime Spike

This app is a minimal Tauri 2 presentation/runtime for the existing Jianyuan
packages. It does not duplicate Domain or Application code.

```text
React WebView
  -> authenticated localhost runtime API
  -> Desktop composition root
  -> packages/core
  -> packages/storage/sqlite
  -> packages/providers/ai
```

The WebView cannot load the Node-only SQLite adapter directly. Tauri therefore
starts a local Node sidecar that owns the existing composition root. The Rust
host resolves `app_local_data_dir`, starts and stops that sidecar, and bridges
the OS credential store. The sidecar binds only to `127.0.0.1` and requires a
random bearer token generated for each process lifetime.

## Local commands

```powershell
npm install
npm test
npm run typecheck
npm run build
npm run tauri -- dev
```

Release builds copy the build-time Node executable into `runtime-dist/node.exe`
and ship it as a Tauri resource, so an installed app does not require Node on
the user's `PATH`. Development builds may still fall back to the host `node`.
Windows native compilation also requires the MSVC C++ toolchain and a Windows
SDK.

The database is `jianyuan.sqlite` below Tauri's system-resolved local app-data
directory. `ai-provider.json` stores only provider ID, Base URL, and selected
model. The API key is stored through Windows Credential Manager or macOS
Keychain and is never written to that JSON file, SQLite, or localStorage.

See `docs/DESKTOP_RUNTIME_SPIKE_REPORT.md` for verification results and
`docs/DESKTOP_RUNTIME_SECURITY_RESEARCH.md` for primary-source security and
encryption research.

## User-session native validation

The explicit two-stage validation harness uses the real Tauri
`app_local_data_dir` and a dedicated Windows Credential Manager entry. It does
not run during normal startup and does not require Node on `PATH`:

```cmd
run-native-validation.cmd prepare
```

After the app opens, wait for the prepare checkpoint, then close the app
completely. The launcher checks that
`native-validation-checkpoint.json` exists before reporting prepare success.
Run the second phase from the same user session:

```cmd
run-native-validation.cmd verify
```

The final `native-validation-result.json` is written beside the SQLite file in
the app-local data directory (with a `%TEMP%` fallback only when that directory
is not writable). The file contains statuses and sanitized error codes only;
validation Record/Reflection text and the test credential are never written to
it. The harness removes only the generated IDs from its checkpoint, never all
user data. The same mode can be launched directly with
`jianyuan-desktop.exe --native-validation --phase=prepare|verify`, or with
`JIANYUAN_NATIVE_VALIDATION=1` and
`JIANYUAN_NATIVE_VALIDATION_PHASE=prepare|verify`.

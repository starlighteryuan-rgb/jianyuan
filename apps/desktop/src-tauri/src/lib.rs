use std::{
    fs,
    io::{BufRead, BufReader, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

#[cfg(target_os = "windows")]
use std::collections::HashMap;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::Serialize;
use tauri::{Manager, Runtime};
use uuid::Uuid;

const SECRET_SERVICE: &str = "com.jianyuan.desktop.ai";
const SECRET_ACCOUNT: &str = "openai-compatible";
const VALIDATION_SECRET_SERVICE: &str = "com.jianyuan.desktop.native-validation";
const VALIDATION_SECRET_ACCOUNT: &str = "phase-7-3";
const VALIDATION_SECRET: &str = "jianyuan-native-validation-secret";

pub trait SecretStore: Send + Sync {
    fn configured(&self) -> Result<bool, String>;
    fn get(&self) -> Result<Option<String>, String>;
    fn set(&self, value: &str) -> Result<(), String>;
    fn delete(&self) -> Result<(), String>;
}

#[derive(Default)]
struct SystemSecretStore;

impl SystemSecretStore {
    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::store_status()
            .as_ref()
            .map_err(|error| format!("System credential store is unavailable: {error}"))?;

        #[cfg(target_os = "windows")]
        {
            let modifiers = HashMap::from([("persistence", "local")]);
            let inner =
                keyring_core::Entry::new_with_modifiers(SECRET_SERVICE, SECRET_ACCOUNT, &modifiers)
                    .map_err(|error| format!("System credential entry is unavailable: {error}"))?;
            Ok(keyring::Entry { inner })
        }

        #[cfg(not(target_os = "windows"))]
        keyring::Entry::new(SECRET_SERVICE, SECRET_ACCOUNT)
            .map_err(|error| format!("System credential entry is unavailable: {error}"))
    }
}

impl SecretStore for SystemSecretStore {
    fn configured(&self) -> Result<bool, String> {
        Ok(self.get()?.is_some())
    }

    fn get(&self) -> Result<Option<String>, String> {
        match self.entry()?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(format!("System credential read failed: {error}")),
        }
    }

    fn set(&self, value: &str) -> Result<(), String> {
        if value.trim().is_empty() {
            return Err("API Key must not be empty.".to_string());
        }
        self.entry()?
            .set_password(value)
            .map_err(|error| format!("System credential write failed: {error}"))
    }

    fn delete(&self) -> Result<(), String> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("System credential delete failed: {error}")),
        }
    }
}

#[derive(Default)]
struct NativeValidationSecretStore;

impl NativeValidationSecretStore {
    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::store_status()
            .as_ref()
            .map_err(|error| format!("System credential store is unavailable: {error}"))?;

        #[cfg(target_os = "windows")]
        {
            let modifiers = HashMap::from([("persistence", "local")]);
            let inner = keyring_core::Entry::new_with_modifiers(
                VALIDATION_SECRET_SERVICE,
                VALIDATION_SECRET_ACCOUNT,
                &modifiers,
            )
            .map_err(|error| format!("System credential entry is unavailable: {error}"))?;
            Ok(keyring::Entry { inner })
        }

        #[cfg(not(target_os = "windows"))]
        keyring::Entry::new(VALIDATION_SECRET_SERVICE, VALIDATION_SECRET_ACCOUNT)
            .map_err(|error| format!("System credential entry is unavailable: {error}"))
    }

    fn write(&self) -> Result<(), String> {
        self.entry()?
            .set_password(VALIDATION_SECRET)
            .map_err(|error| format!("System credential write failed: {error}"))
    }

    fn read_matches(&self) -> Result<bool, String> {
        match self.entry()?.get_password() {
            Ok(value) => Ok(value == VALIDATION_SECRET),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(error) => Err(format!("System credential read failed: {error}")),
        }
    }

    fn delete(&self) -> Result<(), String> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("System credential delete failed: {error}")),
        }
    }
}

#[derive(Default)]
struct DesktopState {
    child: Mutex<Option<Child>>,
    connection: Mutex<Option<RuntimeConnection>>,
    app_data_dir: Mutex<Option<PathBuf>>,
    secrets: SystemSecretStore,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeConnection {
    endpoint: String,
    token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SecretStatus {
    configured: bool,
    backend: &'static str,
}

#[derive(Clone, Copy)]
enum NativeValidationPhase {
    Prepare,
    Verify,
}

impl NativeValidationPhase {
    fn as_str(self) -> &'static str {
        match self {
            Self::Prepare => "prepare",
            Self::Verify => "verify",
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CredentialValidationState {
    credential_write: bool,
    credential_read: bool,
    credential_restart_read: bool,
    credential_delete: bool,
    credential_missing_after_delete: bool,
    errors: Vec<&'static str>,
}

fn native_validation_phase() -> Result<Option<NativeValidationPhase>, String> {
    let args: Vec<String> = std::env::args().collect();
    let enabled = args.iter().any(|arg| arg == "--native-validation")
        || matches!(
            std::env::var("JIANYUAN_NATIVE_VALIDATION").as_deref(),
            Ok("1") | Ok("true") | Ok("TRUE")
        );
    if !enabled {
        return Ok(None);
    }

    let requested = args
        .iter()
        .find_map(|arg| arg.strip_prefix("--phase="))
        .map(str::to_owned)
        .or_else(|| std::env::var("JIANYUAN_NATIVE_VALIDATION_PHASE").ok());
    match requested.as_deref() {
        Some("prepare") => Ok(Some(NativeValidationPhase::Prepare)),
        Some("verify") => Ok(Some(NativeValidationPhase::Verify)),
        _ => Err(
            "Native validation requires --phase=prepare|verify or JIANYUAN_NATIVE_VALIDATION_PHASE."
                .to_string(),
        ),
    }
}

fn write_credential_validation_state(
    app_data_dir: &Path,
    phase: NativeValidationPhase,
) -> Result<(), String> {
    let store = NativeValidationSecretStore;
    let mut errors = Vec::new();
    let mut state = CredentialValidationState {
        credential_write: false,
        credential_read: false,
        credential_restart_read: false,
        credential_delete: false,
        credential_missing_after_delete: false,
        errors: Vec::new(),
    };

    match phase {
        NativeValidationPhase::Prepare => {
            state.credential_write = store.write().map_err(|_| "credential_write_failed").is_ok();
            if !state.credential_write {
                errors.push("credential_write_failed");
            }
            state.credential_read = store
                .read_matches()
                .map_err(|_| "credential_read_failed")
                .unwrap_or(false);
            if !state.credential_read {
                errors.push("credential_read_failed");
            }
        }
        NativeValidationPhase::Verify => {
            state.credential_restart_read = store
                .read_matches()
                .map_err(|_| "credential_restart_read_failed")
                .unwrap_or(false);
            if !state.credential_restart_read {
                errors.push("credential_restart_read_failed");
            }
            state.credential_delete = store
                .delete()
                .map_err(|_| "credential_delete_failed")
                .is_ok();
            if !state.credential_delete {
                errors.push("credential_delete_failed");
            }
            state.credential_missing_after_delete = store
                .read_matches()
                .map(|matches| !matches)
                .map_err(|_| "credential_missing_after_delete_failed")
                .unwrap_or(false);
            if !state.credential_missing_after_delete {
                errors.push("credential_missing_after_delete_failed");
            }
        }
    }
    state.errors = errors;
    let path = app_data_dir.join("native-validation-credential-state.json");
    fs::write(
        path,
        serde_json::to_vec_pretty(&state)
            .map_err(|_| "Native validation credential state serialization failed.".to_string())?,
    )
    .map_err(|_| "Native validation credential state could not be written.".to_string())
}

fn normalize_runtime_path(path: PathBuf) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let value = path.to_string_lossy();
        if let Some(stripped) = value.strip_prefix("\\\\?\\") {
            return PathBuf::from(stripped);
        }
    }
    path
}

fn local_runtime_script<R: Runtime>(app: &tauri::App<R>) -> Result<PathBuf, String> {
    let release_candidate = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Desktop resource directory is unavailable: {error}"))?
        .join("runtime-dist")
        .join("server.mjs");
    if release_candidate.exists() {
        return Ok(normalize_runtime_path(release_candidate));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let adjacent_candidate = parent.join("runtime-dist").join("server.mjs");
            if adjacent_candidate.exists() {
                return Ok(normalize_runtime_path(adjacent_candidate));
            }
        }
    }

    if cfg!(debug_assertions) {
        let source_candidate = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or_else(|| "Desktop source directory is unavailable.".to_string())?
            .join("runtime-dist")
            .join("server.mjs");
        if source_candidate.exists() {
            return Ok(normalize_runtime_path(source_candidate));
        }
    }
    Err("The bundled Desktop Node runtime was not found.".to_string())
}

fn local_runtime_node<R: Runtime>(app: &tauri::App<R>) -> Result<PathBuf, String> {
    let runtime_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };
    let resource_candidate = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Desktop resource directory is unavailable: {error}"))?
        .join("runtime-dist")
        .join(runtime_name);
    if resource_candidate.exists() {
        return Ok(normalize_runtime_path(resource_candidate));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let adjacent_candidate = parent.join("runtime-dist").join(runtime_name);
            if adjacent_candidate.exists() {
                return Ok(normalize_runtime_path(adjacent_candidate));
            }
        }
    }

    if cfg!(debug_assertions) {
        let source_candidate = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or_else(|| "Desktop source directory is unavailable.".to_string())?
            .join("runtime-dist")
            .join(runtime_name);
        if source_candidate.exists() {
            return Ok(normalize_runtime_path(source_candidate));
        }
        return Ok(PathBuf::from("node"));
    }

    Err("The bundled Desktop Node executable was not found.".to_string())
}

fn append_diagnostic(app_data_dir: &Path, event: &str) {
    let path = app_data_dir.join("runtime-diagnostics.log");
    match fs::OpenOptions::new().create(true).append(true).open(path) {
        Ok(mut file) => {
            let _ = writeln!(file, "{event}");
        }
        Err(_) => append_fallback_diagnostic(event),
    }
}

fn append_fallback_diagnostic(event: &str) {
    let path = std::env::temp_dir().join("jianyuan-desktop-runtime.log");
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{event}");
    }
}

fn append_runtime_stderr(app_data_dir: &Path, line: &str) {
    let normalized = line.trim();
    if normalized.is_empty() {
        return;
    }
    let lower = normalized.to_ascii_lowercase();
    if [
        "api_key",
        "apikey",
        "authorization",
        "bearer ",
        "secret",
        "verbatim",
        "reflection",
        "freetext",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
    {
        append_diagnostic(app_data_dir, "runtime_stderr redacted");
        return;
    }
    if lower.starts_with("error:")
        || lower.contains("err_sqlite")
        || lower.contains("unable to open database")
        || lower.starts_with("node.js")
    {
        let bounded = normalized.chars().take(512).collect::<String>();
        append_diagnostic(app_data_dir, &format!("runtime_stderr {bounded}"));
    }
}

fn available_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Cannot reserve a Desktop runtime port: {error}"))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("Cannot resolve the Desktop runtime port: {error}"))
}

fn start_runtime<R: Runtime>(app: &tauri::App<R>) -> Result<(), String> {
    let state = app.state::<DesktopState>();
    let validation_phase = native_validation_phase()?;
    let app_data_dir = match app.path().app_local_data_dir() {
        Ok(path) => path,
        Err(error) => {
            let message = format!("Desktop AppData directory is unavailable: {error}");
            append_fallback_diagnostic(&format!("runtime_app_data_failed error={message}"));
            return Err(message);
        }
    };
    if let Err(error) = fs::create_dir_all(&app_data_dir) {
        let message = format!("Desktop AppData directory could not be created: {error}");
        append_fallback_diagnostic(&format!("runtime_app_data_create_failed error={message}"));
        return Err(message);
    }
    append_diagnostic(
        &app_data_dir,
        &format!(
            "runtime_start app_data_dir={}",
            app_data_dir.to_string_lossy()
        ),
    );
    if let Some(phase) = validation_phase {
        append_diagnostic(
            &app_data_dir,
            &format!("native_validation_phase={}", phase.as_str()),
        );
        if let Err(error) = write_credential_validation_state(&app_data_dir, phase) {
            append_diagnostic(
                &app_data_dir,
                &format!("native_validation_credential_state_failed error={error}"),
            );
        }
    }
    let runtime_script = match local_runtime_script(app) {
        Ok(path) => path,
        Err(error) => {
            append_diagnostic(
                &app_data_dir,
                &format!("runtime_script_failed error={error}"),
            );
            return Err(error);
        }
    };
    let runtime_node = match local_runtime_node(app) {
        Ok(path) => path,
        Err(error) => {
            append_diagnostic(&app_data_dir, &format!("runtime_node_failed error={error}"));
            return Err(error);
        }
    };
    let port = available_port()?;
    let token = Uuid::new_v4().to_string();
    append_diagnostic(
        &app_data_dir,
        &format!(
            "runtime_spawn_prepare node={} script={} port={port}",
            runtime_node.to_string_lossy(),
            runtime_script.to_string_lossy()
        ),
    );
    let mut command = Command::new(&runtime_node);
    command
        .arg(runtime_script)
        .current_dir(runtime_node.parent().unwrap_or_else(|| Path::new(".")))
        .env("JIANYUAN_DESKTOP_APP_DATA_DIR", &app_data_dir)
        .env("JIANYUAN_DESKTOP_RUNTIME_PORT", port.to_string())
        .env("JIANYUAN_DESKTOP_RUNTIME_TOKEN", &token)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    // The bundled Node sidecar must never create a visible console. Pipe and
    // Stdio handles continue to work normally; only window creation changes.
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    if let Some(phase) = validation_phase {
        command
            .env("JIANYUAN_NATIVE_VALIDATION", "1")
            .env("JIANYUAN_NATIVE_VALIDATION_PHASE", phase.as_str());
    }
    let api_key = match state.secrets.get() {
        Ok(value) => value,
        Err(error) => {
            append_diagnostic(&app_data_dir, &format!("secret_read_failed error={error}"));
            None
        }
    };
    if let Some(api_key) = api_key {
        command.env("JIANYUAN_DESKTOP_API_KEY", api_key);
    }
    let mut child = command.spawn().map_err(|error| {
        let message = format!("Desktop Node runtime could not start: {error}");
        append_diagnostic(
            &app_data_dir,
            &format!("runtime_spawn_failed error={message}"),
        );
        message
    })?;

    if let Some(stderr) = child.stderr.take() {
        let diagnostics_path = app_data_dir.clone();
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                append_runtime_stderr(&diagnostics_path, &line);
            }
        });
    }
    append_diagnostic(&app_data_dir, "runtime_spawned");
    thread::sleep(Duration::from_millis(150));
    if let Ok(Some(status)) = child.try_wait() {
        append_diagnostic(
            &app_data_dir,
            &format!("runtime_exited_early status={status}"),
        );
    } else {
        append_diagnostic(&app_data_dir, "runtime_alive_after_start_check");
    }

    *state
        .child
        .lock()
        .map_err(|_| "Runtime process lock failed.".to_string())? = Some(child);
    *state
        .connection
        .lock()
        .map_err(|_| "Runtime connection lock failed.".to_string())? = Some(RuntimeConnection {
        endpoint: format!("http://127.0.0.1:{port}"),
        token,
    });
    *state
        .app_data_dir
        .lock()
        .map_err(|_| "AppData path lock failed.".to_string())? = Some(app_data_dir);
    Ok(())
}

fn stop_runtime(state: &DesktopState) {
    let app_data_dir = state
        .app_data_dir
        .lock()
        .ok()
        .and_then(|guard| guard.clone());
    if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.as_mut() {
            if let Some(stdin) = child.stdin.as_mut() {
                let _ = stdin.write_all(b"shutdown\n");
                let _ = stdin.flush();
            }
            let _ = child.stdin.take();
            let mut exited = false;
            for _ in 0..20 {
                match child.try_wait() {
                    Ok(Some(_)) => {
                        exited = true;
                        break;
                    }
                    Ok(None) => thread::sleep(Duration::from_millis(50)),
                    Err(_) => break,
                }
            }
            if !exited {
                let _ = child.kill();
            }
            let _ = child.wait();
            if let Some(path) = app_data_dir.as_ref() {
                append_diagnostic(path, "runtime_stopped");
            }
        }
        *guard = None;
    }
}

#[tauri::command]
fn runtime_connection(state: tauri::State<'_, DesktopState>) -> Result<RuntimeConnection, String> {
    state
        .connection
        .lock()
        .map_err(|_| "Runtime connection lock failed.".to_string())?
        .clone()
        .ok_or_else(|| "Desktop runtime is not ready.".to_string())
}

#[tauri::command]
fn app_data_path(state: tauri::State<'_, DesktopState>) -> Result<String, String> {
    state
        .app_data_dir
        .lock()
        .map_err(|_| "AppData path lock failed.".to_string())?
        .as_ref()
        .map(|path| path.to_string_lossy().into_owned())
        .ok_or_else(|| "Desktop AppData path is not ready.".to_string())
}

#[tauri::command]
fn secret_status(state: tauri::State<'_, DesktopState>) -> Result<SecretStatus, String> {
    Ok(SecretStatus {
        configured: state.secrets.configured()?,
        backend: if cfg!(target_os = "windows") {
            "windows-credential-manager"
        } else if cfg!(target_os = "macos") {
            "macos-keychain"
        } else {
            "platform-keyring"
        },
    })
}

#[tauri::command]
fn store_api_key(api_key: String, state: tauri::State<'_, DesktopState>) -> Result<(), String> {
    state.secrets.set(&api_key)
}

#[tauri::command]
fn delete_api_key(state: tauri::State<'_, DesktopState>) -> Result<(), String> {
    state.secrets.delete()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(DesktopState::default())
        .setup(|app| start_runtime(app).map_err(Into::into))
        .invoke_handler(tauri::generate_handler![
            runtime_connection,
            app_data_path,
            secret_status,
            store_api_key,
            delete_api_key
        ])
        .build(tauri::generate_context!())
        .expect("error while building Jianyuan Desktop");

    app.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            stop_runtime(&handle.state::<DesktopState>());
        }
    });
}

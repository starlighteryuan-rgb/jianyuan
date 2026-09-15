// Windows release builds must launch as a GUI app. Without this, allocating a
// console window is the default behaviour and users see a terminal alongside
// the Tauri window. Debug builds keep the console for log visibility.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    jianyuan_desktop_lib::run();
}

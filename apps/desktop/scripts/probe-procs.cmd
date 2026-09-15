@echo off
setlocal EnableExtensions
echo ===== RUNNING PROCESSES (jianyuan / node / cargo / rustc / link) =====
tasklist /FO CSV /NH > "%~dp0probe-out\tasklist.txt" 2>&1
findstr /I "jianyuan node.exe cargo.exe rustc.exe link.exe" "%~dp0probe-out\tasklist.txt"
if errorlevel 1 echo NONE_OF_THESE_RUNNING
echo.
echo ===== lib.rs key lines =====
findstr /N /C:"generate_context" /C:"Builder" /C:"invoke_handler" /C:"runtime-dist" /C:"server.mjs" /C:"frontend" /C:"Command::new" "%~dp0src-tauri\src\lib.rs"
echo ===== END =====
endlocal

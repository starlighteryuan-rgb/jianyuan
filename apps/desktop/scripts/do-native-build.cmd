@echo off
setlocal EnableExtensions
set "ROOT=D:\Hackson\project build"
set "DESKTOP=%ROOT%\apps\desktop"
set "TCBIN=C:\Users\26067\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin"
set "CARGO_HOME=%ROOT%\.cargo-home-desktop"
set "PATH=%TCBIN%;C:\Program Files\nodejs;%DESKTOP%\node_modules\.bin;%PATH%"

cd /d "%DESKTOP%"
echo ===== STAGE 0: environment =====
echo CARGO_HOME=%CARGO_HOME%
where cargo.exe
where node.exe
cargo.exe --version
node.exe --version
echo.

echo ===== STAGE 1: renderer + runtime build (npm run build) =====
call npm.cmd run build
if errorlevel 1 ( echo BUILD_RENDERER_FAILED & exit /b 11 )
echo.
echo dist after renderer build:
dir "%DESKTOP%\dist" /s /b
echo runtime-dist:
dir "%DESKTOP%\runtime-dist"
echo.

echo ===== STAGE 2: tauri release build (--no-bundle) =====
call node.exe "%DESKTOP%\node_modules\@tauri-apps\cli\tauri.js" build --no-bundle
if errorlevel 1 ( echo TAURI_BUILD_FAILED & exit /b 12 )
echo.

echo ===== STAGE 3: resulting exe =====
set "EXE=%DESKTOP%\src-tauri\target\release\jianyuan-desktop.exe"
if exist "%EXE%" (
  dir "%EXE%"
) else (
  echo EXE_NOT_FOUND_AFTER_BUILD & exit /b 13
)
echo ===== DONE =====
endlocal

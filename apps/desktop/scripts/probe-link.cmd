@echo off
setlocal EnableExtensions
set "TCBIN=C:\Users\26067\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin"
echo ===== LINK PROBE (msvc) =====
"%TCBIN%\rustc.exe" "%~dp0link-probe.rs" -o "%TEMP%\link-probe-msvc.exe" 2>&1
echo EXITCODE=%ERRORLEVEL%
echo.
echo ===== SEARCH link.exe under VS/SDK roots =====
for %%D in ("C:\Program Files\Microsoft Visual Studio" "C:\Program Files (x86)\Microsoft Visual Studio" "C:\Program Files (x86)\Windows Kits") do (
  if exist %%D (
    echo -- scanning %%D --
    dir /s /b "%%~D\link.exe" 2>nul
  ) else (
    echo -- %%D NOT PRESENT --
  )
)
echo ===== END =====
endlocal

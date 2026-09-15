@echo off
setlocal EnableExtensions
set "TCBIN=C:\Users\26067\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin"
set "OUTDIR=D:\Hackson\project build\apps\desktop\scripts\probe-out"
if not exist "%OUTDIR%" mkdir "%OUTDIR%"
echo ===== LINK PROBE 2 (msvc) =====
"%TCBIN%\rustc.exe" "%~dp0link-probe.rs" -o "%OUTDIR%\link-probe-msvc.exe"
echo RUSTC_EXITCODE=%ERRORLEVEL%
echo.
if exist "%OUTDIR%\link-probe-msvc.exe" (
  echo LINK_EXE_CREATED
  dir "%OUTDIR%\link-probe-msvc.exe"
  "%OUTDIR%\link-probe-msvc.exe"
  echo RUN_EXITCODE=%ERRORLEVEL%
) else (
  echo NO_LINK_EXE_CREATED
)
echo.
echo ===== VS18 structure =====
dir /b "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build" 2>nul
echo ----- vcvars search -----
dir /s /b "C:\Program Files\Microsoft Visual Studio\18\Community\vcvars64.bat" 2>nul
dir /s /b "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" 2>nul
echo ===== END =====
endlocal

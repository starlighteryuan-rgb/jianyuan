@echo off
setlocal EnableExtensions
echo ===== PROBE START =====
set "TCBIN=C:\Users\26067\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin"
set "CARGO_HOME=D:\Hackson\project build\.cargo-home-desktop"
echo CARGO_HOME=%CARGO_HOME%
echo.
echo --- cargo/rustc from real toolchain ---
"%TCBIN%\cargo.exe" --version 2>&1
"%TCBIN%\rustc.exe" --version 2>&1
"%TCBIN%\rustc.exe" --print sysroot 2>&1
echo.
echo --- linker discovery (link.exe / cl.exe) ---
where link.exe 2>&1
where cl.exe 2>&1
where lld-link.exe 2>&1
echo.
echo --- Visual Studio installs ---
if exist "C:\Program Files\Microsoft Visual Studio\2022" (echo VS2022_PF_EXISTS & dir /b "C:\Program Files\Microsoft Visual Studio\2022") else (echo NO_VS2022_PF)
if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022" (echo VS2022_PFX86_EXISTS & dir /b "C:\Program Files (x86)\Microsoft Visual Studio\2022") else (echo NO_VS2022_PFX86)
if exist "C:\BuildTools" (echo BUILDTOOLS_C_EXISTS) else (echo NO_BUILDTOOLS_C)
echo.
echo --- Windows SDK ---
if exist "C:\Program Files (x86)\Windows Kits\10\bin" (echo SDK_BIN_EXISTS & dir /b "C:\Program Files (x86)\Windows Kits\10\bin") else (echo NO_SDK_BIN)
echo.
echo --- GNU/MinGW toolchain bin ---
if exist "C:\Users\26067\.rustup\toolchains\stable-x86_64-pc-windows-gnu\bin" (dir /b "C:\Users\26067\.rustup\toolchains\stable-x86_64-pc-windows-gnu\bin") else (echo NO_GNU_TOOLCHAIN)
echo --- gcc/ld ---
where gcc.exe 2>&1
where ld.exe 2>&1
echo ===== PROBE END =====
endlocal

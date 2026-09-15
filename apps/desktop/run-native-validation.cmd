@echo off
setlocal

set "PHASE=%~1"
if /I not "%PHASE%"=="prepare" if /I not "%PHASE%"=="verify" (
  echo Usage: run-native-validation.cmd prepare
  echo        run-native-validation.cmd verify
  exit /b 2
)

set "EXE=%~dp0src-tauri\target\release\jianyuan-desktop.exe"
if not exist "%EXE%" (
  echo Release executable not found:
  echo   %EXE%
  echo Build it first with: npm run tauri -- build --no-bundle
  exit /b 3
)

set "APP_DATA_DIR=%LOCALAPPDATA%\com.jianyuan.desktop"
set "CHECKPOINT=%APP_DATA_DIR%\native-validation-checkpoint.json"
set "RESULT=%APP_DATA_DIR%\native-validation-result.json"

set "JIANYUAN_NATIVE_VALIDATION=1"
set "JIANYUAN_NATIVE_VALIDATION_PHASE=%PHASE%"

echo Starting Jianyuan native validation phase: %PHASE%
echo The app will use its real app_local_data_dir and Windows Credential Manager.
echo Do not enter a real API key during this validation.
"%EXE%" --native-validation --phase=%PHASE%
set "EXIT_CODE=%ERRORLEVEL%"

if "%PHASE%"=="prepare" if "%EXIT_CODE%"=="0" (
  if not exist "%CHECKPOINT%" (
    echo.
    echo ERROR: Prepare exited without native-validation-checkpoint.json
    echo Expected:
    echo   %CHECKPOINT%
    echo Check the result file and runtime log before retrying.
    exit /b 4
  )
  echo.
  echo Prepare finished. Close the app completely, then run:
  echo   run-native-validation.cmd verify
)
if "%PHASE%"=="verify" if "%EXIT_CODE%"=="0" (
  if not exist "%RESULT%" (
    echo.
    echo ERROR: Verify exited without native-validation-result.json
    echo Expected:
    echo   %RESULT%
    exit /b 5
  )
  echo.
  echo Verify finished. Read native-validation-result.json under the app AppData directory.
)
exit /b %EXIT_CODE%

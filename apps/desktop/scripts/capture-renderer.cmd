@echo off
setlocal EnableExtensions
set "DESKTOP=D:\Hackson\project build\apps\desktop"
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "OUT=%DESKTOP%\scripts\probe-out"
set "PORT=14999"
set "USERDATA=%OUT%\chrome-profile"

if not exist "%OUT%" mkdir "%OUT%"
if not exist "%USERDATA%" mkdir "%USERDATA%"

echo ===== START STATIC SERVER (dist embedded in exe) =====
start "jy-static" /B node.exe "%DESKTOP%\scripts\static-server.mjs" "%DESKTOP%\dist" %PORT% > "%OUT%\static-server.log" 2>&1
timeout /t 3 /nobreak > nul
type "%OUT%\static-server.log"

echo.
echo ===== HEADCLESS CHROME SCREENSHOT (1440x900) =====
"%CHROME%" --headless=new --disable-gpu --hide-scrollbars --no-sandbox ^
  --user-data-dir="%USERDATA%" ^
  --window-size=1440,900 ^
  --virtual-time-budget=8000 ^
  --screenshot="%OUT%\renderer-sidebar.png" ^
  "http://127.0.0.1:%PORT%/index.html" 2>&1

echo CHROME_EXITCODE=%ERRORLEVEL%
echo.
if exist "%OUT%\renderer-sidebar.png" (
  echo SCREENSHOT_CREATED
  dir "%OUT%\renderer-sidebar.png"
) else (
  echo SCREENSHOT_NOT_CREATED
)

echo.
echo ===== STOP STATIC SERVER =====
taskkill /F /IM node.exe /FI "WINDOWTITLE eq jy-static" > nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
  echo killing PID %%a
  taskkill /F /PID %%a > nul 2>&1
)
echo ===== DONE =====
endlocal

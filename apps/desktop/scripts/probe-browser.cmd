@echo off
setlocal EnableExtensions
echo ===== BROWSER / WEBVIEW2 DISCOVERY =====
for %%P in (
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) do (
  if exist %%P (echo FOUND %%P) else (echo MISS  %%P)
)
echo.
echo ===== WebView2 Runtime registry =====
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv 2>nul && echo WEBVIEW2_HKLM_WOW_OK || echo NO_HKLM_WOW
reg query "HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv 2>nul && echo WEBVIEW2_HKCU_OK || echo NO_HKCU
echo.
echo ===== msedgewebview2.exe locations =====
dir /s /b "C:\Program Files (x86)\Microsoft\EdgeWebView\Application\msedgewebview2.exe" 2>nul
dir /s /b "C:\Program Files\Microsoft\EdgeWebView\Application\msedgewebview2.exe" 2>nul
echo ===== END =====
endlocal

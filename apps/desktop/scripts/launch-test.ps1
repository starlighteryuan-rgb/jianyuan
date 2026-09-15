# Headless-safe launch test: start the native exe, verify it stays alive and creates a main window,
# then close it. Does NOT require an interactive desktop / GDI screen surface.
$ErrorActionPreference = 'Continue'

$exe = 'D:\Hackson\project build\apps\desktop\src-tauri\target\release\jianyuan-desktop.exe'

# Kill any leftover instance from a previous run
Get-Process -Name 'jianyuan-desktop' -ErrorAction SilentlyContinue | ForEach-Object {
  try { $_.Kill() } catch {}
}
Start-Sleep -Seconds 1

Write-Output "EXE=$exe"
$fi = Get-Item $exe
Write-Output ("EXE_SIZE=" + $fi.Length)
Write-Output ("EXE_LASTWRITE=" + $fi.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))

$proc = Start-Process -FilePath $exe -PassThru
Write-Output "PID=$($proc.Id)"

# Poll for window + liveness over ~12 seconds
$windowSeen = $false
$titleSeen = ''
for ($i = 0; $i -lt 12; $i++) {
  Start-Sleep -Seconds 1
  $p = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
  if (-not $p) { Write-Output "PROC_EXITED_AT_SECOND=$i"; break }
  if ($p.MainWindowHandle -ne 0) {
    $windowSeen = $true
    $titleSeen = $p.MainWindowTitle
    Write-Output "WINDOW_CREATED_AT_SECOND=$i TITLE=[$titleSeen]"
    break
  } else {
    Write-Output "second=$i alive=true handle=0"
  }
}

$alive = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
if ($alive) {
  Write-Output "PROC_ALIVE_AFTER_POLL=True"
  Write-Output "RESPONDING=$($alive.Responding)"
} else {
  Write-Output "PROC_ALIVE_AFTER_POLL=False"
}
Write-Output "WINDOW_SEEN=$windowSeen"

# Also check the bundled node runtime child (the local server the webview talks to)
$nodeKids = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($proc.Id)" -ErrorAction SilentlyContinue
foreach ($k in $nodeKids) { Write-Output ("CHILD_PROC=" + $k.Name + " PID=" + $k.ProcessId) }

# Close the app
try { $proc.CloseMainWindow() | Out-Null } catch {}
Start-Sleep -Seconds 2
$still = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
if ($still) { try { $proc.Kill() } catch {}; Write-Output "CLOSE=forced-kill" } else { Write-Output "CLOSE=graceful" }

# Final cleanup of any orphans
Get-Process -Name 'jianyuan-desktop' -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill() } catch {} }
Write-Output "DONE"

# Launch the native exe, capture screenshots of the desktop window, then close it.
# Pure automation: does not touch user data, SQLite, or Credential Manager beyond the app's own normal startup.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$exe = 'D:\Hackson\project build\apps\desktop\src-tauri\target\release\jianyuan-desktop.exe'
$outDir = 'D:\Hackson\project build\apps\desktop\scripts\probe-out\shots'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Output "STARTING_EXE=$exe"
$proc = Start-Process -FilePath $exe -PassThru
Write-Output "PID=$($proc.Id)"

function Capture-Screen {
    param([string]$name)
    Start-Sleep -Milliseconds 500
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $path = Join-Path $outDir $name
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Output "SHOT_SAVED=$path"
}

# Give the webview + local runtime time to boot
Start-Sleep -Seconds 6
Capture-Screen "01-initial.png"

# Try to locate the window and bring to front
$sig = @'
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@
Add-Type -TypeDefinition $sig
try {
  $p = Get-Process -Id $proc.Id -ErrorAction Stop
  if ($p.MainWindowHandle -ne 0) {
    [Win]::ShowWindow($p.MainWindowHandle, 9) | Out-Null  # SW_RESTORE
    [Win]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
    Write-Output "WINDOW_FOUND=$($p.MainWindowTitle)"
  } else {
    Write-Output "WINDOW_HANDLE_ZERO"
  }
} catch { Write-Output "PROC_GONE=$($_.Exception.Message)" }

Start-Sleep -Seconds 2
Capture-Screen "02-foreground.png"

# Report whether process is still alive (did not crash)
$alive = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
if ($alive) { Write-Output "PROC_ALIVE=True" } else { Write-Output "PROC_ALIVE=False" }

# Close the app
try { $proc.CloseMainWindow() | Out-Null } catch {}
Start-Sleep -Seconds 2
$still = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
if ($still) { try { $proc.Kill() } catch {}; Write-Output "KILLED_FORCED" } else { Write-Output "CLOSED_GRACEFULLY" }
Write-Output "DONE"

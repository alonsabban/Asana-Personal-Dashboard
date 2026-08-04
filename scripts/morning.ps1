# Personal Dashboard - morning launcher.
# Ensures the Next.js dev server is running, then opens the dashboard so the
# latest Asana tasks and "today's focus" are ready first thing in the morning.
#
# Optional: most people just use START-DASHBOARD.bat. This exists for wiring the
# dashboard into a Windows Scheduled Task (see the bottom of this file).

# Report problems instead of vanishing. This used to be SilentlyContinue, which
# meant a failure on someone else's machine produced no message at all.
$ErrorActionPreference = "Stop"

# Derive the project folder from this script's own location, so the script works
# from any checkout on any machine.
$projectDir = Split-Path -Parent $PSScriptRoot

$port = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$url = "http://localhost:$port"

function Test-Port {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-Port -Port $port)) {
  Write-Host "Starting the dashboard server in $projectDir ..."
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c npm run dev" `
    -WorkingDirectory $projectDir `
    -WindowStyle Hidden

  $up = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Port -Port $port) { $up = $true; break }
  }
  if (-not $up) {
    Write-Error "The dashboard did not start listening on port $port within 40s. Run 'npm run dev' in $projectDir to see the error."
    exit 1
  }
}

# Warm the API so data is cached and any errors surface early. A failure here is
# worth reporting but not worth blocking the browser from opening.
try {
  Invoke-WebRequest -Uri "$url/api/asana/tasks" -UseBasicParsing -TimeoutSec 30 | Out-Null
} catch {
  Write-Warning "Could not pre-load tasks: $($_.Exception.Message)"
}

Start-Process $url

# ---------------------------------------------------------------------------
# To run this every morning at 8:00, paste this into PowerShell (one line):
#
#   Register-ScheduledTask -TaskName "Personal Dashboard Morning" `
#     -Trigger (New-ScheduledTaskTrigger -Daily -At 8:00am) `
#     -Action (New-ScheduledTaskAction -Execute "powershell.exe" `
#       -Argument "-NoProfile -WindowStyle Hidden -File `"$PSCommandPath`"")
#
# Remove it with:
#   Unregister-ScheduledTask -TaskName "Personal Dashboard Morning" -Confirm:$false
#
# Note: the dashboard also refreshes itself daily at 8 AM while running, so this
# is only needed if you want the server started and the browser opened for you.
# ---------------------------------------------------------------------------

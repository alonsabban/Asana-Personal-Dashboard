# Personal Dashboard - startup server.
# Runs at login to keep the Next.js dev server running in the background so the
# dashboard is always available at http://localhost:3000. Does NOT open a browser.
#
# Optional: most people just use START-DASHBOARD.bat. This is for having the
# dashboard always ready without thinking about it.

# Report problems instead of vanishing. This used to be SilentlyContinue, which
# meant a failure on someone else's machine produced no message at all.
$ErrorActionPreference = "Stop"

# Derive the project folder from this script's own location, so the script works
# from any checkout on any machine.
$projectDir = Split-Path -Parent $PSScriptRoot

$port = if ($env:PORT) { [int]$env:PORT } else { 3000 }

function Test-Port {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if (Test-Port -Port $port) {
  Write-Host "Dashboard already running on port $port - nothing to do."
  exit 0
}

Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c npm run dev" `
  -WorkingDirectory $projectDir `
  -WindowStyle Hidden

Write-Host "Dashboard server starting in $projectDir (port $port)."

# ---------------------------------------------------------------------------
# To run this at every login, put a shortcut to it in your Startup folder.
# Open the folder with:  shell:startup
# Shortcut target:
#   powershell.exe -NoProfile -WindowStyle Hidden -File "<full path to this file>"
#
# A logon-triggered Scheduled Task may be blocked by corporate policy; a
# Startup-folder shortcut needs no admin rights. Delete the shortcut to disable.
# ---------------------------------------------------------------------------

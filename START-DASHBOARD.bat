@echo off
setlocal enabledelayedexpansion
title Personal Asana Dashboard
cd /d "%~dp0"

rem ============================================================
rem  Personal Asana Dashboard - one-click launcher
rem
rem  Double-click this file. It checks what is needed, installs
rem  it the first time, starts the dashboard, and opens it in
rem  your browser. Keep this window open while you use it.
rem ============================================================

set "PORT=3000"
set "URL=http://localhost:%PORT%"

echo.
echo   ===========================================
echo     Personal Asana Dashboard
echo   ===========================================
echo.

rem ---------- 1. Is Node.js installed? ----------
where node >nul 2>&1
if errorlevel 1 goto no_node

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODEVER=%%v"
echo   [OK] Node.js !NODEVER! found.

rem ---------- 2. Is the dashboard already running? ----------
netstat -ano | findstr /r /c:"LISTENING" | findstr /c:":%PORT% " >nul 2>&1
if not errorlevel 1 (
    echo   [OK] Dashboard is already running.
    echo.
    echo   Opening %URL% ...
    start "" "%URL%"
    echo.
    echo   Nothing else to do - you can close this window.
    echo.
    pause
    exit /b 0
)

rem ---------- 3. Pull latest updates ----------
where git >nul 2>&1
if errorlevel 1 (
    echo   [--] git not found - skipping update check.
) else (
    echo   Checking for updates...
    git pull
    if errorlevel 1 (
        echo   [!] Could not pull updates ^(no internet?^). Continuing with local version.
    ) else (
        echo   [OK] Up to date.
    )
)
echo.

rem ---------- 4. First-time setup ----------
if not exist "node_modules\" goto install
if not exist "node_modules\next\" goto install
goto run

:install
echo.
echo   First-time setup: downloading the pieces the dashboard needs.
echo   This takes a few minutes and only happens once.
echo   (A lot of text will scroll by - that is normal.)
echo.
call npm install
if errorlevel 1 goto install_failed
echo.
echo   [OK] Setup finished.

:run
echo.
echo   Starting the dashboard...
echo.

rem Start the server in this window's background, then wait for the port.
start "Personal Asana Dashboard - server" /min cmd /c "npm run dev > dashboard-log.txt 2>&1"

rem ---------- 5. Wait for it to come up (up to ~60s) ----------
set /a TRIES=0
:waitloop
set /a TRIES+=1
>nul timeout /t 2 /nobreak 2>nul
netstat -ano | findstr /r /c:"LISTENING" | findstr /c:":%PORT% " >nul 2>&1
if not errorlevel 1 goto ready
if !TRIES! geq 30 goto slow
echo   ... still starting (!TRIES!/30)
goto waitloop

:ready
echo.
echo   [OK] Dashboard is running.
echo.
echo   Opening %URL% ...
start "" "%URL%"
echo.
echo   ===========================================
echo     The first time, the dashboard will ask
echo     for your Asana token. Follow the on-screen
echo     steps - it explains where to get it.
echo   ===========================================
echo.
echo   IMPORTANT: keep this window ^(and the small
echo   minimised one^) open while using the dashboard.
echo   Closing them stops it.
echo.
echo   Press any key to STOP the dashboard and exit.
pause >nul
goto shutdown

:slow
echo.
echo   The dashboard is taking longer than expected to start.
echo.
echo   Try opening %URL% in your browser directly.
echo   If it does not load, see dashboard-log.txt in this folder
echo   and send it to Alon Sabban ^(asabban@paloaltonetworks.com^).
echo.
pause
exit /b 1

:shutdown
echo.
echo   Stopping the dashboard...
rem Kill only the process listening on our port - never all of Node.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"LISTENING" ^| findstr /c:":%PORT% "') do (
    taskkill /f /pid %%p >nul 2>&1
)
echo   Done. You can close this window.
>nul timeout /t 2 /nobreak 2>nul
exit /b 0

:no_node
echo   [X] Node.js is not installed on this PC.
echo.
echo   The dashboard needs it to run. To install:
echo.
echo     1. Go to   https://nodejs.org
echo     2. Download the big green "LTS" button
echo     3. Run the installer, click Next until it finishes
echo     4. Double-click START-DASHBOARD.bat again
echo.
echo   Opening the download page for you...
>nul timeout /t 3 /nobreak 2>nul
start "" "https://nodejs.org"
echo.
pause
exit /b 1

:install_failed
echo.
echo   [X] Setup could not finish.
echo.
echo   This is usually the corporate network blocking the download.
echo   Please send this window's text to Alon Sabban
echo   ^(asabban@paloaltonetworks.com^) and he will sort it out.
echo.
pause
exit /b 1

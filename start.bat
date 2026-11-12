@echo off
REM ===================================================================
REM  Meeting English Coach - double-click this to start the app.
REM
REM  Opens the app in your browser and leaves this window running.
REM  To stop it: close this window, or press Ctrl+C in it.
REM ===================================================================

cd /d "%~dp0"

echo.
echo   Meeting English Coach
echo   ---------------------
echo.

REM First run on a new machine needs the packages installed.
if not exist "node_modules\" (
    echo   First run - installing packages. This takes a few minutes...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo   Install failed. Is Node.js installed?  https://nodejs.org
        echo.
        pause
        exit /b 1
    )
)

if not exist ".env.local" (
    echo   No .env.local found - the app will run in offline mode.
    echo   That works fine, it just uses the built-in rule engine.
    echo.
)

echo   Starting... your browser will open in a moment.
echo   Keep this window open while you practise.
echo.

REM Give the server a head start, then open the browser.
REM ping, not timeout: timeout fails when a Unix one shadows it (Git Bash on PATH).
start "" /b cmd /c "ping -n 6 127.0.0.1 >nul & start http://localhost:3000"

call npm run dev

echo.
echo   Server stopped.
pause

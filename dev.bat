@echo off
setlocal enabledelayedexpansion

:: Monopoly Game Launcher - Development Mode for Windows
:: This script starts the game with hot reloading enabled

title Monopoly Development Server

:: Get the script directory and store it
set "SCRIPT_DIR=%~dp0"

:: Change to script directory
cd /d "%SCRIPT_DIR%"

:: Kill any existing server processes on ports 3000 and 3001
echo Stopping any existing Monopoly servers...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Clear the screen
cls

:: Display banner
echo.
echo +===============================================================+
echo :                                                               :
echo :   M   M  OOO  N   N  OOO  PPPP   OOO  L     Y   Y             :
echo :   MM MM O   O NN  N O   O P   P O   O L      Y Y              :
echo :   M M M O   O N N N O   O PPPP  O   O L       Y               :
echo :   M   M O   O N  NN O   O P     O   O L       Y               :
echo :   M   M  OOO  N   N  OOO  P      OOO  LLLLL   Y               :
echo :                                                               :
echo :                  DEVELOPMENT MODE                             :
echo :         Hot Reloading Enabled - Edit and Refresh!             :
echo :                                                               :
echo +===============================================================+
echo.

:: Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do echo Node.js version: %%v
echo.

:: Always ensure dependencies are installed
echo Checking server dependencies...
if not exist "node_modules" (
    echo Installing server dependencies...
    call npm install
    if !errorlevel! neq 0 (
        echo ERROR: Failed to install server dependencies
        pause
        exit /b 1
    )
)

echo Checking client dependencies...
if not exist "client\node_modules" (
    echo Installing client dependencies - this may take a few minutes...
    cd client
    call npm install
    if !errorlevel! neq 0 (
        echo ERROR: Failed to install client dependencies
        cd ..
        pause
        exit /b 1
    )
    cd ..
)

echo.
echo Starting Monopoly development servers...
echo.

:: Start the API server with nodemon using npm run dev (which uses local nodemon)
echo Starting API server with hot reloading...
start "Monopoly API Server" cmd /k "cd /d %SCRIPT_DIR% && npm run dev"

:: Wait for server to start
echo Waiting for API server to start...
timeout /t 4 /nobreak >nul

:: Start the React development server in a new window
echo Starting React development server...
start "Monopoly React Client" cmd /k "cd /d %SCRIPT_DIR%client && npm start"

:: Wait for client to start
echo Waiting for React dev server to start - this may take a moment...
timeout /t 10 /nobreak >nul

:: Display connection info
cls
echo.
echo +===============================================================+
echo :              DEVELOPMENT SERVERS RUNNING                      :
echo +===============================================================+
echo.
echo Connect to the game:
echo.
echo   Client (React Dev Server):  http://localhost:3000
echo   API Server:                 http://localhost:3001
echo.
echo   Network (for other devices):

:: Display all IPv4 addresses
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=*" %%b in ("%%a") do (
        echo     http://%%b:3000
    )
)

echo.
echo =================================================================
echo.
echo HOT RELOADING ENABLED:
echo   * Edit client files (React) - Browser auto-refreshes
echo   * Edit server files - Server auto-restarts
echo   * Edit bot.js - Takes effect on next bot spawn
echo.
echo =================================================================
echo.
echo NOTE: Two additional command windows have opened for the servers.
echo Check those windows for any error messages if links don't work.
echo.
echo Press any key here to stop all servers and exit...
echo.

pause >nul

:: Cleanup - kill the server windows
echo.
echo Shutting down development servers...

:: Kill processes on ports 3000 and 3001
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Development servers stopped. Thanks for coding!
timeout /t 2 >nul

endlocal

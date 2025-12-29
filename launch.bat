@echo off
setlocal enabledelayedexpansion

:: Monopoly Game Launcher for Windows (Production Mode)
:: This script starts the game server and displays connection information

title Monopoly Game Server

:: Get the script directory and store it
set "SCRIPT_DIR=%~dp0"

:: Change to script directory
cd /d "%SCRIPT_DIR%"

:: Kill any existing server processes on port 3001
echo Stopping any existing Monopoly servers...
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
echo :              Multiplayer Online Board Game                    :
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

:: Check if dependencies are installed
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

:: Build the client if not already built
if not exist "client\build" (
    echo Building client application - this may take a minute...
    cd client
    call npm run build
    if !errorlevel! neq 0 (
        echo ERROR: Failed to build client application
        cd ..
        pause
        exit /b 1
    )
    cd ..
)

echo.
echo Starting Monopoly game server...
echo.

:: Display connection info
echo +===============================================================+
echo :                    GAME SERVER RUNNING                        :
echo +===============================================================+
echo.
echo Connect to the game using one of these addresses:
echo.
echo   Local Machine:
echo     http://localhost:3001
echo.
echo   Network (for other devices):

:: Display all IPv4 addresses
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=*" %%b in ("%%a") do (
        echo     http://%%b:3001
    )
)

echo.
echo =================================================================
echo.
echo Instructions:
echo   1. Open the address above in a web browser
echo   2. Enter your name and create or join a game
echo   3. Share the game code with friends on the same network
echo   4. Have fun playing Monopoly!
echo.
echo Press Ctrl+C to stop the server and exit
echo.
echo =================================================================
echo.

:: Start the server (this will block until Ctrl+C)
call npm start

:: Cleanup message (shown after Ctrl+C)
echo.
echo Shutting down Monopoly game...
echo Game server stopped. Thanks for playing!

endlocal

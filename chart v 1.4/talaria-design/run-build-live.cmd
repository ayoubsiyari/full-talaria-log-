@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node.js LTS from https://nodejs.org
  echo Then reopen Command Prompt or PowerShell and run this script again.
  exit /b 1
)
echo Installing deps...
call npm ci
if errorlevel 1 exit /b 1
echo.
echo Building V9 live bundle to ..\chart\dist-v9\
call npm run build:live
if errorlevel 1 exit /b 1
echo.
echo Done. Deploy or serve ..\chart\dist-v9\ so the browser loads the new JS.

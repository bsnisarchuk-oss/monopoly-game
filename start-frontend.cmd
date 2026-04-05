@echo off
setlocal

cd /d "%~dp0frontend"

if not exist "node_modules" (
  echo [ERROR] Frontend dependencies were not found:
  echo         %CD%\node_modules
  echo [HINT] Run npm.cmd install in the frontend folder first.
  exit /b 1
)

echo [INFO] Starting frontend on http://localhost:5173/
npm.cmd run dev

@echo off
setlocal

cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] Backend virtual environment was not found:
  echo         %CD%\.venv\Scripts\python.exe
  echo [HINT] Install backend dependencies into backend\.venv first.
  exit /b 1
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
  echo [INFO] Port 8000 is already in use by PID %%P.
  echo [INFO] If the backend is already running, open http://127.0.0.1:8000/
  echo [INFO] If it is a stale process, stop it with: taskkill /PID %%P /F /T
  exit /b 1
)

echo [INFO] Starting backend on http://127.0.0.1:8000/
".\.venv\Scripts\python.exe" -m uvicorn main:app

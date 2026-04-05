@echo off
setlocal

echo [INFO] Opening Monopoly backend and frontend in separate windows...
start "Monopoly Backend" cmd /k call "%~dp0start-backend.cmd"
start "Monopoly Frontend" cmd /k call "%~dp0start-frontend.cmd"

echo [INFO] Open http://localhost:5173 once both windows are ready.

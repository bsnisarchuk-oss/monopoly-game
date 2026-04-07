@echo off
start "Backend" cmd /k "cd /d U:\Monopoly\backend && .venv\Scripts\activate.bat && uvicorn main:app --reload"
start "Frontend" cmd /k "cd /d U:\Monopoly\frontend && npm run dev"

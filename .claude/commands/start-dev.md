---
description: Поднять backend (FastAPI) и frontend (Vite) в фоне
allowed-tools: Bash
---

Запусти оба сервера в фоне и проверь, что они отвечают.

1. Backend:
```powershell
cd U:\Monopoly\backend
..\.venv\Scripts\uvicorn.exe main:app --reload --port 8000
```
Запускать через `run_in_background: true`.

2. Подожди 3 секунды, затем:
```powershell
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/
```

3. Frontend:
```powershell
cd U:\Monopoly\frontend
npm.cmd run dev
```
Тоже `run_in_background: true`.

4. Подожди 3 секунды, проверь:
```powershell
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
```

Отчитайся: оба URL, коды ответов. Если что-то не отвечает — покажи первые 30 строк логов фонового процесса.

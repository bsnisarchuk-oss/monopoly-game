---
description: Полный аудит проекта — lint frontend, unittest backend, smoke бэкенда
allowed-tools: Bash, Read
---

Запусти проверки и кратко отчитайся — что прошло, что нет.

1. **Frontend lint**
```powershell
cd U:\Monopoly\frontend
npm.cmd run lint
```

2. **Frontend build** (ловит ошибки сборки, которые lint не видит)
```powershell
cd U:\Monopoly\frontend
npm.cmd run build
```

3. **Backend тесты** (unittest, не pytest)
```powershell
cd U:\Monopoly\backend
..\.venv\Scripts\python.exe -m unittest discover tests
```

4. **Smoke backend** (если запущен)
```powershell
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/
```

Формат отчёта:
- ✅/❌ по каждому пункту
- Краткая причина если что-то упало
- Предложение следующего шага

Не маскируй ошибки. Если `npm run` падает на ExecutionPolicy — используй `npm.cmd run` (это в CLAUDE.md).

$ARGUMENTS

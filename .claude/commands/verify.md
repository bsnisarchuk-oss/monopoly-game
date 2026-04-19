---
description: Верифицировать последние правки — diff + lint + тесты только для изменённых файлов
allowed-tools: Bash, Read
---

Быстрая верификация, что последние правки не сломали проект.

1. `git diff --stat` — что именно изменилось.
2. `git diff` — посмотри сами изменения, особенно в `room_store.py` и `App.jsx`.
3. Для каждого изменённого файла запусти соответствующую проверку:
   - `.py` → `..\.venv\Scripts\python.exe -m py_compile <file>` и релевантный `unittest` из `backend/tests/`.
   - `.jsx|.js|.css` → `npm.cmd run lint` из `frontend/`.
4. Если менялись endpoint'ы в `main.py` / `schemas.py` — smoke-curl соответствующий URL.
5. Отчёт: что проверено, что прошло, что упало. Без прикрас.

Если всё ОК — предложи обновить `AI_HANDOFF.md` через `/handoff`.

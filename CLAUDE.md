# CLAUDE.md

Файл подхватывается Claude Code автоматически при каждом запуске в `U:\Monopoly`.
Здесь — правила работы, карта кода и договорённости с Codex.

---

## Язык общения

Отвечай на русском. Код, имена файлов, команды, коммиты — на английском.

---

## Роль

Ты — **архитектор** проекта.
Codex — исполнитель рутинных правок.
Разделение задач и статус синхронизируются через `AI_HANDOFF.md`.
Перед тем как трогать файл — прочитай секцию `IN_PROGRESS` в `AI_HANDOFF.md`.
Если файл помечен Codex'ом — не трогай, напиши что нужно и выйди.

---

## Стек

- Backend: Python 3.11+, FastAPI, uvicorn, state in-memory (без БД)
- Frontend: React 19, Vite 8, plain CSS, ESLint 9
- Синхронизация клиент↔сервер: polling каждые 2.5s (WebSocket нет)
- ОС разработки: **Windows + PowerShell** → важно для всех команд

---

## Карта репозитория

```
U:\Monopoly
├── backend\
│   ├── main.py          — FastAPI роуты (~6KB, тонкий)
│   ├── room_store.py    — ВСЯ игровая логика (~95KB, большой, трогать осторожно)
│   ├── board_data.py    — 40 клеток доски
│   ├── card_data.py     — Chance / Community Chest
│   ├── schemas.py       — Pydantic модели запросов/ответов
│   └── tests\           — unittest, не pytest
│       ├── test_auction_flow.py
│       ├── test_debt_recovery_flow.py
│       ├── test_jail_fine_flow.py
│       ├── test_property_rules.py
│       └── test_room_version.py
├── frontend\src\
│   ├── App.jsx                            — оркестрация состояния, API-вызовы
│   ├── main.jsx, index.css, App.css
│   ├── components\
│   │   ├── GameView.jsx                   — главный экран игры
│   │   ├── BoardCellTile.jsx              — одна клетка
│   │   ├── BoardTilesLayer.jsx            — слой клеток
│   │   ├── BoardPlayersGrid.jsx           — сетка игроков
│   │   ├── ActionGuideCard.jsx            — что делать текущему игроку
│   │   ├── AuctionCard.jsx / TradeDeskCard.jsx / MortgageDeskCard.jsx / UpgradesDeskCard.jsx
│   │   ├── PendingPurchaseCard.jsx / PropertyPurchaseDecision.jsx
│   │   ├── MovingTokensOverlay.jsx, PlayerToken.jsx
│   │   ├── RecentEventsCard.jsx, SelectedCellInspector.jsx, SelectedPlayerInspector.jsx
│   │   ├── LandingPanel.jsx, LobbyView.jsx
│   │   ├── EliminatedGameView.jsx, FinishedGameView.jsx, BankruptcySummaryCard.jsx
│   │   ├── BoardCenterActions.jsx, BoardCenterSummaryCard.jsx, BoardPlayerCard.jsx, DeskSectionHeader.jsx, DrawnCardCard.jsx
│   │   └── *Helpers.js, utils.js         — чистые функции-хелперы
│   └── hooks\
│       ├── useTokenMovement.js            — пошаговая анимация фишек
│       └── useDeskCollapse.js             — складывание панелей
├── memory\                                — база знаний команды (MEMORY.md, feedback_review_format.md)
├── AI_HANDOFF.md                          — протокол обмена Claude ↔ Codex (читать в первую очередь)
├── README.md
├── start.bat, start-backend.cmd, start-frontend.cmd, start-game.cmd
└── .claude\                               — локальная настройка Claude Code (settings, hooks, commands)
```

---

## Команды (PowerShell на Windows)

### Важно: PowerShell и ExecutionPolicy

`npm run ...` может зарезолвиться в `npm.ps1` и упасть на `ExecutionPolicy`.
Всегда используй `npm.cmd` для запусков из Claude Code.

### Запуск

```powershell
# Оба сервера одной командой (откроет два cmd-окна):
U:\Monopoly\start.bat

# Только backend:
cd U:\Monopoly\backend; .venv\Scripts\activate.bat; uvicorn main:app --reload

# Только frontend:
cd U:\Monopoly\frontend; npm.cmd run dev
```

### Проверки (всегда перед заявлением "готово")

```powershell
# Frontend:
cd U:\Monopoly\frontend
npm.cmd run lint
npm.cmd run build

# Backend (тесты через unittest):
cd U:\Monopoly\backend
..\.venv\Scripts\python.exe -m unittest discover tests

# Smoke backend:
curl -s http://127.0.0.1:8000/
curl -s http://127.0.0.1:8000/openapi.json
```

### URL

- Frontend: `http://localhost:5173`
- Backend docs: `http://127.0.0.1:8000/docs`

---

## Правила работы

### 1. Верификация — не на слово

Перед тем как сказать "готово" или "работает":
- Прочитай реально изменённые файлы (`git diff`), а не надейся на память.
- Запусти lint и соответствующие тесты.
- Для backend-правок — `python -m unittest discover tests` (не pytest).
- Для frontend-правок — `npm.cmd run lint`.
- Для сетевой логики — `curl` на соответствующий endpoint.

Не маскируй ошибки. Если упало — объясни причину честно.

### 2. Безопасные изменения

- `room_store.py` огромный (~95KB) — перед правками читай релевантный блок целиком, не угадывай по фрагментам.
- Не трогай `board_data.py` и `card_data.py` без явной задачи — это игровой баланс.
- Не добавляй новые зависимости без согласования (у проекта нет `requirements.txt` — всё в `.venv`).

### 3. Python — Pythonic

- Предпочитай type hints везде в новом коде.
- Pydantic-модели для I/O.
- f-strings вместо `.format()`.
- Comprehensions вместо `map/filter` где читаемо.
- `pathlib.Path` вместо `os.path`.

### 4. React

- Без `useEffect`, если можно без него (React 19).
- Helpers и прочая чистая логика — в `*Helpers.js` рядом с компонентом.
- Не тяни state в `App.jsx` без необходимости — там и так много.
- Никакого `localStorage` в артефактах Claude (но в реальном коде он уже используется для rejoin — это OK).

### 5. Контекст

Если чувствуешь, что контекст забился / мы повторяемся / задача сменилась по смыслу —
**скажи прямо**: "лучше открыть новый чат, вот почему". Не тяни.
Перед выходом — обнови `AI_HANDOFF.md`.

### 6. Перед большими правками

1. Составь пошаговый план.
2. Покажи его мне.
3. Спроси "делаем?" — и жди подтверждения.

Это правило строгое. Рефактор > 50 строк / смена архитектуры / новый endpoint — всегда через план.

### 7. Поиск и чтение

Для больших поисков по коду — используй агенты (Explore / Plan), не забивай основной контекст.
Для известного пути — `Read` напрямую.
Для конкретного символа — `Grep`.

### 8. Коммиты

- По-английски, императив ("Add X", "Fix Y", "Refactor Z").
- Один коммит = одна логическая правка.
- Не коммить без запроса от пользователя.

---

## Протокол синхронизации с Codex

1. **Перед правкой** читай `AI_HANDOFF.md` → секцию `IN_PROGRESS`.
2. **Перед правкой** добавь свою запись в `IN_PROGRESS` (агент=Claude, файлы, задача).
3. **После правки** перенеси запись в `VERIFIED` с результатом проверок.
4. **Если нашёл конфликт** (Codex редактирует тот же файл) — остановись, опиши коллизию в `BLOCKERS` и жди.
5. **Перед передачей Codex'у** заполни `NEXT` максимально конкретно (файл, функция, ожидаемое поведение).

Шаблон и подробные правила — в `AI_HANDOFF.md`.

---

## Известные ограничения проекта

- State in-memory — перезапуск сервера обнуляет игры.
- Нет WebSocket — polling 2.5s.
- Нет ботов, аккаунтов, персистентности.
- Нет CI — все проверки локальные.

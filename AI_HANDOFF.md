# AI Handoff

## Project

Online Monopoly-style learning project with AI-assisted iteration.

## Stack

- Frontend: React + Vite + JavaScript
- Backend: Python + FastAPI

## Paths

- Root: `U:\Monopoly`
- Frontend: `U:\Monopoly\frontend`
- Backend: `U:\Monopoly\backend`

## Run

### Quick Windows start (одна команда)

```cmd
U:\Monopoly\start.bat
```

Открывает два окна cmd — бэкенд и фронтенд.

### Backend (вручную)

```cmd
cd U:\Monopoly\backend
.venv\Scripts\activate.bat
uvicorn main:app --reload
```

### Frontend (вручную)

```cmd
cd U:\Monopoly\frontend
npm run dev
```

### Open

- Frontend: `http://localhost:5173`
- Backend docs: `http://127.0.0.1:8000/docs`

---

## Verified Current Status

Latest local verification on `2026-04-12`:

- In PowerShell, prefer `npm.cmd run lint` and `npm.cmd run build`
- Reason: `npm run ...` may resolve to `npm.ps1` and fail on `ExecutionPolicy`
- Frontend checks completed:
  - `npm.cmd run lint` - OK
  - `npm.cmd run build` - OK
- Backend checks completed:
  - `..\.venv\Scripts\python -m unittest tests.test_auction_flow tests.test_property_rules` - OK
  - `..\.venv\Scripts\python -m py_compile room_store.py tests\test_auction_flow.py` - OK
- `pytest` is not installed in the backend venv right now; use `unittest` for current backend test files

Recent verified changes:

- Backend:
  - `backend/room_store.py` now has a special 2-player follow-up purchase flow
  - If player A passes on direct purchase, player B gets a direct buy/pass decision instead of an auction
  - If player B also passes, the property stays unowned and turn flow resumes
  - `backend/tests/test_auction_flow.py` was updated for this behaviour
- Frontend:
  - `frontend/src/App.jsx` uses `activeUiPlayerId = pendingAuction.active_player_id ?? pendingPurchase.player_id ?? currentTurnPlayerId`
  - `frontend/src/components/GameView.jsx` prioritises `AuctionCard` in the board spotlight during auction
  - `frontend/src/components/AuctionCard.jsx` is now a more minimal English-only auction card
  - `frontend/src/components/BoardCenterActions.jsx` uses a shorter neutral auction note and a dedicated main CTA class for `Roll dice`
  - `frontend/src/index.css` contains the minimal auction styles and the soft teal `primary-turn-button`

Current local worktree is dirty. Do not revert unrelated edits unless the user explicitly asks:

- `.claude/settings.local.json`
- `backend/room_store.py`
- `backend/tests/test_auction_flow.py`
- `frontend/src/App.jsx`
- `frontend/src/components/AuctionCard.jsx`
- `frontend/src/components/BoardCenterActions.jsx`
- `frontend/src/components/GameView.jsx`
- `frontend/src/components/gameViewHelpers.js`
- `frontend/src/index.css`

Verified against real files on `2026-04-07`.

- `npm run lint` — OK
- `npm run build` — OK
- Last commit: `798822a` — "Redesign game board UI and improve player experience"

---

## Architecture: что нельзя трогать

- **Backend не трогать** — все игровые правила живут там
- Frontend только рендерит состояние и отправляет actions
- Сервер авторитетен
- Identity через `player_token`
- Rejoin через `localStorage`
- In-memory backend state (нет БД)

---

## Что уже сделано в frontend (актуально на 2026-04-07)

### Layout

- Три колонки: `game-player-rail (260px)` | `game-main-stage` | `game-side-panel (360px)`
- При 1100–1380px: side panel уходит под доску внутри `game-main-stage`
- При ≥1380px: `game-main-stage` — двухколоночный grid (доска + side panel)
- `game-player-rail` sticky при ≥1100px, не сползает при скролле (исправлено)
- `RecentEventsCard` вынесен в `game-history-row` под layout
- `game-history-row` выравнивается по колонкам layout на всех брейкпоинтах

### Доска (`BoardCellTile.jsx`, `BoardTilesLayer.jsx`)

- Клетки: иконки типа (`🚂` `?` `⚡` `🔒` `🚔` `GO` `💰` `♥` `P`) вместо текста для спецклеток
- Property-клетки: только название по центру
- Боковые клетки: название вертикально (writing-mode)
- Цена в цветной полосе (`cell-band-price`), на боковых — вертикально
- Уровень upgrade: `★★★` (звёзды)
- Mortgaged: иконка 🔒 внутри клетки
- Кружки с числами событий (`cell-event-count-badge`) **убраны**
- Купленные клетки: сплошная заливка цветом игрока (flat, без градиента)
- `is-owned` — alpha 0.55, `is-owned-by-you` — alpha 0.72
- CSS каскад правильный: `is-owned` → `is-owned-by-you` → `is-move-target` → `is-landed` → `is-focused`

### Токены (`PlayerToken.jsx`, CSS)

- Чистый круг без буквы (текст убран линтером, `aria-label` сохранён)
- Несколько фишек на клетке: отступ 3px между ними, по центру клетки (`position: absolute; inset: 0`)
- На угловых клетках: отступ 4px
- Анимация движения: `280ms`, плавная дуга без мигания (opacity убран из keyframes)
- Шаг: `TOKEN_MOVE_STEP_MS = 280`, буфер `60ms`

### Карточки игроков (`BoardPlayerCard.jsx`, CSS)

- Компактный размер: padding `12px 14px`, border-radius `18px`
- Аватарка `44×44px`
- Пульсирующий ring аватарки у активного игрока (`avatar-active-pulse`)
- `prefers-reduced-motion` отключает все анимации

### Prop-building

- `buildGameViewProps()` в `gameViewHelpers.js` — не хук, pure helper
- `buildFocusTargetProps()` — shared helper для section refs
- `onSelectForTrade` и `onSelectTradeTarget` → именованные handlers в `App.jsx`:
  - `handleSelectCellForTrade(cellIndex, cellName)`
  - `handleSelectPlayerAsTradeTarget(targetPlayerId, targetNickname)`
- `setStatus` убран из `setters` в gameViewHelpers — больше не проникает в prop helpers

### Логика доступа к desk

- `canManagePurchaseFunding` — новое условие: игрок текущий + есть `pendingPurchase` + денег меньше чем цена
- Позволяет открыть MortgageDeskCard и UpgradesDeskCard когда не хватает денег на покупку

---

## Важные файлы frontend

| Файл                                            | Назначение                         |
| ----------------------------------------------- | ---------------------------------- |
| `frontend/src/App.jsx`                          | Оркестрация, state, API, handlers  |
| `frontend/src/index.css`                        | Все стили                          |
| `frontend/src/components/GameView.jsx`          | Экран игры                         |
| `frontend/src/components/BoardCellTile.jsx`     | Одна клетка доски                  |
| `frontend/src/components/BoardTilesLayer.jsx`   | Все клетки + owner tinting         |
| `frontend/src/components/BoardPlayerCard.jsx`   | Карточка игрока в рейле            |
| `frontend/src/components/BoardPlayersGrid.jsx`  | Сетка карточек                     |
| `frontend/src/components/PlayerToken.jsx`       | Фишка                              |
| `frontend/src/components/boardHelpers.js`       | Движение токенов, grid placement   |
| `frontend/src/components/gameViewHelpers.js`    | Prop assembly для GameView         |
| `frontend/src/components/utils.js`              | `hexToRgba`, `getPlayerTokenLabel` |
| `frontend/src/components/ActionGuideCard.jsx`   | Гид по действиям                   |
| `frontend/src/components/RecentEventsCard.jsx`  | История событий                    |
| `frontend/src/components/actionGuideHelpers.js` | Логика action guide                |

---

## Важные файлы backend

- `U:\Monopoly\backend\main.py`
- `U:\Monopoly\backend\board_data.py` — 40 клеток, только name/cell_type/price/color_group, **нет image_url**
- `U:\Monopoly\backend\room_store.py`
- `U:\Monopoly\backend\schemas.py`
- `U:\Monopoly\backend\card_data.py`

---

## Что реализовано в игре (backend)

- Комнаты: create / join / leave / rejoin / host transfer
- Лобби: ready / start
- Ход: бросок кубиков, doubles, jail, go to jail
- Экономика: покупка, аукцион, рента, налоги, chance/community cards
- Mortgage / unmortgage / upgrade / sell upgrade
- Trade (property + cash)
- Bankruptcy flow с debt recovery
- Recent events с refs

---

## Что НЕ реализовано (MVP simplifications)

- Нет WebSocket (polling)
- Нет БД (in-memory)
- Нет ботов
- Нет аккаунтов
- Нет изображений/логотипов на клетках (board_data.py не содержит image_url)

---

## Что можно делать дальше

### Визуал доски (если появятся картинки)

- Добавить `image_url` в `board_data.py` для каждой клетки
- Создать `frontend/src/components/cellImages.js` — маппинг index → url
- Рендерить `<img>` внутри `cell-main-content` в `BoardCellTile.jsx`

### UX / polish

- Отображение названий улиц в боковых клетках можно сократить через `text-overflow: ellipsis`
- Анимация `avatar-active-pulse` у игрока на доске (сейчас только в рейле)
- Адаптив ≤780px — проверить новый layout доски на мобиле

### Код / архитектура

- `App.jsx` всё ещё ~2800 строк — можно выносить большие useEffect-блоки в custom hooks
- Trade UI упрощён — можно улучшить
- Нет тестов

---

## Как начать новый чат

1. Прочитать `AI_HANDOFF.md`
2. Проверить реальные файлы (не доверять только handoff)
3. Запустить `npm run build` — убедиться что всё чисто
4. Предложить следующий шаг

---

## Промт для Claude Code

```
Прочитай AI_HANDOFF.md, затем проверь реальные файлы.
Не полагайся только на handoff — верифицируй код перед любыми выводами.

Проверь:
- frontend/src/App.jsx — текущее состояние оркестрации
- frontend/src/components/GameView.jsx — структура экрана
- frontend/src/index.css — стили доски и карточек
- frontend/src/components/BoardCellTile.jsx — рендер клетки
- frontend/src/components/gameViewHelpers.js — prop assembly

Дай практическую оценку:
- есть ли регрессии после последних изменений
- что стоит улучшить следующим шагом
- нет ли новых мест где UI-логика протекает не туда
- если есть ошибки не маскируй их, а обьясни причину

Правила работы:
- Если контекст становится слишком длинным, если мы начинаем повторяться, если задача меняется по смыслу, или если для качественной работы нужен более чистый контекст — прямо скажи мне, что лучше открыть новый чат, и кратко объясни почему.

Отвечай на русском. Всегда говори что надо исправлять и спрашивай "делаем?" перед реализацией.
```

## Промт для Codex

```
Прочитай AI_HANDOFF.md, затем проверь реальные файлы.
Не полагайся только на handoff.

После проверки:
1. Кратко опиши реальное состояние
2. Предложи следующий практический шаг
3. Реализуй если это frontend-only изменение

Правила работы:
- Backend не трогать
- Проверять реальные файлы перед изменениями
- После изменений: npm run lint && npm run build
- Объяснять что делаешь и почему
- если есть ошибки не маскируй их, а обьясни причину
- Если контекст становится слишком длинным, если мы начинаем повторяться, если задача меняется по смыслу, или если для качественной работы нужен более чистый контекст — прямо скажи мне, что лучше открыть новый чат, и кратко объясни почему.

Текущий приоритет:
- Доска визуально переработана (иконки, цены в полосе, заливка владельца)
- Layout трёхколоночный, sticky rail работает
- Следующий шаг — на усмотрение после проверки файлов
```

---

## Стиль работы с пользователем

- Отвечать на русском
- Всегда говорить что нужно исправить
- Всегда спрашивать "делаем?" перед реализацией
- Проверять реальные файлы, не доверять только handoff
- Запускать `npm run build` после каждого изменения

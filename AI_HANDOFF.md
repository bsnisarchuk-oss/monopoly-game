# AI Handoff

> **Протокол синхронизации Claude ↔ Codex.**
> Оба агента читают этот файл первым делом и обновляют блоки ниже перед/после своей работы.
> Детальный исторический контекст — в разделе "Detailed context" ниже, его вручную не переписываем.

---

## STATUS

`2026-04-19` — lint полностью зелёный (**0 errors, 0 warnings**). После `70e10d3` (registrar callbacks) ещё одна правка: стабилизировали fallback-референсы в `App.jsx` через модульные `EMPTY_PLAYERS`/`EMPTY_RECORD` константы — ушли все 16 `exhaustive-deps` warning'ов. Готово к коммиту и пушу.

---

## IN_PROGRESS

Кто какие файлы сейчас редактирует. **Перед своей правкой — добавь запись. Перед чужой — проверь.**

Формат:
```
- [agent=Claude|Codex] <дата-время ISO> — <краткая задача>
  files: <через запятую>
  branch: <имя ветки или "main">
```

— пусто —

---

## NEXT

1. Закоммитить fix `App.jsx` + `AI_HANDOFF.md`.
   коммит: `Stabilize fallback refs to silence exhaustive-deps warnings`
   проверки до коммита: `npm.cmd run lint` (ожидается 0 problems), `npm.cmd run build` (ожидается без регрессий), быстрый визуальный smoke — лобби/игра открываются, покупка/рента работают.
2. `git push origin master`.

---

## BLOCKERS

Что мешает двигаться (если ничего — удали пункт на сессию).

— пусто —

---

## VERIFIED

Последние проверенные изменения с результатами `lint/build/test/smoke`.
При новой верификации — добавляй сверху, старые записи сдвигай вниз.

- `2026-04-19` — стабилизированные fallback-референсы (`App.jsx`):
  - `EMPTY_PLAYERS = Object.freeze([])` и `EMPTY_RECORD = Object.freeze({})` как модульные константы; 4 fallback'а заменены (`players`, `propertyOwners`, `propertyLevels`, `propertyMortgaged`).
  - `npx eslint .` ✅ — **0 errors, 0 warnings** (было 16 warnings).
  - `npm.cmd run build` — ещё не прогоняли на Windows, ожидается без регрессий.
  - Риск: `Object.freeze` запрещает мутации; grep подтвердил, что в коде нет `.push/.sort/.splice` по этим переменным.
- `2026-04-19` — lint-фикс запушен на `origin/master` (`70e10d3`):
  - `npm.cmd run lint` ✅ — 0 errors, 16 warnings (старые `exhaustive-deps`).
  - `npm.cmd run build` ✅ — vite 47 модулей, 208ms, bundle 318.67 KiB (92.06 KiB gzip) — без регрессий.
  - Визуальный smoke: движение фишек (`MovingTokensOverlay`) ✅, скролл по клику Recent Events (`scrollToRecentEventTarget`) ✅.
  - Изменённые файлы: `App.jsx`, `gameViewHelpers.js`, `BoardTilesLayer.jsx`, `BoardPlayersGrid.jsx`, `BoardCellTile.jsx`, `BoardPlayerCard.jsx`, `MovingTokensOverlay.jsx` + `AI_HANDOFF.md`.
- `2026-04-19` — после трёх коммитов (`08ad32d` setup, `0d792a0` backend, `291c84d` frontend):
  - `npm.cmd run build` ✅ — vite 47 модулей, 277ms.
  - `..\.venv\Scripts\python.exe -m unittest discover tests` ✅ — 67 тестов.
  - `ruff check .` (backend) ✅ — 0 ошибок.
  - `npm.cmd run lint` ❌ — 3 ошибки (см. NEXT); 16 warnings.
- `2026-04-12` — frontend `npm.cmd run lint` ✅, `npm.cmd run build` ✅;
  backend `python -m unittest tests.test_auction_flow tests.test_property_rules` ✅;
  `py_compile room_store.py` ✅.

---

## Anti-conflict правила

1. Один файл одновременно редактирует **один агент**.
2. Claude работает в ветке `claude/*`, Codex — в `codex/*` или через stash — согласовать перед стартом.
3. Если файл в `IN_PROGRESS` у другого агента — **не редактируй**, опиши своё предложение в `NEXT`.
4. Перед любой правкой читай реальный файл, а не только handoff.
5. После правки: запусти релевантные проверки → обнови `VERIFIED` → очисти свою запись из `IN_PROGRESS`.

---

# Detailed context

Ниже — накопленный контекст проекта. Обновляется **только при значимых архитектурных изменениях**, не после каждой правки.

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
Прочитай CLAUDE.md и AI_HANDOFF.md (секции STATUS / IN_PROGRESS / NEXT / BLOCKERS).
Проверь реальные файлы — не полагайся только на handoff.

Ты — архитектор. Codex — исполнитель.
Перед правкой: проверь IN_PROGRESS в handoff; если файл у Codex — не трогай, опиши свой вариант в NEXT.

Команды под рукой (из .claude/commands/):
- /check — полный аудит (lint + build + unittest + smoke)
- /plan <задача> — план перед рефактором
- /claim <файлы> — залочить файлы в IN_PROGRESS
- /verify — быстрая проверка последних правок
- /handoff — обновить AI_HANDOFF.md
- /start-dev — поднять backend + frontend

Правила:
- Верифицируй код перед выводами. Ошибки не маскируй.
- Перед большими правками — /plan и "делаем?".
- Если контекст забивается / задача сменилась — прямо скажи "лучше новый чат" и почему.
- Отвечай на русском.
```

## Промт для Codex

```
Прочитай AI_HANDOFF.md — сначала STATUS, IN_PROGRESS, NEXT.
Проверь реальные файлы, не доверяй только handoff.

Ты — исполнитель рутинных правок. Архитектурные решения — на Claude.
Перед правкой: добавь запись в IN_PROGRESS (agent=Codex, файлы, задача, ветка).
Если файл уже у Claude — не трогай, опиши альтернативу в NEXT.

Правила:
- Backend не трогать без явной задачи.
- PowerShell: использовать `npm.cmd run` вместо `npm run` (ExecutionPolicy).
- После правки: `npm.cmd run lint` + `npm.cmd run build`, добавить запись в VERIFIED.
- Ошибки не маскируй, объясняй причину.
- Если контекст переполняется или задача сменилась — прямо скажи "нужен новый чат", и почему.
```

---

## Стиль работы с пользователем

- Отвечать на русском
- Всегда говорить что нужно исправить
- Всегда спрашивать "делаем?" перед реализацией
- Проверять реальные файлы, не доверять только handoff
- Запускать `npm run build` после каждого изменения

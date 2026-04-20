# AI Handoff

> **Протокол синхронизации Claude ↔ Codex.**
> Оба агента читают этот файл первым делом и обновляют блоки ниже перед/после своей работы.
> Детальный исторический контекст — в разделе "Detailed context" ниже, его вручную не переписываем.

---

## STATUS

`2026-04-20` — Перф-трек закрыт. Steps A–E реализованы и готовы к коммиту (CLS 0.49 → 0.03). Корень оставшегося stutter оказался **не в коде**, а в выключенной галочке "Use hardware acceleration when available" в Chrome — после включения игра плавная (см. `memory/perf_lessons.md` "Урок №0"). Следующий большой трек — **Task #18: SSE для push-репликации состояния комнаты** (лаг между мониторами до 2.5s на polling). Этот чат закрывается по переполнению контекста; работа продолжится в новом чате с чистым состоянием.

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

**Коммитим Steps A–E одним коммитом.**

Корень stutter (GPU acceleration off у пользователя) не связан с кодом, но оптимизации Steps A–E реальные и ценные (CLS с 0.49 до 0.03 подтверждён метрикой) — их нужно зафиксировать.

**Команды на Windows (PowerShell):**

```powershell
cd U:\Monopoly
git status
git diff --stat
# Проверь, реально ли App.jsx показывается "весь файл" из-за CRLF↔LF.
# Если да → git add -p App.jsx и выбрать ТОЛЬКО hunk в районе строк 770-792 (short-circuit room_version).
# Остальные файлы добавь штучно, чтоб не зацепить ничего лишнего.

git add frontend/src/index.css
git add frontend/src/components/PlayerToken.jsx
git add frontend/src/components/MovingTokensOverlay.jsx
git add AI_HANDOFF.md
git add memory/perf_lessons.md
git add memory/MEMORY.md
git add -p frontend/src/App.jsx

git commit -m "Optimize token movement: reduce reconciliation, repaints and layout shifts"
```

Описание (можно положить в тело коммита через `-m`):

```
- Steps A+B+C (index.css, PlayerToken.jsx):
  Заменить box-shadow + color-mix keyframes на opacity-only glow на ::after.
  Убрать 3-й слой box-shadow у overlay-токена. contain: layout paint на overlay.
- Step D/1 (App.jsx):
  Short-circuit в applyIncomingRoomStateRef: пропуск setCurrentRoom если room_version
  и room_code не изменились. Бэкенд бампает room_version только на мутациях.
- Step D/2 (PlayerToken.jsx, MovingTokensOverlay.jsx):
  React.memo с дефолтным shallow compare. Props стабильны после Step D/1.
- Step E (index.css):
  contain: layout на .recent-events-card, .board-card, .action-guide-card.
  font-variant-numeric: tabular-nums на .board-card-cash и .board-card-stats strong.
  CLS 0.49 → 0.03.
```

---

**После коммита:**

1. Обновить `STATUS` / `VERIFIED` в `AI_HANDOFF.md`, пометить, что коммит прошёл.
2. Перейти к **Task #18** (WebSocket/SSE vs polling 2.5s) — это единственное, что осталось: лаг между мониторами до 2.5s при движении фишки. Локально всё плавно, это чисто архитектурный вопрос репликации состояния.
3. Возможно, посмотреть на оптимизацию polling-трафика (`If-None-Match` / ETag + `304 Not Modified`) — ~3.5 KB × (1 req / 2.5s) сейчас уходит в /dev/null, т.к. клиент короткозамыкает по `room_version`. Не блокирует, но естественный next step после D/1.

1. `cd U:\Monopoly\frontend; npm.cmd run build` — должен пройти зелёным, ожидаемый bundle ~318-319 KiB / ~92 KiB gzip (правка только импорт `memo` + одна обёртка в двух файлах = +50-100 байт).
2. Перезапустить dev-сервер и хард-релоад в браузере (`Ctrl+Shift+R`).
3. DevTools → Performance → запись 10-15 секунд игры с 3-4 ходами. Сравнить с прошлой записью:
   - Главный поток в моменты движения фишки должен стать ещё реже.
   - Визуально — плавность фишки.
4. Если плавно → коммитить. Если всё ещё дёргается → копать в polling-fetch latency (JSON.parse на main thread в момент анимации) или переходить на WebSocket.

**Если коммитим — что и как:**

- `frontend/src/index.css` — Steps A+B+C (CSS перф-фиксы анимаций) + Step E (`contain: layout` + `tabular-nums`).
- `frontend/src/components/PlayerToken.jsx` — Step A (easing) + Step D/2 (memo).
- `frontend/src/components/MovingTokensOverlay.jsx` — Step D/2 (memo).
- `frontend/src/App.jsx` — **Внимание CRLF↔LF:** `git status` покажет файл целиком из-за артефакта sandbox↔Windows. Реальная правка только в блоке ~770-792 (короткое замыкание). Коммитить через `git add -p` (выбрать только нужный hunk) или после `git diff --stat` убедиться что сравнение идёт по содержательным строкам.
- `AI_HANDOFF.md`, `memory/perf_lessons.md`, `memory/MEMORY.md`.

Один коммит на тему:
```
Optimize token movement: reduce reconciliation, repaints and layout shifts
```
Описание: Steps A-E — убирают continuous box-shadow repaint (A+B+C), drop polling reconciliation when room_version unchanged (D/1), memoize token renderers (D/2), contain layout + tabular-nums to prevent CLS during turn transitions (E).

**Параллельно: вопрос WebSocket/SSE (Task #18).**

Пользователь увидел отставание до 2.5s между двумя клиентами при движении одной фишки — это polling-лаг, фундаментальное ограничение. Лечится только переходом с polling на push-канал.

Варианты:
- **WebSocket (FastAPI):** богаче, двусторонний, но сложнее (auth, reconnect, состояние клиентов в памяти сервера, отдельный test harness).
- **SSE (Server-Sent Events):** проще для нашего случая (только сервер → клиент, нам этого хватит), переподключения дёшевы, прямой fit для FastAPI через `EventSourceResponse`.

Рекомендация: **SSE**, если согласимся делать. Но это отдельный трек на ~1-2 сессии. Начать стоит с прочного плана: какие endpoints, как broadcast'ить, как переходить с polling без даунтайма.

— `Step D/2 mem-оизация` сделана и ждёт smoke. Остальное — open вопросы, см. выше.

Цель: убрать ненужные ререндеры `PlayerToken` и `MovingTokensOverlay` при изменениях, которые их не касаются. После Step D/1 polling-тики стали лёгкими (Scheduler/Components треки редкие), но stutter всё ещё есть → значит реконсиляция всё-таки залезает в моменты движения фишки и сбивает WAAPI кадры.

Пошагово:
1. Прочитать `frontend/src/components/PlayerToken.jsx` — понять текущие props и есть ли уже memoization.
2. Найти `renderPlayerToken` и `getPlayerColor` (предположительно в `App.jsx` или `gameViewHelpers.js`) — посмотреть, стабильны ли ссылки между ребилдами.
3. Обернуть `PlayerToken` в `React.memo` (default shallow). Если props-объекты пересоздаются inline — добавить кастомный `arePropsEqual` или поднять `useMemo` вверх по дереву.
4. Обернуть `MovingTokensOverlay` в `React.memo`. Сейчас он перерисовывается на каждом ребилде родителя, даже если `movingTokenEffects` не менялся.
5. `useCallback` для `getPlayerColor` (важно: пересоздание этой функции инвалидирует `useLayoutEffect` в `MovingTokensOverlay` → перезапуск анимации → видимый стуттер).
6. `useCallback` для `renderPlayerToken` (если он передаётся в `BoardCellTile` / `BoardPlayersGrid`).
7. Проверки: `npm.cmd run lint`, `npm.cmd run build`, Performance-запись на Windows. Ожидаю: главный поток в моменты движения фишки почти пустой, визуально плавно.

**Ожидаемый объём:** ~40-60 строк в 3-4 файлах (`PlayerToken.jsx`, `MovingTokensOverlay.jsx`, `App.jsx`, возможно `gameViewHelpers.js`).

**Риски:**
- Если props в `PlayerToken` — inline-объекты (`{ x, y }`), shallow-compare не сработает → нужен `useMemo` у источника или кастомный compare.
- `boardCellRefs` в `MovingTokensOverlay` — это ref-объект, должен быть стабилен.

**Параллельный вопрос (ждёт решения пользователя):** заменить polling 2.5s на WebSocket / SSE — это лечит "опоздание на втором мониторе до 2.5s", но это отдельная большая задача (бэкенд + фронт + переподключения). Пользователь скажет завтра, делаем или откладываем.

**Что есть незакоммиченного на момент паузы:**
- `frontend/src/index.css` — Steps A + B + C (CSS перф-фиксы анимаций активного хода).
- `frontend/src/components/PlayerToken.jsx` — Step A (overlay easing → `ease-in-out`).
- `frontend/src/App.jsx` — Step D/1 (short-circuit `room_version`). **Внимание:** `git status` покажет файл целиком из-за CRLF↔LF артефакта sandbox↔Windows; реальная правка — только блок `~770-792` (короткое замыкание перед `setCurrentRoom`). Коммитить через `git add -p` или явно по строкам, не наивным `git add App.jsx`.
- `AI_HANDOFF.md` — текущие правки секций STATUS / NEXT / VERIFIED.

**С чего начать завтра:**
1. Перечитать эту секцию NEXT.
2. Прочитать `PlayerToken.jsx`, `MovingTokensOverlay.jsx`, `App.jsx` (где `renderPlayerToken` и `getPlayerColor`).
3. Подтвердить с пользователем: Step D/2 + WebSocket → делаем оба или сначала D/2?
4. Реализовать D/2, прогнать lint/build, попросить smoke.

---

## BLOCKERS

Что мешает двигаться (если ничего — удали пункт на сессию).

— пусто —

---

## VERIFIED

Последние проверенные изменения с результатами `lint/build/test/smoke`.
При новой верификации — добавляй сверху, старые записи сдвигай вниз.

- `2026-04-20` — **Task #18 Фаза 2 — frontend SSE (smoke пройден, готово к коммиту)**:
  - `frontend/src/apiConfig.js` (новый, 3 строки) — вынесена константа `API_BASE_URL`; раньше она жила только внутри `App.jsx`, теперь импорт из двух мест (App + новый хук), single source of truth.
  - `frontend/src/hooks/useRoomStream.js` (новый, ~75 строк) — обёртка над `EventSource`. API: `useRoomStream(roomCode, { onSnapshot, onGone })`. Ключевые решения:
    - callbacks живут в `useRef`, обновляются через отдельные `useEffect` — стрим не пересоздаётся при каждом ререндере родителя.
    - `addEventListener("snapshot", ...)` (а не `onmessage`) — ловим именно наш тип события.
    - `onGone` вызывается только при `readyState === EventSource.CLOSED` в `onerror`. Это покрывает 404 "room not found" (сервер отвечает сразу, браузер не retries). Транзитные сетевые ошибки остаются в `CONNECTING`, EventSource сам reconnect'ит — мы их не трогаем.
    - JSON.parse обёрнут в try/catch с `console.warn` — битый payload не ломает поток.
  - `frontend/src/App.jsx` — удалён `setInterval` (~45 строк старого polling), разбит старый монолитный `useEffect([currentRoomCode])` на:
    - Lifecycle-only `useEffect` (reset recent events UI при выходе из комнаты, **без** сетевой логики).
    - Вызов `useRoomStream(currentRoomCode, { onSnapshot, onGone })` на верхнем уровне компонента.
    - `onSnapshot` дёргает тот же `applyIncomingRoomStateRef.current(data, { expectedRoomCode })` с `isActionInFlightRef` guard'ом — оптимистичные изменения не перезаписываются.
    - `onGone` повторяет весь legacy 404-cleanup: `clearStoredSession`, `clearCurrentRoomStateRef`, reset recent events, `setStatus("The room no longer exists.")`, очистка player_id/player_token.
    - Убран `const API_BASE_URL = ...` (24-я строка), вместо `import { API_BASE_URL } from "./apiConfig"`.
  - **Sandbox проверки:**
    - `./node_modules/.bin/eslint .` ✅ — 0 errors, 0 warnings.
    - `vite build` нельзя прогнать в sandbox (rolldown-binding Linux native недоступен).
  - **Windows проверки пройдены:**
    - `npm.cmd run build` ✅ — vite v8.0.3, 49 modules (+2: `useRoomStream.js` + `apiConfig.js`), **319.34 KiB / 92.32 KiB gzip**, 257ms. Никаких ошибок/варнингов.
    - Smoke в двух вкладках браузера ✅ — действия в одной мгновенно отображаются в другой; лага 2.5s больше нет; Network показывает один `GET /rooms/{code}/stream` с EventStream вместо бесконечного polling-пинга.
  - **Готово к коммиту.**

- `2026-04-20` — **Task #18 Фаза 1 — backend SSE (закоммичено `6648ae3`)**:
  - `backend/room_events.py` (новый, ~95 строк) — thin pub/sub поверх `asyncio.Queue`. `subscribe/unsubscribe/publish/subscriber_count/reset_for_tests`. `_QUEUE_MAX_SIZE=8`, latest-wins drop при переполнении. `defaultdict[str, set]` для O(1) подписок по `room_code`.
  - `backend/room_store.py` — `import room_events` и в `_touch_room` publish полного snapshot'а (`_build_room_response`) при `increment_version=True`. GET-чтения не публикуют. Также добавлена публичная `build_room_snapshot(room_code, include_board)` как алиас для `get_room` — чтобы SSE-хендлер не лез в приватные имена.
  - `backend/main.py` — новый endpoint `GET /rooms/{room_code}/stream` через `sse_starlette.EventSourceResponse`. Протокол: одно событие `snapshot` при connect (full room state), потом по событию на каждую мутацию. Heartbeat 15s, disconnect через `request.is_disconnected()`. `asyncio.wait_for(queue.get(), timeout=15s)` гоняет цикл чтобы ловить disconnect даже без новых событий.
  - `backend/tests/test_sse_stream.py` (новый, ~155 строк, unittest + `asyncio.run`) — 10 тестов: pub/sub изоляция + интеграция с `_touch_room`. HTTP-слой не тестируется (Starlette TestClient для SSE нетривиален; smoke через `curl -N` на Windows).
  - Решения: (B) full-push snapshot, polling удалим после Фазы 2, heartbeat 15s, зависимость `sse-starlette`.
  - **Sandbox проверки:**
    - `python3 -m py_compile room_events.py room_store.py main.py tests/test_sse_stream.py` ✅.
    - Pure pub/sub smoke (5 инвариантов без fastapi) ✅ — `subscribe/unsubscribe` count, fan-out на N подписчиков, drop-oldest при переполнении queue (8 из 9 сохранены), publish без подписчиков = noop, идемпотентный unsubscribe.
  - **Windows проверки пройдены:**
    - `.venv\Scripts\pip.exe install sse-starlette` ✅ (3.3.4).
    - `..\.venv\Scripts\python.exe -m unittest discover tests` ✅ — **77 tests, 0.073s, OK** (67 старых + 10 новых).
    - `.venv\Scripts\uvicorn.exe main:app` ✅ — `Application startup complete`, `GET /` возвращает `{"message":"Backend is working"}`.
    - SSE smoke end-to-end ✅:
      - `curl.exe -N http://127.0.0.1:8000/rooms/0F2LGH/stream` → сразу пришёл `event: snapshot` c baseline room_version=1, players=[Host], is_ready=false.
      - Heartbeat `: ping - 2026-04-20 19:10:49...` каждые ~15s как ожидалось.
      - `POST /rooms/0F2LGH/ready` с `is_ready=true` → **немедленно** в stream-терминал прилетел второй `event: snapshot` с `is_ready=true, room_version=2`.
    - Подтверждено: мутация на сервере → push через sub-секунду, лаг 2.5s от polling в этом канале отсутствует.
  - **Следующий шаг — Фаза 2 (frontend):** хук `useRoomStream(roomCode)`, замена `setInterval`-polling в `App.jsx:1711-1753` на `EventSource`, удаление polling-пути. Детали проработаем в новой IN_PROGRESS записи после коммита backend-части.

- `2026-04-20` — **GPU acceleration был выключен в Chrome** — корень оставшегося stutter:
  - После всех Steps A-E метрики в DevTools были идеальны (CLS 0.03, сервер 3ms, Scheduler редкий), но визуально stutter оставался **на обоих мониторах, на всём пути движения фишки**.
  - DevTools → Rendering → Frame Rate показал **4.8 FPS** и "GPU raster: off".
  - `chrome://gpu`: `Compositing: Software only`, `Rasterization: Software only`, `Canvas: Software only`, `WebGL/WebGPU: unavailable`, `OpenGL: Disabled`.
  - Причина: `chrome://settings/system` → "Use hardware acceleration when available" было снято. Без этой галочки все остальные acceleration-фичи каскадно отключаются.
  - Фикс: включить галочку → Restart Chrome → всё полетело. После рестарта игра плавная.
  - Урок зафиксирован в `memory/perf_lessons.md` как "Урок №0: сначала проверь `chrome://gpu`".
  - **Ни одну строку кода менять не пришлось.** Steps A-E остаются валидными и нужными (CLS-фикс реальный, React.memo обоснованный, short-circuit работает), просто их эффект визуально проявляется только при GPU-акселерации.

- `2026-04-20` — Step E: превентивный CLS-фикс (НЕ закоммичено, ждёт коммита):
  - Диагноз: DevTools Performance Insights на продакшн-билде показал **CLS = 0.49** (плохо — цель < 0.1), INP = 776ms. Слой layout shifts держался ~1.5s — ровно длительность 4-5 шагов × `TOKEN_MOVE_STEP_MS (340ms)` в `useTokenMovement.js`. То есть layout пересчитывался на каждом ходу.
  - Корневые причины (гипотеза подтверждена структурой DOM):
    - `RecentEventsCard` добавляет `<article class="recent-event-item">` на каждом ходу → grows height → толкает сестёр вниз по странице.
    - `.board-card-cash` ($100 → $1000) меняет ширину строки → пересчёт layout соседей.
    - `.action-guide-card` и другие карточки с переменной длиной текста двигают соседей.
  - **`frontend/src/index.css` — 5 правок:**
    - `.recent-events-card` (строка ~773): `contain: layout` + комментарий про growth RecentEvents.
    - `.board-card` (строка ~2738): `contain: layout` — изоляция карточек игроков от изменений ширины баланса.
    - `.action-guide-card` (строка ~376): `contain: layout` — изоляция переменного текста гида.
    - `.board-card-cash` (строка ~2876): `font-variant-numeric: tabular-nums` — моноширинные цифры баланса.
    - `.board-card-stats strong` (строка ~2897): `font-variant-numeric: tabular-nums` — моноширинные цифры статистики.
  - `contain: layout` изолирует layout-бокс элемента от внешнего контекста: изменения размеров внутри не триггерят reflow соседей и родителей. `tabular-nums` включает OpenType-фичу моноширинных цифр (пропорциональный шрифт, но цифры одинаковой ширины) — стандартное решение для счётчиков и балансов.
  - `npm.cmd run lint` (sandbox eslint) ✅ — 0 errors, 0 warnings. (CSS-only правки, JS не трогал.)
  - `npm.cmd run build` — не проверен в sandbox; проверить на Windows.
  - Smoke на Windows: TODO. Ожидается: CLS < 0.1 (Good) вместо 0.49 (Poor). Визуально фишки ходят плавно, без "рывками то быстрее то медленнее".

- `2026-04-20` — Step D/2: мемоизация рендера токенов (НЕ закоммичено, ждёт smoke):
  - `frontend/src/components/PlayerToken.jsx`: импорт `memo` из `react`, `export default memo(PlayerToken)`. Дефолтный shallow compare безопасен — для не-overlay токенов все props примитивы или стабильные ссылки (player из currentRoom после Step D/1, tokenColor строка, isActiveTurn bool); для overlay-токенов overlayPosition/overlayAnimationKeyframes пересоздаются при measure, но measure запускается только при смене animationId — therefore memo нейтральна там.
  - `frontend/src/components/MovingTokensOverlay.jsx`: импорт `memo`, `export default memo(MovingTokensOverlay)`. Все props стабильны: refs (boardRef, boardCellRefs), useCallback (getPlayerColor), стабильный массив players (благодаря Step D/1), movingTokenEffects меняется только на старте/конце анимации.
  - **Важно проверено заранее:**
    - `getPlayerColor` уже `useCallback([playerColorById])` (App.jsx:1012).
    - `renderPlayerToken` уже `useCallback([activeUiPlayerId, getPlayerColor])` (App.jsx:1019).
    - `useTokenMovement` дёргает setState только на старте/конце анимации, не каждый кадр (WAAPI крутит сам в браузере).
    - `playerPositions = currentRoom?.game?.positions` — простая деривация, ссылка стабильна вместе с currentRoom.
  - `npm.cmd run lint` (sandbox eslint) ✅ — 0 errors, 0 warnings.
  - `npm.cmd run build` — не проверен в sandbox; проверить на Windows (`cd U:\Monopoly\frontend; npm.cmd run build`).
  - Smoke на Windows: TODO. Ожидается: главный поток в моменты движения фишки почти пустой (раньше ребилдились все ~6-12 токенов на каждой клетке × N клеток на каждой реконсиляции родителя — теперь только реально изменившиеся), визуально плавно.

- `2026-04-19` — Step D/1: short-circuit polling по `room_version` (НЕ закоммичено):
  - `frontend/src/App.jsx` строки ~777-792 — внутри `applyIncomingRoomStateRef.current` добавлено раннее `return true` перед `setCurrentRoom(...)`, если `room_code` совпадает и `room_version` (через `getRoomVersion`) равна предыдущей. Использует уже существующий `currentRoomRef.current` как источник prev-состояния.
  - Backend: `room_version` бампается только на реальных мутациях (тест `test_game_actions_increment_room_version_but_room_reads_do_not`), GET-чтения её не трогают.
  - `npm.cmd run lint` ✅ — 0 errors, 0 warnings (sandbox eslint).
  - `npm.cmd run build` ✅ — на Windows у пользователя, vite 47 модулей, 234ms, bundle 318.84 KiB / gzip 92.13 KiB (+120 байт vs прошлый билд = одно условие + комментарии).
  - Smoke на Windows (Performance-запись ~70 секунд):
    - Выполнение скриптов: 758-942мс на ~67 сек = ~1.2-1.4% CPU.
    - Scheduler/Components треки — точки редкие → React-апдейтов мало → short-circuit подтверждённо работает.
    - Смещения макета — мелкие точки → CLS под контролем.
    - Визуально: фишки стали ходить лучше, **но stutter частично остался** → нужен Step D/2 (см. NEXT).
    - Между мониторами фишка отстаёт до 2.5s — это polling-лаг, не stutter; лечится только WebSocket (см. NEXT).

- `2026-04-19` — перф-фикс токен-анимации активного хода (НЕ закоммичено, ждёт smoke на Windows):
  - **Step A** (`frontend/src/index.css`, `frontend/src/components/PlayerToken.jsx`):
    - `.player-token.is-overlay`: убран третий тяжёлый `box-shadow` слой (blur 22px), добавлен `contain: layout paint` — CLS упал **0.46 → 0.00**.
    - `PlayerToken.jsx`: overlay easing `"linear"` → `"ease-in-out"`.
  - **Step B** (`frontend/src/index.css`, только CSS):
    - `.player-token.is-active-turn` — вместо бесконечной анимации `box-shadow` + `color-mix(in srgb, ...)` (дорогой repaint каждый кадр) теперь два лёгких keyframes:
      - `token-active-scale` — только `transform: scale()` на самом токене (компоситор).
      - `token-active-glow` — только `opacity` на `::after` псевдоэлементе со статичным свечением (компоситор).
    - Добавлен `will-change: transform` / `will-change: opacity` на соответствующих слоях.
    - Обновлён `prefers-reduced-motion` — отключает animation на `::after` тоже.
  - **Step C** (`frontend/src/index.css`, только CSS):
    - То же лекарство для `.board-card.is-current-turn .board-card-avatar` (пульс аватара активного игрока в рейле).
    - `avatar-active-pulse` (3-слойный box-shadow keyframes) заменён на `avatar-active-glow` (opacity 0→1→0 на `::after`).
    - `.board-card-avatar` получил `position: relative` для правильного позиционирования `::after`.
    - `prefers-reduced-motion` обновлён.
  - `npm.cmd run lint` (через sandbox eslint) ✅ — 0 errors, 0 warnings.
  - `npm.cmd run build` — не проверен в sandbox (rolldown native binding Linux-недоступен); проверить на Windows.
  - Smoke визуал: TODO на Windows — ожидается плавная overlay-анимация без дёрганья, pulse активного игрока должен выглядеть примерно как раньше (лёгкое пульсирующее свечение).

- `2026-04-19` — стабилизированные fallback-референсы (`ef6f80b`):
  - `EMPTY_PLAYERS = Object.freeze([])` и `EMPTY_RECORD = Object.freeze({})` как модульные константы; 4 fallback'а заменены (`players`, `propertyOwners`, `propertyLevels`, `propertyMortgaged`).
  - `npm.cmd run lint` ✅ — **0 errors, 0 warnings** (было 16 warnings).
  - `npm.cmd run build` ✅ — 209ms, без регрессий по размеру bundle.
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

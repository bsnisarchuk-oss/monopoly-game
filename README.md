# Monopoly

Multiplayer Monopoly-style board game playable in the browser. Up to 4 players, no accounts required — share a room code and start.

![Game board](docs/screenshot.png)

> Screenshot placeholder — replace with an actual screenshot before publishing.

---

## Stack

| Layer    | Tech                        |
|----------|-----------------------------|
| Frontend | React 19, Vite, plain CSS   |
| Backend  | Python 3.11+, FastAPI       |
| State    | In-memory (no database)     |
| Sync     | Polling every 2.5s          |

---

## Features

- Create or join a room with a code
- Full turn cycle: roll, doubles, Go to Jail
- Buy, auction, mortgage, unmortgage properties
- Upgrade properties (up to level 4), sell upgrades
- Cash-for-property trades between players
- Bankruptcy flow with debt recovery
- Chance and Community Chest cards
- Animated player tokens with step-by-step movement
- Action guide — tells each player what to do next
- Recent events log with board navigation
- Responsive layout (desktop + mobile)
- Rejoin after page refresh via localStorage

---

## Run locally

**Requirements:** Node 18+, Python 3.11+

```bash
# Clone
git clone <repo-url>
cd Monopoly

# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Backend API docs: [http://localhost:8000/docs](http://localhost:8000/docs).

---

## Project structure

```
backend/
  main.py          — API routes (FastAPI)
  room_store.py    — all game logic
  board_data.py    — 40 board cells
  card_data.py     — Chance / Community Chest cards
  schemas.py       — request/response models

frontend/src/
  App.jsx                      — orchestration, state, API calls
  components/GameView.jsx      — game screen layout
  components/BoardCellTile.jsx — single board cell
  components/ActionGuideCard.jsx — per-player action guide
  hooks/useTokenMovement.js    — animated token stepping
  hooks/useDeskCollapse.js     — collapsible desk panels
```

---

## Known limitations

- State is in-memory — restarting the server ends all games
- No WebSockets — synced via polling
- No bots
- No accounts or persistence

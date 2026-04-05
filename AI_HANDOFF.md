# AI Handoff

## Project
Online Monopoly-style game for learning and iterative AI-assisted development.

## Stack
- Frontend: React + Vite + JavaScript
- Backend: Python + FastAPI

## Paths
- Root: `U:\Monopoly`
- Frontend: `U:\Monopoly\frontend`
- Backend: `U:\Monopoly\backend`

## Run
### Quickest Windows start
```powershell
cd U:\Monopoly
.\start-game.cmd
```

### Backend
```powershell
cd U:\Monopoly\backend
.\.venv\Scripts\python -m uvicorn main:app
```

- Use `backend\.venv`, not the root `.venv`
- `Activate.ps1` is optional; you can run the backend Python directly
- If `127.0.0.1:8000` is already responding, the backend is already running

### Frontend
```powershell
cd U:\Monopoly\frontend
npm.cmd run dev
```

### Root helpers
- `U:\Monopoly\start-backend.cmd`
- `U:\Monopoly\start-frontend.cmd`
- `U:\Monopoly\start-game.cmd`

### Latest launch notes
- Prefer the root helper scripts on Windows instead of `Activate.ps1`
- Backend packages are in `U:\Monopoly\backend\.venv`
- The root `U:\Monopoly\.venv` can be misleading for backend startup
- If the browser only shows the soft gradient background, refresh after pulling the latest frontend fix

### Open
- Frontend: `http://localhost:5173`
- Backend docs: `http://127.0.0.1:8000/docs`

## Verified Status
As of the latest handoff update:
- Backend tests: `57/57 OK`
- Frontend: `npm.cmd run lint` OK
- Frontend: `npm.cmd run build` OK
- Frontend blank first screen bug fixed:
  - cause was unsafe `currentRoom.players` access before room data existed
  - fixed in `U:\Monopoly\frontend\src\App.jsx`

## Core Architecture Rules
- Server is authoritative.
- Game rules must stay in backend.
- Frontend should render state and send actions only.
- Room/game state is currently stored in memory on the backend.
- Identity is based on `player_token`.
- Rejoin uses `localStorage` on the frontend.
- Do not rely only on this handoff: always inspect the real files before continuing.

## What Is Already Implemented
### Room and lobby flow
- Create room
- Join room
- Ready / unready
- Host-only start
- Leave room
- Rejoin from stored session
- Host transfer
- Room cleanup by TTL

### Core game flow
- `lobby`, `in_game`, `finished`
- Turn order
- Dice rolling
- Doubles logic
- Jail logic
- Go to jail logic
- Winner when one player remains

### Board and movement
- 40-cell board data
- Player positions
- Pass Start bonus
- Tax cells
- Go To Jail cell
- Chance / Community cards
- Last landed cell

### Economy and property rules
- Buy property
- Skip purchase
- Auction flow
- Ownership
- Rent
- Full color set doubles base rent when allowed
- Mortgage / unmortgage
- Upgrade / sell upgrade
- Even-build rule
- Even-sell rule
- Mortgage blocks upgrade when group state requires it
- Trade between players for property + cash
- Completed-set / upgrades-unlocked messages are suppressed when mortgage state should block them

### Jail flow
- Jail turn counter
- Forced fine and movement on the 3rd failed escape attempt
- Voluntary pay `$50` before roll
- UI warning / counter for jail turns

### Debt recovery and bankruptcy
- Negative cash no longer always means instant elimination
- `pending_bankruptcy` recovery flow
- Recovery can be resolved via:
  - mortgage
  - sell upgrade
  - trade
  - declare bankruptcy
- Creditor-aware debt:
  - debt can be owed to bank
  - debt can be owed to another player
- Partial rent payment when player cannot cover full debt
- `resume_player_id` support so turn flow recovers correctly after debt resolution
- Recovery handles player leave / creditor leave / resume-player leave cases
- Final bankruptcy:
  - liquidates upgrades automatically first
  - transfers properties / cash to creditor when applicable
  - mortgaged properties transfer as mortgaged
  - mortgaged takeover does not produce rent until unmortgaged
- `last_bankruptcy_summary` is exposed to UI

### Recent events / recap system
- Structured `recent_events` in backend state
- `event_id` monotonic ids
- `kind` categories
- structured refs:
  - `player_id`
  - `target_player_id`
  - `cell_index`
- `last_bankruptcy_summary` recap card in UI
- Recent events UI supports:
  - grouping
  - `Show more / Show less`
  - kind filters
  - fixed filter order
  - event focus
  - entity filtering from board cells / player cards
  - linked-event badges on cells and player cards
  - `9+` compact badge display
  - help legend
  - help persistence via `localStorage`
  - mobile `More` actions menu
  - keyboard navigation
  - accessibility / ARIA polish
  - `aria-live` announcements

### Board UI polish
- Board cells clickable for recent-event navigation
- Player cards clickable for recent-event navigation
- MVP player tokens on board:
  - colored circular tokens
  - first-letter initial
  - active-turn highlight
  - overlap stacking for crowded cells
  - special jail split for cell 10:
    - visiting zone
    - jailed zone
  - mobile token sizing override

## Important Backend Files
- `U:\Monopoly\backend\main.py`
- `U:\Monopoly\backend\schemas.py`
- `U:\Monopoly\backend\room_store.py`
- `U:\Monopoly\backend\board_data.py`
- `U:\Monopoly\backend\card_data.py`
- `U:\Monopoly\backend\tests\test_auction_flow.py`
- `U:\Monopoly\backend\tests\test_debt_recovery_flow.py`
- `U:\Monopoly\backend\tests\test_jail_fine_flow.py`
- `U:\Monopoly\backend\tests\test_property_rules.py`

## Important Frontend Files
- `U:\Monopoly\frontend\src\App.jsx`
- `U:\Monopoly\frontend\src\index.css`

## Current MVP Simplifications
- No WebSocket yet
- No persistent database
- No bots
- No accounts
- Trade UI is still simplified
- In-memory backend state only
- Board tokens are MVP circles, not themed pieces yet
- Token movement is not animated yet

## Best Next Step
The best next practical step is:

**Add simple token movement feedback on the board**

Recommended version:
- keep backend unchanged
- frontend-only improvement
- animate or at least visually emphasize the token that just moved
- keep it simple and readable on mobile

Good concrete target:
- short movement animation or step transition for board tokens
- highlight the token / destination cell after movement

## What Claude Code Should Check Next
For the next board-token step, Claude Code is most useful for:
- overlap readability when 3-4 tokens share one cell
- jail vs visiting layout on cell 10
- corner-cell layout
- mobile layout around `390px`
- whether color-by-player-order is acceptable long-term
- UX review for token movement animation before implementation

## What Codex Should Do Next
Codex is best for:
- implementing the token movement / highlight UI
- wiring the visual behavior into existing React state
- CSS changes
- build/lint verification

## What The User Should Learn
The user should keep learning:
- React rendering from state
- UI state vs game state
- `useState`
- `useEffect`
- `useRef`
- keyboard / focus management
- `fetch`
- FastAPI routes
- Pydantic schemas
- backend validation
- server-authoritative game logic
- how to turn a rule into a regression test
- git workflow with small commits

## How To Start A New Chat
Always begin with:
1. Read `AI_HANDOFF.md`
2. Inspect the real files
3. Summarize the real current state
4. Only then propose the next practical step

## Suggested New Chat Prompt For Codex
```text
Read AI_HANDOFF.md first, then inspect the real files.
Summarize the real current state of the project.
We are continuing from the latest board-token work.
The next practical step is simple token movement feedback / animation on the board.
Do not rely only on the handoff; verify the real code first.
```

## Suggested New Chat Prompt For Claude Code
```text
Read AI_HANDOFF.md first, then inspect the real files.
Review the current board-token implementation and prepare edge-case / UX guidance for the next step:
- token overlap
- jail vs visiting layout
- corner cells
- mobile layout
- movement highlight / animation risks
Do not rely only on the handoff; verify the real code first.
```

## Working Style With This User
This project is also for learning.

When helping:
- explain what we are doing now
- explain what the user needs to understand and learn
- say when to use Codex
- say when to use Claude Code
- keep explanations practical and beginner-friendly
- prefer implementing the next real step instead of only discussing theory

If Claude Code changed files, verify the real codebase before continuing.

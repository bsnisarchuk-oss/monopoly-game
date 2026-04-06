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
### Quick Windows start
```powershell
cd U:\Monopoly
.\start-game.cmd
```

### Backend
```powershell
cd U:\Monopoly
.\start-backend.cmd
```

- The backend must use `U:\Monopoly\backend\.venv`
- Do not use the root `U:\Monopoly\.venv` for backend startup
- `start-backend.cmd` checks that `backend\.venv\Scripts\python.exe` exists

### Frontend
```powershell
cd U:\Monopoly
.\start-frontend.cmd
```

### Direct backend command
```powershell
cd U:\Monopoly\backend
.\.venv\Scripts\python -m uvicorn main:app
```

### Open
- Frontend: `http://localhost:5173`
- Backend docs: `http://127.0.0.1:8000/docs`

## Verified Current Status
Verified against real files on `2026-04-06`:
- `start-backend.cmd`, `start-frontend.cmd`, `start-game.cmd` exist and match the current Windows flow
- Frontend blank first screen bug is already fixed in `frontend/src/App.jsx`
- Cause of the old bug: unsafe `currentRoom.players` access before room data existed
- Frontend checks:
  - `npm.cmd run lint` OK
  - `npm.cmd run build` OK

## Current Worktree
Current local modifications:
- `frontend/src/App.jsx`
- `frontend/src/index.css`
- `.claude/settings.local.json`

Important:
- `.claude/settings.local.json` is local tooling state; do not revert it unless explicitly asked
- The current frontend changes are not only styling; they include real UI logic and accessibility behavior

## Core Architecture Rules
- Server is authoritative
- Game rules stay in the backend
- Frontend renders state and sends actions only
- Room/game state is currently stored in memory on the backend
- Identity is based on `player_token`
- Rejoin uses `localStorage` on the frontend
- Do not rely only on this handoff: always inspect the real files before continuing

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

### Board and economy rules
- 40-cell board data
- Player positions
- Pass Start bonus
- Tax cells
- Go To Jail cell
- Chance / Community cards
- Property buying
- Skip purchase
- Auction flow
- Ownership
- Rent
- Full color set handling
- Mortgage / unmortgage
- Upgrade / sell upgrade
- Even-build rule
- Even-sell rule
- Trade between players for property + cash

### Debt recovery and bankruptcy
- `pending_bankruptcy` recovery flow
- Recovery through mortgage / sell upgrade / trade / declare bankruptcy
- Creditor-aware debt
- Debt can be owed to bank or another player
- Partial rent payment when player cannot fully pay
- `resume_player_id` handling
- Recovery handling for leave-edge-cases
- Automatic liquidation of upgrades before final bankruptcy transfer
- `last_bankruptcy_summary` exposed to UI

### Recent events and recap
- Structured `recent_events` in backend state
- `event_id` monotonic ids
- event `kind`
- event refs:
  - `player_id`
  - `target_player_id`
  - `cell_index`
- Recent events UI supports:
  - grouping
  - kind filters
  - show more / show less
  - event focus
  - entity filtering from board cells and player cards
  - linked-event badges
  - help legend
  - help persistence in `localStorage`
  - mobile actions menu
  - keyboard navigation
  - `aria-live` announcements
- `last_bankruptcy_summary` recap card is rendered in the UI

### Board and player UI
- Board tokens exist
- Token movement feedback exists with moving/highlight state
- Owner markers exist on owned cells
- Selected cell inspector exists
- Selected player inspector exists
- Mobile cleanup has already been done

### Action guide and navigation UX
- There is a central action guide card in `frontend/src/App.jsx`
- It derives the current player guidance from real game state
- It can show `Jump to ...` for the relevant active section
- Jump uses `scrollIntoView({ block: "start" })`
- Jump also moves keyboard focus to a preferred control when possible
- A hidden `aria-live` region announces jump results
- The target section gets temporary visual flash feedback
- Section labels are normalized, including `Upgrades desk`

### Desk sections UX
- `Trade desk`, `Mortgage desk`, and `Upgrades desk` have status headers
- Statuses include `Open`, `Locked`, `Empty`, `Waiting`, `Action needed`
- Locked and empty desk sections are collapsible
- These sections default to collapsed when they are explanatory only
- Collapse preferences are stored in `localStorage`
- The action guide shows `Reset desk layout` when custom desk collapse preferences exist
- Reset clears the stored desk layout preferences
- Reset also announces feedback through the action guide live region
- Mobile tap target for the desk toggle was improved with an expanded invisible hit area

## Important Backend Files
- `U:\Monopoly\backend\main.py`
- `U:\Monopoly\backend\schemas.py`
- `U:\Monopoly\backend\room_store.py`
- `U:\Monopoly\backend\board_data.py`
- `U:\Monopoly\backend\card_data.py`

## Important Frontend Files
- `U:\Monopoly\frontend\src\App.jsx`
- `U:\Monopoly\frontend\src\index.css`
- `U:\Monopoly\start-backend.cmd`
- `U:\Monopoly\start-frontend.cmd`
- `U:\Monopoly\start-game.cmd`

## Current MVP Simplifications
- No WebSocket yet
- No persistent database
- No bots
- No accounts
- In-memory backend state only
- Trade UI is still simplified
- Tokens are still simple circles, not themed pieces

## Best Next Step
The best next practical step is:

**Unify UI preference reset controls**

Recommended version:
- keep backend unchanged
- frontend-only
- combine `Reset desk layout` and the existing recent-events help reset into one small `Reset UI preferences` control
- keep the wording simple and the placement obvious

Good concrete target:
- one reset entry point for local UI preferences
- clear visual feedback
- clear `aria-live` feedback
- no extra complexity beyond the current UI system

## What Claude Code Should Check Next
Claude Code is most useful for:
- checking whether `Reset desk layout` is visually too strong next to `Jump to ...`
- checking whether one combined `Reset UI preferences` control is clearer than multiple reset buttons
- reviewing mobile layout when the guide card has multiple action buttons
- reviewing wording for reset feedback and section labels
- checking that `aria-live` feedback is helpful and not noisy

## What Codex Should Do Next
Codex is best for:
- implementing the unified reset control
- reusing existing `localStorage` helpers and guide feedback patterns
- keeping backend untouched
- updating `App.jsx` and `index.css`
- running `npm.cmd run lint` and `npm.cmd run build`

## What The User Should Learn
The user should keep learning:
- React rendering from state
- UI state vs game state
- `useState`
- `useEffect`
- `useRef`
- `localStorage`
- accessibility basics
- focus management
- `aria-live`
- FastAPI routes
- Pydantic schemas
- backend validation
- server-authoritative game logic
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
Do not rely only on the handoff; verify the current code before deciding anything.

After checking the files:
1. briefly summarize the real current state
2. list what is already implemented
3. propose the best practical next step
4. if the next step is frontend-only, start implementing it

Important working style:
- explain what we are doing now
- explain what I need to understand and learn
- say what Claude Code should verify after your changes
- keep explanations practical and simple
- check real files before changing anything
- after changes, run the needed checks
```

## Suggested New Chat Prompt For Claude Code
```text
Read AI_HANDOFF.md first, then inspect the real files.
Do not rely only on the handoff; verify the current code before commenting.

Focus on the current frontend state around:
- action guide
- jump-to-section behavior
- desk section headers and collapse behavior
- localStorage UI preferences
- reset controls

Then provide a practical review of:
- visual hierarchy
- wording consistency
- mobile UX
- accessibility / aria-live noise
- whether a single "Reset UI preferences" control is better than separate resets

Keep the review practical and tied to the real files.
```

## Working Style With This User
This project is also for learning.

When helping:
- explain what we are doing now
- explain what the user should understand and learn
- say what Claude Code should check next
- keep explanations practical and beginner-friendly
- prefer the next real step over abstract theory

If Claude Code changed files, verify the real codebase before continuing.

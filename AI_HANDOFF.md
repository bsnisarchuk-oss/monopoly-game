# AI Handoff

## Project
Online Monopoly-style game.

## Stack
- Frontend: React + Vite + JavaScript
- Backend: Python + FastAPI

## Paths
- Root: `U:\Monopoly`
- Frontend: `U:\Monopoly\frontend`
- Backend: `U:\Monopoly\backend`

## Run
### Backend
```powershell
cd U:\Monopoly\backend
.\.venv\Scripts\python -m uvicorn main:app --reload

Frontend
cd U:\Monopoly\frontend
npm.cmd run dev

Open
Frontend: http://localhost:5173
Backend docs: http://127.0.0.1:8000/docs
Current architecture
Server is authoritative.
Game rules must stay in backend.
Frontend should only render state and send player actions.
Room and game state are currently stored in memory on the backend.
Identity is based on player_token.
Rejoin uses localStorage on the frontend.
What is already implemented
Lobby / room flow
create room
join room
ready / unready
host-only start
leave room
rejoin
host transfer
room cleanup by TTL
Core game flow
game states: lobby, in_game, finished
current turn tracking
roll dice
doubles logic
jail logic
go to jail logic
winner when one player remains
Board / movement
board data
positions on board
pass start bonus
tax cells
go to jail cell
chance / community cards
last landed cell
last effects log
Economy
buy property
skip purchase
ownership
rent
property levels / upgrades
sell upgrades
mortgage / unmortgage
trade between players (simplified cash-for-property flow)
bankruptcy / elimination
Frontend
room screens
lobby UI
game board UI
center panel for current state
pending purchase UI
upgrade UI
mortgage UI
trade desk UI
finished / eliminated screens
Simplified rules currently used
This is an MVP, not full Monopoly.

Examples of simplifications:

no full auction system yet
no advanced trade negotiation UI
no bots
no accounts
no persistent database
no WebSocket yet
upgrades are simplified houses-like levels
trade is currently property-for-cash only
Current important backend files
U:\Monopoly\backend\main.py
U:\Monopoly\backend\schemas.py
U:\Monopoly\backend\room_store.py
U:\Monopoly\backend\board_data.py
U:\Monopoly\backend\card_data.py
Current important frontend files
U:\Monopoly\frontend\src\App.jsx
U:\Monopoly\frontend\src\index.css
Current next step
Likely next mechanic:

auction
Possible alternative if needed:

another economy/system improvement that fits MVP

Known working principle for future AI help
Always:

read this file first
then inspect the real project files
only after that suggest the next step
Do not rely only on this handoff because Claude Code may have changed files.

How to work with the user
This project is also for learning.

When helping:

explain what we are doing now
explain what the user absolutely needs to understand and learn
say when to use Codex
say when to use Claude Code
keep explanations practical and beginner-friendly
prefer building the next real feature instead of only discussing theory
When to use Codex
Use Codex mainly for:

writing routine code
adding endpoints
adding React UI
wiring backend and frontend
generating repetitive logic
explaining specific code line by line
When to use Claude Code
Use Claude Code mainly for:

code review
architecture checks
edge cases
hidden logic bugs
state machine risks
checking whether a rule or flow can break
Important note about Claude Code changes
If Claude Code changed files, verify the real codebase before continuing.
Do not assume the previous explanation is still correct without checking files.

Main learning topics for the user
The user should keep learning:

React components
state
props
event handling
controlled inputs
async/await
fetch
FastAPI routes
Pydantic schemas
server-authoritative game logic
shared game state thinking
validation on backend
difference between UI state and game state
Git / workflow
Use small commits after meaningful milestones.
If starting a new chat, ask the AI to:

read AI_HANDOFF.md
inspect the real files
summarize current project state
propose the next practical step
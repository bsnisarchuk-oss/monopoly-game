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

What is already implemented
create/join room
ready/unready
host start
leave room
rejoin
host transfer
turns
roll dice
doubles
jail
start / tax / go to jail
board data
chance / community cards
buy property / skip purchase
rent
bankruptcy / elimination / winner
upgrades
mortgage / unmortgage
trade between players
sell upgrades
Current state
The game is already playable as an MVP.
Main game flow works in browser.
Board UI exists and game rules are partially implemented.

Current next step
Implement the next mechanic:

auction
or
another agreed next gameplay/economy feature
Important architecture notes
Server is authoritative.
Game logic must stay in backend.
Frontend only renders state and sends actions.
Claude Code may have changed files during the project, so always verify real files before continuing.
How to work with me
When helping on this project:

First inspect the real files.
Then explain what we are doing now.
Tell me what I absolutely need to understand and learn.
Tell me when to use Codex.
Tell me when to use Claude Code.
If Claude Code changed something, adapt to the real codebase before suggesting next steps.
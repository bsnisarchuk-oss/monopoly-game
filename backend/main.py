from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from room_store import (
    create_room,
    get_room,
    join_room,
    leave_room,
    rejoin_room,
    roll_dice,
    set_player_ready,
    start_game,
)
from schemas import (
    CreateRoomRequest,
    JoinRoomRequest,
    LeaveRoomRequest,
    LeaveRoomResponse,
    RejoinRoomRequest,
    ReadyStateRequest,
    RollDiceRequest,
    StartGameRequest,
    RoomActionResponse,
    RoomResponse,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Backend is working"}


@app.post("/rooms", response_model=RoomActionResponse)
def create_room_endpoint(payload: CreateRoomRequest):
    return create_room(payload.nickname)


@app.post("/rooms/join", response_model=RoomActionResponse)
def join_room_endpoint(payload: JoinRoomRequest):
    return join_room(payload.room_code, payload.nickname)


@app.get("/rooms/{room_code}", response_model=RoomResponse)
def get_room_endpoint(room_code: str):
    return get_room(room_code)


@app.post("/rooms/{room_code}/ready", response_model=RoomActionResponse)
def set_ready_state_endpoint(room_code: str, payload: ReadyStateRequest):
    return set_player_ready(room_code, payload.player_token, payload.is_ready)


@app.post("/rooms/{room_code}/start", response_model=RoomActionResponse)
def start_game_endpoint(room_code: str, payload: StartGameRequest):
    return start_game(room_code, payload.player_token)


@app.post("/rooms/{room_code}/leave", response_model=LeaveRoomResponse)
def leave_room_endpoint(room_code: str, payload: LeaveRoomRequest):
    return leave_room(room_code, payload.player_token)


@app.post("/rooms/{room_code}/rejoin", response_model=RoomActionResponse)
def rejoin_room_endpoint(room_code: str, payload: RejoinRoomRequest):
    return rejoin_room(room_code, payload.player_token)


@app.post("/rooms/{room_code}/roll", response_model=RoomActionResponse)
def roll_dice_endpoint(room_code: str, payload: RollDiceRequest):
    return roll_dice(room_code, payload.player_token)

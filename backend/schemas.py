from pydantic import BaseModel, Field


class CreateRoomRequest(BaseModel):
    nickname: str = Field(min_length=1, max_length=24)


class JoinRoomRequest(BaseModel):
    nickname: str = Field(min_length=1, max_length=24)
    room_code: str = Field(min_length=6, max_length=6)


class ReadyStateRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)
    is_ready: bool


class StartGameRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)


class LeaveRoomRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)


class RejoinRoomRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)


class RollDiceRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)


class PlayerResponse(BaseModel):
    player_id: str
    nickname: str
    is_host: bool
    is_ready: bool


class BoardCellResponse(BaseModel):
    index: int
    name: str
    cell_type: str
    description: str
    price: int | None = None
    amount: int | None = None
    color_group: str | None = None


class TurnStateResponse(BaseModel):
    current_player_id: str
    turn_number: int
    last_roll: list[int] | None
    is_doubles: bool
    can_roll: bool


class GameStateResponse(BaseModel):
    board: list[BoardCellResponse]
    turn: TurnStateResponse
    positions: dict[str, int]
    cash: dict[str, int]
    in_jail: dict[str, bool]
    doubles_streak: dict[str, int]
    winner_id: str | None = None
    last_landed_player_id: str | None = None
    last_landed_position: int | None = None
    last_effects: list[str]


class RoomResponse(BaseModel):
    room_code: str
    status: str
    max_players: int
    min_players_to_start: int
    players: list[PlayerResponse]
    game: GameStateResponse | None = None


class RoomActionResponse(BaseModel):
    player_id: str
    player_token: str
    room: RoomResponse


class LeaveRoomResponse(BaseModel):
    left_room: bool
    room_deleted: bool

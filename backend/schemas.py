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


class PayJailFineRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)


class DeclareBankruptcyRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)


class BuyPropertyRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)


class SkipPurchaseRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)


class BidAuctionRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)
    amount: int = Field(ge=1)


class PassAuctionRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)


class UpgradePropertyRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)
    position: int = Field(ge=0, le=39)


class SellUpgradeRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)
    position: int = Field(ge=0, le=39)


class MortgagePropertyRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)
    position: int = Field(ge=0, le=39)


class UnmortgagePropertyRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)
    position: int = Field(ge=0, le=39)


class ProposeTradeRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)
    target_player_id: str = Field(min_length=8, max_length=8)
    position: int = Field(ge=0, le=39)
    cash_amount: int = Field(ge=0, le=5000)


class RespondTradeRequest(BaseModel):
    player_token: str = Field(min_length=32, max_length=32)
    accept: bool


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


class StaticBoardResponse(BaseModel):
    board: list[BoardCellResponse]


class TurnStateResponse(BaseModel):
    current_player_id: str
    turn_number: int
    last_roll: list[int] | None
    is_doubles: bool
    can_roll: bool


class PendingPurchaseResponse(BaseModel):
    player_id: str
    position: int
    price: int
    cell_name: str
    cell_type: str


class DrawnCardResponse(BaseModel):
    deck: str
    title: str
    description: str


class PendingTradeResponse(BaseModel):
    proposer_id: str
    receiver_id: str
    position: int
    cell_name: str
    cell_type: str
    cash_amount: int


class PendingAuctionResponse(BaseModel):
    initiator_player_id: str
    active_player_id: str
    highest_bidder_id: str | None = None
    position: int
    cell_name: str
    cell_type: str
    price: int
    current_bid: int
    eligible_player_ids: list[str]
    passed_player_ids: list[str]


class PendingBankruptcyResponse(BaseModel):
    player_id: str
    amount_owed: int
    creditor_type: str = "bank"
    creditor_player_id: str | None = None


class BankruptcySummaryResponse(BaseModel):
    debtor_player_id: str
    debtor_nickname: str
    creditor_type: str
    creditor_player_id: str | None = None
    creditor_name: str
    message: str
    property_count: int
    mortgaged_property_count: int
    liquidated_upgrade_count: int
    liquidation_cash: int
    cash_collected: int


class RecentEventResponse(BaseModel):
    event_id: int
    turn_number: int
    kind: str
    player_id: str | None = None
    target_player_id: str | None = None
    cell_index: int | None = None
    summary: str
    details: list[str]


class GameStateResponse(BaseModel):
    board: list[BoardCellResponse] | None = None
    turn: TurnStateResponse
    positions: dict[str, int]
    cash: dict[str, int]
    property_owners: dict[int, str]
    property_levels: dict[int, int]
    property_mortgaged: dict[int, bool]
    in_jail: dict[str, bool]
    doubles_streak: dict[str, int]
    turns_in_jail: dict[str, int]
    pending_purchase: PendingPurchaseResponse | None = None
    pending_trade: PendingTradeResponse | None = None
    pending_auction: PendingAuctionResponse | None = None
    pending_bankruptcy: PendingBankruptcyResponse | None = None
    last_bankruptcy_summary: BankruptcySummaryResponse | None = None
    recent_events: list[RecentEventResponse]
    last_drawn_card: DrawnCardResponse | None = None
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
    last_activity: float = 0.0
    room_version: int = 0


class RoomActionResponse(BaseModel):
    player_id: str
    player_token: str
    room: RoomResponse


class LeaveRoomResponse(BaseModel):
    left_room: bool
    room_deleted: bool

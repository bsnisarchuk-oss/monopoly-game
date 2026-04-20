import asyncio
import json

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

import room_events
from board_data import get_board_cells
from room_store import (
    auction_pending_purchase,
    bid_in_auction,
    build_room_snapshot,
    buy_property,
    create_room,
    declare_bankruptcy,
    get_room,
    join_room,
    leave_room,
    mortgage_property,
    pay_jail_fine,
    pass_auction,
    propose_trade,
    rejoin_room,
    respond_to_trade,
    roll_dice,
    sell_upgrade,
    set_player_ready,
    skip_property_purchase,
    start_game,
    unmortgage_property,
    upgrade_property,
)
from schemas import (
    BidAuctionRequest,
    BuyPropertyRequest,
    CreateRoomRequest,
    DeclareBankruptcyRequest,
    JoinRoomRequest,
    LeaveRoomRequest,
    LeaveRoomResponse,
    MortgagePropertyRequest,
    PayJailFineRequest,
    PassAuctionRequest,
    ProposeTradeRequest,
    RejoinRoomRequest,
    ReadyStateRequest,
    RespondTradeRequest,
    RollDiceRequest,
    SellUpgradeRequest,
    RoomActionResponse,
    StaticBoardResponse,
    RoomResponse,
    SkipPurchaseRequest,
    StartGameRequest,
    UnmortgagePropertyRequest,
    UpgradePropertyRequest,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Частота heartbeat: достаточно редкая, чтобы не спамить, но чаще стандартных
# idle-таймаутов reverse-proxy (Nginx 60s, Cloudflare 100s).
_SSE_HEARTBEAT_SECONDS = 15
# Если очередь подписчика пуста дольше heartbeat — шлём ping-comment.
_SSE_QUEUE_WAIT_SECONDS = _SSE_HEARTBEAT_SECONDS


@app.get("/")
def read_root():
    return {"message": "Backend is working"}


@app.get("/board", response_model=StaticBoardResponse)
def get_board_endpoint():
    return {"board": get_board_cells()}


@app.post("/rooms", response_model=RoomActionResponse)
def create_room_endpoint(payload: CreateRoomRequest):
    return create_room(payload.nickname)


@app.post("/rooms/join", response_model=RoomActionResponse)
def join_room_endpoint(payload: JoinRoomRequest):
    return join_room(payload.room_code, payload.nickname)


@app.get("/rooms/{room_code}", response_model=RoomResponse)
def get_room_endpoint(room_code: str, include_board: bool = False):
    return get_room(room_code, include_board=include_board)


@app.get("/rooms/{room_code}/stream")
async def stream_room_endpoint(room_code: str, request: Request):
    """Server-Sent Events channel: push full room snapshot on every mutation.

    Protocol:
      * On connect the server sends one ``snapshot`` event with the current
        room state so the client has a baseline without a separate GET.
      * Every subsequent ``_touch_room`` in ``room_store`` fans a fresh snapshot
        through ``room_events.publish`` and the handler forwards it here.
      * ``sse_starlette`` handles heartbeat comments and disconnect detection.

    TODO: on room deletion emit a terminal ``gone`` event so the client can
    clear its session immediately (сейчас клиент узнаёт это при следующем
    действии через 404).
    """
    # build_room_snapshot поднимет 404 если комнаты нет — FastAPI его подхватит.
    # Важно: сначала snapshot, потом subscribe, чтобы на stream открытия у нас
    # уже был валидный room_code и клиент получил гарантированно свежий state
    # даже если мутация случилась между subscribe и первым yield.
    initial_snapshot = build_room_snapshot(room_code)
    queue = room_events.subscribe(initial_snapshot["room_code"])

    async def event_generator():
        try:
            yield {"event": "snapshot", "data": json.dumps(initial_snapshot)}
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(
                        queue.get(), timeout=_SSE_QUEUE_WAIT_SECONDS
                    )
                except asyncio.TimeoutError:
                    # sse-starlette сам шлёт ping, но на всякий случай
                    # гоняем цикл — проверяем disconnect.
                    continue
                yield {"event": "snapshot", "data": json.dumps(payload)}
        finally:
            room_events.unsubscribe(initial_snapshot["room_code"], queue)

    return EventSourceResponse(
        event_generator(),
        ping=_SSE_HEARTBEAT_SECONDS,
    )


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


@app.post("/rooms/{room_code}/jail/pay-fine", response_model=RoomActionResponse)
def pay_jail_fine_endpoint(room_code: str, payload: PayJailFineRequest):
    return pay_jail_fine(room_code, payload.player_token)


@app.post("/rooms/{room_code}/bankruptcy/declare", response_model=RoomActionResponse)
def declare_bankruptcy_endpoint(room_code: str, payload: DeclareBankruptcyRequest):
    return declare_bankruptcy(room_code, payload.player_token)


@app.post("/rooms/{room_code}/buy", response_model=RoomActionResponse)
def buy_property_endpoint(room_code: str, payload: BuyPropertyRequest):
    return buy_property(room_code, payload.player_token)


@app.post("/rooms/{room_code}/auction/start", response_model=RoomActionResponse)
def start_pending_purchase_auction_endpoint(room_code: str, payload: BuyPropertyRequest):
    return auction_pending_purchase(room_code, payload.player_token)


@app.post("/rooms/{room_code}/skip-purchase", response_model=RoomActionResponse)
def skip_purchase_endpoint(room_code: str, payload: SkipPurchaseRequest):
    return skip_property_purchase(room_code, payload.player_token)


@app.post("/rooms/{room_code}/auction/bid", response_model=RoomActionResponse)
def bid_auction_endpoint(room_code: str, payload: BidAuctionRequest):
    return bid_in_auction(room_code, payload.player_token, payload.amount)


@app.post("/rooms/{room_code}/auction/pass", response_model=RoomActionResponse)
def pass_auction_endpoint(room_code: str, payload: PassAuctionRequest):
    return pass_auction(room_code, payload.player_token)


@app.post("/rooms/{room_code}/upgrade", response_model=RoomActionResponse)
def upgrade_property_endpoint(room_code: str, payload: UpgradePropertyRequest):
    return upgrade_property(room_code, payload.player_token, payload.position)


@app.post("/rooms/{room_code}/sell-upgrade", response_model=RoomActionResponse)
def sell_upgrade_endpoint(room_code: str, payload: SellUpgradeRequest):
    return sell_upgrade(room_code, payload.player_token, payload.position)


@app.post("/rooms/{room_code}/mortgage", response_model=RoomActionResponse)
def mortgage_property_endpoint(room_code: str, payload: MortgagePropertyRequest):
    return mortgage_property(room_code, payload.player_token, payload.position)


@app.post("/rooms/{room_code}/unmortgage", response_model=RoomActionResponse)
def unmortgage_property_endpoint(room_code: str, payload: UnmortgagePropertyRequest):
    return unmortgage_property(room_code, payload.player_token, payload.position)


@app.post("/rooms/{room_code}/trade/propose", response_model=RoomActionResponse)
def propose_trade_endpoint(room_code: str, payload: ProposeTradeRequest):
    return propose_trade(
        room_code,
        payload.player_token,
        payload.target_player_id,
        payload.position,
        payload.cash_amount,
    )


@app.post("/rooms/{room_code}/trade/respond", response_model=RoomActionResponse)
def respond_trade_endpoint(room_code: str, payload: RespondTradeRequest):
    return respond_to_trade(room_code, payload.player_token, payload.accept)

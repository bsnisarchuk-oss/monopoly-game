import random
import string
import threading
import time
import uuid

from board_data import BOARD_CELLS, get_board_cells
from fastapi import HTTPException

MAX_PLAYERS = 4
MIN_PLAYERS_TO_START = 2
ROOM_CODE_LENGTH = 6
ROOM_STATUS_LOBBY = "lobby"
ROOM_STATUS_IN_GAME = "in_game"
ROOM_STATUS_FINISHED = "finished"
ROOM_TTL_SECONDS = 2 * 60 * 60
_CLEANUP_INTERVAL_SECONDS = 10 * 60
STARTING_CASH = 1500
BOARD_SIZE = len(BOARD_CELLS)
JAIL_POSITION = 10
MAX_DOUBLES_STREAK = 3

rooms: dict[str, dict] = {}
_rooms_lock = threading.Lock()


def _normalize_nickname(nickname: str) -> str:
    trimmed_nickname = nickname.strip()

    if not trimmed_nickname:
        raise HTTPException(status_code=400, detail="Nickname is required.")

    return trimmed_nickname


def _normalize_room_code(room_code: str) -> str:
    trimmed_code = room_code.strip().upper()

    if not trimmed_code:
        raise HTTPException(status_code=400, detail="Room code is required.")

    return trimmed_code


def _generate_player(nickname: str, is_host: bool) -> dict:
    return {
        "player_id": uuid.uuid4().hex[:8],
        "player_token": uuid.uuid4().hex,
        "nickname": nickname,
        "is_host": is_host,
        "is_ready": False,
    }


def _generate_room_code() -> str:
    """Call only while holding _rooms_lock."""
    alphabet = string.ascii_uppercase + string.digits

    while True:
        room_code = "".join(random.choices(alphabet, k=ROOM_CODE_LENGTH))

        if room_code not in rooms:
            return room_code


def _cleanup_expired_rooms() -> None:
    while True:
        time.sleep(_CLEANUP_INTERVAL_SECONDS)
        now = time.time()
        with _rooms_lock:
            expired = [
                code
                for code, room in rooms.items()
                if now - room["last_activity"] > ROOM_TTL_SECONDS
            ]
            for code in expired:
                del rooms[code]


threading.Thread(target=_cleanup_expired_rooms, daemon=True).start()


def _find_room_or_raise(room_code: str) -> dict:
    room = rooms.get(room_code)

    if room is None:
        raise HTTPException(status_code=404, detail="Room not found.")

    return room


def _ensure_room_is_in_lobby(room: dict) -> None:
    if room["status"] != ROOM_STATUS_LOBBY:
        raise HTTPException(status_code=400, detail="Game has already started.")


def _ensure_nickname_is_unique(room: dict, nickname: str) -> None:
    existing_nicknames = {player["nickname"].lower() for player in room["players"]}

    if nickname.lower() in existing_nicknames:
        raise HTTPException(
            status_code=400,
            detail="A player with this nickname is already in the room.",
        )


def _find_player_by_token(room: dict, player_token: str) -> dict:
    for player in room["players"]:
        if player["player_token"] == player_token:
            return player

    raise HTTPException(status_code=403, detail="Invalid player token.")


def _touch_room(room: dict) -> None:
    room["last_activity"] = time.time()


def _get_board_cell(position: int) -> dict:
    return BOARD_CELLS[position]


def _create_game_state(room: dict) -> dict:
    player_ids = [player["player_id"] for player in room["players"]]
    first_player_id = random.choice(player_ids)

    return {
        "board": get_board_cells(),
        "turn": {
            "current_player_id": first_player_id,
            "turn_number": 1,
            "last_roll": None,
            "is_doubles": False,
            "can_roll": True,
        },
        "positions": {player_id: 0 for player_id in player_ids},
        "cash": {player_id: STARTING_CASH for player_id in player_ids},
        "in_jail": {player_id: False for player_id in player_ids},
        "doubles_streak": {player_id: 0 for player_id in player_ids},
        "winner_id": None,
        "last_landed_player_id": None,
        "last_landed_position": None,
        "last_effects": [],
    }


def _set_last_resolution(
    game: dict,
    player_id: str,
    landed_position: int | None,
    effects: list[str],
) -> None:
    game["last_landed_player_id"] = player_id
    game["last_landed_position"] = landed_position
    game["last_effects"] = effects


def _apply_start_bonus(game: dict, player_id: str, effects: list[str]) -> None:
    start_amount = _get_board_cell(0).get("amount", 0)

    if start_amount:
        game["cash"][player_id] += start_amount
        effects.append(f"Collected ${start_amount} from Start.")


def _resolve_landing(
    game: dict,
    player_id: str,
    current_position: int,
    total: int,
) -> tuple[int, bool, list[str]]:
    effects: list[str] = []
    landed_position = (current_position + total) % BOARD_SIZE
    passed_start = current_position + total >= BOARD_SIZE

    if passed_start:
        _apply_start_bonus(game, player_id, effects)

    landed_cell = _get_board_cell(landed_position)

    if landed_cell["cell_type"] == "go_to_jail":
        game["in_jail"][player_id] = True
        game["doubles_streak"][player_id] = 0
        game["positions"][player_id] = JAIL_POSITION
        effects.append("Landed on Go To Jail and moved directly to Jail.")
        return landed_position, True, effects

    game["positions"][player_id] = landed_position

    if landed_cell["cell_type"] == "tax":
        tax_amount = landed_cell.get("amount", 0)
        if tax_amount:
            game["cash"][player_id] -= tax_amount
            effects.append(f"Paid ${tax_amount} for {landed_cell['name']}.")

    return landed_position, False, effects


def _remove_player_from_game_state(room: dict, leaving_player_id: str) -> None:
    game = room.get("game")

    if not game:
        return

    remaining_player_ids = [player["player_id"] for player in room["players"]]
    turn = game["turn"]

    if turn["current_player_id"] == leaving_player_id and remaining_player_ids:
        all_ids = list(game["positions"].keys())
        leaving_index = all_ids.index(leaving_player_id)
        next_id = remaining_player_ids[0]
        for i in range(1, len(all_ids)):
            candidate = all_ids[(leaving_index + i) % len(all_ids)]
            if candidate in remaining_player_ids:
                next_id = candidate
                break
        turn["current_player_id"] = next_id
        turn["can_roll"] = True

    game["positions"].pop(leaving_player_id, None)
    game["cash"].pop(leaving_player_id, None)
    game["in_jail"].pop(leaving_player_id, None)
    game["doubles_streak"].pop(leaving_player_id, None)


def _build_action_response(player: dict, room: dict) -> dict:
    return {
        "player_id": player["player_id"],
        "player_token": player["player_token"],
        "room": room,
    }


def create_room(nickname: str) -> dict:
    normalized_nickname = _normalize_nickname(nickname)

    with _rooms_lock:
        room_code = _generate_room_code()
        host_player = _generate_player(normalized_nickname, is_host=True)
        room = {
            "room_code": room_code,
            "status": ROOM_STATUS_LOBBY,
            "max_players": MAX_PLAYERS,
            "min_players_to_start": MIN_PLAYERS_TO_START,
            "players": [host_player],
            "last_activity": time.time(),
        }
        rooms[room_code] = room

    return _build_action_response(host_player, room)


def join_room(room_code: str, nickname: str) -> dict:
    normalized_room_code = _normalize_room_code(room_code)
    normalized_nickname = _normalize_nickname(nickname)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)
        _ensure_room_is_in_lobby(room)

        if len(room["players"]) >= room["max_players"]:
            raise HTTPException(status_code=400, detail="Room is full.")

        _ensure_nickname_is_unique(room, normalized_nickname)

        for player in room["players"]:
            player["is_ready"] = False

        new_player = _generate_player(normalized_nickname, is_host=False)
        room["players"].append(new_player)
        _touch_room(room)

    return _build_action_response(new_player, room)


def get_room(room_code: str) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        return _find_room_or_raise(normalized_room_code)


def set_player_ready(room_code: str, player_token: str, is_ready: bool) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)
        _ensure_room_is_in_lobby(room)
        player = _find_player_by_token(room, player_token)
        player["is_ready"] = is_ready
        _touch_room(room)

    return _build_action_response(player, room)


def start_game(room_code: str, player_token: str) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)
        _ensure_room_is_in_lobby(room)
        player = _find_player_by_token(room, player_token)

        if not player["is_host"]:
            raise HTTPException(status_code=403, detail="Only the host can start the game.")

        if len(room["players"]) < room["min_players_to_start"]:
            raise HTTPException(
                status_code=400,
                detail="At least two players are required to start the game.",
            )

        if not all(member["is_ready"] for member in room["players"]):
            raise HTTPException(
                status_code=400,
                detail="All players must be ready before the game can start.",
            )

        room["status"] = ROOM_STATUS_IN_GAME
        room["game"] = _create_game_state(room)
        _touch_room(room)

    return _build_action_response(player, room)


def leave_room(room_code: str, player_token: str) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)
        player = _find_player_by_token(room, player_token)
        was_host = player["is_host"]

        room["players"] = [
            existing_player
            for existing_player in room["players"]
            if existing_player["player_token"] != player_token
        ]

        if not room["players"]:
            del rooms[normalized_room_code]
            return {"left_room": True, "room_deleted": True}

        _remove_player_from_game_state(room, player["player_id"])

        if was_host:
            room["players"][0]["is_host"] = True

        if room["status"] == ROOM_STATUS_IN_GAME and len(room["players"]) == 1:
            room["status"] = ROOM_STATUS_FINISHED
            room["game"]["winner_id"] = room["players"][0]["player_id"]

        _touch_room(room)

    return {"left_room": True, "room_deleted": False}


def rejoin_room(room_code: str, player_token: str) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)
        player = _find_player_by_token(room, player_token)
        _touch_room(room)

    return _build_action_response(player, room)


def roll_dice(room_code: str, player_token: str) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)
        player = _find_player_by_token(room, player_token)

        if room["status"] != ROOM_STATUS_IN_GAME or room.get("game") is None:
            raise HTTPException(status_code=400, detail="Game has not started yet.")

        game = room["game"]
        turn = game["turn"]

        if turn["current_player_id"] != player["player_id"]:
            raise HTTPException(status_code=403, detail="It is not your turn.")

        if not turn["can_roll"]:
            raise HTTPException(status_code=400, detail="You already rolled this turn.")

        game["last_effects"] = []
        turn["last_roll"] = None
        turn["is_doubles"] = False

        die_one = random.randint(1, 6)
        die_two = random.randint(1, 6)
        total = die_one + die_two
        is_doubles = die_one == die_two

        turn["last_roll"] = [die_one, die_two]
        turn["is_doubles"] = is_doubles

        player_id = player["player_id"]
        player_ids = [member["player_id"] for member in room["players"]]
        next_index = (player_ids.index(player_id) + 1) % len(player_ids)
        next_player_id = player_ids[next_index]

        if game["in_jail"][player_id]:
            if is_doubles:
                game["in_jail"][player_id] = False
                game["doubles_streak"][player_id] = 0
                landed_position, sent_to_jail, effects = _resolve_landing(
                    game,
                    player_id,
                    game["positions"][player_id],
                    total,
                )
                effects.insert(0, "Rolled doubles to leave Jail.")
                _set_last_resolution(game, player_id, landed_position, effects)
                turn["current_player_id"] = next_player_id
            else:
                _set_last_resolution(
                    game,
                    player_id,
                    game["positions"][player_id],
                    ["Stayed in Jail after failing to roll doubles."],
                )
                turn["current_player_id"] = next_player_id

            turn["turn_number"] += 1
            turn["can_roll"] = True
            _touch_room(room)
            return _build_action_response(player, room)

        if is_doubles:
            game["doubles_streak"][player_id] += 1
        else:
            game["doubles_streak"][player_id] = 0

        if is_doubles and game["doubles_streak"][player_id] >= MAX_DOUBLES_STREAK:
            game["in_jail"][player_id] = True
            game["doubles_streak"][player_id] = 0
            game["positions"][player_id] = JAIL_POSITION
            _set_last_resolution(
                game,
                player_id,
                JAIL_POSITION,
                ["Rolled three doubles in a row and went directly to Jail."],
            )
            turn["current_player_id"] = next_player_id
            turn["turn_number"] += 1
            turn["can_roll"] = True
            _touch_room(room)
            return _build_action_response(player, room)

        landed_position, sent_to_jail, effects = _resolve_landing(
            game,
            player_id,
            game["positions"][player_id],
            total,
        )
        _set_last_resolution(game, player_id, landed_position, effects)

        if sent_to_jail:
            game["last_effects"].append("Doubles forfeited - sent to Jail.")
            turn["current_player_id"] = next_player_id
        elif is_doubles:
            game["last_effects"].append("Rolled doubles, so you take another turn.")
        else:
            turn["current_player_id"] = next_player_id

        turn["turn_number"] += 1
        turn["can_roll"] = True
        _touch_room(room)

    return _build_action_response(player, room)

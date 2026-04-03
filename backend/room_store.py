import random
import string
import threading
import time
import uuid
import math

from board_data import BOARD_CELLS, get_board_cells
from card_data import draw_card
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
BUYABLE_CELL_TYPES = {"property", "railroad", "utility"}
MAX_PROPERTY_LEVEL = 4
PROPERTY_RENT_MULTIPLIERS = [1, 2, 4, 7, 11]

rooms: dict[str, dict] = {}
_rooms_lock = threading.Lock()
PROPERTY_GROUPS: dict[str, list[int]] = {}

for board_cell in BOARD_CELLS:
    if board_cell["cell_type"] != "property" or not board_cell.get("color_group"):
        continue

    PROPERTY_GROUPS.setdefault(board_cell["color_group"], []).append(board_cell["index"])


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


def _find_player_by_id(room: dict, player_id: str) -> dict:
    for player in room["players"]:
        if player["player_id"] == player_id:
            return player

    raise HTTPException(status_code=404, detail="Player not found in this room.")


def _touch_room(room: dict) -> None:
    room["last_activity"] = time.time()


def _get_board_cell(position: int) -> dict:
    return BOARD_CELLS[position]


def _is_buyable_cell(cell: dict) -> bool:
    return cell["cell_type"] in BUYABLE_CELL_TYPES and cell.get("price") is not None


def _get_next_player_id(room: dict, player_id: str) -> str:
    player_ids = [member["player_id"] for member in room["players"]]
    next_index = (player_ids.index(player_id) + 1) % len(player_ids)
    return player_ids[next_index]


def _get_player_name(room: dict, player_id: str) -> str:
    for player in room["players"]:
        if player["player_id"] == player_id:
            return player["nickname"]

    return "Unknown player"


def _count_owned_cells_by_type(game: dict, owner_id: str, cell_type: str) -> int:
    return sum(
        1
        for position, current_owner_id in game["property_owners"].items()
        if current_owner_id == owner_id and _get_board_cell(position)["cell_type"] == cell_type
    )


def _get_property_level(game: dict, position: int) -> int:
    return game["property_levels"].get(position, 0)


def _get_upgrade_cost(cell: dict) -> int:
    return max(50, cell["price"] // 2)


def _get_upgrade_sell_value(cell: dict) -> int:
    return max(25, _get_upgrade_cost(cell) // 2)


def _get_mortgage_value(cell: dict) -> int:
    return max(30, cell["price"] // 2)


def _get_unmortgage_cost(cell: dict) -> int:
    return math.ceil(_get_mortgage_value(cell) * 1.1)


def _owns_full_color_group(game: dict, owner_id: str, position: int) -> bool:
    cell = _get_board_cell(position)

    if cell["cell_type"] != "property" or not cell.get("color_group"):
        return False

    group_positions = PROPERTY_GROUPS.get(cell["color_group"], [])

    return bool(group_positions) and all(
        game["property_owners"].get(group_position) == owner_id
        for group_position in group_positions
    )


def _color_group_has_mortgaged_property(game: dict, position: int) -> bool:
    cell = _get_board_cell(position)

    if cell["cell_type"] != "property" or not cell.get("color_group"):
        return False

    group_positions = PROPERTY_GROUPS.get(cell["color_group"], [])

    return any(game["property_mortgaged"].get(group_position, False) for group_position in group_positions)


def _color_group_has_any_upgrade(game: dict, position: int) -> bool:
    cell = _get_board_cell(position)

    if cell["cell_type"] != "property" or not cell.get("color_group"):
        return False

    group_positions = PROPERTY_GROUPS.get(cell["color_group"], [])

    return any(game["property_levels"].get(group_position, 0) > 0 for group_position in group_positions)


def _calculate_rent(game: dict, owner_id: str, landed_position: int, roll_total: int) -> int:
    landed_cell = _get_board_cell(landed_position)
    cell_type = landed_cell["cell_type"]

    if game["property_mortgaged"].get(landed_position, False):
        return 0

    if cell_type == "property":
        base_rent = max(10, landed_cell["price"] // 10)
        level = min(_get_property_level(game, landed_position), MAX_PROPERTY_LEVEL)
        return base_rent * PROPERTY_RENT_MULTIPLIERS[level]

    if cell_type == "railroad":
        owned_railroads = _count_owned_cells_by_type(game, owner_id, "railroad")
        return 25 * max(1, owned_railroads)

    if cell_type == "utility":
        owned_utilities = _count_owned_cells_by_type(game, owner_id, "utility")
        multiplier = 10 if owned_utilities >= 2 else 4
        return roll_total * multiplier

    return 0


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
        "property_owners": {},
        "property_levels": {},
        "property_mortgaged": {},
        "in_jail": {player_id: False for player_id in player_ids},
        "doubles_streak": {player_id: 0 for player_id in player_ids},
        "pending_purchase": None,
        "pending_trade": None,
        "last_drawn_card": None,
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


def _resolve_card_destination(
    room: dict,
    player_id: str,
    target_position: int,
    roll_total: int,
    effects: list[str],
) -> tuple[bool, bool]:
    game = room["game"]
    target_cell = _get_board_cell(target_position)

    if target_cell["cell_type"] == "go_to_jail":
        game["in_jail"][player_id] = True
        game["doubles_streak"][player_id] = 0
        game["positions"][player_id] = JAIL_POSITION
        effects.append("The card sent you to Go To Jail, then on to Jail.")
        return True, False

    game["positions"][player_id] = target_position

    if target_cell["cell_type"] == "tax":
        tax_amount = target_cell.get("amount", 0)
        if tax_amount:
            game["cash"][player_id] -= tax_amount
            effects.append(f"Paid ${tax_amount} for {target_cell['name']}.")

    pending_purchase_created = False
    if _is_buyable_cell(target_cell):
        pending_purchase_created = _resolve_buyable_cell(
            room,
            player_id,
            target_position,
            roll_total,
            effects,
        )

    return False, pending_purchase_created


def _draw_and_resolve_card(
    room: dict,
    player_id: str,
    cell_type: str,
    current_position: int,
    roll_total: int,
    effects: list[str],
) -> tuple[bool, bool]:
    game = room["game"]
    card = draw_card(cell_type)
    game["last_drawn_card"] = {
        "deck": card["deck"],
        "title": card["title"],
        "description": card["description"],
    }
    effects.append(f"{card['deck']} card: {card['title']}.")
    effect_type = card["effect_type"]

    if effect_type == "cash":
        amount = card["amount"]
        game["cash"][player_id] += amount
        if amount >= 0:
            effects.append(f"Collected ${amount} from the card.")
        else:
            effects.append(f"Paid ${abs(amount)} because of the card.")
        return False, False

    if effect_type == "go_to_jail":
        game["in_jail"][player_id] = True
        game["doubles_streak"][player_id] = 0
        game["positions"][player_id] = JAIL_POSITION
        effects.append("Moved directly to Jail because of the card.")
        return True, False

    if effect_type == "move_to":
        target_position = card["position"]

        if card.get("collect_start") or target_position < current_position:
            _apply_start_bonus(game, player_id, effects)

        target_cell = _get_board_cell(target_position)
        effects.append(f"Moved to {target_cell['name']} because of the card.")
        return _resolve_card_destination(
            room,
            player_id,
            target_position,
            roll_total,
            effects,
        )

    return False, False


def _resolve_landing(
    room: dict,
    player_id: str,
    current_position: int,
    total: int,
) -> tuple[int, bool, bool, list[str]]:
    game = room["game"]
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
        return landed_position, True, False, effects

    game["positions"][player_id] = landed_position

    if landed_cell["cell_type"] == "tax":
        tax_amount = landed_cell.get("amount", 0)
        if tax_amount:
            game["cash"][player_id] -= tax_amount
            effects.append(f"Paid ${tax_amount} for {landed_cell['name']}.")

    if landed_cell["cell_type"] in {"chance", "community"}:
        sent_to_jail, pending_purchase_created = _draw_and_resolve_card(
            room,
            player_id,
            landed_cell["cell_type"],
            landed_position,
            total,
            effects,
        )
        return landed_position, sent_to_jail, pending_purchase_created, effects

    return landed_position, False, False, effects


def _resolve_buyable_cell(
    room: dict,
    player_id: str,
    landed_position: int,
    roll_total: int,
    effects: list[str],
) -> bool:
    game = room["game"]
    landed_cell = _get_board_cell(landed_position)

    if not _is_buyable_cell(landed_cell):
        return False

    owner_id = game["property_owners"].get(landed_position)

    if owner_id is None:
        price = landed_cell["price"]

        if game["cash"][player_id] < price:
            effects.append(f"You cannot afford {landed_cell['name']} for ${price}.")
            return False

        game["pending_purchase"] = {
            "player_id": player_id,
            "position": landed_position,
            "price": price,
            "cell_name": landed_cell["name"],
            "cell_type": landed_cell["cell_type"],
        }
        effects.append(f"You can buy {landed_cell['name']} for ${price}.")
        return True

    if owner_id == player_id:
        if game["property_mortgaged"].get(landed_position, False):
            effects.append(f"You landed on your mortgaged {landed_cell['name']}.")
        else:
            effects.append(f"You landed on your own {landed_cell['name']}.")
    else:
        owner_name = _get_player_name(room, owner_id)
        if game["property_mortgaged"].get(landed_position, False):
            effects.append(f"{landed_cell['name']} is mortgaged, so no rent is due.")
            return False
        rent = _calculate_rent(game, owner_id, landed_position, roll_total)
        game["cash"][player_id] -= rent
        game["cash"][owner_id] += rent
        effects.append(f"Paid ${rent} rent to {owner_name} for {landed_cell['name']}.")

    return False


def _resume_turn_after_purchase(room: dict, player_id: str) -> None:
    game = room["game"]
    turn = game["turn"]

    if turn["is_doubles"] and not game["in_jail"].get(player_id, False):
        turn["current_player_id"] = player_id
    else:
        turn["current_player_id"] = _get_next_player_id(room, player_id)

    turn["can_roll"] = True


def _handle_bankruptcy(room: dict, player: dict) -> bool:
    game = room["game"]
    player_id = player["player_id"]

    if game["cash"].get(player_id, 0) >= 0:
        return False

    game["last_effects"].append(f"{player['nickname']} went bankrupt and was eliminated.")
    game["pending_purchase"] = None
    game["pending_trade"] = None
    game["turn"]["is_doubles"] = False
    game["turn"]["turn_number"] += 1

    room["players"] = [
        existing_player
        for existing_player in room["players"]
        if existing_player["player_id"] != player_id
    ]

    _remove_player_from_game_state(room, player_id)

    if room["players"] and player["is_host"]:
        room["players"][0]["is_host"] = True

    if len(room["players"]) == 1:
        winner = room["players"][0]
        room["status"] = ROOM_STATUS_FINISHED
        game["winner_id"] = winner["player_id"]
        game["last_effects"].append(f"{winner['nickname']} wins the game.")

    _touch_room(room)
    return True


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
    game["property_owners"] = {
        position: owner_id
        for position, owner_id in game["property_owners"].items()
        if owner_id != leaving_player_id
    }
    game["property_levels"] = {
        position: level
        for position, level in game.get("property_levels", {}).items()
        if position in game["property_owners"]
    }
    game["property_mortgaged"] = {
        position: is_mortgaged
        for position, is_mortgaged in game.get("property_mortgaged", {}).items()
        if position in game["property_owners"]
    }
    game["in_jail"].pop(leaving_player_id, None)
    game["doubles_streak"].pop(leaving_player_id, None)

    pending_purchase = game.get("pending_purchase")
    if pending_purchase and pending_purchase["player_id"] == leaving_player_id:
        game["pending_purchase"] = None

    pending_trade = game.get("pending_trade")
    if pending_trade and leaving_player_id in {
        pending_trade["proposer_id"],
        pending_trade["receiver_id"],
    }:
        game["pending_trade"] = None


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

        if game["pending_trade"] is not None:
            raise HTTPException(status_code=400, detail="Resolve the pending trade before rolling.")

        game["last_effects"] = []
        game["pending_purchase"] = None
        game["last_drawn_card"] = None
        turn["last_roll"] = None
        turn["is_doubles"] = False

        die_one = random.randint(1, 6)
        die_two = random.randint(1, 6)
        total = die_one + die_two
        is_doubles = die_one == die_two

        turn["last_roll"] = [die_one, die_two]
        turn["is_doubles"] = is_doubles

        player_id = player["player_id"]
        next_player_id = _get_next_player_id(room, player_id)

        if game["in_jail"][player_id]:
            if is_doubles:
                game["in_jail"][player_id] = False
                game["doubles_streak"][player_id] = 0
                landed_position, sent_to_jail, pending_purchase_created, effects = _resolve_landing(
                    room,
                    player_id,
                    game["positions"][player_id],
                    total,
                )
                effects.insert(0, "Rolled doubles to leave Jail.")
                _set_last_resolution(game, player_id, landed_position, effects)

                if not sent_to_jail and not pending_purchase_created:
                    pending_purchase_created = _resolve_buyable_cell(
                        room,
                        player_id,
                        landed_position,
                        total,
                        game["last_effects"],
                    )

                if pending_purchase_created:
                    # Jail escape never grants an extra turn - override so
                    # _resume_turn_after_purchase sends to next player.
                    turn["is_doubles"] = False
                    turn["current_player_id"] = player_id
                    turn["can_roll"] = False
                    turn["turn_number"] += 1
                    _touch_room(room)
                    return _build_action_response(player, room)

                if _handle_bankruptcy(room, player):
                    return _build_action_response(player, room)

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

        landed_position, sent_to_jail, pending_purchase_created, effects = _resolve_landing(
            room,
            player_id,
            game["positions"][player_id],
            total,
        )
        _set_last_resolution(game, player_id, landed_position, effects)

        if not sent_to_jail and not pending_purchase_created:
            pending_purchase_created = _resolve_buyable_cell(
                room,
                player_id,
                landed_position,
                total,
                game["last_effects"],
            )

        if _handle_bankruptcy(room, player):
            return _build_action_response(player, room)

        if sent_to_jail:
            if is_doubles:
                game["last_effects"].append("Doubles forfeited - sent to Jail.")
            turn["current_player_id"] = next_player_id
        elif pending_purchase_created:
            if is_doubles:
                game["last_effects"].append("Resolve the purchase first to use your extra turn.")
            turn["current_player_id"] = player_id
            turn["can_roll"] = False
            turn["turn_number"] += 1
            _touch_room(room)
            return _build_action_response(player, room)
        elif is_doubles:
            game["last_effects"].append("Rolled doubles, so you take another turn.")
        else:
            turn["current_player_id"] = next_player_id

        turn["turn_number"] += 1
        turn["can_roll"] = True
        _touch_room(room)

    return _build_action_response(player, room)


def _require_pending_purchase(room: dict, player_token: str) -> tuple[dict, dict, dict]:
    if room["status"] != ROOM_STATUS_IN_GAME or room.get("game") is None:
        raise HTTPException(status_code=400, detail="Game has not started yet.")

    player = _find_player_by_token(room, player_token)
    game = room["game"]
    pending_purchase = game.get("pending_purchase")

    if pending_purchase is None:
        raise HTTPException(status_code=400, detail="There is no property waiting to be resolved.")

    if pending_purchase["player_id"] != player["player_id"]:
        raise HTTPException(status_code=403, detail="Only the active player can resolve this purchase.")

    return player, game, pending_purchase


def buy_property(room_code: str, player_token: str) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)
        player, game, pending_purchase = _require_pending_purchase(room, player_token)
        player_id = player["player_id"]
        position = pending_purchase["position"]
        cell = _get_board_cell(position)
        price = pending_purchase["price"]

        if not _is_buyable_cell(cell):
            raise HTTPException(status_code=400, detail="This cell cannot be purchased.")

        if position in game["property_owners"]:
            raise HTTPException(status_code=400, detail="This property is already owned.")

        if game["cash"][player_id] < price:
            raise HTTPException(
                status_code=400,
                detail="You do not have enough cash to buy this property.",
            )

        game["cash"][player_id] -= price
        game["property_owners"][position] = player_id
        game["property_mortgaged"][position] = False
        game["pending_purchase"] = None
        game["last_effects"].append(f"Bought {cell['name']} for ${price}.")

        if _owns_full_color_group(game, player_id, position):
            game["last_effects"].append(
                f"Completed the {cell['color_group'].replace('_', ' ')} set. Upgrades unlocked."
            )

        _resume_turn_after_purchase(room, player_id)
        _touch_room(room)

    return _build_action_response(player, room)


def skip_property_purchase(room_code: str, player_token: str) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)
        player, game, pending_purchase = _require_pending_purchase(room, player_token)
        player_id = player["player_id"]
        cell = _get_board_cell(pending_purchase["position"])

        game["pending_purchase"] = None
        game["last_effects"].append(f"Passed on buying {cell['name']}.")
        _resume_turn_after_purchase(room, player_id)
        _touch_room(room)

    return _build_action_response(player, room)


def upgrade_property(room_code: str, player_token: str, position: int) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)

        if room["status"] != ROOM_STATUS_IN_GAME or room.get("game") is None:
            raise HTTPException(status_code=400, detail="Game has not started yet.")

        player = _find_player_by_token(room, player_token)
        game = room["game"]
        turn = game["turn"]
        player_id = player["player_id"]

        if turn["current_player_id"] != player_id:
            raise HTTPException(status_code=403, detail="It is not your turn.")

        if not turn["can_roll"]:
            raise HTTPException(
                status_code=400,
                detail="You can only upgrade properties before rolling this turn.",
            )

        if game["pending_purchase"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending purchase before upgrading properties.",
            )

        if game["pending_trade"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending trade before upgrading properties.",
            )

        if position < 0 or position >= BOARD_SIZE:
            raise HTTPException(status_code=400, detail="Invalid board position.")

        cell = _get_board_cell(position)

        if cell["cell_type"] != "property" or cell.get("price") is None:
            raise HTTPException(
                status_code=400,
                detail="Only standard property cells can be upgraded.",
            )

        if game["property_owners"].get(position) != player_id:
            raise HTTPException(
                status_code=403,
                detail="You can only upgrade properties that you own.",
            )

        if not _owns_full_color_group(game, player_id, position):
            raise HTTPException(
                status_code=400,
                detail="You need the full color group before upgrading this property.",
            )

        if _color_group_has_mortgaged_property(game, position):
            raise HTTPException(
                status_code=400,
                detail="You cannot upgrade a color group while any property in it is mortgaged.",
            )

        current_level = _get_property_level(game, position)

        if current_level >= MAX_PROPERTY_LEVEL:
            raise HTTPException(
                status_code=400,
                detail="This property is already at the maximum upgrade level.",
            )

        upgrade_cost = _get_upgrade_cost(cell)

        if game["cash"][player_id] < upgrade_cost:
            raise HTTPException(
                status_code=400,
                detail="You do not have enough cash to upgrade this property.",
            )

        game["cash"][player_id] -= upgrade_cost
        new_level = current_level + 1
        game["property_levels"][position] = new_level
        new_rent = _calculate_rent(game, player_id, position, 0)
        game["last_drawn_card"] = None
        game["last_effects"] = [
            f"Upgraded {cell['name']} to level {new_level} for ${upgrade_cost}.",
            f"Rent is now ${new_rent}.",
        ]
        _touch_room(room)

    return _build_action_response(player, room)


def sell_upgrade(room_code: str, player_token: str, position: int) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)

        if room["status"] != ROOM_STATUS_IN_GAME or room.get("game") is None:
            raise HTTPException(status_code=400, detail="Game has not started yet.")

        player = _find_player_by_token(room, player_token)
        game = room["game"]
        turn = game["turn"]
        player_id = player["player_id"]

        if turn["current_player_id"] != player_id:
            raise HTTPException(status_code=403, detail="It is not your turn.")

        if not turn["can_roll"]:
            raise HTTPException(
                status_code=400,
                detail="You can only sell upgrades before rolling this turn.",
            )

        if game["pending_purchase"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending purchase before selling upgrades.",
            )

        if game["pending_trade"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending trade before selling upgrades.",
            )

        if position < 0 or position >= BOARD_SIZE:
            raise HTTPException(status_code=400, detail="Invalid board position.")

        cell = _get_board_cell(position)

        if cell["cell_type"] != "property" or cell.get("price") is None:
            raise HTTPException(
                status_code=400,
                detail="Only standard property cells can sell upgrades.",
            )

        if game["property_owners"].get(position) != player_id:
            raise HTTPException(
                status_code=403,
                detail="You can only sell upgrades from properties that you own.",
            )

        current_level = _get_property_level(game, position)

        if current_level <= 0:
            raise HTTPException(
                status_code=400,
                detail="This property has no upgrades to sell.",
            )

        sell_value = _get_upgrade_sell_value(cell)
        new_level = current_level - 1
        game["cash"][player_id] += sell_value

        if new_level == 0:
            game["property_levels"].pop(position, None)
        else:
            game["property_levels"][position] = new_level

        new_rent = _calculate_rent(game, player_id, position, 0)
        game["last_drawn_card"] = None
        game["last_effects"] = [
            f"Sold one upgrade on {cell['name']} for ${sell_value}.",
            f"Rent is now ${new_rent}.",
        ]
        _touch_room(room)

    return _build_action_response(player, room)


def mortgage_property(room_code: str, player_token: str, position: int) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)

        if room["status"] != ROOM_STATUS_IN_GAME or room.get("game") is None:
            raise HTTPException(status_code=400, detail="Game has not started yet.")

        player = _find_player_by_token(room, player_token)
        game = room["game"]
        turn = game["turn"]
        player_id = player["player_id"]

        if turn["current_player_id"] != player_id:
            raise HTTPException(status_code=403, detail="It is not your turn.")

        if not turn["can_roll"]:
            raise HTTPException(
                status_code=400,
                detail="You can only manage mortgages before rolling this turn.",
            )

        if game["pending_purchase"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending purchase before managing mortgages.",
            )

        if game["pending_trade"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending trade before managing mortgages.",
            )

        cell = _get_board_cell(position)

        if not _is_buyable_cell(cell):
            raise HTTPException(status_code=400, detail="This cell cannot be mortgaged.")

        if game["property_owners"].get(position) != player_id:
            raise HTTPException(
                status_code=403,
                detail="You can only mortgage cells that you own.",
            )

        if game["property_mortgaged"].get(position, False):
            raise HTTPException(status_code=400, detail="This cell is already mortgaged.")

        if cell["cell_type"] == "property" and _color_group_has_any_upgrade(game, position):
            raise HTTPException(
                status_code=400,
                detail="Sell all upgrades in this color group before mortgaging any property in it.",
            )

        mortgage_value = _get_mortgage_value(cell)
        game["cash"][player_id] += mortgage_value
        game["property_mortgaged"][position] = True
        game["last_drawn_card"] = None
        game["last_effects"] = [f"Mortgaged {cell['name']} for ${mortgage_value}."]
        _touch_room(room)

    return _build_action_response(player, room)


def unmortgage_property(room_code: str, player_token: str, position: int) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)

        if room["status"] != ROOM_STATUS_IN_GAME or room.get("game") is None:
            raise HTTPException(status_code=400, detail="Game has not started yet.")

        player = _find_player_by_token(room, player_token)
        game = room["game"]
        turn = game["turn"]
        player_id = player["player_id"]

        if turn["current_player_id"] != player_id:
            raise HTTPException(status_code=403, detail="It is not your turn.")

        if not turn["can_roll"]:
            raise HTTPException(
                status_code=400,
                detail="You can only manage mortgages before rolling this turn.",
            )

        if game["pending_purchase"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending purchase before managing mortgages.",
            )

        if game["pending_trade"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending trade before managing mortgages.",
            )

        cell = _get_board_cell(position)

        if not _is_buyable_cell(cell):
            raise HTTPException(status_code=400, detail="This cell cannot be unmortgaged.")

        if game["property_owners"].get(position) != player_id:
            raise HTTPException(
                status_code=403,
                detail="You can only unmortgage cells that you own.",
            )

        if not game["property_mortgaged"].get(position, False):
            raise HTTPException(status_code=400, detail="This cell is not mortgaged.")

        unmortgage_cost = _get_unmortgage_cost(cell)

        if game["cash"][player_id] < unmortgage_cost:
            raise HTTPException(
                status_code=400,
                detail="You do not have enough cash to unmortgage this cell.",
            )

        game["cash"][player_id] -= unmortgage_cost
        game["property_mortgaged"][position] = False
        game["last_drawn_card"] = None
        game["last_effects"] = [f"Unmortgaged {cell['name']} for ${unmortgage_cost}."]
        _touch_room(room)

    return _build_action_response(player, room)


def propose_trade(
    room_code: str,
    player_token: str,
    target_player_id: str,
    position: int,
    cash_amount: int,
) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)

        if room["status"] != ROOM_STATUS_IN_GAME or room.get("game") is None:
            raise HTTPException(status_code=400, detail="Game has not started yet.")

        player = _find_player_by_token(room, player_token)
        target_player = _find_player_by_id(room, target_player_id)
        game = room["game"]
        turn = game["turn"]
        player_id = player["player_id"]

        if target_player["player_id"] == player_id:
            raise HTTPException(status_code=400, detail="You cannot offer a trade to yourself.")

        if turn["current_player_id"] != player_id:
            raise HTTPException(status_code=403, detail="It is not your turn.")

        if not turn["can_roll"]:
            raise HTTPException(
                status_code=400,
                detail="You can only propose trades before rolling this turn.",
            )

        if game["pending_purchase"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending purchase before proposing a trade.",
            )

        if game["pending_trade"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the current pending trade before proposing another one.",
            )

        cell = _get_board_cell(position)

        if not _is_buyable_cell(cell):
            raise HTTPException(status_code=400, detail="Only owned buyable cells can be traded.")

        if game["property_owners"].get(position) != player_id:
            raise HTTPException(status_code=403, detail="You can only trade cells that you own.")

        if game["property_mortgaged"].get(position, False):
            raise HTTPException(status_code=400, detail="Mortgaged cells cannot be traded.")

        if cell["cell_type"] == "property" and _color_group_has_any_upgrade(game, position):
            raise HTTPException(
                status_code=400,
                detail="Remove all upgrades in this color group before trading a property from it.",
            )

        if game["cash"].get(target_player_id, 0) < cash_amount:
            raise HTTPException(
                status_code=400,
                detail=f"{target_player['nickname']} does not have enough cash for this offer.",
            )

        game["pending_trade"] = {
            "proposer_id": player_id,
            "receiver_id": target_player_id,
            "position": position,
            "cell_name": cell["name"],
            "cell_type": cell["cell_type"],
            "cash_amount": cash_amount,
        }
        game["last_drawn_card"] = None
        game["last_effects"] = [
            f"Offered {cell['name']} to {target_player['nickname']} for ${cash_amount}.",
        ]
        _touch_room(room)

    return _build_action_response(player, room)


def respond_to_trade(room_code: str, player_token: str, accept: bool) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)

        if room["status"] != ROOM_STATUS_IN_GAME or room.get("game") is None:
            raise HTTPException(status_code=400, detail="Game has not started yet.")

        player = _find_player_by_token(room, player_token)
        game = room["game"]
        pending_trade = game.get("pending_trade")

        if pending_trade is None:
            raise HTTPException(status_code=400, detail="There is no pending trade to resolve.")

        proposer_id = pending_trade["proposer_id"]
        receiver_id = pending_trade["receiver_id"]
        position = pending_trade["position"]
        cash_amount = pending_trade["cash_amount"]
        cell = _get_board_cell(position)
        proposer = _find_player_by_id(room, proposer_id)
        receiver = _find_player_by_id(room, receiver_id)
        actor_id = player["player_id"]

        if actor_id not in {proposer_id, receiver_id}:
            raise HTTPException(status_code=403, detail="You are not part of this trade.")

        if accept and actor_id != receiver_id:
            raise HTTPException(status_code=403, detail="Only the receiving player can accept this trade.")

        if not accept:
            action_word = "cancelled" if actor_id == proposer_id else "rejected"
            game["pending_trade"] = None
            game["last_drawn_card"] = None
            game["last_effects"] = [
                f"{player['nickname']} {action_word} the trade for {cell['name']}.",
            ]
            _touch_room(room)
            return _build_action_response(player, room)

        if game["property_owners"].get(position) != proposer_id:
            raise HTTPException(
                status_code=400,
                detail="The offered property is no longer owned by the proposing player.",
            )

        if game["property_mortgaged"].get(position, False):
            raise HTTPException(status_code=400, detail="Mortgaged cells cannot be traded.")

        if cell["cell_type"] == "property" and _color_group_has_any_upgrade(game, position):
            raise HTTPException(
                status_code=400,
                detail="Remove all upgrades in this color group before trading a property from it.",
            )

        if game["cash"].get(receiver_id, 0) < cash_amount:
            raise HTTPException(
                status_code=400,
                detail=f"{receiver['nickname']} no longer has enough cash for this trade.",
            )

        game["cash"][receiver_id] -= cash_amount
        game["cash"][proposer_id] += cash_amount
        game["property_owners"][position] = receiver_id
        game["pending_trade"] = None
        game["last_drawn_card"] = None
        game["last_effects"] = [
            f"{receiver['nickname']} bought {cell['name']} from {proposer['nickname']} for ${cash_amount}.",
        ]

        if cell["cell_type"] == "property" and _owns_full_color_group(game, receiver_id, position):
            game["last_effects"].append(
                f"{receiver['nickname']} completed the {cell['color_group'].replace('_', ' ')} set."
            )

        _touch_room(room)

    return _build_action_response(player, room)

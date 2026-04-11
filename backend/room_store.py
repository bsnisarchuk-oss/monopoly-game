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
JAIL_FINE_AMOUNT = 50
MAX_DOUBLES_STREAK = 3
MAX_JAIL_TURNS = 3
BUYABLE_CELL_TYPES = {"property", "railroad", "utility"}
MAX_PROPERTY_LEVEL = 4
PROPERTY_RENT_MULTIPLIERS = [1, 2, 4, 7, 11]
BANKRUPTCY_CREDITOR_BANK = "bank"
BANKRUPTCY_CREDITOR_PLAYER = "player"
MAX_RECENT_EVENTS = 8
EVENT_KIND_AUCTION = "auction"
EVENT_KIND_BANKRUPTCY = "bankruptcy"
EVENT_KIND_JAIL = "jail"
EVENT_KIND_PROPERTY = "property"
EVENT_KIND_ROLL = "roll"
EVENT_KIND_SYSTEM = "system"
EVENT_KIND_TRADE = "trade"

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


def _touch_room(room: dict, *, increment_version: bool = True) -> None:
    if increment_version:
        room["room_version"] = room.get("room_version", 0) + 1
    room["last_activity"] = time.time()


def _append_recent_event(
    game: dict,
    event_kind: str,
    player_id: str | None = None,
    target_player_id: str | None = None,
    cell_index: int | None = None,
) -> None:
    details = [effect for effect in game.get("last_effects", []) if effect]
    if not details:
        return

    next_event_id = game.get("next_recent_event_id", 1)
    event = {
        "event_id": next_event_id,
        "turn_number": game.get("turn", {}).get("turn_number", 0),
        "kind": event_kind,
        "player_id": player_id,
        "target_player_id": target_player_id,
        "cell_index": cell_index,
        "summary": details[0],
        "details": details,
    }
    game["next_recent_event_id"] = next_event_id + 1
    existing_events = game.get("recent_events", [])
    game["recent_events"] = [event, *existing_events][:MAX_RECENT_EVENTS]


def _touch_room_with_event(
    room: dict,
    event_kind: str = EVENT_KIND_SYSTEM,
    player_id: str | None = None,
    target_player_id: str | None = None,
    cell_index: int | None = None,
) -> None:
    game = room.get("game")
    if game is not None:
        _append_recent_event(
            game,
            event_kind,
            player_id=player_id,
            target_player_id=target_player_id,
            cell_index=cell_index,
        )
    _touch_room(room)


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
    mortgage_value = _get_mortgage_value(cell)
    return mortgage_value + math.ceil(mortgage_value / 10)


def _collect_partial_payment(game: dict, debtor_id: str, creditor_id: str, amount: int) -> tuple[int, int]:
    available_cash = max(game["cash"].get(debtor_id, 0), 0)
    paid_now = min(available_cash, amount)

    if paid_now > 0:
        game["cash"][debtor_id] -= paid_now
        game["cash"][creditor_id] += paid_now

    return paid_now, amount - paid_now


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
        rent = base_rent * PROPERTY_RENT_MULTIPLIERS[level]
        if (
            level == 0
            and _owns_full_color_group(game, owner_id, landed_position)
            and not _color_group_has_mortgaged_property(game, landed_position)
        ):
            rent *= 2
        return rent

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
        "turns_in_jail": {player_id: 0 for player_id in player_ids},
        "pending_purchase": None,
        "pending_trade": None,
        "pending_auction": None,
        "pending_bankruptcy": None,
        "last_bankruptcy_summary": None,
        "recent_events": [],
        "next_recent_event_id": 1,
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
) -> tuple[bool, bool, dict | None]:
    game = room["game"]
    target_cell = _get_board_cell(target_position)

    if target_cell["cell_type"] == "go_to_jail":
        game["in_jail"][player_id] = True
        game["doubles_streak"][player_id] = 0
        game["positions"][player_id] = JAIL_POSITION
        effects.append("The card sent you to Go To Jail, then on to Jail.")
        return True, False, None

    game["positions"][player_id] = target_position

    if target_cell["cell_type"] == "tax":
        tax_amount = target_cell.get("amount", 0)
        if tax_amount:
            game["cash"][player_id] -= tax_amount
            effects.append(f"Paid ${tax_amount} for {target_cell['name']}.")

    pending_purchase_created = False
    bankruptcy_context = None
    if _is_buyable_cell(target_cell):
        pending_purchase_created, bankruptcy_context = _resolve_buyable_cell(
            room,
            player_id,
            target_position,
            roll_total,
            effects,
        )

    return False, pending_purchase_created, bankruptcy_context


def _draw_and_resolve_card(
    room: dict,
    player_id: str,
    cell_type: str,
    current_position: int,
    roll_total: int,
    effects: list[str],
) -> tuple[bool, bool, dict | None]:
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
        return False, False, None

    if effect_type == "go_to_jail":
        game["in_jail"][player_id] = True
        game["doubles_streak"][player_id] = 0
        game["positions"][player_id] = JAIL_POSITION
        effects.append("Moved directly to Jail because of the card.")
        return True, False, None

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

    return False, False, None


def _resolve_landing(
    room: dict,
    player_id: str,
    current_position: int,
    total: int,
) -> tuple[int, bool, bool, list[str], dict | None]:
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
        return landed_position, True, False, effects, None

    game["positions"][player_id] = landed_position

    if landed_cell["cell_type"] == "tax":
        tax_amount = landed_cell.get("amount", 0)
        if tax_amount:
            game["cash"][player_id] -= tax_amount
            effects.append(f"Paid ${tax_amount} for {landed_cell['name']}.")

    if landed_cell["cell_type"] in {"chance", "community"}:
        sent_to_jail, pending_purchase_created, bankruptcy_context = _draw_and_resolve_card(
            room,
            player_id,
            landed_cell["cell_type"],
            landed_position,
            total,
            effects,
        )
        return landed_position, sent_to_jail, pending_purchase_created, effects, bankruptcy_context

    return landed_position, False, False, effects, None


def _resolve_buyable_cell(
    room: dict,
    player_id: str,
    landed_position: int,
    roll_total: int,
    effects: list[str],
) -> tuple[bool, dict | None]:
    game = room["game"]
    landed_cell = _get_board_cell(landed_position)

    if not _is_buyable_cell(landed_cell):
        return False, None

    owner_id = game["property_owners"].get(landed_position)

    if owner_id is None:
        price = landed_cell["price"]

        if game["cash"][player_id] < price:
            effects.append(f"You cannot afford {landed_cell['name']} for ${price}.")
            return False, None

        game["pending_purchase"] = {
            "player_id": player_id,
            "position": landed_position,
            "price": price,
            "cell_name": landed_cell["name"],
            "cell_type": landed_cell["cell_type"],
        }
        effects.append(f"You can buy {landed_cell['name']} for ${price}.")
        return True, None

    if owner_id == player_id:
        if game["property_mortgaged"].get(landed_position, False):
            effects.append(f"You landed on your mortgaged {landed_cell['name']}.")
        else:
            effects.append(f"You landed on your own {landed_cell['name']}.")
    else:
        owner_name = _get_player_name(room, owner_id)
        if game["property_mortgaged"].get(landed_position, False):
            effects.append(f"{landed_cell['name']} is mortgaged, so no rent is due.")
            return False, None
        rent = _calculate_rent(game, owner_id, landed_position, roll_total)
        if game["cash"][player_id] >= rent:
            game["cash"][player_id] -= rent
            game["cash"][owner_id] += rent
            effects.append(f"Paid ${rent} rent to {owner_name} for {landed_cell['name']}.")
        else:
            paid_now, remaining_owed = _collect_partial_payment(game, player_id, owner_id, rent)
            if paid_now > 0:
                effects.append(
                    f"Paid ${paid_now} rent to {owner_name} for {landed_cell['name']}, but still owe ${remaining_owed}."
                )
            else:
                effects.append(
                    f"Could not pay the ${rent} rent to {owner_name} for {landed_cell['name']}."
                )
            return (
                False,
                {
                    "amount_owed": remaining_owed,
                    "creditor_type": BANKRUPTCY_CREDITOR_PLAYER,
                    "creditor_player_id": owner_id,
                },
            )

    return False, None


def _resume_turn_after_purchase(room: dict, player_id: str) -> None:
    game = room["game"]
    turn = game["turn"]

    if turn["is_doubles"] and not game["in_jail"].get(player_id, False):
        turn["current_player_id"] = player_id
    else:
        turn["current_player_id"] = _get_next_player_id(room, player_id)

    turn["can_roll"] = True


def _build_auction_order(room: dict, initiator_player_id: str) -> list[str]:
    game = room["game"]
    ordered_player_ids = [
        player["player_id"]
        for player in room["players"]
        if game["cash"].get(player["player_id"], 0) > 0
    ]

    if initiator_player_id not in ordered_player_ids:
        return ordered_player_ids

    initiator_index = ordered_player_ids.index(initiator_player_id)
    return (
        ordered_player_ids[initiator_index + 1 :]
        + ordered_player_ids[: initiator_index + 1]
    )


def _get_active_auction_player_ids(auction: dict) -> list[str]:
    passed_player_ids = set(auction.get("passed_player_ids", []))
    return [
        player_id
        for player_id in auction["eligible_player_ids"]
        if player_id not in passed_player_ids
    ]


def _get_next_auction_player_id(auction: dict, current_player_id: str | None) -> str | None:
    active_player_ids = _get_active_auction_player_ids(auction)

    if not active_player_ids:
        return None

    if current_player_id is None or current_player_id not in auction["eligible_player_ids"]:
        return active_player_ids[0]

    current_index = auction["eligible_player_ids"].index(current_player_id)
    total_players = len(auction["eligible_player_ids"])

    for offset in range(1, total_players + 1):
        candidate = auction["eligible_player_ids"][(current_index + offset) % total_players]

        if candidate in active_player_ids:
            return candidate

    return active_player_ids[0]


def _start_auction(
    room: dict,
    initiator_player_id: str,
    position: int,
    effects: list[str],
) -> bool:
    game = room["game"]
    cell = _get_board_cell(position)

    if not _is_buyable_cell(cell) or game["property_owners"].get(position) is not None:
        return False

    if game.get("pending_auction") is not None:
        return False

    eligible_player_ids = _build_auction_order(room, initiator_player_id)

    if not eligible_player_ids:
        effects.append(f"No players have enough cash to start an auction for {cell['name']}.")
        return False

    active_player_id = eligible_player_ids[0]
    game["pending_auction"] = {
        "initiator_player_id": initiator_player_id,
        "active_player_id": active_player_id,
        "highest_bidder_id": None,
        "position": position,
        "cell_name": cell["name"],
        "cell_type": cell["cell_type"],
        "price": cell["price"],
        "current_bid": 0,
        "eligible_player_ids": eligible_player_ids,
        "passed_player_ids": [],
    }
    effects.append(f"Auction started for {cell['name']}.")
    effects.append(f"{_get_player_name(room, active_player_id)} bids first.")
    return True


def _finalize_auction(room: dict, auction: dict) -> None:
    game = room["game"]
    position = auction["position"]
    cell = _get_board_cell(position)
    highest_bidder_id = auction.get("highest_bidder_id")
    current_bid = auction["current_bid"]

    if highest_bidder_id is not None and current_bid > 0:
        winner_name = _get_player_name(room, highest_bidder_id)
        game["cash"][highest_bidder_id] -= current_bid
        game["property_owners"][position] = highest_bidder_id
        game["property_mortgaged"][position] = False
        game["last_effects"].append(
            f"{winner_name} won the auction for {cell['name']} at ${current_bid}."
        )

        if (
            cell["cell_type"] == "property"
            and _owns_full_color_group(game, highest_bidder_id, position)
            and not _color_group_has_mortgaged_property(game, position)
        ):
            game["last_effects"].append(
                f"{winner_name} completed the {cell['color_group'].replace('_', ' ')} set. Upgrades unlocked."
            )
    else:
        game["last_effects"].append(f"No one bought {cell['name']} in the auction.")

    game["pending_auction"] = None
    _resume_turn_after_purchase(room, auction["initiator_player_id"])


def _start_bankruptcy_recovery(
    room: dict,
    player: dict,
    resume_player_id: str,
    amount_owed: int | None = None,
    creditor_type: str = BANKRUPTCY_CREDITOR_BANK,
    creditor_player_id: str | None = None,
) -> bool:
    game = room["game"]
    player_id = player["player_id"]

    if amount_owed is None:
        amount_owed = abs(min(game["cash"].get(player_id, 0), 0))

    if amount_owed <= 0:
        return False

    game["pending_purchase"] = None
    game["pending_trade"] = None
    game["pending_auction"] = None
    game["pending_bankruptcy"] = {
        "player_id": player_id,
        "amount_owed": amount_owed,
        "resume_player_id": resume_player_id,
        "creditor_type": creditor_type,
        "creditor_player_id": creditor_player_id,
    }
    game["turn"]["current_player_id"] = player_id
    game["turn"]["can_roll"] = False
    game["turn"]["turn_number"] += 1
    if creditor_type == BANKRUPTCY_CREDITOR_PLAYER and creditor_player_id is not None:
        creditor_name = _get_player_name(room, creditor_player_id)
        game["last_effects"].append(
            f"{player['nickname']} must recover ${amount_owed} owed to {creditor_name} or declare bankruptcy."
        )
    else:
        game["last_effects"].append(
            f"{player['nickname']} must recover ${amount_owed} or declare bankruptcy."
        )
    _touch_room_with_event(
        room,
        EVENT_KIND_BANKRUPTCY,
        player_id=player_id,
        target_player_id=creditor_player_id,
    )
    return True


def _start_bankruptcy_recovery_from_context(
    room: dict,
    player: dict,
    resume_player_id: str,
    bankruptcy_context: dict | None,
) -> bool:
    if bankruptcy_context is None:
        return _start_bankruptcy_recovery(room, player, resume_player_id)

    return _start_bankruptcy_recovery(
        room,
        player,
        resume_player_id,
        amount_owed=bankruptcy_context["amount_owed"],
        creditor_type=bankruptcy_context.get("creditor_type", BANKRUPTCY_CREDITOR_BANK),
        creditor_player_id=bankruptcy_context.get("creditor_player_id"),
    )


def _transfer_bankrupt_assets_to_creditor(
    room: dict, debtor_id: str, creditor_player_id: str
) -> tuple[int, int, int]:
    game = room["game"]

    if creditor_player_id == debtor_id or creditor_player_id not in game["cash"]:
        return 0, 0, 0

    transferred_cash = max(game["cash"].get(debtor_id, 0), 0)
    if transferred_cash > 0:
        game["cash"][debtor_id] -= transferred_cash
        game["cash"][creditor_player_id] += transferred_cash

    transferred_positions = 0
    transferred_mortgaged_positions = 0
    for position, owner_id in list(game["property_owners"].items()):
        if owner_id == debtor_id:
            game["property_owners"][position] = creditor_player_id
            transferred_positions += 1
            if game["property_mortgaged"].get(position, False):
                transferred_mortgaged_positions += 1

    return transferred_cash, transferred_positions, transferred_mortgaged_positions


def _get_bankrupt_property_positions(game: dict, player_id: str) -> list[int]:
    return [
        position
        for position, owner_id in game["property_owners"].items()
        if owner_id == player_id
    ]


def _liquidate_bankrupt_upgrades(game: dict, player_id: str) -> tuple[int, int]:
    liquidated_upgrades = 0
    liquidation_cash = 0

    for position, owner_id in list(game["property_owners"].items()):
        if owner_id != player_id:
            continue

        current_level = game["property_levels"].get(position, 0)
        if current_level <= 0:
            continue

        cell = _get_board_cell(position)
        liquidation_cash += _get_upgrade_sell_value(cell) * current_level
        liquidated_upgrades += current_level
        game["property_levels"].pop(position, None)

    if liquidation_cash > 0:
        game["cash"][player_id] += liquidation_cash

    return liquidated_upgrades, liquidation_cash


def _eliminate_bankrupt_player(
    room: dict, player: dict, message: str, pending_bankruptcy: dict | None = None
) -> None:
    game = room["game"]
    player_id = player["player_id"]
    creditor_player_id = None
    creditor_type = BANKRUPTCY_CREDITOR_BANK
    creditor_name = "the bank"

    if pending_bankruptcy:
        creditor_type = pending_bankruptcy.get("creditor_type", BANKRUPTCY_CREDITOR_BANK)
        if creditor_type == BANKRUPTCY_CREDITOR_PLAYER:
            creditor_player_id = pending_bankruptcy.get("creditor_player_id")
            if creditor_player_id is not None:
                creditor_name = _get_player_name(room, creditor_player_id)

    transferred_cash = 0
    transferred_positions = 0
    transferred_mortgaged_positions = 0
    property_positions = _get_bankrupt_property_positions(game, player_id)
    property_count = len(property_positions)
    mortgaged_property_count = sum(
        1 for position in property_positions if game["property_mortgaged"].get(position, False)
    )
    liquidated_upgrades, liquidation_cash = _liquidate_bankrupt_upgrades(game, player_id)
    if creditor_player_id is not None:
        (
            transferred_cash,
            transferred_positions,
            transferred_mortgaged_positions,
        ) = _transfer_bankrupt_assets_to_creditor(
            room, player_id, creditor_player_id
        )

    game["last_bankruptcy_summary"] = {
        "debtor_player_id": player_id,
        "debtor_nickname": player["nickname"],
        "creditor_type": creditor_type,
        "creditor_player_id": creditor_player_id,
        "creditor_name": creditor_name,
        "message": message,
        "property_count": transferred_positions if creditor_player_id is not None else property_count,
        "mortgaged_property_count": (
            transferred_mortgaged_positions
            if creditor_player_id is not None
            else mortgaged_property_count
        ),
        "liquidated_upgrade_count": liquidated_upgrades,
        "liquidation_cash": liquidation_cash,
        "cash_collected": transferred_cash,
    }
    game["last_effects"] = [message]
    if liquidation_cash > 0:
        game["last_effects"].append(
            f"Sold {liquidated_upgrades} upgrades back to the bank for ${liquidation_cash} before bankruptcy transfer."
        )
    if creditor_player_id is not None and (transferred_cash > 0 or transferred_positions > 0):
        transfer_parts: list[str] = []
        if transferred_cash > 0:
            transfer_parts.append(f"${transferred_cash} cash")
        if transferred_positions > 0:
            transfer_parts.append(f"{transferred_positions} properties")
        game["last_effects"].append(
            f"{_get_player_name(room, creditor_player_id)} collected {' and '.join(transfer_parts)} from the bankruptcy."
        )
    if creditor_player_id is not None and transferred_mortgaged_positions > 0:
        property_word = "property" if transferred_mortgaged_positions == 1 else "properties"
        game["last_effects"].append(
            f"{_get_player_name(room, creditor_player_id)} received {transferred_mortgaged_positions} mortgaged {property_word}. They stay mortgaged until unmortgaged."
        )
    game["pending_purchase"] = None
    game["pending_trade"] = None
    game["pending_auction"] = None
    game["pending_bankruptcy"] = None
    game["turn"]["is_doubles"] = False

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

    _touch_room_with_event(
        room,
        EVENT_KIND_BANKRUPTCY,
        player_id=player_id,
        target_player_id=creditor_player_id,
    )


def _sync_pending_bankruptcy(room: dict, player_id: str) -> bool:
    game = room["game"]
    pending_bankruptcy = game.get("pending_bankruptcy")

    if pending_bankruptcy is None or pending_bankruptcy["player_id"] != player_id:
        return False

    creditor_type = pending_bankruptcy.get("creditor_type", BANKRUPTCY_CREDITOR_BANK)
    creditor_player_id = pending_bankruptcy.get("creditor_player_id")

    if creditor_type == BANKRUPTCY_CREDITOR_PLAYER and creditor_player_id is not None:
        amount_owed = pending_bankruptcy["amount_owed"]
        if game["cash"].get(player_id, 0) < amount_owed:
            game["last_effects"].append(
                f"Still owe ${amount_owed} to {_get_player_name(room, creditor_player_id)} to avoid bankruptcy."
            )
            return False

        game["cash"][player_id] -= amount_owed
        if creditor_player_id in game["cash"]:
            game["cash"][creditor_player_id] += amount_owed
            game["last_effects"].append(
                f"Paid ${amount_owed} to {_get_player_name(room, creditor_player_id)}."
            )
    elif game["cash"].get(player_id, 0) < 0:
        pending_bankruptcy["amount_owed"] = abs(game["cash"][player_id])
        game["last_effects"].append(
            f"Still owe ${pending_bankruptcy['amount_owed']} to avoid bankruptcy."
        )
        return False

    resume_player_id = pending_bankruptcy["resume_player_id"]
    game["pending_bankruptcy"] = None
    game["turn"]["current_player_id"] = resume_player_id
    game["turn"]["can_roll"] = True
    if resume_player_id != player_id:
        game["turn"]["is_doubles"] = False

    if resume_player_id == player_id:
        game["last_effects"].append("Debt recovered. Your turn continues.")
    else:
        game["last_effects"].append(
            f"Debt recovered. {_get_player_name(room, resume_player_id)} is next."
        )

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
    game["turns_in_jail"].pop(leaving_player_id, None)

    pending_purchase = game.get("pending_purchase")
    if pending_purchase and pending_purchase["player_id"] == leaving_player_id:
        game["pending_purchase"] = None

    pending_trade = game.get("pending_trade")
    if pending_trade and leaving_player_id in {
        pending_trade["proposer_id"],
        pending_trade["receiver_id"],
    }:
        game["pending_trade"] = None

    pending_auction = game.get("pending_auction")
    if pending_auction:
        passed_ids = set(pending_auction.get("passed_player_ids", []))
        is_critical = leaving_player_id in {
            pending_auction["initiator_player_id"],
            pending_auction["active_player_id"],
            pending_auction.get("highest_bidder_id"),
        }
        in_auction = leaving_player_id in pending_auction["eligible_player_ids"]
        already_passed = leaving_player_id in passed_ids

        if in_auction and already_passed and not is_critical:
            # Player already passed — just remove them, auction continues
            pending_auction["eligible_player_ids"] = [
                pid for pid in pending_auction["eligible_player_ids"]
                if pid != leaving_player_id
            ]
            pending_auction["passed_player_ids"] = [
                pid for pid in passed_ids
                if pid != leaving_player_id
            ]
            active_ids = _get_active_auction_player_ids(pending_auction)
            highest_bidder_id = pending_auction.get("highest_bidder_id")
            if not active_ids or (
                highest_bidder_id is not None
                and len(active_ids) == 1
                and active_ids[0] == highest_bidder_id
            ):
                _finalize_auction(room, pending_auction)
        elif is_critical or in_auction:
            game["pending_auction"] = None
            initiator_player_id = pending_auction["initiator_player_id"]

            if initiator_player_id in remaining_player_ids and not turn["can_roll"]:
                game["last_effects"] = ["Auction was cancelled because a player left the room."]
                _resume_turn_after_purchase(room, initiator_player_id)

    pending_bankruptcy = game.get("pending_bankruptcy")
    if pending_bankruptcy:
        if pending_bankruptcy["player_id"] == leaving_player_id:
            # The debtor left — cancel recovery, resume for whoever was next.
            game["pending_bankruptcy"] = None
            resume_id = pending_bankruptcy["resume_player_id"]
            if resume_id in remaining_player_ids:
                turn["current_player_id"] = resume_id
                turn["can_roll"] = True
        elif pending_bankruptcy["resume_player_id"] == leaving_player_id:
            # The player who was supposed to get the turn after recovery left —
            # redirect to the next player after the debtor in turn order.
            debtor_id = pending_bankruptcy["player_id"]
            all_ids = list(game["positions"].keys())
            next_remaining = remaining_player_ids[0] if remaining_player_ids else None
            if debtor_id in all_ids:
                debtor_index = all_ids.index(debtor_id)
                for i in range(1, len(all_ids)):
                    candidate = all_ids[(debtor_index + i) % len(all_ids)]
                    if candidate in remaining_player_ids:
                        next_remaining = candidate
                        break
            if next_remaining:
                pending_bankruptcy["resume_player_id"] = next_remaining

        if game.get("pending_bankruptcy") and pending_bankruptcy.get("creditor_player_id") == leaving_player_id:
            debtor_id = pending_bankruptcy["player_id"]
            game["cash"][debtor_id] -= pending_bankruptcy["amount_owed"]
            pending_bankruptcy["amount_owed"] = abs(min(game["cash"][debtor_id], 0))
            pending_bankruptcy["creditor_type"] = BANKRUPTCY_CREDITOR_BANK
            pending_bankruptcy["creditor_player_id"] = None


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
            "room_version": 1,
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
        previous_effects: tuple[str, ...] = ()
        if room.get("game") is not None:
            previous_effects = tuple(room["game"].get("last_effects", []))

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

        if (
            room.get("game") is not None
            and tuple(room["game"].get("last_effects", [])) != previous_effects
        ):
            _touch_room_with_event(room, EVENT_KIND_SYSTEM, player_id=player["player_id"])
        else:
            _touch_room(room)

    return {"left_room": True, "room_deleted": False}


def rejoin_room(room_code: str, player_token: str) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)
        player = _find_player_by_token(room, player_token)
        _touch_room(room, increment_version=False)

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

        if game["pending_auction"] is not None:
            raise HTTPException(status_code=400, detail="Resolve the pending auction before rolling.")

        if not turn["can_roll"]:
            raise HTTPException(status_code=400, detail="You already rolled this turn.")

        if game["pending_trade"] is not None:
            raise HTTPException(status_code=400, detail="Resolve the pending trade before rolling.")

        if game.get("pending_bankruptcy") is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending bankruptcy before rolling.",
            )

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
                game["turns_in_jail"][player_id] = 0
                (
                    landed_position,
                    sent_to_jail,
                    pending_purchase_created,
                    effects,
                    bankruptcy_context,
                ) = _resolve_landing(
                    room,
                    player_id,
                    game["positions"][player_id],
                    total,
                )
                effects.insert(0, "Rolled doubles to leave Jail.")
                _set_last_resolution(game, player_id, landed_position, effects)

                if not sent_to_jail and not pending_purchase_created:
                    pending_purchase_created, bankruptcy_context = _resolve_buyable_cell(
                        room,
                        player_id,
                        landed_position,
                        total,
                        game["last_effects"],
                    )

                if _start_bankruptcy_recovery_from_context(
                    room, player, next_player_id, bankruptcy_context
                ):
                    return _build_action_response(player, room)

                auction_started = False
                if not sent_to_jail and not pending_purchase_created:
                    auction_started = _start_auction(
                        room,
                        player_id,
                        game["positions"][player_id],
                        game["last_effects"],
                    )

                if pending_purchase_created:
                    # Jail escape never grants an extra turn - override so
                    # _resume_turn_after_purchase sends to next player.
                    turn["is_doubles"] = False
                    turn["current_player_id"] = player_id
                    turn["can_roll"] = False
                    turn["turn_number"] += 1
                    _touch_room_with_event(
                        room,
                        EVENT_KIND_JAIL,
                        player_id=player_id,
                        cell_index=landed_position,
                    )
                    return _build_action_response(player, room)

                if auction_started:
                    turn["is_doubles"] = False
                    turn["current_player_id"] = player_id
                    turn["can_roll"] = False
                    turn["turn_number"] += 1
                    _touch_room_with_event(
                        room,
                        EVENT_KIND_JAIL,
                        player_id=player_id,
                        cell_index=landed_position,
                    )
                    return _build_action_response(player, room)
                turn["current_player_id"] = next_player_id
            else:
                game["turns_in_jail"][player_id] += 1
                turns_used = game["turns_in_jail"][player_id]

                if turns_used >= MAX_JAIL_TURNS:
                    # Third failed attempt — must pay fine and move with this roll
                    # No cash check here — if player can't afford the fine they go bankrupt.
                    # This matches standard Monopoly rules: on the 3rd failed roll the fine
                    # is mandatory and the player must move regardless of cash.
                    game["cash"][player_id] -= JAIL_FINE_AMOUNT
                    game["in_jail"][player_id] = False
                    game["turns_in_jail"][player_id] = 0
                    game["last_drawn_card"] = None
                    (
                        landed_position,
                        sent_to_jail,
                        pending_purchase_created,
                        effects,
                        bankruptcy_context,
                    ) = _resolve_landing(
                        room,
                        player_id,
                        game["positions"][player_id],
                        total,
                    )
                    effects.insert(0, f"Paid ${JAIL_FINE_AMOUNT} fine after {MAX_JAIL_TURNS} turns in Jail and moved with the roll.")
                    _set_last_resolution(game, player_id, landed_position, effects)

                    if not sent_to_jail and not pending_purchase_created:
                        pending_purchase_created, bankruptcy_context = _resolve_buyable_cell(
                            room,
                            player_id,
                            landed_position,
                            total,
                            game["last_effects"],
                        )

                    if _start_bankruptcy_recovery_from_context(
                        room, player, next_player_id, bankruptcy_context
                    ):
                        return _build_action_response(player, room)

                    auction_started = False
                    if not sent_to_jail and not pending_purchase_created:
                        auction_started = _start_auction(
                            room,
                            player_id,
                            game["positions"][player_id],
                            game["last_effects"],
                        )

                    if pending_purchase_created:
                        turn["is_doubles"] = False
                        turn["current_player_id"] = player_id
                        turn["can_roll"] = False
                        turn["turn_number"] += 1
                        _touch_room_with_event(
                            room,
                            EVENT_KIND_JAIL,
                            player_id=player_id,
                            cell_index=landed_position,
                        )
                        return _build_action_response(player, room)

                    if auction_started:
                        turn["is_doubles"] = False
                        turn["current_player_id"] = player_id
                        turn["can_roll"] = False
                        turn["turn_number"] += 1
                        _touch_room_with_event(
                            room,
                            EVENT_KIND_JAIL,
                            player_id=player_id,
                            cell_index=landed_position,
                        )
                        return _build_action_response(player, room)
                    turn["current_player_id"] = next_player_id
                else:
                    _set_last_resolution(
                        game,
                        player_id,
                        game["positions"][player_id],
                        [f"Stayed in Jail. Turn {turns_used}/3 without doubles."],
                    )
                    turn["current_player_id"] = next_player_id

            turn["turn_number"] += 1
            turn["can_roll"] = True
            _touch_room_with_event(
                room,
                EVENT_KIND_JAIL,
                player_id=player_id,
                cell_index=game["last_landed_position"],
            )
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
            _touch_room_with_event(
                room,
                EVENT_KIND_JAIL,
                player_id=player_id,
                cell_index=JAIL_POSITION,
            )
            return _build_action_response(player, room)

        (
            landed_position,
            sent_to_jail,
            pending_purchase_created,
            effects,
            bankruptcy_context,
        ) = _resolve_landing(
            room,
            player_id,
            game["positions"][player_id],
            total,
        )
        _set_last_resolution(game, player_id, landed_position, effects)

        if not sent_to_jail and not pending_purchase_created:
            pending_purchase_created, bankruptcy_context = _resolve_buyable_cell(
                room,
                player_id,
                landed_position,
                total,
                game["last_effects"],
            )

        resume_player_id = player_id if is_doubles and not sent_to_jail else next_player_id
        if _start_bankruptcy_recovery_from_context(
            room, player, resume_player_id, bankruptcy_context
        ):
            return _build_action_response(player, room)

        auction_started = False
        if not sent_to_jail and not pending_purchase_created:
            auction_started = _start_auction(
                room,
                player_id,
                game["positions"][player_id],
                game["last_effects"],
            )

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
            _touch_room_with_event(
                room,
                EVENT_KIND_ROLL,
                player_id=player_id,
                cell_index=landed_position,
            )
            return _build_action_response(player, room)
        elif auction_started:
            if is_doubles:
                game["last_effects"].append("Resolve the auction first to use your extra turn.")
            turn["current_player_id"] = player_id
            turn["can_roll"] = False
            turn["turn_number"] += 1
            _touch_room_with_event(
                room,
                EVENT_KIND_ROLL,
                player_id=player_id,
                cell_index=landed_position,
            )
            return _build_action_response(player, room)
        elif is_doubles:
            game["last_effects"].append("Rolled doubles, so you take another turn.")
        else:
            turn["current_player_id"] = next_player_id

        turn["turn_number"] += 1
        turn["can_roll"] = True
        _touch_room_with_event(
            room,
            EVENT_KIND_ROLL,
            player_id=player_id,
            cell_index=landed_position,
        )

    return _build_action_response(player, room)


def pay_jail_fine(room_code: str, player_token: str) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)

        if room["status"] != ROOM_STATUS_IN_GAME or room.get("game") is None:
            raise HTTPException(status_code=400, detail="Game has not started yet.")

        player = _find_player_by_token(room, player_token)
        game = room["game"]
        turn = game["turn"]
        player_id = player["player_id"]
        pending_bankruptcy = game.get("pending_bankruptcy")
        is_bankruptcy_recovery = (
            pending_bankruptcy is not None and pending_bankruptcy["player_id"] == player_id
        )

        if turn["current_player_id"] != player_id:
            raise HTTPException(status_code=403, detail="It is not your turn.")

        if game.get("pending_bankruptcy") is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending bankruptcy before paying the jail fine.",
            )

        if not turn["can_roll"]:
            raise HTTPException(
                status_code=400,
                detail="You can only pay the jail fine before rolling this turn.",
            )

        if game["pending_purchase"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending purchase before paying the jail fine.",
            )

        if game["pending_trade"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending trade before paying the jail fine.",
            )

        if game["pending_auction"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending auction before paying the jail fine.",
            )

        if not game["in_jail"].get(player_id, False):
            raise HTTPException(status_code=400, detail="You are not in jail.")

        if game["cash"][player_id] < JAIL_FINE_AMOUNT:
            raise HTTPException(
                status_code=400,
                detail="You do not have enough cash to pay the jail fine.",
            )

        game["cash"][player_id] -= JAIL_FINE_AMOUNT
        game["in_jail"][player_id] = False
        game["turns_in_jail"][player_id] = 0
        game["last_drawn_card"] = None
        game["last_effects"] = [
            f"Paid ${JAIL_FINE_AMOUNT} to leave Jail before rolling.",
        ]
        _touch_room_with_event(
            room,
            EVENT_KIND_JAIL,
            player_id=player_id,
            cell_index=game["positions"][player_id],
        )

    return _build_action_response(player, room)


def _require_pending_bankruptcy(room: dict, player_token: str) -> tuple[dict, dict, dict]:
    if room["status"] != ROOM_STATUS_IN_GAME or room.get("game") is None:
        raise HTTPException(status_code=400, detail="Game has not started yet.")

    player = _find_player_by_token(room, player_token)
    game = room["game"]
    pending_bankruptcy = game.get("pending_bankruptcy")

    if pending_bankruptcy is None:
        raise HTTPException(status_code=400, detail="There is no bankruptcy recovery in progress.")

    if pending_bankruptcy["player_id"] != player["player_id"]:
        raise HTTPException(status_code=403, detail="You are not the player in bankruptcy recovery.")

    return player, game, pending_bankruptcy


def declare_bankruptcy(room_code: str, player_token: str) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)
        player, _, pending_bankruptcy = _require_pending_bankruptcy(room, player_token)
        _eliminate_bankrupt_player(
            room,
            player,
            f"{player['nickname']} declared bankruptcy and was eliminated.",
            pending_bankruptcy=pending_bankruptcy,
        )

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


def _require_pending_auction(room: dict, player_token: str) -> tuple[dict, dict, dict]:
    if room["status"] != ROOM_STATUS_IN_GAME or room.get("game") is None:
        raise HTTPException(status_code=400, detail="Game has not started yet.")

    player = _find_player_by_token(room, player_token)
    game = room["game"]
    pending_auction = game.get("pending_auction")

    if pending_auction is None:
        raise HTTPException(status_code=400, detail="There is no auction waiting to be resolved.")

    if player["player_id"] not in pending_auction["eligible_player_ids"]:
        raise HTTPException(status_code=403, detail="You are not part of this auction.")

    if player["player_id"] in pending_auction.get("passed_player_ids", []):
        raise HTTPException(status_code=403, detail="You have already passed in this auction.")

    return player, game, pending_auction


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

        if (
            _owns_full_color_group(game, player_id, position)
            and not _color_group_has_mortgaged_property(game, position)
        ):
            game["last_effects"].append(
                f"Completed the {cell['color_group'].replace('_', ' ')} set. Upgrades unlocked."
            )

        _resume_turn_after_purchase(room, player_id)
        _touch_room_with_event(
            room,
            EVENT_KIND_PROPERTY,
            player_id=player_id,
            cell_index=position,
        )

    return _build_action_response(player, room)


def skip_property_purchase(room_code: str, player_token: str) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)
        player, game, pending_purchase = _require_pending_purchase(room, player_token)
        player_id = player["player_id"]
        position = pending_purchase["position"]
        cell = _get_board_cell(position)

        game["pending_purchase"] = None
        game["last_effects"].append(f"Passed on buying {cell['name']}.")

        if _start_auction(room, player_id, position, game["last_effects"]):
            _touch_room_with_event(
                room,
                EVENT_KIND_AUCTION,
                player_id=player_id,
                cell_index=position,
            )
            return _build_action_response(player, room)

        _resume_turn_after_purchase(room, player_id)
        _touch_room_with_event(
            room,
            EVENT_KIND_PROPERTY,
            player_id=player_id,
            cell_index=position,
        )

    return _build_action_response(player, room)


def bid_in_auction(room_code: str, player_token: str, amount: int) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)
        player, game, pending_auction = _require_pending_auction(room, player_token)
        player_id = player["player_id"]

        if pending_auction["active_player_id"] != player_id:
            raise HTTPException(status_code=403, detail="It is not your turn to bid.")

        minimum_bid = pending_auction["current_bid"] + 1

        if amount < minimum_bid:
            raise HTTPException(status_code=400, detail=f"Bid must be at least ${minimum_bid}.")

        if game["cash"].get(player_id, 0) < amount:
            raise HTTPException(
                status_code=400,
                detail="You do not have enough cash for that bid.",
            )

        cell = _get_board_cell(pending_auction["position"])
        pending_auction["current_bid"] = amount
        pending_auction["highest_bidder_id"] = player_id
        game["last_effects"] = [f"{player['nickname']} bid ${amount} for {cell['name']}."]

        active_player_ids = _get_active_auction_player_ids(pending_auction)
        if len(active_player_ids) == 1 and active_player_ids[0] == player_id:
            _finalize_auction(room, pending_auction)
        else:
            next_player_id = _get_next_auction_player_id(pending_auction, player_id)

            if next_player_id is None:
                _finalize_auction(room, pending_auction)
            else:
                pending_auction["active_player_id"] = next_player_id
                game["last_effects"].append(
                    f"{_get_player_name(room, next_player_id)} is next in the auction."
                )

        if game.get("pending_auction") is None:
            _touch_room_with_event(
                room,
                EVENT_KIND_AUCTION,
                player_id=game["property_owners"].get(cell["index"]),
                cell_index=cell["index"],
            )
        else:
            _touch_room(room)

    return _build_action_response(player, room)


def pass_auction(room_code: str, player_token: str) -> dict:
    normalized_room_code = _normalize_room_code(room_code)

    with _rooms_lock:
        room = _find_room_or_raise(normalized_room_code)
        player, game, pending_auction = _require_pending_auction(room, player_token)
        player_id = player["player_id"]

        if pending_auction["active_player_id"] != player_id:
            raise HTTPException(status_code=403, detail="It is not your turn to act in the auction.")

        cell = _get_board_cell(pending_auction["position"])
        pending_auction["passed_player_ids"].append(player_id)
        game["last_effects"] = [f"{player['nickname']} passed in the auction for {cell['name']}."]

        active_player_ids = _get_active_auction_player_ids(pending_auction)
        highest_bidder_id = pending_auction.get("highest_bidder_id")

        if not active_player_ids or (
            highest_bidder_id is not None
            and len(active_player_ids) == 1
            and active_player_ids[0] == highest_bidder_id
        ):
            _finalize_auction(room, pending_auction)
        else:
            next_player_id = _get_next_auction_player_id(pending_auction, player_id)

            if next_player_id is None:
                _finalize_auction(room, pending_auction)
            else:
                pending_auction["active_player_id"] = next_player_id
                game["last_effects"].append(
                    f"{_get_player_name(room, next_player_id)} is next in the auction."
                )

        if game.get("pending_auction") is None:
            _touch_room_with_event(
                room,
                EVENT_KIND_AUCTION,
                player_id=game["property_owners"].get(cell["index"]),
                cell_index=cell["index"],
            )
        else:
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

        if game["pending_auction"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending auction before upgrading properties.",
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

        group_positions = PROPERTY_GROUPS.get(cell["color_group"], [])
        other_positions = [pos for pos in group_positions if pos != position]
        if other_positions:
            min_other_level = min(_get_property_level(game, pos) for pos in other_positions)
            if current_level > min_other_level:
                raise HTTPException(
                    status_code=400,
                    detail="Build evenly: upgrade another property in this group first.",
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
        _touch_room_with_event(
            room,
            EVENT_KIND_PROPERTY,
            player_id=player_id,
            cell_index=position,
        )

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
        pending_bankruptcy = game.get("pending_bankruptcy")
        is_bankruptcy_recovery = (
            pending_bankruptcy is not None and pending_bankruptcy["player_id"] == player_id
        )

        if turn["current_player_id"] != player_id:
            raise HTTPException(status_code=403, detail="It is not your turn.")

        if not turn["can_roll"] and not is_bankruptcy_recovery:
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

        if game["pending_auction"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending auction before selling upgrades.",
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

        group_positions = PROPERTY_GROUPS.get(cell.get("color_group", ""), [])
        other_positions = [pos for pos in group_positions if pos != position]
        if other_positions:
            max_other_level = max(_get_property_level(game, pos) for pos in other_positions)
            if current_level < max_other_level:
                raise HTTPException(
                    status_code=400,
                    detail="Sell evenly: sell an upgrade from a higher-level property in this group first.",
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
        _sync_pending_bankruptcy(room, player_id)
        _touch_room_with_event(
            room,
            EVENT_KIND_PROPERTY,
            player_id=player_id,
            cell_index=position,
        )

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
        pending_bankruptcy = game.get("pending_bankruptcy")
        is_bankruptcy_recovery = (
            pending_bankruptcy is not None and pending_bankruptcy["player_id"] == player_id
        )

        if turn["current_player_id"] != player_id:
            raise HTTPException(status_code=403, detail="It is not your turn.")

        if not turn["can_roll"] and not is_bankruptcy_recovery:
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

        if game["pending_auction"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending auction before managing mortgages.",
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
        _sync_pending_bankruptcy(room, player_id)
        _touch_room_with_event(
            room,
            EVENT_KIND_PROPERTY,
            player_id=player_id,
            cell_index=position,
        )

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

        if game.get("pending_bankruptcy") is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending bankruptcy before unmortgaging properties.",
            )

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

        if game["pending_auction"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending auction before managing mortgages.",
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
        _touch_room_with_event(
            room,
            EVENT_KIND_PROPERTY,
            player_id=player_id,
            cell_index=position,
        )

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
        pending_bankruptcy = game.get("pending_bankruptcy")
        is_bankruptcy_recovery = (
            pending_bankruptcy is not None and pending_bankruptcy["player_id"] == player_id
        )

        if target_player["player_id"] == player_id:
            raise HTTPException(status_code=400, detail="You cannot offer a trade to yourself.")

        if turn["current_player_id"] != player_id:
            raise HTTPException(status_code=403, detail="It is not your turn.")

        if not turn["can_roll"] and not is_bankruptcy_recovery:
            raise HTTPException(
                status_code=400,
                detail="You can only propose trades before rolling this turn or while recovering from bankruptcy.",
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

        if game["pending_auction"] is not None:
            raise HTTPException(
                status_code=400,
                detail="Resolve the pending auction before proposing a trade.",
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
        _touch_room_with_event(
            room,
            EVENT_KIND_TRADE,
            player_id=player_id,
            target_player_id=target_player_id,
            cell_index=position,
        )

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

        if (
            cell["cell_type"] == "property"
            and _owns_full_color_group(game, receiver_id, position)
            and not _color_group_has_mortgaged_property(game, position)
        ):
            game["last_effects"].append(
                f"{receiver['nickname']} completed the {cell['color_group'].replace('_', ' ')} set."
            )

        _sync_pending_bankruptcy(room, proposer_id)
        _touch_room_with_event(
            room,
            EVENT_KIND_TRADE,
            player_id=receiver_id,
            target_player_id=proposer_id,
            cell_index=position,
        )

    return _build_action_response(player, room)

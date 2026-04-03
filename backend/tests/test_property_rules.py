import unittest
from unittest.mock import patch

from fastapi import HTTPException

import room_store


class PropertyRuleTests(unittest.TestCase):
    def setUp(self):
        room_store.rooms.clear()

    def _create_started_room(self, nicknames=("Host", "Guest"), starting_player_index=0):
        responses = [room_store.create_room(nicknames[0])]
        room_code = responses[0]["room"]["room_code"]

        for nickname in nicknames[1:]:
            responses.append(room_store.join_room(room_code, nickname))

        for response in responses:
            room_store.set_player_ready(room_code, response["player_token"], True)

        starting_player_id = responses[starting_player_index]["player_id"]
        with patch("room_store.random.choice", return_value=starting_player_id):
            room_store.start_game(room_code, responses[0]["player_token"])

        room = room_store.rooms[room_code]
        return room_code, room, responses

    def _give_brown_set_to_host(self, room, host_player_id):
        game = room["game"]
        for position in (1, 3):
            game["property_owners"][position] = host_player_id
            game["property_mortgaged"][position] = False

    def _give_light_blue_set_to_host(self, room, host_player_id):
        game = room["game"]
        for position in (6, 8, 9):
            game["property_owners"][position] = host_player_id
            game["property_mortgaged"][position] = False

    def test_full_color_set_doubles_base_rent_without_upgrades(self):
        _, room, responses = self._create_started_room()
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        self._give_brown_set_to_host(room, host_player_id)
        effects: list[str] = []

        _, _ = room_store._resolve_buyable_cell(room, guest_player_id, 1, 7, effects)

        self.assertEqual(game["cash"][guest_player_id], room_store.STARTING_CASH - 20)
        self.assertEqual(game["cash"][host_player_id], room_store.STARTING_CASH + 20)
        self.assertIn("Paid $20 rent to Host for Copper Hollow.", effects)

    def test_even_build_requires_upgrading_lower_property_first(self):
        room_code, room, responses = self._create_started_room(nicknames=("Host", "Guest"), starting_player_index=0)
        host_response = responses[0]
        host_player_id = host_response["player_id"]
        game = room["game"]

        self._give_brown_set_to_host(room, host_player_id)
        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = True

        room_store.upgrade_property(room_code, host_response["player_token"], 1)

        with self.assertRaises(HTTPException) as error:
            room_store.upgrade_property(room_code, host_response["player_token"], 1)

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(
            error.exception.detail,
            "Build evenly: upgrade another property in this group first.",
        )

    def test_even_sell_requires_selling_highest_property_first(self):
        room_code, room, responses = self._create_started_room(nicknames=("Host", "Guest"), starting_player_index=0)
        host_response = responses[0]
        host_player_id = host_response["player_id"]
        game = room["game"]

        self._give_brown_set_to_host(room, host_player_id)
        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = True
        game["property_levels"][1] = 1
        game["property_levels"][3] = 2

        with self.assertRaises(HTTPException) as error:
            room_store.sell_upgrade(room_code, host_response["player_token"], 1)

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(
            error.exception.detail,
            "Sell evenly: sell an upgrade from a higher-level property in this group first.",
        )

    def test_selling_highest_property_is_allowed_under_even_sell_rule(self):
        room_code, room, responses = self._create_started_room(nicknames=("Host", "Guest"), starting_player_index=0)
        host_response = responses[0]
        host_player_id = host_response["player_id"]
        game = room["game"]

        self._give_brown_set_to_host(room, host_player_id)
        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = True
        game["property_levels"][1] = 1
        game["property_levels"][3] = 2
        starting_cash = game["cash"][host_player_id]

        response = room_store.sell_upgrade(room_code, host_response["player_token"], 3)

        self.assertEqual(response["room"]["game"]["property_levels"][3], 1)
        self.assertEqual(
            response["room"]["game"]["cash"][host_player_id],
            starting_cash + room_store._get_upgrade_sell_value(room_store.BOARD_CELLS[3]),
        )


    def test_even_build_three_property_group_middle_state(self):
        # Group [1, 1, 0]: must upgrade position 9 (level 0) before either level-1 property.
        room_code, room, responses = self._create_started_room()
        host_response = responses[0]
        host_player_id = host_response["player_id"]
        game = room["game"]

        self._give_light_blue_set_to_host(room, host_player_id)
        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = True
        game["property_levels"][6] = 1
        game["property_levels"][8] = 1

        # Upgrading a level-0 property (position 9) must succeed.
        response = room_store.upgrade_property(room_code, host_response["player_token"], 9)
        self.assertEqual(response["room"]["game"]["property_levels"].get(9, 0), 1)

        # After upgrade, levels are [1, 1, 1] — reset to [1, 1, 0] and try blocked direction.
        game["property_levels"][9] = 0
        game["turn"]["can_roll"] = True

        # Upgrading a level-1 property while another is at level 0 must be blocked.
        with self.assertRaises(HTTPException) as error:
            room_store.upgrade_property(room_code, host_response["player_token"], 6)

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(
            error.exception.detail,
            "Build evenly: upgrade another property in this group first.",
        )

    def test_upgrade_blocked_when_any_property_in_group_is_mortgaged(self):
        room_code, room, responses = self._create_started_room()
        host_response = responses[0]
        host_player_id = host_response["player_id"]
        game = room["game"]

        self._give_brown_set_to_host(room, host_player_id)
        game["property_mortgaged"][3] = True
        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = True

        with self.assertRaises(HTTPException) as error:
            room_store.upgrade_property(room_code, host_response["player_token"], 1)

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(
            error.exception.detail,
            "You cannot upgrade a color group while any property in it is mortgaged.",
        )

    def test_full_color_set_doubles_rent_via_roll_dice(self):
        # Same rule as test_full_color_set_doubles_base_rent_without_upgrades
        # but tested through the public roll_dice action instead of an internal helper.
        # Guest starts at position 0, rolls [1, 2] (total 3) → lands on position 3
        # (Harbor Avenue, brown, price 60). base_rent = max(10, 60//10) = 10, doubled = 20.
        room_code, room, responses = self._create_started_room(starting_player_index=1)
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        self._give_brown_set_to_host(room, host_player_id)
        game["positions"][guest_player_id] = 0

        with patch("room_store.random.randint", side_effect=[1, 2]):
            room_store.roll_dice(room_code, guest_response["player_token"])

        self.assertEqual(game["cash"][guest_player_id], room_store.STARTING_CASH - 20)
        self.assertEqual(game["cash"][host_player_id], room_store.STARTING_CASH + 20)

    def test_even_sell_three_property_group_middle_state(self):
        # light_blue group (positions 6, 8, 9). State [2, 1, 1]:
        # can only sell from position 6 (highest), positions 8 and 9 are blocked.
        room_code, room, responses = self._create_started_room()
        host_response = responses[0]
        host_player_id = host_response["player_id"]
        game = room["game"]

        self._give_light_blue_set_to_host(room, host_player_id)
        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = True
        game["property_levels"][6] = 2
        game["property_levels"][8] = 1
        game["property_levels"][9] = 1

        # Selling from a lower-level property must be blocked.
        with self.assertRaises(HTTPException) as error:
            room_store.sell_upgrade(room_code, host_response["player_token"], 8)

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(
            error.exception.detail,
            "Sell evenly: sell an upgrade from a higher-level property in this group first.",
        )

        # Selling from the highest-level property must succeed.
        game["turn"]["can_roll"] = True
        response = room_store.sell_upgrade(room_code, host_response["player_token"], 6)
        self.assertEqual(response["room"]["game"]["property_levels"].get(6), 1)

    def test_mortgage_blocked_when_group_has_upgrades(self):
        # Can't mortgage a property while any property in the group has upgrades.
        room_code, room, responses = self._create_started_room()
        host_response = responses[0]
        host_player_id = host_response["player_id"]
        game = room["game"]

        self._give_brown_set_to_host(room, host_player_id)
        game["property_levels"][1] = 1
        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = True

        with self.assertRaises(HTTPException) as error:
            room_store.mortgage_property(room_code, host_response["player_token"], 3)

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(
            error.exception.detail,
            "Sell all upgrades in this color group before mortgaging any property in it.",
        )


    def test_full_set_rent_not_doubled_when_sibling_is_mortgaged(self):
        # Own both brown properties but position 3 is mortgaged.
        # Landing on position 1 (not mortgaged) should give base rent, not doubled.
        _, room, responses = self._create_started_room()
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        self._give_brown_set_to_host(room, host_player_id)
        game["property_mortgaged"][3] = True

        effects: list[str] = []
        _, _ = room_store._resolve_buyable_cell(room, guest_player_id, 1, 7, effects)

        base_rent = max(10, 60 // 10)  # = 10, not doubled
        self.assertEqual(game["cash"][guest_player_id], room_store.STARTING_CASH - base_rent)
        self.assertEqual(game["cash"][host_player_id], room_store.STARTING_CASH + base_rent)

    def test_upgrade_blocked_by_mortgage_in_three_property_group(self):
        # light_blue has 3 properties (6, 8, 9). Mortgaging one blocks upgrades on all.
        room_code, room, responses = self._create_started_room()
        host_response = responses[0]
        host_player_id = host_response["player_id"]
        game = room["game"]

        self._give_light_blue_set_to_host(room, host_player_id)
        game["property_mortgaged"][9] = True
        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = True

        with self.assertRaises(HTTPException) as error:
            room_store.upgrade_property(room_code, host_response["player_token"], 6)

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(
            error.exception.detail,
            "You cannot upgrade a color group while any property in it is mortgaged.",
        )

    def test_unmortgage_then_upgrade_via_public_actions(self):
        # Full flow through public actions: mortgage blocks upgrade,
        # unmortgage unblocks it, upgrade then succeeds.
        room_code, room, responses = self._create_started_room()
        host_response = responses[0]
        host_player_id = host_response["player_id"]
        game = room["game"]

        self._give_brown_set_to_host(room, host_player_id)
        game["property_mortgaged"][3] = True
        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = True

        # Upgrade must be blocked while mortgaged.
        with self.assertRaises(HTTPException):
            room_store.upgrade_property(room_code, host_response["player_token"], 1)

        # Unmortgage position 3.
        game["turn"]["can_roll"] = True
        room_store.unmortgage_property(room_code, host_response["player_token"], 3)

        # Upgrade must now succeed.
        game["turn"]["can_roll"] = True
        response = room_store.upgrade_property(room_code, host_response["player_token"], 1)
        self.assertEqual(response["room"]["game"]["property_levels"].get(1, 0), 1)


    def test_full_set_rent_not_doubled_when_sibling_mortgaged_three_property_group(self):
        # light_blue (6, 8, 9). Own all three, position 9 is mortgaged.
        # Guest lands on 6 — rent must NOT be doubled.
        _, room, responses = self._create_started_room()
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        self._give_light_blue_set_to_host(room, host_player_id)
        game["property_mortgaged"][9] = True

        effects: list[str] = []
        _, _ = room_store._resolve_buyable_cell(room, guest_player_id, 6, 7, effects)

        base_rent = max(10, 100 // 10)  # = 10, not doubled
        self.assertEqual(game["cash"][guest_player_id], room_store.STARTING_CASH - base_rent)
        self.assertEqual(game["cash"][host_player_id], room_store.STARTING_CASH + base_rent)

    def test_trade_completed_set_message_suppressed_when_mortgaged(self):
        # After trade, receiver owns full brown set but one property is mortgaged.
        # "completed the set" message must NOT appear — doubled rent doesn't apply.
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        # Host owns position 1 (Copper Hollow), guest owns position 3 (Harbor Avenue, mortgaged).
        game["property_owners"][1] = host_player_id
        game["property_mortgaged"][1] = False
        game["property_owners"][3] = guest_player_id
        game["property_mortgaged"][3] = True

        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = True

        # Host trades position 1 to guest for $0.
        room_store.propose_trade(room_code, host_response["player_token"], guest_player_id, 1, 0)
        response = room_store.respond_to_trade(room_code, guest_response["player_token"], True)

        last_effects = response["room"]["game"]["last_effects"]
        self.assertEqual(game["property_owners"][1], guest_player_id)
        self.assertFalse(
            any("completed" in effect for effect in last_effects),
            f"Expected no 'completed set' message but got: {last_effects}",
        )

    def test_trade_completed_set_message_shown_when_no_mortgage(self):
        # Same trade but neither property is mortgaged — message must appear.
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        game["property_owners"][1] = host_player_id
        game["property_mortgaged"][1] = False
        game["property_owners"][3] = guest_player_id
        game["property_mortgaged"][3] = False

        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = True

        room_store.propose_trade(room_code, host_response["player_token"], guest_player_id, 1, 0)
        response = room_store.respond_to_trade(room_code, guest_response["player_token"], True)

        last_effects = response["room"]["game"]["last_effects"]
        self.assertTrue(
            any("completed" in effect for effect in last_effects),
            f"Expected 'completed set' message but got: {last_effects}",
        )


    def test_buy_property_completed_set_message_suppressed_when_sibling_mortgaged(self):
        # Host owns position 3 (mortgaged). Guest buys position 1 via pending_purchase.
        # "Upgrades unlocked" must NOT appear — sibling is mortgaged.
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        game["property_owners"][3] = guest_player_id
        game["property_mortgaged"][3] = True
        game["turn"]["current_player_id"] = guest_player_id
        game["turn"]["can_roll"] = False
        game["pending_purchase"] = {
            "player_id": guest_player_id,
            "position": 1,
            "price": 60,
            "cell_name": "Copper Hollow",
            "cell_type": "property",
        }

        response = room_store.buy_property(room_code, guest_response["player_token"])
        last_effects = response["room"]["game"]["last_effects"]

        self.assertEqual(game["property_owners"][1], guest_player_id)
        self.assertFalse(any("Upgrades unlocked" in e for e in last_effects))

    def test_auction_win_completed_set_message_suppressed_when_sibling_mortgaged(self):
        # Guest owns position 3 (mortgaged). Auction for position 1, guest wins.
        # "Upgrades unlocked" must NOT appear.
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        game["property_owners"][3] = guest_player_id
        game["property_mortgaged"][3] = True

        # Set up auction for position 1, guest is the only eligible bidder with a bid.
        game["turn"]["current_player_id"] = host_response["player_id"]
        game["turn"]["can_roll"] = False
        game["pending_auction"] = {
            "initiator_player_id": host_response["player_id"],
            "active_player_id": guest_player_id,
            "highest_bidder_id": None,
            "position": 1,
            "cell_name": "Copper Hollow",
            "cell_type": "property",
            "price": 60,
            "current_bid": 0,
            "eligible_player_ids": [guest_player_id],
            "passed_player_ids": [],
        }

        response = room_store.bid_in_auction(room_code, guest_response["player_token"], 50)
        last_effects = response["room"]["game"]["last_effects"]

        self.assertEqual(game["property_owners"][1], guest_player_id)
        self.assertFalse(any("Upgrades unlocked" in e for e in last_effects))

    def test_trade_completed_set_message_suppressed_three_property_group(self):
        # light_blue (6, 8, 9). Guest owns 8 and 9, position 9 is mortgaged.
        # Host trades position 6 to guest — "completed set" must NOT appear.
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        game["property_owners"][6] = host_player_id
        game["property_mortgaged"][6] = False
        game["property_owners"][8] = guest_player_id
        game["property_mortgaged"][8] = False
        game["property_owners"][9] = guest_player_id
        game["property_mortgaged"][9] = True

        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = True

        room_store.propose_trade(room_code, host_response["player_token"], guest_player_id, 6, 0)
        response = room_store.respond_to_trade(room_code, guest_response["player_token"], True)

        last_effects = response["room"]["game"]["last_effects"]
        self.assertEqual(game["property_owners"][6], guest_player_id)
        self.assertFalse(any("completed" in e for e in last_effects))


if __name__ == "__main__":
    unittest.main()

import unittest
from unittest.mock import patch

import room_store


class AuctionFlowTests(unittest.TestCase):
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

    def _set_pending_purchase(self, room, player_response, position=1):
        cell = room_store.BOARD_CELLS[position]
        game = room["game"]
        game["turn"]["current_player_id"] = player_response["player_id"]
        game["turn"]["can_roll"] = False
        game["turn"]["is_doubles"] = False
        game["pending_purchase"] = {
            "player_id": player_response["player_id"],
            "position": position,
            "price": cell["price"],
            "cell_name": cell["name"],
            "cell_type": cell["cell_type"],
        }

    def test_skip_purchase_starts_auction_for_next_player(self):
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses

        self._set_pending_purchase(room, host_response, position=1)
        response = room_store.skip_property_purchase(room_code, host_response["player_token"])

        auction = response["room"]["game"]["pending_auction"]

        self.assertIsNotNone(auction)
        self.assertEqual(auction["position"], 1)
        self.assertEqual(
            auction["eligible_player_ids"],
            [guest_response["player_id"], host_response["player_id"]],
        )
        self.assertEqual(auction["active_player_id"], guest_response["player_id"])
        self.assertEqual(auction["current_bid"], 0)
        self.assertIsNone(auction["highest_bidder_id"])
        self.assertIn("Auction started for Copper Hollow.", response["room"]["game"]["last_effects"])

    def test_highest_bidder_wins_after_other_player_passes(self):
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses

        self._set_pending_purchase(room, host_response, position=1)
        room_store.skip_property_purchase(room_code, host_response["player_token"])

        bid_response = room_store.bid_in_auction(room_code, guest_response["player_token"], amount=50)
        pending_auction = bid_response["room"]["game"]["pending_auction"]

        self.assertEqual(pending_auction["current_bid"], 50)
        self.assertEqual(pending_auction["highest_bidder_id"], guest_response["player_id"])
        self.assertEqual(pending_auction["active_player_id"], host_response["player_id"])

        final_response = room_store.pass_auction(room_code, host_response["player_token"])
        game = final_response["room"]["game"]

        self.assertIsNone(game["pending_auction"])
        self.assertEqual(game["property_owners"][1], guest_response["player_id"])
        self.assertEqual(game["property_mortgaged"][1], False)
        self.assertEqual(game["cash"][guest_response["player_id"]], room_store.STARTING_CASH - 50)
        self.assertEqual(game["turn"]["current_player_id"], guest_response["player_id"])
        self.assertTrue(game["turn"]["can_roll"])
        self.assertEqual(game["recent_events"][0]["kind"], room_store.EVENT_KIND_AUCTION)
        self.assertEqual(game["recent_events"][0]["player_id"], guest_response["player_id"])
        self.assertIsNone(game["recent_events"][0]["target_player_id"])
        self.assertEqual(game["recent_events"][0]["cell_index"], 1)
        self.assertIn(
            "won the auction for Copper Hollow at $50.",
            " ".join(game["last_effects"]),
        )

    def test_property_stays_unowned_if_everyone_passes(self):
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses

        self._set_pending_purchase(room, host_response, position=1)
        room_store.skip_property_purchase(room_code, host_response["player_token"])
        room_store.pass_auction(room_code, guest_response["player_token"])
        final_response = room_store.pass_auction(room_code, host_response["player_token"])

        game = final_response["room"]["game"]

        self.assertIsNone(game["pending_auction"])
        self.assertNotIn(1, game["property_owners"])
        self.assertEqual(game["turn"]["current_player_id"], guest_response["player_id"])
        self.assertTrue(game["turn"]["can_roll"])
        self.assertIn("No one bought Copper Hollow in the auction.", game["last_effects"])

    def test_bid_below_minimum_is_rejected(self):
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses

        self._set_pending_purchase(room, host_response, position=1)
        room_store.skip_property_purchase(room_code, host_response["player_token"])
        # Guest bids $10.
        room_store.bid_in_auction(room_code, guest_response["player_token"], amount=10)
        # Host must bid at least $11 (current + 1). Bidding $10 must fail.
        with self.assertRaises(Exception) as error:
            room_store.bid_in_auction(room_code, host_response["player_token"], amount=10)
        self.assertEqual(error.exception.status_code, 400)
        self.assertIn("$11", error.exception.detail)

    def test_bid_above_cash_is_rejected(self):
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses
        game = room["game"]

        # Give guest just $5 so they can't match a large bid.
        game["cash"][guest_response["player_id"]] = 5

        self._set_pending_purchase(room, host_response, position=1)
        room_store.skip_property_purchase(room_code, host_response["player_token"])

        with self.assertRaises(Exception) as error:
            room_store.bid_in_auction(room_code, guest_response["player_token"], amount=6)
        self.assertEqual(error.exception.status_code, 400)
        self.assertIn("enough cash", error.exception.detail)

    def test_cannot_bid_out_of_turn(self):
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses

        self._set_pending_purchase(room, host_response, position=1)
        room_store.skip_property_purchase(room_code, host_response["player_token"])
        # Guest is active bidder; host tries to bid first.
        with self.assertRaises(Exception) as error:
            room_store.bid_in_auction(room_code, host_response["player_token"], amount=1)
        self.assertEqual(error.exception.status_code, 403)

    def test_already_passed_player_cannot_bid(self):
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses

        self._set_pending_purchase(room, host_response, position=1)
        room_store.skip_property_purchase(room_code, host_response["player_token"])
        # Guest passes; then tries to bid — should be rejected.
        room_store.pass_auction(room_code, guest_response["player_token"])

        with self.assertRaises(Exception) as error:
            room_store.bid_in_auction(room_code, guest_response["player_token"], amount=1)
        self.assertEqual(error.exception.status_code, 403)
        self.assertIn("already passed", error.exception.detail)

    def test_highest_bidder_wins_when_last_opponent_passes_3_players(self):
        # 3-player auction: Guest1 bids, Guest2 passes, Host passes.
        # Only after Host's pass is Guest1 the sole remaining active player → finalize.
        room_code, room, responses = self._create_started_room(
            nicknames=("Host", "Guest1", "Guest2"), starting_player_index=0
        )
        host_response, guest1_response, guest2_response = responses

        self._set_pending_purchase(room, host_response, position=1)
        room_store.skip_property_purchase(room_code, host_response["player_token"])

        # Auction order: Guest1 → Guest2 → Host (initiator bids last).
        room_store.bid_in_auction(room_code, guest1_response["player_token"], amount=30)
        # After Guest2 passes, auction is NOT yet over — Host still needs to act.
        mid_response = room_store.pass_auction(room_code, guest2_response["player_token"])
        self.assertIsNotNone(mid_response["room"]["game"]["pending_auction"])
        self.assertEqual(
            mid_response["room"]["game"]["pending_auction"]["active_player_id"],
            host_response["player_id"],
        )
        # Host passes → only Guest1 (highest bidder) remains → finalize.
        final_response = room_store.pass_auction(room_code, host_response["player_token"])
        game = final_response["room"]["game"]

        self.assertIsNone(game["pending_auction"])
        self.assertEqual(game["property_owners"][1], guest1_response["player_id"])
        self.assertEqual(game["cash"][guest1_response["player_id"]], room_store.STARTING_CASH - 30)
        self.assertIn("won the auction for Copper Hollow at $30.", " ".join(game["last_effects"]))

    def test_last_active_bidder_wins_immediately_on_bid(self):
        # Tests the bid_in_auction immediate-finalization path (line 1464):
        # if after your bid you are the ONLY remaining active player, auction ends inline.
        # Setup: 3-player auction, Guest1 and Guest2 both pass first,
        # then Host bids — Host is only active player — finalize inside bid call.
        room_code, room, responses = self._create_started_room(
            nicknames=("Host", "Guest1", "Guest2"), starting_player_index=0
        )
        host_response, guest1_response, guest2_response = responses

        self._set_pending_purchase(room, host_response, position=1)
        room_store.skip_property_purchase(room_code, host_response["player_token"])

        # Auction order: Guest1 → Guest2 → Host.
        # Guest1 and Guest2 both pass without bidding.
        room_store.pass_auction(room_code, guest1_response["player_token"])
        room_store.pass_auction(room_code, guest2_response["player_token"])

        # Only Host remains active. Host bids → immediate finalization inside bid_in_auction.
        final_response = room_store.bid_in_auction(room_code, host_response["player_token"], amount=50)
        game = final_response["room"]["game"]

        self.assertIsNone(game["pending_auction"])
        self.assertEqual(game["property_owners"][1], host_response["player_id"])
        self.assertEqual(game["cash"][host_response["player_id"]], room_store.STARTING_CASH - 50)
        self.assertIn("won the auction for Copper Hollow at $50.", " ".join(game["last_effects"]))


if __name__ == "__main__":
    unittest.main()

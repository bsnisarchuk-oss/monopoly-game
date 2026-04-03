import unittest
from unittest.mock import patch

from fastapi import HTTPException

import room_store


class JailFineFlowTests(unittest.TestCase):
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

    def _put_player_in_jail(self, room, player_response, turns_in_jail=1):
        player_id = player_response["player_id"]
        game = room["game"]
        game["turn"]["current_player_id"] = player_id
        game["turn"]["can_roll"] = True
        game["in_jail"][player_id] = True
        game["turns_in_jail"][player_id] = turns_in_jail

    def test_player_can_pay_to_leave_jail_before_rolling(self):
        room_code, room, responses = self._create_started_room()
        host_response = responses[0]
        self._put_player_in_jail(room, host_response, turns_in_jail=2)

        response = room_store.pay_jail_fine(room_code, host_response["player_token"])
        game = response["room"]["game"]
        player_id = host_response["player_id"]

        self.assertFalse(game["in_jail"][player_id])
        self.assertEqual(game["turns_in_jail"][player_id], 0)
        self.assertEqual(
            game["cash"][player_id],
            room_store.STARTING_CASH - room_store.JAIL_FINE_AMOUNT,
        )
        self.assertEqual(game["turn"]["current_player_id"], player_id)
        self.assertTrue(game["turn"]["can_roll"])
        self.assertIn(
            f"Paid ${room_store.JAIL_FINE_AMOUNT} to leave Jail before rolling.",
            game["last_effects"],
        )

    def test_player_cannot_pay_jail_fine_when_not_in_jail(self):
        room_code, room, responses = self._create_started_room()
        host_response = responses[0]
        room["game"]["turn"]["current_player_id"] = host_response["player_id"]

        with self.assertRaises(HTTPException) as error:
            room_store.pay_jail_fine(room_code, host_response["player_token"])

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(error.exception.detail, "You are not in jail.")

    def test_player_cannot_pay_jail_fine_out_of_turn(self):
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses
        self._put_player_in_jail(room, host_response)
        room["game"]["turn"]["current_player_id"] = guest_response["player_id"]

        with self.assertRaises(HTTPException) as error:
            room_store.pay_jail_fine(room_code, host_response["player_token"])

        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(error.exception.detail, "It is not your turn.")

    def test_player_cannot_pay_jail_fine_after_rolling(self):
        room_code, room, responses = self._create_started_room()
        host_response = responses[0]
        self._put_player_in_jail(room, host_response)
        room["game"]["turn"]["can_roll"] = False

        with self.assertRaises(HTTPException) as error:
            room_store.pay_jail_fine(room_code, host_response["player_token"])

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(
            error.exception.detail,
            "You can only pay the jail fine before rolling this turn.",
        )

    def test_player_cannot_pay_jail_fine_without_enough_cash(self):
        room_code, room, responses = self._create_started_room()
        host_response = responses[0]
        self._put_player_in_jail(room, host_response)
        room["game"]["cash"][host_response["player_id"]] = room_store.JAIL_FINE_AMOUNT - 1

        with self.assertRaises(HTTPException) as error:
            room_store.pay_jail_fine(room_code, host_response["player_token"])

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(
            error.exception.detail,
            "You do not have enough cash to pay the jail fine.",
        )

    def test_jail_turn_counter_increments_on_failed_roll(self):
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses
        player_id = host_response["player_id"]

        self._put_player_in_jail(room, host_response, turns_in_jail=0)
        room["game"]["positions"][player_id] = room_store.JAIL_POSITION

        with patch("room_store.random.randint", side_effect=[1, 2]):
            response = room_store.roll_dice(room_code, host_response["player_token"])

        game = response["room"]["game"]

        self.assertTrue(game["in_jail"][player_id])
        self.assertEqual(game["turns_in_jail"][player_id], 1)
        self.assertEqual(game["cash"][player_id], room_store.STARTING_CASH)
        self.assertEqual(game["positions"][player_id], room_store.JAIL_POSITION)
        self.assertEqual(game["turn"]["current_player_id"], guest_response["player_id"])

    def test_forced_exit_on_third_failed_roll(self):
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses
        player_id = host_response["player_id"]

        self._put_player_in_jail(room, host_response, turns_in_jail=2)
        room["game"]["positions"][player_id] = room_store.JAIL_POSITION

        with patch("room_store.random.randint", side_effect=[1, 2]):
            response = room_store.roll_dice(room_code, host_response["player_token"])

        game = response["room"]["game"]

        self.assertFalse(game["in_jail"][player_id])
        self.assertEqual(game["turns_in_jail"][player_id], 0)
        self.assertEqual(game["cash"][player_id], room_store.STARTING_CASH - room_store.JAIL_FINE_AMOUNT)
        expected_position = (room_store.JAIL_POSITION + 3) % room_store.BOARD_SIZE
        self.assertEqual(game["positions"][player_id], expected_position)
        self.assertTrue(
            any(f"Paid ${room_store.JAIL_FINE_AMOUNT} fine" in effect for effect in game["last_effects"])
        )

    def test_doubles_escape_from_jail_resets_counter(self):
        room_code, room, responses = self._create_started_room()
        host_response = responses[0]
        player_id = host_response["player_id"]

        self._put_player_in_jail(room, host_response, turns_in_jail=2)
        room["game"]["positions"][player_id] = room_store.JAIL_POSITION

        with patch("room_store.random.randint", side_effect=[3, 3]):
            response = room_store.roll_dice(room_code, host_response["player_token"])

        game = response["room"]["game"]

        self.assertFalse(game["in_jail"][player_id])
        self.assertEqual(game["turns_in_jail"][player_id], 0)
        self.assertEqual(game["cash"][player_id], room_store.STARTING_CASH)
        expected_position = (room_store.JAIL_POSITION + 6) % room_store.BOARD_SIZE
        self.assertEqual(game["positions"][player_id], expected_position)


if __name__ == "__main__":
    unittest.main()

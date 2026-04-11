import unittest
from unittest.mock import patch

import room_store


class RoomVersionTests(unittest.TestCase):
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

    def test_room_version_is_monotonic_across_room_mutations(self):
        create_response = room_store.create_room("Host")
        room_code = create_response["room"]["room_code"]
        create_version = create_response["room"]["room_version"]

        join_response = room_store.join_room(room_code, "Guest")
        join_version = join_response["room"]["room_version"]

        host_ready_response = room_store.set_player_ready(
            room_code, create_response["player_token"], True
        )
        host_ready_version = host_ready_response["room"]["room_version"]

        guest_ready_response = room_store.set_player_ready(
            room_code, join_response["player_token"], True
        )
        guest_ready_version = guest_ready_response["room"]["room_version"]

        with patch("room_store.random.choice", return_value=create_response["player_id"]):
            start_response = room_store.start_game(room_code, create_response["player_token"])
        start_version = start_response["room"]["room_version"]

        self.assertEqual(create_version, 1)
        self.assertEqual(join_version, 2)
        self.assertEqual(host_ready_version, 3)
        self.assertEqual(guest_ready_version, 4)
        self.assertEqual(start_version, 5)

    def test_rejoin_updates_last_activity_without_bumping_room_version(self):
        create_response = room_store.create_room("Host")
        room_code = create_response["room"]["room_code"]
        room = room_store.rooms[room_code]
        room["last_activity"] = 0
        initial_version = create_response["room"]["room_version"]

        rejoin_response = room_store.rejoin_room(room_code, create_response["player_token"])

        self.assertEqual(rejoin_response["room"]["room_version"], initial_version)
        self.assertGreater(rejoin_response["room"]["last_activity"], 0)

    def test_game_actions_increment_room_version_but_room_reads_do_not(self):
        room_code, room, responses = self._create_started_room()
        active_player = responses[0]
        baseline_version = room["room_version"]

        with patch("room_store.random.randint", side_effect=[1, 2]):
            roll_response = room_store.roll_dice(room_code, active_player["player_token"])

        rolled_version = roll_response["room"]["room_version"]
        fetched_version = room_store.get_room(room_code)["room_version"]
        fetched_version_again = room_store.get_room(room_code)["room_version"]

        self.assertEqual(rolled_version, baseline_version + 1)
        self.assertEqual(fetched_version, rolled_version)
        self.assertEqual(fetched_version_again, rolled_version)


if __name__ == "__main__":
    unittest.main()

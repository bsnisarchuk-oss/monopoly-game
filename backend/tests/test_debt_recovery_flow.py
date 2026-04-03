import unittest
from unittest.mock import patch

import room_store


class DebtRecoveryFlowTests(unittest.TestCase):
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

    def test_roll_starts_debt_recovery_instead_of_immediate_elimination(self):
        room_code, room, responses = self._create_started_room(starting_player_index=1)
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        game["property_owners"][1] = host_player_id
        game["property_owners"][3] = host_player_id
        game["property_mortgaged"][1] = False
        game["property_mortgaged"][3] = False
        game["cash"][guest_player_id] = 10
        game["positions"][guest_player_id] = 0

        with patch("room_store.random.randint", side_effect=[1, 2]):
            response = room_store.roll_dice(room_code, guest_response["player_token"])

        response_game = response["room"]["game"]

        self.assertEqual(response_game["pending_bankruptcy"]["player_id"], guest_player_id)
        self.assertEqual(response_game["pending_bankruptcy"]["amount_owed"], 10)
        self.assertEqual(response_game["pending_bankruptcy"]["creditor_type"], room_store.BANKRUPTCY_CREDITOR_PLAYER)
        self.assertEqual(response_game["pending_bankruptcy"]["creditor_player_id"], host_player_id)
        self.assertEqual(response_game["turn"]["current_player_id"], guest_player_id)
        self.assertFalse(response_game["turn"]["can_roll"])
        self.assertEqual(response_game["cash"][guest_player_id], 0)
        self.assertEqual(response_game["cash"][host_player_id], room_store.STARTING_CASH + 10)
        self.assertEqual(len(response["room"]["players"]), 2)
        self.assertIn("must recover $10 owed to Host or declare bankruptcy.", " ".join(response_game["last_effects"]))

    def test_tax_starts_bankruptcy_recovery_owed_to_bank(self):
        room_code, room, responses = self._create_started_room(starting_player_index=1)
        _, guest_response = responses
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        game["cash"][guest_player_id] = 10
        game["positions"][guest_player_id] = 0

        with patch("room_store.random.randint", side_effect=[1, 3]):
            response = room_store.roll_dice(room_code, guest_response["player_token"])

        response_game = response["room"]["game"]

        self.assertEqual(response_game["pending_bankruptcy"]["player_id"], guest_player_id)
        self.assertEqual(response_game["pending_bankruptcy"]["amount_owed"], 190)
        self.assertEqual(response_game["pending_bankruptcy"]["creditor_type"], room_store.BANKRUPTCY_CREDITOR_BANK)
        self.assertIsNone(response_game["pending_bankruptcy"]["creditor_player_id"])
        self.assertEqual(response_game["cash"][guest_player_id], -190)
        self.assertIn("must recover $190 or declare bankruptcy.", " ".join(response_game["last_effects"]))

    def test_mortgage_can_resolve_debt_recovery_and_pass_turn(self):
        room_code, room, responses = self._create_started_room(starting_player_index=1)
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        game["property_owners"][1] = host_player_id
        game["property_owners"][3] = host_player_id
        game["property_mortgaged"][1] = False
        game["property_mortgaged"][3] = False
        game["property_owners"][5] = guest_player_id
        game["property_mortgaged"][5] = False
        game["cash"][guest_player_id] = 10
        game["positions"][guest_player_id] = 0

        with patch("room_store.random.randint", side_effect=[1, 2]):
            room_store.roll_dice(room_code, guest_response["player_token"])

        response = room_store.mortgage_property(room_code, guest_response["player_token"], 5)
        response_game = response["room"]["game"]

        self.assertIsNone(response_game["pending_bankruptcy"])
        self.assertEqual(response_game["cash"][guest_player_id], 90)
        self.assertEqual(response_game["turn"]["current_player_id"], host_player_id)
        self.assertTrue(response_game["turn"]["can_roll"])
        self.assertIn("Debt recovered.", " ".join(response_game["last_effects"]))

    def test_sell_upgrade_can_resolve_debt_recovery_and_keep_extra_turn(self):
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        game = room["game"]

        game["property_owners"][1] = host_player_id
        game["property_owners"][3] = host_player_id
        game["property_mortgaged"][1] = False
        game["property_mortgaged"][3] = False
        game["property_levels"][1] = 1
        game["cash"][host_player_id] = -10
        game["pending_bankruptcy"] = {
            "player_id": host_player_id,
            "amount_owed": 10,
            "resume_player_id": host_player_id,
        }
        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = False

        response = room_store.sell_upgrade(room_code, host_response["player_token"], 1)
        response_game = response["room"]["game"]

        self.assertIsNone(response_game["pending_bankruptcy"])
        self.assertEqual(response_game["cash"][host_player_id], 15)
        self.assertEqual(response_game["turn"]["current_player_id"], host_player_id)
        self.assertTrue(response_game["turn"]["can_roll"])
        self.assertIn("Debt recovered. Your turn continues.", response_game["last_effects"])

    def test_player_can_declare_bankruptcy_during_recovery(self):
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        game["cash"][host_player_id] = -25
        game["pending_bankruptcy"] = {
            "player_id": host_player_id,
            "amount_owed": 25,
            "resume_player_id": guest_player_id,
        }
        game["turn"]["current_player_id"] = host_player_id
        game["turn"]["can_roll"] = False

        response = room_store.declare_bankruptcy(room_code, host_response["player_token"])
        response_room = response["room"]

        self.assertEqual(response_room["status"], room_store.ROOM_STATUS_FINISHED)
        self.assertEqual(response_room["game"]["winner_id"], guest_player_id)
        self.assertEqual(len(response_room["players"]), 1)
        self.assertEqual(response_room["players"][0]["player_id"], guest_player_id)
        self.assertIn("declared bankruptcy and was eliminated.", " ".join(response_room["game"]["last_effects"]))

    def test_player_creditor_collects_assets_on_bankruptcy(self):
        room_code, room, responses = self._create_started_room()
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        game["cash"][guest_player_id] = 40
        game["property_owners"][5] = guest_player_id
        game["property_mortgaged"][5] = True
        game["property_owners"][6] = guest_player_id
        game["property_mortgaged"][6] = False
        game["property_levels"][6] = 1
        game["pending_bankruptcy"] = {
            "player_id": guest_player_id,
            "amount_owed": 60,
            "resume_player_id": host_player_id,
            "creditor_type": room_store.BANKRUPTCY_CREDITOR_PLAYER,
            "creditor_player_id": host_player_id,
        }
        game["turn"]["current_player_id"] = guest_player_id
        game["turn"]["can_roll"] = False

        response = room_store.declare_bankruptcy(room_code, guest_response["player_token"])
        response_room = response["room"]
        response_game = response_room["game"]

        self.assertEqual(response_room["status"], room_store.ROOM_STATUS_FINISHED)
        self.assertEqual(response_game["winner_id"], host_player_id)
        self.assertEqual(response_game["cash"][host_player_id], room_store.STARTING_CASH + 65)
        self.assertEqual(response_game["property_owners"][5], host_player_id)
        self.assertEqual(response_game["property_owners"][6], host_player_id)
        self.assertTrue(response_game["property_mortgaged"][5])
        self.assertNotIn(6, response_game["property_levels"])
        self.assertEqual(len(response_room["players"]), 1)
        self.assertIn(
            "received 1 mortgaged property. They stay mortgaged until unmortgaged.",
            " ".join(response_game["last_effects"]),
        )

    def test_mortgaged_property_from_bankruptcy_stays_inactive_until_unmortgaged(self):
        room_code, room, responses = self._create_started_room(
            nicknames=("Host", "Guest1", "Guest2"), starting_player_index=1
        )
        host_response, guest1_response, guest2_response = responses
        host_player_id = host_response["player_id"]
        guest1_player_id = guest1_response["player_id"]
        guest2_player_id = guest2_response["player_id"]
        game = room["game"]

        game["cash"][guest1_player_id] = 0
        game["property_owners"][5] = guest1_player_id
        game["property_mortgaged"][5] = True
        game["pending_bankruptcy"] = {
            "player_id": guest1_player_id,
            "amount_owed": 20,
            "resume_player_id": host_player_id,
            "creditor_type": room_store.BANKRUPTCY_CREDITOR_PLAYER,
            "creditor_player_id": host_player_id,
        }
        game["turn"]["current_player_id"] = guest1_player_id
        game["turn"]["can_roll"] = False

        room_store.declare_bankruptcy(room_code, guest1_response["player_token"])
        updated_game = room_store.rooms[room_code]["game"]

        self.assertEqual(updated_game["property_owners"][5], host_player_id)
        self.assertTrue(updated_game["property_mortgaged"][5])

        updated_game["positions"][guest2_player_id] = 2
        updated_game["turn"]["current_player_id"] = guest2_player_id
        updated_game["turn"]["can_roll"] = True

        with patch("room_store.random.randint", side_effect=[1, 2]):
            first_roll_response = room_store.roll_dice(room_code, guest2_response["player_token"])

        first_roll_game = first_roll_response["room"]["game"]
        self.assertEqual(first_roll_game["cash"][guest2_player_id], room_store.STARTING_CASH)
        self.assertEqual(first_roll_game["cash"][host_player_id], room_store.STARTING_CASH)
        self.assertIn("is mortgaged, so no rent is due.", " ".join(first_roll_game["last_effects"]))

        first_roll_game["turn"]["current_player_id"] = host_player_id
        first_roll_game["turn"]["can_roll"] = True
        unmortgage_response = room_store.unmortgage_property(room_code, host_response["player_token"], 5)
        self.assertFalse(unmortgage_response["room"]["game"]["property_mortgaged"][5])

        updated_game = room_store.rooms[room_code]["game"]
        updated_game["positions"][guest2_player_id] = 2
        updated_game["turn"]["current_player_id"] = guest2_player_id
        updated_game["turn"]["can_roll"] = True

        with patch("room_store.random.randint", side_effect=[1, 2]):
            second_roll_response = room_store.roll_dice(room_code, guest2_response["player_token"])

        second_roll_game = second_roll_response["room"]["game"]
        self.assertEqual(second_roll_game["cash"][guest2_player_id], room_store.STARTING_CASH - 25)
        self.assertEqual(second_roll_game["cash"][host_player_id], room_store.STARTING_CASH - 110 + 25)
        self.assertIn("Paid $25 rent to Host for North Line.", " ".join(second_roll_game["last_effects"]))

    def test_creditor_leaves_during_player_debt_recovery_converts_debt_to_bank(self):
        room_code, room, responses = self._create_started_room(
            nicknames=("Host", "Guest1", "Guest2"), starting_player_index=1
        )
        host_response, guest1_response, guest2_response = responses
        guest1_player_id = guest1_response["player_id"]
        guest2_player_id = guest2_response["player_id"]
        game = room["game"]

        game["cash"][guest1_player_id] = 4
        game["pending_bankruptcy"] = {
            "player_id": guest1_player_id,
            "amount_owed": 10,
            "resume_player_id": guest2_player_id,
            "creditor_type": room_store.BANKRUPTCY_CREDITOR_PLAYER,
            "creditor_player_id": host_response["player_id"],
        }
        game["turn"]["current_player_id"] = guest1_player_id
        game["turn"]["can_roll"] = False

        room_store.leave_room(room_code, host_response["player_token"])

        updated_game = room_store.rooms[room_code]["game"]

        self.assertEqual(updated_game["cash"][guest1_player_id], -6)
        self.assertEqual(updated_game["pending_bankruptcy"]["amount_owed"], 6)
        self.assertEqual(updated_game["pending_bankruptcy"]["creditor_type"], room_store.BANKRUPTCY_CREDITOR_BANK)
        self.assertIsNone(updated_game["pending_bankruptcy"]["creditor_player_id"])

    def test_trade_can_resolve_debt_recovery_and_pass_turn(self):
        room_code, room, responses = self._create_started_room(starting_player_index=1)
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        game["property_owners"][5] = guest_player_id
        game["property_mortgaged"][5] = False
        game["cash"][guest_player_id] = -40
        game["pending_bankruptcy"] = {
            "player_id": guest_player_id,
            "amount_owed": 40,
            "resume_player_id": host_player_id,
        }
        game["turn"]["current_player_id"] = guest_player_id
        game["turn"]["can_roll"] = False
        game["turn"]["is_doubles"] = False

        room_store.propose_trade(room_code, guest_response["player_token"], host_player_id, 5, 100)
        response = room_store.respond_to_trade(room_code, host_response["player_token"], True)
        response_game = response["room"]["game"]

        self.assertIsNone(response_game["pending_trade"])
        self.assertIsNone(response_game["pending_bankruptcy"])
        self.assertEqual(response_game["property_owners"][5], host_player_id)
        self.assertEqual(response_game["cash"][guest_player_id], 60)
        self.assertEqual(response_game["turn"]["current_player_id"], host_player_id)
        self.assertTrue(response_game["turn"]["can_roll"])
        self.assertFalse(response_game["turn"]["is_doubles"])
        self.assertIn("Debt recovered.", " ".join(response_game["last_effects"]))

    def test_trade_during_recovery_can_leave_debt_unresolved(self):
        room_code, room, responses = self._create_started_room(starting_player_index=1)
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        game["property_owners"][5] = guest_player_id
        game["property_mortgaged"][5] = False
        game["cash"][guest_player_id] = -120
        game["pending_bankruptcy"] = {
            "player_id": guest_player_id,
            "amount_owed": 120,
            "resume_player_id": host_player_id,
        }
        game["turn"]["current_player_id"] = guest_player_id
        game["turn"]["can_roll"] = False

        room_store.propose_trade(room_code, guest_response["player_token"], host_player_id, 5, 60)
        response = room_store.respond_to_trade(room_code, host_response["player_token"], True)
        response_game = response["room"]["game"]

        self.assertIsNone(response_game["pending_trade"])
        self.assertIsNotNone(response_game["pending_bankruptcy"])
        self.assertEqual(response_game["pending_bankruptcy"]["player_id"], guest_player_id)
        self.assertEqual(response_game["pending_bankruptcy"]["amount_owed"], 60)
        self.assertEqual(response_game["turn"]["current_player_id"], guest_player_id)
        self.assertFalse(response_game["turn"]["can_roll"])
        self.assertIn("Still owe $60 to avoid bankruptcy.", " ".join(response_game["last_effects"]))

    def test_trade_can_resolve_doubles_recovery_without_losing_extra_turn(self):
        room_code, room, responses = self._create_started_room(starting_player_index=1)
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        game["property_owners"][5] = guest_player_id
        game["property_mortgaged"][5] = False
        game["cash"][guest_player_id] = -40
        game["pending_bankruptcy"] = {
            "player_id": guest_player_id,
            "amount_owed": 40,
            "resume_player_id": guest_player_id,
        }
        game["turn"]["current_player_id"] = guest_player_id
        game["turn"]["can_roll"] = False
        game["turn"]["is_doubles"] = True

        room_store.propose_trade(room_code, guest_response["player_token"], host_player_id, 5, 100)
        response = room_store.respond_to_trade(room_code, host_response["player_token"], True)
        response_game = response["room"]["game"]

        self.assertIsNone(response_game["pending_bankruptcy"])
        self.assertEqual(response_game["turn"]["current_player_id"], guest_player_id)
        self.assertTrue(response_game["turn"]["can_roll"])
        self.assertTrue(response_game["turn"]["is_doubles"])
        self.assertIn("Debt recovered. Your turn continues.", " ".join(response_game["last_effects"]))


    def test_doubles_roll_starts_recovery_and_extra_turn_resumes_after_resolve(self):
        # Doubles → guest lands on host property, owes rent, can't pay.
        # After mortgage resolves debt, guest should get an EXTRA roll (resume_player_id == guest).
        room_code, room, responses = self._create_started_room(starting_player_index=1)
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        # Host owns Connecticut Ave (position 9, light-blue group).
        game["property_owners"][9] = host_player_id
        game["property_mortgaged"][9] = False
        # Guest has just $2 (can't pay any rent), positioned to roll doubles → land on 9.
        game["cash"][guest_player_id] = 2
        game["positions"][guest_player_id] = 3  # + doubles(3+3)=6 → position 9

        # Give guest a property so they can mortgage it to recover.
        game["property_owners"][5] = guest_player_id
        game["property_mortgaged"][5] = False

        # Doubles roll: both dice show 3.
        with patch("room_store.random.randint", side_effect=[3, 3]):
            roll_response = room_store.roll_dice(room_code, guest_response["player_token"])

        roll_game = roll_response["room"]["game"]
        # Recovery started, still guest's turn.
        self.assertIsNotNone(roll_game["pending_bankruptcy"])
        self.assertEqual(roll_game["pending_bankruptcy"]["player_id"], guest_player_id)
        # resume_player_id must be guest (doubles → extra turn).
        self.assertEqual(roll_game["pending_bankruptcy"]["resume_player_id"], guest_player_id)

        # Mortgage to recover debt.
        resolve_response = room_store.mortgage_property(room_code, guest_response["player_token"], 5)
        resolve_game = resolve_response["room"]["game"]

        self.assertIsNone(resolve_game["pending_bankruptcy"])
        # After recovery guest keeps the turn (extra roll for doubles).
        self.assertEqual(resolve_game["turn"]["current_player_id"], guest_player_id)
        self.assertTrue(resolve_game["turn"]["can_roll"])

    def test_debtor_leaves_during_recovery_resumes_correct_player(self):
        # Guest is in bankruptcy recovery; guest leaves → pending_bankruptcy cleared
        # and turn should transfer to host (resume_player_id) immediately.
        room_code, room, responses = self._create_started_room(starting_player_index=1)
        host_response, guest_response = responses
        host_player_id = host_response["player_id"]
        guest_player_id = guest_response["player_id"]
        game = room["game"]

        # Put guest into recovery manually (simpler than a full roll setup here).
        game["cash"][guest_player_id] = -30
        game["pending_bankruptcy"] = {
            "player_id": guest_player_id,
            "amount_owed": 30,
            "resume_player_id": host_player_id,
        }
        game["turn"]["current_player_id"] = guest_player_id
        game["turn"]["can_roll"] = False

        room_store.leave_room(room_code, guest_response["player_token"])

        # Room still exists (host remains), game should continue.
        updated_room = room_store.rooms[room_code]
        updated_game = updated_room["game"]

        self.assertIsNone(updated_game["pending_bankruptcy"])
        self.assertEqual(updated_game["turn"]["current_player_id"], host_player_id)
        self.assertTrue(updated_game["turn"]["can_roll"])
        self.assertEqual(len(updated_room["players"]), 1)

    def test_resume_player_leaves_during_recovery_redirects_turn(self):
        # 3-player game: guest1 owes debt, resume_player is guest2.
        # guest2 leaves → resume_player_id should redirect to host (next in rotation after guest1).
        room_code, room, responses = self._create_started_room(
            nicknames=("Host", "Guest1", "Guest2"), starting_player_index=1
        )
        host_response, guest1_response, guest2_response = responses
        host_player_id = host_response["player_id"]
        guest1_player_id = guest1_response["player_id"]
        guest2_player_id = guest2_response["player_id"]
        game = room["game"]

        game["cash"][guest1_player_id] = -20
        game["pending_bankruptcy"] = {
            "player_id": guest1_player_id,
            "amount_owed": 20,
            "resume_player_id": guest2_player_id,
        }
        game["turn"]["current_player_id"] = guest1_player_id
        game["turn"]["can_roll"] = False

        room_store.leave_room(room_code, guest2_response["player_token"])

        updated_room = room_store.rooms[room_code]
        updated_game = updated_room["game"]

        # Recovery is still active — guest1 must still resolve the debt.
        self.assertIsNotNone(updated_game["pending_bankruptcy"])
        self.assertEqual(updated_game["pending_bankruptcy"]["player_id"], guest1_player_id)
        # Turn order: Host→Guest1→Guest2. Guest1 is debtor, Guest2 (resume) leaves.
        # Next after Guest1 in rotation excluding Guest2 = Host.
        self.assertEqual(updated_game["pending_bankruptcy"]["resume_player_id"], host_player_id)

    def test_resume_player_leaves_during_recovery_correct_turn_order_4_players(self):
        # Regression test for 4-player bug: resume_player_id must follow turn order,
        # not just pick remaining_player_ids[0] (which would be the host/first joiner).
        #
        # Turn order: Host → PlayerB → PlayerC → PlayerD
        # PlayerB is debtor, PlayerC is resume (natural next after B).
        # PlayerC leaves → resume should redirect to PlayerD (next after B in rotation),
        # NOT to Host (which would be the wrong remaining_player_ids[0] shortcut).
        room_code, room, responses = self._create_started_room(
            nicknames=("Host", "PlayerB", "PlayerC", "PlayerD"), starting_player_index=1
        )
        host_response, b_response, c_response, d_response = responses
        b_player_id = b_response["player_id"]
        c_player_id = c_response["player_id"]
        d_player_id = d_response["player_id"]
        game = room["game"]

        game["cash"][b_player_id] = -15
        game["pending_bankruptcy"] = {
            "player_id": b_player_id,
            "amount_owed": 15,
            "resume_player_id": c_player_id,
        }
        game["turn"]["current_player_id"] = b_player_id
        game["turn"]["can_roll"] = False

        room_store.leave_room(room_code, c_response["player_token"])

        updated_room = room_store.rooms[room_code]
        updated_game = updated_room["game"]

        # Recovery must still be active for PlayerB.
        self.assertIsNotNone(updated_game["pending_bankruptcy"])
        self.assertEqual(updated_game["pending_bankruptcy"]["player_id"], b_player_id)
        # Must redirect to PlayerD (next after B in rotation), not Host.
        self.assertEqual(updated_game["pending_bankruptcy"]["resume_player_id"], d_player_id)
        self.assertNotEqual(updated_game["pending_bankruptcy"]["resume_player_id"], host_response["player_id"])

    def test_trade_resolves_player_creditor_debt_and_pays_creditor(self):
        # Trade during recovery with player creditor: debtor sells property to third party,
        # _sync_pending_bankruptcy must deduct amount_owed from debtor AND credit it to creditor.
        # (Bank path only checks cash >= 0; player path checks cash >= amount_owed and pays creditor.)
        room_code, room, responses = self._create_started_room(
            nicknames=("Host", "Guest1", "Guest2"), starting_player_index=1
        )
        host_response, guest1_response, guest2_response = responses
        host_player_id = host_response["player_id"]
        guest1_player_id = guest1_response["player_id"]
        guest2_player_id = guest2_response["player_id"]
        game = room["game"]

        # Guest1 owes Host $30 (player creditor). Guest1 has $0, Host is resume.
        game["property_owners"][5] = guest1_player_id
        game["property_mortgaged"][5] = False
        game["cash"][guest1_player_id] = 0
        game["pending_bankruptcy"] = {
            "player_id": guest1_player_id,
            "amount_owed": 30,
            "resume_player_id": host_player_id,
            "creditor_type": room_store.BANKRUPTCY_CREDITOR_PLAYER,
            "creditor_player_id": host_player_id,
        }
        game["turn"]["current_player_id"] = guest1_player_id
        game["turn"]["can_roll"] = False

        # Guest1 trades property to Guest2 (third party, not the creditor) for $50.
        room_store.propose_trade(room_code, guest1_response["player_token"], guest2_player_id, 5, 50)
        response = room_store.respond_to_trade(room_code, guest2_response["player_token"], True)
        response_game = response["room"]["game"]

        self.assertIsNone(response_game["pending_bankruptcy"])
        self.assertEqual(response_game["property_owners"][5], guest2_player_id)
        # Guest1 received $50, paid $30 to Host → net $20 remaining.
        self.assertEqual(response_game["cash"][guest1_player_id], 20)
        # Host (creditor) received the $30 debt payment.
        self.assertEqual(response_game["cash"][host_player_id], room_store.STARTING_CASH + 30)
        self.assertEqual(response_game["turn"]["current_player_id"], host_player_id)
        self.assertTrue(response_game["turn"]["can_roll"])
        self.assertIn("Paid $30 to Host.", " ".join(response_game["last_effects"]))
        self.assertIn("Debt recovered.", " ".join(response_game["last_effects"]))

    def test_creditor_is_resume_player_leaves_converts_to_bank_and_redirects_turn(self):
        # Common case: creditor == resume_player_id (debtor lands on creditor's property,
        # creditor is next in turn order). Creditor leaves → BOTH the resume redirect
        # AND the bank conversion must fire. Verified they don't conflict.
        room_code, room, responses = self._create_started_room(
            nicknames=("Host", "Guest1", "Guest2"), starting_player_index=1
        )
        host_response, guest1_response, guest2_response = responses
        host_player_id = host_response["player_id"]
        guest1_player_id = guest1_response["player_id"]
        guest2_player_id = guest2_response["player_id"]
        game = room["game"]

        # Guest1 owes Host $30. Host is BOTH creditor AND resume_player.
        game["cash"][guest1_player_id] = 10
        game["pending_bankruptcy"] = {
            "player_id": guest1_player_id,
            "amount_owed": 30,
            "resume_player_id": host_player_id,   # <-- same as creditor
            "creditor_type": room_store.BANKRUPTCY_CREDITOR_PLAYER,
            "creditor_player_id": host_player_id,  # <-- same as resume
        }
        game["turn"]["current_player_id"] = guest1_player_id
        game["turn"]["can_roll"] = False

        room_store.leave_room(room_code, host_response["player_token"])

        updated_room = room_store.rooms[room_code]
        updated_game = updated_room["game"]

        # Recovery still active (Guest1 still owes something).
        self.assertIsNotNone(updated_game["pending_bankruptcy"])
        self.assertEqual(updated_game["pending_bankruptcy"]["player_id"], guest1_player_id)
        # Converted to bank path.
        self.assertEqual(updated_game["pending_bankruptcy"]["creditor_type"], room_store.BANKRUPTCY_CREDITOR_BANK)
        self.assertIsNone(updated_game["pending_bankruptcy"]["creditor_player_id"])
        # Guest1 had $10, owed $30 → cash = 10 - 30 = -20, amount_owed updated to 20.
        self.assertEqual(updated_game["cash"][guest1_player_id], -20)
        self.assertEqual(updated_game["pending_bankruptcy"]["amount_owed"], 20)
        # resume_player_id must be redirected away from departed Host → to Guest2.
        self.assertEqual(updated_game["pending_bankruptcy"]["resume_player_id"], guest2_player_id)

    def test_declare_bankruptcy_liquidates_upgrades_before_transfer_to_creditor(self):
        # On final bankruptcy, upgrades are sold back to the bank first.
        # Creditor receives the property without levels, plus the liquidation cash.
        # 3-player game so the game continues after Guest1 goes bankrupt.
        room_code, room, responses = self._create_started_room(
            nicknames=("Host", "Guest1", "Guest2"), starting_player_index=1
        )
        host_response, guest1_response, guest2_response = responses
        host_player_id = host_response["player_id"]
        guest1_player_id = guest1_response["player_id"]
        game = room["game"]

        # Guest1 has level-2 property at position 6 and $5 cash; owes Host $50.
        game["cash"][guest1_player_id] = 5
        game["property_owners"][6] = guest1_player_id
        game["property_mortgaged"][6] = False
        game["property_levels"][6] = 2
        game["pending_bankruptcy"] = {
            "player_id": guest1_player_id,
            "amount_owed": 50,
            "resume_player_id": host_player_id,
            "creditor_type": room_store.BANKRUPTCY_CREDITOR_PLAYER,
            "creditor_player_id": host_player_id,
        }
        game["turn"]["current_player_id"] = guest1_player_id
        game["turn"]["can_roll"] = False

        room_store.declare_bankruptcy(room_code, guest1_response["player_token"])

        updated_game = room_store.rooms[room_code]["game"]

        # Host received cash ($5 + $50 liquidation) and property with levels cleared.
        self.assertEqual(updated_game["cash"][host_player_id], room_store.STARTING_CASH + 55)
        self.assertEqual(updated_game["property_owners"][6], host_player_id)
        self.assertNotIn(6, updated_game["property_levels"])
        self.assertFalse(updated_game["property_mortgaged"][6])
        self.assertIn(
            "Sold 2 upgrades back to the bank for $50 before bankruptcy transfer.",
            " ".join(updated_game["last_effects"]),
        )

        # Host can mortgage position 6 immediately now because upgrades were liquidated.
        # Set up Host as current player so the turn guard passes.
        updated_game["turn"]["current_player_id"] = host_player_id
        updated_game["turn"]["can_roll"] = True
        mortgage_response = room_store.mortgage_property(room_code, host_response["player_token"], 6)
        self.assertTrue(mortgage_response["room"]["game"]["property_mortgaged"][6])


if __name__ == "__main__":
    unittest.main()

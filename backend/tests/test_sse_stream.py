"""Tests for SSE push-replication (Task #18).

Цель: проверить, что pub/sub механизм корректно публикует snapshot-ы при
мутациях комнаты и что подписка/отписка работают атомарно.

HTTP-слой (endpoint `/rooms/{room_code}/stream`) тут не тестируется — это
отдельный smoke через ``curl -N``, т.к. Starlette TestClient для SSE требует
httpx + асинхронный контекст, что усложняет unittest-инфраструктуру.
"""

import asyncio
import unittest
from unittest.mock import patch

import room_events
import room_store


class RoomEventsPubSubTests(unittest.TestCase):
    """Pure pub/sub без HTTP-слоя."""

    def setUp(self):
        room_events.reset_for_tests()

    def tearDown(self):
        room_events.reset_for_tests()

    def test_subscribe_registers_queue(self):
        async def run():
            queue = room_events.subscribe("ABC123")
            self.assertEqual(room_events.subscriber_count("ABC123"), 1)
            room_events.unsubscribe("ABC123", queue)
            self.assertEqual(room_events.subscriber_count("ABC123"), 0)

        asyncio.run(run())

    def test_publish_fans_out_to_all_subscribers(self):
        async def run():
            q1 = room_events.subscribe("ROOM1")
            q2 = room_events.subscribe("ROOM1")

            payload = {"room_version": 42, "room_code": "ROOM1"}
            room_events.publish("ROOM1", payload)

            self.assertEqual(q1.qsize(), 1)
            self.assertEqual(q2.qsize(), 1)
            self.assertIs(q1.get_nowait(), payload)
            self.assertIs(q2.get_nowait(), payload)

            room_events.unsubscribe("ROOM1", q1)
            room_events.unsubscribe("ROOM1", q2)

        asyncio.run(run())

    def test_publish_to_empty_room_is_noop(self):
        # Не должно ничего ломать и не должно создавать entry в _subscribers.
        room_events.publish("GHOSTY", {"anything": 1})
        self.assertEqual(room_events.subscriber_count("GHOSTY"), 0)

    def test_publish_drops_oldest_when_queue_full(self):
        async def run():
            queue = room_events.subscribe("ROOM2")
            # _QUEUE_MAX_SIZE = 8, заполним 9 — первый должен уехать.
            for index in range(9):
                room_events.publish("ROOM2", {"seq": index})
            seen = []
            while not queue.empty():
                seen.append(queue.get_nowait()["seq"])
            # Первый (seq=0) должен быть отброшен: latest-wins politic.
            self.assertNotIn(0, seen)
            self.assertIn(8, seen)
            room_events.unsubscribe("ROOM2", queue)

        asyncio.run(run())

    def test_unsubscribe_is_idempotent(self):
        async def run():
            queue = room_events.subscribe("ROOM3")
            room_events.unsubscribe("ROOM3", queue)
            # Второй вызов — никакого AttributeError/KeyError.
            room_events.unsubscribe("ROOM3", queue)
            self.assertEqual(room_events.subscriber_count("ROOM3"), 0)

        asyncio.run(run())


class RoomStoreTouchPublishesSnapshotTests(unittest.TestCase):
    """Подтверждение, что _touch_room публикует snapshot в room_events."""

    def setUp(self):
        room_store.rooms.clear()
        room_events.reset_for_tests()

    def tearDown(self):
        room_store.rooms.clear()
        room_events.reset_for_tests()

    def test_create_room_publishes_nothing_because_no_subscriber(self):
        # create_room не вызывает _touch_room (room уже свежий),
        # но даже если бы вызвал — без подписчика publish no-op.
        response = room_store.create_room("Solo")
        room_code = response["room"]["room_code"]
        self.assertEqual(room_events.subscriber_count(room_code), 0)

    def test_mutation_publishes_snapshot_to_subscriber(self):
        async def run():
            host = room_store.create_room("Host")
            room_code = host["room"]["room_code"]

            queue = room_events.subscribe(room_code)

            # join_room вызывает _touch_room → publish.
            room_store.join_room(room_code, "Guest")

            self.assertEqual(queue.qsize(), 1)
            snapshot = queue.get_nowait()
            self.assertEqual(snapshot["room_code"], room_code)
            # В snapshot должен быть уже обновлённый room_version.
            self.assertGreaterEqual(snapshot["room_version"], 2)
            # И второй игрок в списке.
            nicknames = [p["nickname"] for p in snapshot["players"]]
            self.assertIn("Guest", nicknames)

            room_events.unsubscribe(room_code, queue)

        asyncio.run(run())

    def test_mutation_publishes_to_multiple_subscribers(self):
        async def run():
            host = room_store.create_room("Host")
            room_code = host["room"]["room_code"]
            room_store.join_room(room_code, "Guest")

            q1 = room_events.subscribe(room_code)
            q2 = room_events.subscribe(room_code)

            room_store.set_player_ready(room_code, host["player_token"], True)

            self.assertEqual(q1.qsize(), 1)
            self.assertEqual(q2.qsize(), 1)
            snap1 = q1.get_nowait()
            snap2 = q2.get_nowait()
            self.assertEqual(snap1["room_code"], room_code)
            self.assertEqual(snap2["room_code"], room_code)

            room_events.unsubscribe(room_code, q1)
            room_events.unsubscribe(room_code, q2)

        asyncio.run(run())

    def test_read_only_get_room_does_not_publish(self):
        """get_room — чистое чтение; _touch_room не вызывается, publish не идёт."""

        async def run():
            host = room_store.create_room("Host")
            room_code = host["room"]["room_code"]
            queue = room_events.subscribe(room_code)

            room_store.get_room(room_code)

            self.assertTrue(queue.empty())
            room_events.unsubscribe(room_code, queue)

        asyncio.run(run())

    def test_room_version_in_snapshot_matches_touched_version(self):
        """Инвариант: publish вызывается ПОСЛЕ инкремента, значит snapshot
        содержит новую версию, не старую."""

        async def run():
            host = room_store.create_room("Host")
            room_code = host["room"]["room_code"]
            before = host["room"]["room_version"]

            queue = room_events.subscribe(room_code)
            room_store.join_room(room_code, "Guest")

            snapshot = queue.get_nowait()
            self.assertGreater(snapshot["room_version"], before)

            room_events.unsubscribe(room_code, queue)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()

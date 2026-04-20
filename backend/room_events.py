"""Thin in-memory pub/sub for broadcasting room state snapshots to SSE subscribers.

Single-process uvicorn only. If we ever move to multi-worker, this module has to be
replaced with Redis pub/sub or similar — all logic keyed on ``room_code`` so the
migration is localized.

Design notes
------------
* One bounded ``asyncio.Queue`` per subscriber. If a subscriber can't keep up, we
  drop the oldest item (full-push model — the latest snapshot supersedes any
  stale one, so dropping is safe).
* ``publish`` is synchronous (called from ``_touch_room`` which runs under the
  sync ``rooms_lock``). It schedules the fan-out via ``queue.put_nowait`` so it
  never blocks mutation paths.
* Subscribers are tracked in a ``defaultdict[str, set]``. We use a set for O(1)
  unsubscribe on disconnect.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)

# Each subscriber queue only ever needs the *latest* snapshot — bound size and
# drop the oldest on overflow so slow clients can't accumulate memory.
_QUEUE_MAX_SIZE = 8

_subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)


def subscribe(room_code: str) -> asyncio.Queue[dict[str, Any]]:
    """Register a new subscriber for ``room_code`` and return its queue."""
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=_QUEUE_MAX_SIZE)
    _subscribers[room_code].add(queue)
    logger.debug(
        "sse subscribe: room=%s subscribers=%d",
        room_code,
        len(_subscribers[room_code]),
    )
    return queue


def unsubscribe(room_code: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
    """Remove ``queue`` from the subscriber set. Idempotent."""
    bucket = _subscribers.get(room_code)
    if bucket is None:
        return
    bucket.discard(queue)
    if not bucket:
        _subscribers.pop(room_code, None)
    logger.debug(
        "sse unsubscribe: room=%s remaining=%d",
        room_code,
        len(_subscribers.get(room_code, ())),
    )


def publish(room_code: str, payload: dict[str, Any]) -> None:
    """Fan-out ``payload`` to every live subscriber of ``room_code``.

    Called from synchronous code inside ``_touch_room``. Never blocks: if a
    subscriber queue is full we drop its oldest snapshot before enqueuing the
    new one (latest wins).
    """
    bucket = _subscribers.get(room_code)
    if not bucket:
        return

    for queue in tuple(bucket):
        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            # Drop oldest, retry — latest snapshot is what matters.
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                logger.warning(
                    "sse publish dropped (queue still full): room=%s", room_code
                )


def subscriber_count(room_code: str) -> int:
    """Return the number of live subscribers for ``room_code`` (test helper)."""
    return len(_subscribers.get(room_code, ()))


def reset_for_tests() -> None:
    """Drop every subscriber. Only for tests."""
    _subscribers.clear()

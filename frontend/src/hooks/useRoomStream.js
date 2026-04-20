import { useEffect, useRef } from "react";

import { API_BASE_URL } from "../apiConfig";

/**
 * Subscribes to the room's SSE channel (`GET /rooms/{roomCode}/stream`) and
 * dispatches callbacks on incoming snapshots. Replaces the legacy 2.5s polling
 * loop — mutations on the server now land in the UI within sub-second latency.
 *
 * Protocol (see backend/main.py:stream_room_endpoint):
 *   * On connect the server sends one `snapshot` event with the current room
 *     state. `onSnapshot` fires once immediately.
 *   * Every subsequent `_touch_room` on the server re-emits `snapshot` with
 *     the fresh payload.
 *   * If the room is deleted the backend closes the stream with HTTP 404 —
 *     we detect that via `readyState === CLOSED` inside `onerror` and call
 *     `onGone` so the caller can clear its session.
 *
 * Callbacks are stored in refs so that consumers don't have to memoize them —
 * the EventSource is created once per `roomCode` and never torn down on a
 * callback-identity change.
 */
export default function useRoomStream(roomCode, { onSnapshot, onGone } = {}) {
  const onSnapshotRef = useRef(onSnapshot);
  const onGoneRef = useRef(onGone);

  // Keep the latest callback references without retriggering the connect
  // effect — otherwise every parent rerender would tear down the stream.
  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);
  useEffect(() => {
    onGoneRef.current = onGone;
  }, [onGone]);

  useEffect(() => {
    if (!roomCode) {
      return undefined;
    }

    const url = `${API_BASE_URL}/rooms/${roomCode}/stream`;
    const eventSource = new EventSource(url);

    const handleSnapshot = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (error) {
        console.warn("useRoomStream: failed to parse snapshot payload", error);
        return;
      }
      onSnapshotRef.current?.(payload);
    };

    const handleError = () => {
      // Browsers report non-2xx responses (like 404 "room not found") by
      // transitioning readyState to CLOSED *without* attempting a reconnect.
      // Transient network errors stay in CONNECTING and will retry on their
      // own — we don't touch those.
      if (eventSource.readyState === EventSource.CLOSED) {
        onGoneRef.current?.();
      }
    };

    eventSource.addEventListener("snapshot", handleSnapshot);
    eventSource.addEventListener("error", handleError);

    return () => {
      eventSource.removeEventListener("snapshot", handleSnapshot);
      eventSource.removeEventListener("error", handleError);
      eventSource.close();
    };
  }, [roomCode]);
}

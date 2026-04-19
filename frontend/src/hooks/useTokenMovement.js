import { useEffect, useMemo, useRef, useState } from "react";
import { buildTokenMovementPath } from "../components/boardHelpers";

const TOKEN_MOVE_STEP_MS = 340;
const TOKEN_MOVE_FINISH_BUFFER_MS = 90;

export function useTokenMovement({ currentRoom, currentRoomCode, playerPositions }) {
  const [movingTokenEffects, setMovingTokenEffects] = useState({});
  const previousPositionsRef = useRef({});
  const tokenMovementTimeoutsRef = useRef({});

  function clearTokenMovementTimers(targetPlayerId = null) {
    if (targetPlayerId) {
      for (const timeoutId of tokenMovementTimeoutsRef.current[targetPlayerId] ?? []) {
        window.clearTimeout(timeoutId);
      }
      delete tokenMovementTimeoutsRef.current[targetPlayerId];
      return;
    }

    for (const timeoutIds of Object.values(tokenMovementTimeoutsRef.current)) {
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
    }

    tokenMovementTimeoutsRef.current = {};
  }

  useEffect(() => {
    previousPositionsRef.current = {};
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMovingTokenEffects({});
    clearTokenMovementTimers();
  }, [currentRoomCode]);

  useEffect(() => {
    if (!currentRoomCode || !currentRoom) {
      return;
    }

    const nextKnownPositions = {};
    const nextMovementEffects = [];

    for (const player of currentRoom.players) {
      const nextPosition = playerPositions?.[player.player_id];

      if (!Number.isInteger(nextPosition)) {
        continue;
      }

      nextKnownPositions[player.player_id] = nextPosition;

      const previousPosition = previousPositionsRef.current[player.player_id];
      if (Number.isInteger(previousPosition) && previousPosition !== nextPosition) {
        const rollTotal = (currentRoom.game?.turn?.last_roll ?? []).reduce(
          (sum, value) => sum + value,
          0,
        );
        const movementPath = buildTokenMovementPath(previousPosition, nextPosition, rollTotal);

        if (movementPath.length === 0) {
          continue;
        }

        nextMovementEffects.push({
          animationId: Date.now() + Math.random(),
          playerId: player.player_id,
          path: [previousPosition, ...movementPath],
          stepDurationMs: TOKEN_MOVE_STEP_MS,
        });
      }
    }

    previousPositionsRef.current = nextKnownPositions;

    if (nextMovementEffects.length === 0) {
      return;
    }

    for (const movementEffect of nextMovementEffects) {
      clearTokenMovementTimers(movementEffect.playerId);

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMovingTokenEffects((current) => ({
        ...current,
        [movementEffect.playerId]: movementEffect,
      }));

      const cleanupTimeoutId = window.setTimeout(() => {
        setMovingTokenEffects((current) => {
          if (!current[movementEffect.playerId]) {
            return current;
          }

          const next = { ...current };
          delete next[movementEffect.playerId];
          return next;
        });

        clearTokenMovementTimers(movementEffect.playerId);
      }, (movementEffect.path.length - 1) * TOKEN_MOVE_STEP_MS + TOKEN_MOVE_FINISH_BUFFER_MS);

      tokenMovementTimeoutsRef.current[movementEffect.playerId] = [cleanupTimeoutId];
    }
  }, [currentRoomCode, currentRoom, playerPositions]);

  useEffect(() => {
    return () => {
      clearTokenMovementTimers();
    };
  }, []);

  const movedCellIndexSet = useMemo(
    () =>
      new Set(
        Object.values(movingTokenEffects)
          .map((effect) => effect.path?.[effect.path.length - 1])
          .filter((position) => Number.isInteger(position)),
      ),
    [movingTokenEffects],
  );
  const movingPlayerIds = useMemo(
    () => Object.keys(movingTokenEffects),
    [movingTokenEffects],
  );

  const renderedPlayerPositions = playerPositions ?? {};

  return { movingPlayerIds, movingTokenEffects, movedCellIndexSet, renderedPlayerPositions };
}

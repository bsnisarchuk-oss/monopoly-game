import { useEffect, useRef, useState } from "react";
import { buildTokenMovementPath } from "../components/boardHelpers";

const TOKEN_MOVE_STEP_MS = 280;
const TOKEN_MOVE_FINISH_BUFFER_MS = 60;

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
          playerId: player.player_id,
          fromPosition: previousPosition,
          path: movementPath,
        });
      }
    }

    previousPositionsRef.current = nextKnownPositions;

    if (nextMovementEffects.length === 0) {
      return;
    }

    for (const movementEffect of nextMovementEffects) {
      clearTokenMovementTimers(movementEffect.playerId);

      const timeoutIds = [];
      const firstStepPosition = movementEffect.path[0];

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMovingTokenEffects((current) => ({
        ...current,
        [movementEffect.playerId]: {
          animationId: 1,
          displayPosition: firstStepPosition,
          fromPosition: movementEffect.fromPosition,
          toPosition: firstStepPosition,
        },
      }));

      movementEffect.path.slice(1).forEach((stepPosition, pathIndex) => {
        const stepFromPosition = movementEffect.path[pathIndex];
        const timeoutId = window.setTimeout(() => {
          setMovingTokenEffects((current) => ({
            ...current,
            [movementEffect.playerId]: {
              animationId: pathIndex + 2,
              displayPosition: stepPosition,
              fromPosition: stepFromPosition,
              toPosition: stepPosition,
            },
          }));
        }, (pathIndex + 1) * TOKEN_MOVE_STEP_MS);

        timeoutIds.push(timeoutId);
      });

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
      }, movementEffect.path.length * TOKEN_MOVE_STEP_MS + TOKEN_MOVE_FINISH_BUFFER_MS);

      timeoutIds.push(cleanupTimeoutId);
      tokenMovementTimeoutsRef.current[movementEffect.playerId] = timeoutIds;
    }
  }, [currentRoomCode, currentRoom, playerPositions]);

  useEffect(() => {
    return () => {
      clearTokenMovementTimers();
    };
  }, []);

  const movedCellIndexSet = new Set(
    Object.values(movingTokenEffects)
      .map((effect) => effect.toPosition)
      .filter((position) => Number.isInteger(position)),
  );

  const renderedPlayerPositions =
    currentRoom?.players.reduce((acc, player) => {
      const animatedPosition = movingTokenEffects[player.player_id]?.displayPosition;
      const actualPosition = playerPositions?.[player.player_id];

      if (Number.isInteger(animatedPosition)) {
        acc[player.player_id] = animatedPosition;
      } else if (Number.isInteger(actualPosition)) {
        acc[player.player_id] = actualPosition;
      }

      return acc;
    }, {}) ?? {};

  return { movingTokenEffects, movedCellIndexSet, renderedPlayerPositions };
}

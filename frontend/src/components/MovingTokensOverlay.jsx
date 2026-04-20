import { memo, useLayoutEffect, useRef, useState } from "react";
import PlayerToken from "./PlayerToken";

const TOKEN_HOP_HEIGHT_PX = 9;
const TOKEN_HOP_SCALE = 1.06;

function buildOverlayTransform(x, y, scale = 1) {
  return `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;
}

function getCellCenter({ position, boardRect, boardCellRefs }) {
  const cellElement = boardCellRefs?.current?.[position];

  if (!cellElement) {
    return null;
  }

  const rect = cellElement.getBoundingClientRect();
  return {
    x: rect.left - boardRect.left + rect.width / 2,
    y: rect.top - boardRect.top + rect.height / 2,
  };
}

function buildOverlayAnimationKeyframes(points) {
  if (points.length < 2) {
    return [];
  }

  const segmentCount = points.length - 1;
  const keyframes = [
    {
      offset: 0,
      transform: buildOverlayTransform(points[0].x, points[0].y),
    },
  ];

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const fromPoint = points[segmentIndex];
    const toPoint = points[segmentIndex + 1];
    const segmentStartOffset = segmentIndex / segmentCount;
    const segmentEndOffset = (segmentIndex + 1) / segmentCount;
    const midOffset = segmentStartOffset + (segmentEndOffset - segmentStartOffset) * 0.58;
    const midX = fromPoint.x + (toPoint.x - fromPoint.x) * 0.5;
    const midY = fromPoint.y + (toPoint.y - fromPoint.y) * 0.5 - TOKEN_HOP_HEIGHT_PX;

    keyframes.push({
      offset: midOffset,
      transform: buildOverlayTransform(midX, midY, TOKEN_HOP_SCALE),
    });
    keyframes.push({
      offset: segmentEndOffset,
      transform: buildOverlayTransform(toPoint.x, toPoint.y),
    });
  }

  return keyframes;
}

function MovingTokensOverlay({
  boardRef,
  boardCellRefs,
  players = [],
  movingTokenEffects = {},
  getPlayerColor,
}) {
  const [measuredTokens, setMeasuredTokens] = useState([]);
  const lastMeasurementSignatureRef = useRef("");

  // DOM-измерение через useLayoutEffect + setState — идиоматический паттерн для
  // расчёта абсолютных координат клеток доски. Сигнатура гарантирует,
  // что setState вызывается только при реальной смене активных анимаций, так что
  // cascading render ограничен одним проходом на анимацию.
  useLayoutEffect(() => {
    const movingEntries = Object.entries(movingTokenEffects ?? {});
    const measurementSignature = movingEntries
      .map(([playerId, effect]) => `${playerId}:${effect?.animationId ?? "pending"}`)
      .join("|");

    if (measurementSignature === lastMeasurementSignatureRef.current) {
      return;
    }

    lastMeasurementSignatureRef.current = measurementSignature;

    if (!measurementSignature || !boardRef?.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMeasuredTokens([]);
      return;
    }

    const playerById = {};
    for (const player of players) {
      playerById[player.player_id] = player;
    }

    const boardRect = boardRef.current.getBoundingClientRect();
    const nextMeasuredTokens = movingEntries
      .map(([playerId, effect], overlayIndex) => {
        const player = playerById[playerId] ?? null;
        const path = effect?.path ?? [];

        if (!player || path.length < 2) {
          return null;
        }

        const points = path
          .map((position) => getCellCenter({ position, boardRect, boardCellRefs }))
          .filter(Boolean);

        if (points.length < 2) {
          return null;
        }

        return {
          animationId: effect.animationId,
          player,
          playerId,
          overlayIndex,
          tokenColor: getPlayerColor(player.player_id, overlayIndex),
          startPosition: points[0],
          animationKeyframes: buildOverlayAnimationKeyframes(points),
          animationDurationMs: (points.length - 1) * effect.stepDurationMs,
        };
      })
      .filter(Boolean);

    setMeasuredTokens(nextMeasuredTokens);
  }, [boardCellRefs, boardRef, getPlayerColor, movingTokenEffects, players]);

  if (measuredTokens.length === 0) {
    return null;
  }

  return (
    <div className="moving-tokens-overlay" aria-hidden="true">
      {measuredTokens.map((token) => {
        return (
          <PlayerToken
            key={`${token.playerId}:${token.animationId}`}
            player={token.player}
            occupantIndex={token.overlayIndex}
            tokenColor={token.tokenColor}
            overlayPosition={token.startPosition}
            overlayScale={1}
            overlayAnimationId={token.animationId}
            overlayAnimationKeyframes={token.animationKeyframes}
            overlayAnimationDurationMs={token.animationDurationMs}
            isOverlay
          />
        );
      })}
    </div>
  );
}

// React.memo с дефолтным shallow-сравнением: все props стабильны после Step D/1
// (boardRef/boardCellRefs — refs; players — стабильно через короткое замыкание
// room_version; movingTokenEffects — меняется только на старте/конце анимации;
// getPlayerColor — useCallback). Memo предотвращает сброс useLayoutEffect и
// перезапуск WAAPI-анимации при ребилдах родителя, не связанных с движением.
export default memo(MovingTokensOverlay);

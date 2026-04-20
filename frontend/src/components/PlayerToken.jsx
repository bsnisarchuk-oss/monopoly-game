import { memo, useLayoutEffect, useRef } from "react";

function PlayerToken({
  player,
  occupantIndex,
  tokenColor,
  overlayPosition = null,
  overlayScale = 1,
  overlayAnimationId = null,
  overlayAnimationKeyframes = null,
  overlayAnimationDurationMs = 0,
  isOverlay = false,
  isActiveTurn = false,
  isMoving = false,
}) {
  const tokenRef = useRef(null);
  const shouldPulseActiveTurn = isActiveTurn && !isOverlay;

  useLayoutEffect(() => {
    const element = tokenRef.current;

    if (
      !element ||
      !isOverlay ||
      !overlayAnimationId ||
      !Array.isArray(overlayAnimationKeyframes) ||
      overlayAnimationKeyframes.length === 0 ||
      overlayAnimationDurationMs <= 0 ||
      typeof element.animate !== "function"
    ) {
      return undefined;
    }

    const animation = element.animate(overlayAnimationKeyframes, {
      duration: overlayAnimationDurationMs,
      easing: "ease-in-out",
      fill: "both",
    });

    return () => {
      animation.cancel();
    };
  }, [
    isOverlay,
    overlayAnimationDurationMs,
    overlayAnimationId,
    overlayAnimationKeyframes,
  ]);

  return (
    <div
      ref={tokenRef}
      className={`player-token ${shouldPulseActiveTurn ? "is-active-turn" : ""} ${
        isMoving ? "is-moving" : ""
      } ${isOverlay ? "is-overlay" : ""}`}
      style={{
        "--player-token-color": tokenColor,
        ...(overlayPosition
          ? {
              "--player-token-overlay-x": `${overlayPosition.x}px`,
              "--player-token-overlay-y": `${overlayPosition.y}px`,
              "--player-token-overlay-scale": overlayScale,
            }
          : {}),
        zIndex: (occupantIndex + 1) + (isMoving ? 20 : 0),
      }}
      title={player.nickname}
      aria-label={`${player.nickname} token${isMoving ? " just moved" : ""}`}
    />
  );
}

// React.memo с дефолтным shallow-сравнением: для НЕ-overlay токенов (на клетках)
// все props — примитивы или стабильные ссылки (player из currentRoom стабилен после
// Step D/1 short-circuit, tokenColor — строка, isActiveTurn — bool). Это убирает
// массовый ребилд всех токенов на каждой реконсиляции родителя.
// Для overlay-токенов overlayPosition/overlayAnimationKeyframes — новые объекты при
// каждом measure, но measure происходит только при смене animationId, поэтому memo
// не вредит и в overlay-режиме.
export default memo(PlayerToken);

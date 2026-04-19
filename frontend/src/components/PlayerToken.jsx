import { useLayoutEffect, useRef } from "react";

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
      easing: "linear",
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

export default PlayerToken;

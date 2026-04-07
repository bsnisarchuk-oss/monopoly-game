function PlayerToken({
  player,
  occupantIndex,
  tokenColor,
  movementOffset = null,
  isActiveTurn = false,
  isMoving = false,
}) {
  return (
    <div
      className={`player-token ${isActiveTurn ? "is-active-turn" : ""} ${isMoving ? "is-moving" : ""}`}
      style={{
        "--player-token-color": tokenColor,
        ...(movementOffset
          ? {
              "--token-move-from-x": `${movementOffset.x}px`,
              "--token-move-from-y": `${movementOffset.y}px`,
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

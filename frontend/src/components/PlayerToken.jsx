import { getPlayerTokenLabel } from "./utils";

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
        zIndex: Math.max(1, 8 - occupantIndex) + (isMoving ? 20 : 0),
      }}
      title={player.nickname}
      aria-label={`${player.nickname} token${isMoving ? " just moved" : ""}`}
    >
      {getPlayerTokenLabel(player.nickname)}
    </div>
  );
}

export default PlayerToken;

const TOKEN_MOVE_MAX_OFFSET_PX = 26;

export function getBoardPlacement(index) {
  if (index >= 0 && index <= 10) {
    return { row: 11, column: 11 - index };
  }

  if (index >= 11 && index <= 20) {
    return { row: 11 - (index - 10), column: 1 };
  }

  if (index >= 21 && index <= 30) {
    return { row: 1, column: index - 19 };
  }

  return { row: index - 29, column: 11 };
}

export function getBoardSide(index) {
  if (index === 0 || index === 10 || index === 20 || index === 30) {
    return "corner";
  }

  if (index > 0 && index < 10) {
    return "bottom";
  }

  if (index > 10 && index < 20) {
    return "left";
  }

  if (index > 20 && index < 30) {
    return "top";
  }

  return "right";
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getTokenMovementOffset(fromPosition, toPosition) {
  if (
    !Number.isInteger(fromPosition) ||
    !Number.isInteger(toPosition) ||
    fromPosition === toPosition
  ) {
    return { x: 0, y: 0 };
  }

  const fromPlacement = getBoardPlacement(fromPosition);
  const toPlacement = getBoardPlacement(toPosition);

  return {
    x: clampNumber(
      (fromPlacement.column - toPlacement.column) * 10,
      -TOKEN_MOVE_MAX_OFFSET_PX,
      TOKEN_MOVE_MAX_OFFSET_PX,
    ),
    y: clampNumber(
      (fromPlacement.row - toPlacement.row) * 10,
      -TOKEN_MOVE_MAX_OFFSET_PX,
      TOKEN_MOVE_MAX_OFFSET_PX,
    ),
  };
}

export function splitJailOccupants(players, inJailByPlayerId) {
  const jailPlayers = [];
  const visitingPlayers = [];

  for (const player of players) {
    if (inJailByPlayerId?.[player.player_id]) {
      jailPlayers.push(player);
    } else {
      visitingPlayers.push(player);
    }
  }

  return { jailPlayers, visitingPlayers };
}

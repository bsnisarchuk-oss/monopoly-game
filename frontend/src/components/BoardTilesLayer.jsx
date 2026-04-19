import { memo, useMemo } from "react";
import BoardCellTile from "./BoardCellTile";
import { getBoardPlacement, getBoardSide, splitJailOccupants } from "./boardHelpers";
import { hexToRgba } from "./utils";

const EMPTY_OCCUPANTS = [];

function BoardTilesLayer({
  boardCells = [],
  players = [],
  playerPositions = {},
  hiddenPlayerIds = [],
  inJailByPlayer = {},
  jailPosition = 10,
  propertyOwners = {},
  propertyMortgaged = {},
  propertyLevels = {},
  lastLandedCellIndex = null,
  focusedEventCellIndex = null,
  movedCellIndexSet,
  currentPlayerId = null,
  getPlayerColor,
  registerBoardCellRef,
  onFocusCell,
  renderPlayerToken,
}) {
  const hiddenPlayerIdSet = useMemo(() => new Set(hiddenPlayerIds), [hiddenPlayerIds]);
  const playerById = useMemo(() => {
    const nextPlayerById = {};

    for (const player of players) {
      nextPlayerById[player.player_id] = player;
    }

    return nextPlayerById;
  }, [players]);
  const occupantsByCellIndex = useMemo(() => {
    const nextOccupantsByCellIndex = {};

    for (const player of players) {
      if (hiddenPlayerIdSet.has(player.player_id)) {
        continue;
      }

      const playerPosition = playerPositions?.[player.player_id];

      if (!Number.isInteger(playerPosition)) {
        continue;
      }

      if (!nextOccupantsByCellIndex[playerPosition]) {
        nextOccupantsByCellIndex[playerPosition] = [];
      }

      nextOccupantsByCellIndex[playerPosition].push(player);
    }

    return nextOccupantsByCellIndex;
  }, [hiddenPlayerIdSet, playerPositions, players]);

  return boardCells.map((cell) => {
    const occupants = occupantsByCellIndex[cell.index] ?? EMPTY_OCCUPANTS;
    const isJailCell = cell.index === jailPosition;
    const { jailPlayers, visitingPlayers } = isJailCell
      ? splitJailOccupants(occupants, inJailByPlayer)
      : { jailPlayers: [], visitingPlayers: occupants };
    const { row, column } = getBoardPlacement(cell.index);
    const boardSide = getBoardSide(cell.index);
    const groupClass = cell.color_group ? `cell-group-${cell.color_group}` : "";
    const ownerPlayerId = propertyOwners[cell.index] ?? null;
    const ownerPlayer = ownerPlayerId ? playerById[ownerPlayerId] ?? null : null;
    const ownerColor = ownerPlayer ? getPlayerColor(ownerPlayer.player_id) : null;
    const ownerTint = ownerColor ? hexToRgba(ownerColor, 0.55) : null;
    const ownerTintStrong = ownerColor ? hexToRgba(ownerColor, 0.72) : null;
    const ownerShadow = ownerColor ? hexToRgba(ownerColor, 0.45) : null;

    return (
      <BoardCellTile
        key={cell.index}
        cell={cell}
        boardSide={boardSide}
        row={row}
        column={column}
        groupClass={groupClass}
        isLanded={lastLandedCellIndex === cell.index}
        isFocused={focusedEventCellIndex === cell.index}
        isMoveTarget={movedCellIndexSet.has(cell.index)}
        isOwnedByYou={ownerPlayer?.player_id === currentPlayerId}
        ownerPlayer={ownerPlayer}
        ownerColor={ownerColor}
        ownerTint={ownerTint}
        ownerTintStrong={ownerTintStrong}
        ownerShadow={ownerShadow}
        isMortgaged={propertyMortgaged[cell.index]}
        propertyLevel={propertyLevels[cell.index] ?? 0}
        isJailCell={isJailCell}
        visitingPlayers={visitingPlayers}
        jailPlayers={jailPlayers}
        occupants={occupants}
        registerBoardCellRef={registerBoardCellRef}
        onFocusCell={onFocusCell}
        renderPlayerToken={renderPlayerToken}
      />
    );
  });
}

export default memo(BoardTilesLayer);

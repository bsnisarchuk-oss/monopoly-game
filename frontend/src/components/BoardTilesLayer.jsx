import BoardCellTile from "./BoardCellTile";
import { getBoardPlacement, getBoardSide, splitJailOccupants } from "./boardHelpers";
import { hexToRgba } from "./utils";

function BoardTilesLayer({
  boardCells = [],
  players = [],
  playerPositions = {},
  inJailByPlayer = {},
  jailPosition = 10,
  propertyOwners = {},
  propertyMortgaged = {},
  propertyLevels = {},
  lastLandedCellIndex = null,
  focusedEventCellIndex = null,
  movedCellIndexSet,
  currentPlayerId = null,
  getPlayerById,
  getPlayerColor,
  onTileRef,
  onFocusCell,
  renderPlayerToken,
}) {
  return boardCells.map((cell) => {
    const occupants = players.filter((player) => {
      const playerPosition = playerPositions?.[player.player_id];
      return Number.isInteger(playerPosition) && playerPosition === cell.index;
    });
    const isJailCell = cell.index === jailPosition;
    const { jailPlayers, visitingPlayers } = isJailCell
      ? splitJailOccupants(occupants, inJailByPlayer)
      : { jailPlayers: [], visitingPlayers: occupants };
    const { row, column } = getBoardPlacement(cell.index);
    const boardSide = getBoardSide(cell.index);
    const groupClass = cell.color_group ? `cell-group-${cell.color_group}` : "";
    const ownerPlayerId = propertyOwners[cell.index] ?? null;
    const ownerPlayer = ownerPlayerId ? getPlayerById(ownerPlayerId) : null;
    const ownerColor = ownerPlayer ? getPlayerColor(ownerPlayer.player_id) : null;
    const ownerTint = ownerColor ? hexToRgba(ownerColor, 0.55) : null;
    const ownerTintStrong = ownerColor ? hexToRgba(ownerColor, 0.72) : null;
    const ownerShadow = ownerColor ? hexToRgba(ownerColor, 0.45) : null;

    return (
      <BoardCellTile
        key={cell.index}
        cell={cell}
        boardSide={boardSide}
        groupClass={groupClass}
        isLanded={lastLandedCellIndex === cell.index}
        isFocused={focusedEventCellIndex === cell.index}
        isMoveTarget={movedCellIndexSet.has(cell.index)}
        isOwnedByYou={ownerPlayer?.player_id === currentPlayerId}
        ownerPlayer={ownerPlayer}
        tileStyle={{
          gridRow: row,
          gridColumn: column,
          ...(ownerColor
            ? {
                "--cell-owner-color": ownerColor,
                "--cell-owner-tint": ownerTint,
                "--cell-owner-tint-strong": ownerTintStrong,
                "--cell-owner-shadow": ownerShadow,
              }
            : {}),
        }}
        isMortgaged={propertyMortgaged[cell.index]}
        propertyLevel={propertyLevels[cell.index] ?? 0}
        isJailCell={isJailCell}
        visitingPlayers={visitingPlayers}
        jailPlayers={jailPlayers}
        occupants={occupants}
        tileRef={(element) => onTileRef(cell.index, element)}
        onFocus={() => onFocusCell(cell)}
        renderPlayerToken={renderPlayerToken}
      />
    );
  });
}

export default BoardTilesLayer;

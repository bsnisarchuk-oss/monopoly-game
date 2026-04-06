import BoardCellTile from "./BoardCellTile";
import { getBoardPlacement, getBoardSide, splitJailOccupants } from "./boardHelpers";
import { formatLinkedEventLabel } from "./recentEventsHelpers";

function BoardTilesLayer({
  boardCells = [],
  players = [],
  playerPositions = {},
  inJailByPlayer = {},
  jailPosition = 10,
  cellRecentEventCounts = {},
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
    const linkedEventCount = cellRecentEventCounts[cell.index] ?? 0;
    const linkedEventLabel = formatLinkedEventLabel(linkedEventCount, cell.name);
    const ownerPlayerId = propertyOwners[cell.index] ?? null;
    const ownerPlayer = ownerPlayerId ? getPlayerById(ownerPlayerId) : null;
    const ownerColor = ownerPlayer ? getPlayerColor(ownerPlayer.player_id) : null;

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
        linkedEventCount={linkedEventCount}
        linkedEventLabel={linkedEventLabel}
        ownerPlayer={ownerPlayer}
        tileStyle={{
          gridRow: row,
          gridColumn: column,
          ...(ownerColor ? { "--cell-owner-color": ownerColor } : {}),
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

import { memo } from "react";
import BoardPlayerCard from "./BoardPlayerCard";
import { formatLinkedEventLabel } from "./recentEventsHelpers";

function BoardPlayersGrid({
  players = [],
  playerRecentEventCounts = {},
  selectedTradeTargetId = "",
  currentTurnPlayerId = null,
  inJailByPlayer = {},
  currentPlayerId = null,
  cashByPlayer = {},
  focusedPlayerIdSet,
  propertyLevels = {},
  getPlayerPosition,
  getPlayerCell,
  getRentHint,
  getPlayerColor,
  getOwnedCellsByPlayer,
  getMortgagedOwnedCellCount,
  onFocusPlayer,
  registerPlayerCardRef,
}) {
  return (
    <section className="board-grid">
      {players.map((player) => {
        const linkedEventCount = playerRecentEventCounts[player.player_id] ?? 0;
        const linkedEventLabel = formatLinkedEventLabel(linkedEventCount, player.nickname);
        const playerPosition = getPlayerPosition(player.player_id);
        const playerCell = getPlayerCell(player.player_id);
        const playerLevel = propertyLevels[playerPosition] ?? 0;
        const playerRentHint = getRentHint(playerCell, playerLevel);
        const playerOwnedCellCount = getOwnedCellsByPlayer(player.player_id).length;
        const playerMortgagedCellCount = getMortgagedOwnedCellCount(player.player_id);
        const playerColor = getPlayerColor(player.player_id);
        const isTradeTargetReady = selectedTradeTargetId === player.player_id;
        const statusLabel =
          currentTurnPlayerId === player.player_id
            ? "Their turn"
            : inJailByPlayer?.[player.player_id]
              ? "In jail"
              : "Waiting";

        return (
          <BoardPlayerCard
            key={player.player_id}
            player={player}
            isYou={player.player_id === currentPlayerId}
            isFocused={focusedPlayerIdSet.has(player.player_id)}
            isTradeTarget={isTradeTargetReady}
            isCurrentTurn={currentTurnPlayerId === player.player_id}
            linkedEventCount={linkedEventCount}
            linkedEventLabel={linkedEventLabel}
            playerCellName={playerCell?.name ?? `Cell ${playerPosition}`}
            showUpgradeLevel={playerCell?.cell_type === "property"}
            playerLevel={playerLevel}
            playerRentHint={playerRentHint}
            cash={cashByPlayer[player.player_id] ?? 0}
            ownedCellCount={playerOwnedCellCount}
            mortgagedCellCount={playerMortgagedCellCount}
            playerColor={playerColor}
            statusLabel={statusLabel}
            onFocusPlayer={onFocusPlayer}
            registerPlayerCardRef={registerPlayerCardRef}
          />
        );
      })}
    </section>
  );
}

export default memo(BoardPlayersGrid);

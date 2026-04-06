function SelectedPlayerInspector({
  player,
  currentPlayerId,
  playerColor = null,
  isCurrentTurn = false,
  cash = 0,
  position = 0,
  cell = null,
  isPendingBankruptcy = false,
  isInJail = false,
  turnsInJail = 0,
  ownedCells = [],
  ownedCellsPreview = [],
  mortgagedCellCount = 0,
  linkedEventCount = 0,
  canBeTradeTarget = false,
  isSelectedTradeTarget = false,
  tradeMessage = null,
  debtMessage = null,
  isSubmitting = false,
  onClear,
  onSelectTradeTarget,
}) {
  const isYou = player.player_id === currentPlayerId;
  const statusLabel = isPendingBankruptcy
    ? "In debt"
    : isInJail
      ? "In jail"
      : isCurrentTurn
        ? "Current turn"
        : "Waiting";

  return (
    <section
      className="game-summary player-inspector board-center-section"
      style={playerColor ? { "--player-inspector-color": playerColor } : undefined}
    >
      <div className="cell-inspector-header">
        <div>
          <h3>Selected player</h3>
          <p className="cell-inspector-title">
            <strong>
              {player.nickname}
              {isYou ? " (you)" : ""}
            </strong>
          </p>
        </div>
        <button
          type="button"
          className="recent-events-clear-focus"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <p className="cell-inspector-description">
        {isCurrentTurn
          ? "This player is taking the current turn."
          : "This player is waiting for their next turn."}
      </p>
      <div className="cell-inspector-meta">
        <article className="cell-inspector-stat">
          <span>Cash</span>
          <strong>${cash}</strong>
        </article>
        <article className="cell-inspector-stat">
          <span>Position</span>
          <strong>
            Cell {position}
            {cell ? ` - ${cell.name}` : ""}
          </strong>
        </article>
        <article className="cell-inspector-stat">
          <span>Status</span>
          <strong>{statusLabel}</strong>
        </article>
        <article className="cell-inspector-stat">
          <span>Owned cells</span>
          <strong>{ownedCells.length}</strong>
        </article>
        <article className="cell-inspector-stat">
          <span>Mortgaged cells</span>
          <strong>{mortgagedCellCount}</strong>
        </article>
        {linkedEventCount > 0 && (
          <article className="cell-inspector-stat">
            <span>Recent events</span>
            <strong>{linkedEventCount}</strong>
          </article>
        )}
      </div>
      {canBeTradeTarget && (
        <div className="cell-inspector-actions">
          <button
            type="button"
            className="trade-button accept-button"
            onClick={onSelectTradeTarget}
            disabled={isSubmitting}
          >
            {isSelectedTradeTarget ? "Selected for trade" : "Select for trade"}
          </button>
        </div>
      )}
      {tradeMessage && <p className="cell-inspector-helper">{tradeMessage}</p>}
      {isInJail && (
        <p className="cell-inspector-note">
          In jail &mdash; turn <strong>{turnsInJail}/3</strong>.{" "}
          {turnsInJail >= 2
            ? "Next failed roll forces the fine and movement."
            : "They can roll doubles to leave or pay before rolling."}
        </p>
      )}
      {debtMessage && <p className="cell-inspector-note">{debtMessage}</p>}
      {ownedCellsPreview.length > 0 && (
        <p className="cell-inspector-note">
          Properties:{" "}
          <strong>
            {ownedCellsPreview.map((ownedCell) => ownedCell.name).join(", ")}
            {ownedCells.length > ownedCellsPreview.length
              ? ` +${ownedCells.length - ownedCellsPreview.length} more`
              : ""}
          </strong>
        </p>
      )}
    </section>
  );
}

export default SelectedPlayerInspector;

import { formatLinkedEventCount } from "./recentEventsHelpers";

function BoardPlayerCard({
  player,
  isYou = false,
  isFocused = false,
  isTradeTarget = false,
  isCurrentTurn = false,
  linkedEventCount = 0,
  linkedEventLabel,
  playerCellName,
  showUpgradeLevel = false,
  playerLevel = 0,
  playerRentHint = null,
  cash = 0,
  ownedCellCount = 0,
  mortgagedCellCount = 0,
  statusLabel,
  onFocus,
  cardRef,
}) {
  return (
    <article
      ref={cardRef}
      className={`board-card ${isYou ? "is-you" : ""} ${isFocused ? "is-focused" : ""} ${
        isTradeTarget ? "is-trade-target" : ""
      } ${isCurrentTurn ? "is-current-turn" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onFocus}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onFocus();
        }
      }}
    >
      <div className="board-card-header">
        <h3>{player.nickname}</h3>
        <div className="board-card-badges">
          {isTradeTarget && (
            <span className="board-card-target-badge">Trade target</span>
          )}
          {linkedEventCount > 0 && (
            <span
              className="board-card-event-count"
              title={linkedEventLabel}
              aria-label={linkedEventLabel}
            >
              {formatLinkedEventCount(linkedEventCount)}
            </span>
          )}
        </div>
      </div>
      <p>
        On: <strong>{playerCellName}</strong>
      </p>
      {showUpgradeLevel && (
        <p>
          Upgrade level: <strong>{playerLevel}</strong>
        </p>
      )}
      {playerRentHint && (
        <p><strong>{playerRentHint}</strong></p>
      )}
      <p>
        Cash: <strong>${cash}</strong>
      </p>
      <p>
        Owned cells: <strong>{ownedCellCount}</strong>
      </p>
      <p>
        Mortgaged cells: <strong>{mortgagedCellCount}</strong>
      </p>
      <p>
        Status: <strong>{statusLabel}</strong>
      </p>
    </article>
  );
}

export default BoardPlayerCard;

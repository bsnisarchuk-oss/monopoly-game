import { memo, useCallback, useMemo } from "react";
import { formatLinkedEventCount } from "./recentEventsHelpers";
import { getPlayerTokenLabel, hexToRgba } from "./utils";

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
  playerColor = null,
  statusLabel,
  onFocusPlayer,
  registerPlayerCardRef,
}) {
  const statusToneClass = isCurrentTurn
    ? "is-active"
    : statusLabel === "In jail"
      ? "is-warning"
      : "is-neutral";
  const playerCardStyle = useMemo(
    () =>
      playerColor
        ? {
            "--player-card-accent": playerColor,
            "--player-card-accent-soft": hexToRgba(playerColor, 0.2),
            "--player-card-accent-strong": hexToRgba(playerColor, 0.34),
          }
        : undefined,
    [playerColor],
  );
  const handleCardRef = useCallback(
    (element) => {
      registerPlayerCardRef?.(player.player_id, element);
    },
    [player.player_id, registerPlayerCardRef],
  );
  const handleFocus = useCallback(() => {
    onFocusPlayer?.(player);
  }, [onFocusPlayer, player]);
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleFocus();
      }
    },
    [handleFocus],
  );

  return (
    <article
      ref={handleCardRef}
      className={`board-card ${isYou ? "is-you" : ""} ${isFocused ? "is-focused" : ""} ${
        isTradeTarget ? "is-trade-target" : ""
      } ${isCurrentTurn ? "is-current-turn" : ""}`}
      style={playerCardStyle}
      role="button"
      tabIndex={0}
      onClick={handleFocus}
      onKeyDown={handleKeyDown}
    >
      <div className="board-card-topline">
        <div className="board-card-avatar" aria-hidden="true">
          {getPlayerTokenLabel(player.nickname)}
        </div>
        <div className="board-card-identity">
          <p className="board-card-kicker">{isYou ? "You" : "Player"}</p>
          <h3>{player.nickname}</h3>
        </div>
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
      <p className="board-card-cash">${cash}</p>
      <div className="board-card-stats">
        <p>
          On <strong>{playerCellName}</strong>
        </p>
        {showUpgradeLevel && (
          <p>
            Upgrade level <strong>{playerLevel}</strong>
          </p>
        )}
        {playerRentHint && <p>{playerRentHint}</p>}
        <p>
          Owned <strong>{ownedCellCount}</strong> &middot; Mortgaged{" "}
          <strong>{mortgagedCellCount}</strong>
        </p>
      </div>
      <div className="board-card-footer">
        <span className={`board-card-status-pill ${statusToneClass}`}>{statusLabel}</span>
        <span className="board-card-focus-hint">Press Enter to inspect</span>
      </div>
    </article>
  );
}

export default memo(BoardPlayerCard);

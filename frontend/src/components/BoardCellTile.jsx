import { formatLinkedEventCount } from "./recentEventsHelpers";
import { getPlayerTokenLabel } from "./utils";

function BoardCellTile({
  cell,
  boardSide,
  groupClass = "",
  isLanded = false,
  isFocused = false,
  isMoveTarget = false,
  isOwnedByYou = false,
  linkedEventCount = 0,
  linkedEventLabel,
  ownerPlayer = null,
  tileStyle,
  isMortgaged = false,
  propertyLevel = 0,
  isJailCell = false,
  visitingPlayers = [],
  jailPlayers = [],
  occupants = [],
  tileRef,
  onFocus,
  renderPlayerToken,
}) {
  return (
    <article
      ref={tileRef}
      className={`cell-tile cell-side-${boardSide} ${groupClass} ${
        isLanded ? "is-landed" : ""
      } ${isFocused ? "is-focused" : ""} ${isMoveTarget ? "is-move-target" : ""} ${
        ownerPlayer ? "is-owned" : ""
      } ${isOwnedByYou ? "is-owned-by-you" : ""} is-actionable`}
      role="button"
      tabIndex={0}
      onClick={onFocus}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onFocus();
        }
      }}
      style={tileStyle}
    >
      <span className={`cell-band cell-band-${cell.cell_type}`} aria-hidden="true" />
      {linkedEventCount > 0 && (
        <span
          className="cell-event-count-badge"
          title={linkedEventLabel}
          aria-label={linkedEventLabel}
        >
          {formatLinkedEventCount(linkedEventCount)}
        </span>
      )}
      <h4>{cell.name}</h4>
      {ownerPlayer && (
        <p
          className="cell-owner-badge"
          title={`Owned by ${ownerPlayer.nickname}`}
          aria-label={`Owned by ${ownerPlayer.nickname}`}
        >
          <span className="cell-owner-dot" aria-hidden="true" />
          <span className="cell-owner-label">{getPlayerTokenLabel(ownerPlayer.nickname)}</span>
        </p>
      )}
      {isMortgaged && (
        <p className="cell-mortgaged-badge">Mortgaged</p>
      )}
      {cell.cell_type === "property" && propertyLevel > 0 && (
        <p className="cell-level-badge">
          Level {propertyLevel}
        </p>
      )}
      {isJailCell ? (
        <div className="cell-jail-layout">
          {visitingPlayers.length > 0 && (
            <div className="cell-occupants cell-visiting-zone">
              {visitingPlayers.map((player, occupantIndex) =>
                renderPlayerToken(player, occupantIndex),
              )}
            </div>
          )}
          {jailPlayers.length > 0 && (
            <div className="cell-occupants cell-jail-zone">
              {jailPlayers.map((player, occupantIndex) =>
                renderPlayerToken(player, occupantIndex),
              )}
            </div>
          )}
        </div>
      ) : (
        occupants.length > 0 && (
          <div className="cell-occupants">
            {occupants.map((player, occupantIndex) =>
              renderPlayerToken(player, occupantIndex),
            )}
          </div>
        )
      )}
    </article>
  );
}

export default BoardCellTile;

const CELL_ICONS = {
  start: "GO",
  railroad: "🚂",
  utility: "⚡",
  chance: "?",
  community: "♥",
  tax: "💰",
  jail: "🔒",
  go_to_jail: "🚔",
  free_parking: "P",
};

function formatCellPrice(cell) {
  if (cell.price) return `$${cell.price}`;
  if (typeof cell.amount === "number" && cell.cell_type === "tax") return `-$${cell.amount}`;
  return null;
}

function BoardCellTile({
  cell,
  boardSide,
  groupClass = "",
  isLanded = false,
  isFocused = false,
  isMoveTarget = false,
  isOwnedByYou = false,
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
  const cellIcon = CELL_ICONS[cell.cell_type] ?? null;
  const priceLabel = formatCellPrice(cell);

  return (
    <article
      ref={tileRef}
      className={`cell-tile cell-side-${boardSide} ${groupClass} ${
        isLanded ? "is-landed" : ""
      } ${isFocused ? "is-focused" : ""} ${isMoveTarget ? "is-move-target" : ""} ${
        ownerPlayer ? "is-owned" : ""
      } ${isOwnedByYou ? "is-owned-by-you" : ""} ${
        isMortgaged ? "is-mortgaged" : ""
      } is-actionable`}
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
      <span className={`cell-band cell-band-${cell.cell_type}`} aria-hidden="true">
        {priceLabel && <span className="cell-band-price">{priceLabel}</span>}
      </span>

      <div className="cell-tile-body">
        {ownerPlayer && (
          <span className="sr-only">{`Owned by ${ownerPlayer.nickname}`}</span>
        )}

        <div className="cell-main-content">
          {cellIcon ? (
            <span className="cell-type-icon" aria-hidden="true">
              {cellIcon}
            </span>
          ) : (
            <h4 className="cell-name">{cell.name}</h4>
          )}
        </div>

        <div className="cell-tile-bottom">
          {(propertyLevel > 0 || isMortgaged) && (
            <div className="cell-indicators">
              {propertyLevel > 0 && (
                <span className="cell-level-stars" aria-label={`Level ${propertyLevel}`}>
                  {"★".repeat(propertyLevel)}
                </span>
              )}
              {isMortgaged && (
                <span className="cell-lock-icon" aria-hidden="true">🔒</span>
              )}
            </div>
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
        </div>
      </div>

    </article>
  );
}

export default BoardCellTile;

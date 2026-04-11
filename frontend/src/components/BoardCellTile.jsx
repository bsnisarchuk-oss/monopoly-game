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

const PROPERTY_RENT_MULTIPLIERS = [1, 2, 4, 7, 11];

function formatAmount(value) {
  if (value >= 1000) {
    const k = value / 1000;
    return `${k.toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  }
  return `$${value}`;
}

function calcPropertyRent(price, level) {
  const baseRent = Math.max(10, Math.floor(price / 10));
  const clampedLevel = Math.min(level ?? 0, PROPERTY_RENT_MULTIPLIERS.length - 1);
  return baseRent * PROPERTY_RENT_MULTIPLIERS[clampedLevel];
}

function getBandLabel(cell, ownerPlayer, propertyLevel) {
  if (cell.cell_type === "property" && cell.price) {
    if (ownerPlayer) {
      return formatAmount(calcPropertyRent(cell.price, propertyLevel ?? 0));
    }
    return formatAmount(cell.price);
  }
  if (cell.price) return formatAmount(cell.price);
  if (typeof cell.amount === "number" && cell.cell_type === "tax") {
    return `-${formatAmount(cell.amount)}`;
  }
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
  const bandLabel = getBandLabel(cell, ownerPlayer, propertyLevel);

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
        {bandLabel && <span className="cell-band-price">{bandLabel}</span>}
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

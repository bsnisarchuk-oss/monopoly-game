function SelectedCellInspector({
  cell,
  ownerPlayer = null,
  ownerColor = null,
  cellTypeLabel,
  rentHint = null,
  isMortgaged = false,
  mortgageValue = 0,
  propertyLevel = 0,
  maxPropertyLevel = 0,
  upgradeCost = 0,
  occupants = [],
  linkedEventCount = 0,
  jailGroups = null,
  quickActionMessage = null,
  isSubmitting = false,
  canBuy = false,
  canSkipPurchase = false,
  canAffordPurchase = true,
  canUpgrade = false,
  canSellUpgrade = false,
  canMortgage = false,
  canUnmortgage = false,
  canUseTradeDesk = false,
  isSelectedInTradeDesk = false,
  onClear,
  onBuyProperty,
  onSkipPurchase,
  onUpgrade,
  onSellUpgrade,
  onMortgage,
  onUnmortgage,
  onSelectForTrade,
}) {
  const hasQuickActions =
    canBuy ||
    canSkipPurchase ||
    canUpgrade ||
    canSellUpgrade ||
    canMortgage ||
    canUnmortgage ||
    canUseTradeDesk;
  const hasJailSplit =
    jailGroups &&
    (jailGroups.jailPlayers.length > 0 || jailGroups.visitingPlayers.length > 0);

  return (
    <section
      className="game-summary cell-inspector board-center-section"
      style={ownerColor ? { "--cell-owner-color": ownerColor } : undefined}
    >
      <div className="cell-inspector-header">
        <div>
          <h3>Selected cell</h3>
          <p className="cell-inspector-title">
            <strong>{cell.name}</strong> &middot; Cell {cell.index}
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
        <strong>{cellTypeLabel}</strong> &middot; {cell.description}
      </p>
      <div className="cell-inspector-meta">
        {cell.price && (
          <article className="cell-inspector-stat">
            <span>Price</span>
            <strong>${cell.price}</strong>
          </article>
        )}
        {rentHint && (
          <article className="cell-inspector-stat">
            <span>Rent</span>
            <strong>{rentHint.replace("Rent: ", "")}</strong>
          </article>
        )}
        {cell.price && (
          <article className="cell-inspector-stat">
            <span>Owner</span>
            <strong>{ownerPlayer?.nickname ?? "Unowned"}</strong>
          </article>
        )}
        {cell.price && (
          <article className="cell-inspector-stat">
            <span>Mortgage</span>
            <strong>{isMortgaged ? "Active" : `$${mortgageValue}`}</strong>
          </article>
        )}
        {cell.cell_type === "property" && (
          <article className="cell-inspector-stat">
            <span>Level</span>
            <strong>
              {propertyLevel}/{maxPropertyLevel}
            </strong>
          </article>
        )}
        {cell.cell_type === "property" && (
          <article className="cell-inspector-stat">
            <span>Upgrade</span>
            <strong>${upgradeCost}</strong>
          </article>
        )}
        {!cell.price && typeof cell.amount === "number" && (
          <article className="cell-inspector-stat">
            <span>Amount</span>
            <strong>{cell.cell_type === "tax" ? `-$${cell.amount}` : `+$${cell.amount}`}</strong>
          </article>
        )}
        <article className="cell-inspector-stat">
          <span>Occupants</span>
          <strong>{occupants.length}</strong>
        </article>
        {linkedEventCount > 0 && (
          <article className="cell-inspector-stat">
            <span>Recent events</span>
            <strong>{linkedEventCount}</strong>
          </article>
        )}
      </div>
      {hasQuickActions && (
        <div className="cell-inspector-actions">
          {canBuy && (
            <button
              type="button"
              className="buy-button"
              onClick={onBuyProperty}
              disabled={isSubmitting || !canAffordPurchase}
            >
              Buy property
            </button>
          )}
          {canSkipPurchase && (
            <button
              type="button"
              className="pass-button"
              onClick={onSkipPurchase}
              disabled={isSubmitting}
            >
              Pass on purchase
            </button>
          )}
          {canUpgrade && (
            <button
              type="button"
              className="upgrade-button"
              onClick={onUpgrade}
              disabled={isSubmitting}
            >
              Upgrade
            </button>
          )}
          {canSellUpgrade && (
            <button
              type="button"
              className="sell-button"
              onClick={onSellUpgrade}
              disabled={isSubmitting}
            >
              Sell upgrade
            </button>
          )}
          {canMortgage && (
            <button
              type="button"
              className="mortgage-button"
              onClick={onMortgage}
              disabled={isSubmitting}
            >
              Mortgage
            </button>
          )}
          {canUnmortgage && (
            <button
              type="button"
              className="unmortgage-button"
              onClick={onUnmortgage}
              disabled={isSubmitting}
            >
              Unmortgage
            </button>
          )}
          {canUseTradeDesk && (
            <button
              type="button"
              className="trade-button accept-button"
              onClick={onSelectForTrade}
              disabled={isSubmitting}
            >
              {isSelectedInTradeDesk ? "Selected for trade" : "Select for trade"}
            </button>
          )}
        </div>
      )}
      {quickActionMessage && (
        <p className="cell-inspector-helper">{quickActionMessage}</p>
      )}
      {occupants.length > 0 && (
        <p className="cell-inspector-note">
          Occupants: <strong>{occupants.map((player) => player.nickname).join(", ")}</strong>
        </p>
      )}
      {hasJailSplit && (
        <p className="cell-inspector-note">
          Jail split: <strong>{jailGroups.jailPlayers.length} jailed</strong> &middot;{" "}
          <strong>{jailGroups.visitingPlayers.length} visiting</strong>
        </p>
      )}
      {isMortgaged && (
        <p className="cell-inspector-note">
          Mortgage is active, so this cell is not charging rent right now.
        </p>
      )}
    </section>
  );
}

export default SelectedCellInspector;

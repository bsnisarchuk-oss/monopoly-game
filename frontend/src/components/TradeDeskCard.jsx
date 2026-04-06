import DeskSectionHeader from "./DeskSectionHeader";

function TradeDeskCard({
  sectionRef,
  className,
  style,
  statusLabel,
  statusTone,
  note,
  isCollapsible = false,
  isCollapsed = false,
  onToggleCollapse,
  pendingTrade = null,
  pendingTradeProposerName = "A player",
  pendingTradeCellName = "",
  pendingTradeReceiverName = "another player",
  pendingTradeCashAmount = 0,
  pendingTradeCellTypeLabel = "",
  canAcceptTrade = false,
  canRejectTrade = false,
  rejectTradeLabel = "Reject trade",
  isSubmitting = false,
  onAcceptTrade,
  onRejectTrade,
  canShowTradeForm = false,
  canManageDebtRecovery = false,
  tradeableCells = [],
  selectedTradePosition = "",
  onSelectedTradePositionChange,
  tradeTargets = [],
  selectedTradeTargetId = "",
  onSelectedTradeTargetIdChange,
  tradeCashAmount = "0",
  onTradeCashAmountChange,
  canProposeTrade = false,
  onProposeTrade,
}) {
  return (
    <section ref={sectionRef} id="desk-trade" className={className} style={style}>
      <DeskSectionHeader
        title="Trade desk"
        sectionId="desk-trade"
        statusLabel={statusLabel}
        statusTone={statusTone}
        note={note}
        isCollapsible={isCollapsible}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!isCollapsed &&
        (pendingTrade ? (
          <>
            <p>
              <strong>{pendingTradeProposerName}</strong> offers{" "}
              <strong>{pendingTradeCellName}</strong> to <strong>{pendingTradeReceiverName}</strong>{" "}
              for <strong>${pendingTradeCashAmount}</strong>.
            </p>
            <p className="trade-meta">
              Type: <strong>{pendingTradeCellTypeLabel}</strong>
            </p>
            <div className="trade-actions">
              {canAcceptTrade && (
                <button
                  type="button"
                  className="trade-button accept-button"
                  data-guide-focus="accept-trade"
                  onClick={onAcceptTrade}
                  disabled={isSubmitting}
                >
                  Accept trade
                </button>
              )}
              {canRejectTrade && (
                <button
                  type="button"
                  className="trade-button reject-button"
                  data-guide-focus="reject-trade"
                  onClick={onRejectTrade}
                  disabled={isSubmitting}
                >
                  {rejectTradeLabel}
                </button>
              )}
            </div>
            {!canAcceptTrade && !canRejectTrade && (
              <p className="trade-note">
                Waiting for {pendingTradeReceiverName} to accept or reject the offer.
              </p>
            )}
          </>
        ) : canShowTradeForm ? (
          <>
            <p>
              {canManageDebtRecovery
                ? "Offer one of your unmortgaged cells for cash to escape bankruptcy."
                : "Offer one of your unmortgaged cells for cash before rolling."}{" "}
              Property-for-cash only in this version.
            </p>
            <div className="trade-form">
              <label className="trade-field">
                <span>Offer cell</span>
                <select
                  className="trade-select"
                  data-guide-focus="trade-offer-cell"
                  value={selectedTradePosition}
                  onChange={(event) => onSelectedTradePositionChange(event.target.value)}
                >
                  {tradeableCells.map((cell) => (
                    <option key={cell.index} value={cell.index}>
                      {cell.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="trade-field">
                <span>Trade with</span>
                <select
                  className="trade-select"
                  data-guide-focus="trade-target-player"
                  value={selectedTradeTargetId}
                  onChange={(event) => onSelectedTradeTargetIdChange(event.target.value)}
                >
                  {tradeTargets.map((player) => (
                    <option key={player.player_id} value={player.player_id}>
                      {player.nickname}
                    </option>
                  ))}
                </select>
              </label>
              <label className="trade-field">
                <span>Cash requested</span>
                <input
                  className="trade-input"
                  type="number"
                  data-guide-focus="trade-cash-requested"
                  min="0"
                  step="1"
                  value={tradeCashAmount}
                  onChange={(event) => onTradeCashAmountChange(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="trade-button"
                data-guide-focus="propose-trade"
                onClick={onProposeTrade}
                disabled={
                  isSubmitting ||
                  !canProposeTrade ||
                  tradeableCells.length === 0 ||
                  tradeTargets.length === 0
                }
              >
                Propose trade
              </button>
            </div>
          </>
        ) : (
          <p className="trade-note">{note}</p>
        ))}
    </section>
  );
}

export default TradeDeskCard;

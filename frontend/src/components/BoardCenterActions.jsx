function BoardCenterActions({
  sectionRef,
  className,
  style,
  pendingPurchaseCell = null,
  pendingPurchasePlayer = null,
  pendingPurchase = null,
  canResolvePurchase = false,
  pendingAuction = null,
  pendingAuctionCell = null,
  pendingAuctionActivePlayer = null,
  canBidInAuction = false,
  minimumAuctionBid = 0,
  pendingTrade = null,
  pendingTradeCell = null,
  pendingTradeReceiver = null,
  canAcceptTrade = false,
  canRejectTrade = false,
  playerId = null,
  pendingBankruptcy = null,
  pendingBankruptcyPlayer = null,
  pendingBankruptcyCreditorLabel = "",
  canManageDebtRecovery = false,
  isCurrentPlayerInJail = false,
  currentPlayerTurnsInJail = 0,
  jailFineAmount = 0,
  canPayJailFine = false,
  canAffordJailFine = false,
  canDeclareBankruptcy = false,
  currentPlayerDoublesStreak = 0,
  isSubmitting = false,
  canRollDice = false,
  onPayJailFine,
  onDeclareBankruptcy,
  onRollDice,
  onBuyProperty,
  onSkipPurchase,
  onLeaveRoom,
}) {
  return (
    <div ref={sectionRef} className={className} style={style}>
      {pendingPurchaseCell && !canResolvePurchase && (
        <p className="purchase-note">
          Waiting for {pendingPurchasePlayer?.nickname ?? "the active player"} to buy or pass on{" "}
          {pendingPurchaseCell.name}.
        </p>
      )}
      {canResolvePurchase && (
        <p className="purchase-note">
          You can buy {pendingPurchaseCell.name} for ${pendingPurchase?.price} or pass.
        </p>
      )}
      {pendingAuction && !canBidInAuction && (
        <p className="purchase-note">
          Waiting for {pendingAuctionActivePlayer?.nickname ?? "the current bidder"} to bid or pass
          on {pendingAuctionCell?.name ?? pendingAuction.cell_name}.
        </p>
      )}
      {pendingAuction && canBidInAuction && (
        <p className="purchase-note">
          You can bid at least ${minimumAuctionBid} for{" "}
          {pendingAuctionCell?.name ?? pendingAuction.cell_name}, or pass.
        </p>
      )}
      {pendingTrade && !canAcceptTrade && !canRejectTrade && (
        <p className="purchase-note">
          Waiting for {pendingTradeReceiver?.nickname ?? "the receiving player"} to respond to the
          trade offer for {pendingTradeCell?.name ?? pendingTrade.cell_name}.
        </p>
      )}
      {canAcceptTrade && (
        <p className="purchase-note">
          You can accept or reject the trade for{" "}
          {pendingTradeCell?.name ?? pendingTrade.cell_name}.
        </p>
      )}
      {pendingTrade?.proposer_id === playerId && (
        <p className="purchase-note">
          Your turn is paused until the trade is accepted, rejected, or cancelled.
        </p>
      )}
      {pendingBankruptcy && !canManageDebtRecovery && (
        <p className="purchase-note">
          Waiting for {pendingBankruptcyPlayer?.nickname ?? "the active player"} to raise $
          {pendingBankruptcy.amount_owed} owed to {pendingBankruptcyCreditorLabel} or declare
          bankruptcy.
        </p>
      )}
      {canManageDebtRecovery && (
        <p className="purchase-note">
          You owe {pendingBankruptcyCreditorLabel} ${pendingBankruptcy?.amount_owed ?? 0}. Sell
          upgrades, mortgage cells, or trade property for cash to cover the debt, or declare
          bankruptcy. If you go bankrupt, any remaining upgrades are sold back to the bank
          automatically before your properties go to the creditor, and any already mortgaged
          properties stay mortgaged when they transfer.
        </p>
      )}
      {isCurrentPlayerInJail && (
        <p className="jail-notice">
          You are in jail. Turn {currentPlayerTurnsInJail}/3.{" "}
          {currentPlayerTurnsInJail >= 2
            ? `Next failed roll forces a $${jailFineAmount} fine and you move.`
            : `Roll doubles to escape for free, or pay $${jailFineAmount} before rolling.`}
        </p>
      )}
      {canPayJailFine && (
        <button
          type="button"
          className="buy-button"
          data-guide-focus="pay-jail-fine"
          onClick={onPayJailFine}
          disabled={isSubmitting || !canAffordJailFine}
        >
          Pay ${jailFineAmount} fine
        </button>
      )}
      {canPayJailFine && !canAffordJailFine && (
        <p className="purchase-note">
          You need at least ${jailFineAmount} cash to pay your way out before rolling.
        </p>
      )}
      {canDeclareBankruptcy && (
        <button
          type="button"
          className="pass-button"
          data-guide-focus="declare-bankruptcy"
          onClick={onDeclareBankruptcy}
          disabled={isSubmitting}
        >
          Declare bankruptcy
        </button>
      )}
      {!isCurrentPlayerInJail && currentPlayerDoublesStreak > 0 && (
        <p className="doubles-notice">
          Doubles streak: {currentPlayerDoublesStreak}/3 - one more and you go to jail!
        </p>
      )}
      <button
        type="button"
        className="start-button"
        data-guide-focus="roll-dice"
        onClick={onRollDice}
        disabled={isSubmitting || !canRollDice}
      >
        {isCurrentPlayerInJail ? "Roll dice (jail)" : "Roll dice"}
      </button>
      {canResolvePurchase && (
        <>
          <button
            type="button"
            className="buy-button"
            data-guide-focus="buy-property"
            onClick={onBuyProperty}
            disabled={isSubmitting}
          >
            Buy property
          </button>
          <button
            type="button"
            className="pass-button"
            data-guide-focus="skip-purchase"
            onClick={onSkipPurchase}
            disabled={isSubmitting}
          >
            Pass on purchase
          </button>
        </>
      )}
      <button
        type="button"
        className="leave-button"
        onClick={onLeaveRoom}
        disabled={isSubmitting}
      >
        Leave room
      </button>
    </div>
  );
}

export default BoardCenterActions;

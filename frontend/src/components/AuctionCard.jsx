function AuctionCard({
  sectionRef,
  className,
  style,
  cellName,
  initiatorName,
  cellTypeLabel,
  printedPrice,
  currentBid,
  highestBidderName,
  activePlayerName,
  passedPlayerNames = [],
  canBid = false,
  bidAmount = "",
  minimumBid = 0,
  currentPlayerCash = 0,
  canAffordBid = false,
  canPass = false,
  isSubmitting = false,
  onBidAmountChange,
  onPlaceBid,
  onPass,
}) {
  return (
    <section ref={sectionRef} className={className} style={style}>
      <h3>Auction</h3>
      <p>
        <strong>{cellName}</strong> is now being auctioned after{" "}
        <strong>{initiatorName}</strong> passed on the direct purchase.
      </p>
      <p className="trade-meta">
        Type: <strong>{cellTypeLabel}</strong>
      </p>
      <p className="trade-meta">
        Printed price: <strong>${printedPrice}</strong> &middot; Current bid:{" "}
        <strong>${currentBid}</strong>
      </p>
      <p className="trade-meta">
        Highest bidder: <strong>{highestBidderName}</strong> &middot; Active player:{" "}
        <strong>{activePlayerName}</strong>
      </p>
      {passedPlayerNames.length > 0 && (
        <p className="trade-meta">
          Passed: <strong>{passedPlayerNames.join(", ")}</strong>
        </p>
      )}
      {canBid ? (
        <>
          <div className="trade-form">
            <label className="trade-field">
              <span>Your bid</span>
              <input
                className="trade-input"
                type="number"
                data-guide-focus="auction-bid-input"
                min={minimumBid}
                step="1"
                value={bidAmount}
                onChange={(event) => onBidAmountChange(event.target.value)}
              />
            </label>
          </div>
          <div className="trade-actions">
            <button
              type="button"
              className="trade-button accept-button"
              data-guide-focus="auction-place-bid"
              onClick={onPlaceBid}
              disabled={isSubmitting || !canAffordBid}
            >
              Place bid
            </button>
            <button
              type="button"
              className="trade-button reject-button"
              data-guide-focus="auction-pass"
              onClick={onPass}
              disabled={isSubmitting || !canPass}
            >
              Pass
            </button>
          </div>
          <p className="trade-note">
            Minimum next bid: <strong>${minimumBid}</strong> &middot; Your cash:{" "}
            <strong>${currentPlayerCash}</strong>
          </p>
          {!canAffordBid && (
            <p className="trade-note">
              You cannot afford the next bid, so the only valid move is to pass.
            </p>
          )}
        </>
      ) : (
        <p className="trade-note">Waiting for {activePlayerName} to bid or pass.</p>
      )}
    </section>
  );
}

export default AuctionCard;

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
  const isOpeningBid = currentBid <= 0;
  const cardClassName = [className, "auction-card"].filter(Boolean).join(" ");
  const headline = `Auction for ${cellName}`;
  const eyebrow = canBid ? "Your turn" : "Auction";
  const summary = canBid
    ? isOpeningBid
      ? `${initiatorName} passed on the direct purchase. Open the bidding or pass.`
      : `Current bid is $${currentBid}. Raise to at least $${minimumBid}, or pass.`
    : isOpeningBid
      ? `Waiting for ${activePlayerName} to open the bidding.`
      : `Waiting for ${activePlayerName} to raise or pass.`;
  const bidLabel = isOpeningBid ? "Opening bid" : "Your bid";
  const bidButtonLabel = isOpeningBid ? "Place bid" : `Bid $${minimumBid}`;
  const leaderLabel = currentBid > 0 ? highestBidderName : "No bids yet";
  const bidNote = canBid
    ? canAffordBid
      ? isOpeningBid
        ? `Opening bid starts at $${minimumBid}.`
        : `Minimum next bid is $${minimumBid}.`
      : "You cannot cover the next bid. Pass to leave the auction."
    : null;

  return (
    <section ref={sectionRef} className={cardClassName} style={style}>
      <div className="auction-card-header">
        <p className="spotlight-card-eyebrow">{eyebrow}</p>
        <h3>{headline}</h3>
        <p className="auction-card-summary">{summary}</p>
      </div>

      <div className={`auction-card-stats${canBid ? " has-cash-stat" : ""}`}>
        <p className="auction-card-stat">
          <span>Type</span>
          <strong>{cellTypeLabel}</strong>
        </p>
        <p className="auction-card-stat">
          <span>Price</span>
          <strong>${printedPrice}</strong>
        </p>
        <p className="auction-card-stat">
          <span>Current bid</span>
          <strong>${currentBid}</strong>
        </p>
        {canBid && (
          <p className="auction-card-stat">
            <span>Your cash</span>
            <strong>${currentPlayerCash}</strong>
          </p>
        )}
      </div>

      <div className="auction-card-status-row">
        <p className="auction-card-status">
          <span>Leader</span>
          <strong>{leaderLabel}</strong>
        </p>
        <p className="auction-card-status">
          <span>Turn</span>
          <strong>{activePlayerName}</strong>
        </p>
      </div>

      {passedPlayerNames.length > 0 && (
        <p className="auction-card-passed">
          Passed: <strong>{passedPlayerNames.join(", ")}</strong>
        </p>
      )}

      {canBid ? (
        <>
          <div className="auction-card-form">
            <label className="auction-card-field">
              <span>{bidLabel}</span>
              <input
                className="trade-input auction-card-input"
                type="number"
                data-guide-focus="auction-bid-input"
                min={minimumBid}
                step="1"
                value={bidAmount}
                onChange={(event) => onBidAmountChange(event.target.value)}
              />
            </label>
          </div>

          <div className="trade-actions auction-card-actions">
            <button
              type="button"
              className="trade-button accept-button auction-card-primary"
              data-guide-focus="auction-place-bid"
              onClick={onPlaceBid}
              disabled={isSubmitting || !canAffordBid}
            >
              {bidButtonLabel}
            </button>
            <button
              type="button"
              className="trade-button auction-card-secondary"
              data-guide-focus="auction-pass"
              onClick={onPass}
              disabled={isSubmitting || !canPass}
            >
              Pass
            </button>
          </div>

          {bidNote && <p className="auction-card-note">{bidNote}</p>}
        </>
      ) : (
        <p className="auction-card-note">Waiting for {activePlayerName} to bid or pass.</p>
      )}
    </section>
  );
}

export default AuctionCard;

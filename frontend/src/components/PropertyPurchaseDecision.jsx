function PropertyPurchaseDecision({
  sectionRef,
  className,
  style,
  cellName,
  price,
  canAffordPurchase = true,
  isSubmitting = false,
  onBuy,
  onAuction,
}) {
  const summary = canAffordPurchase
    ? `${cellName} is available for $${price}. Choose whether to buy it now or send it straight to auction.`
    : `${cellName} costs $${price}. You do not have enough cash to buy it right now, so auction is the available move.`;

  return (
    <section
      ref={sectionRef}
      className={className}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-labelledby="property-purchase-decision-title"
    >
      <div className="property-purchase-decision-copy">
        <h3 id="property-purchase-decision-title">Buy this property?</h3>
        <p className="property-purchase-decision-summary">{summary}</p>
      </div>

      <div className="property-purchase-decision-actions">
        <button
          type="button"
          className="property-purchase-decision-button property-purchase-decision-button-buy"
          data-guide-focus="buy-property"
          onClick={onBuy}
          disabled={isSubmitting || !canAffordPurchase}
        >
          Buy for ${price}
        </button>
        <button
          type="button"
          className="property-purchase-decision-button property-purchase-decision-button-auction"
          data-guide-focus="auction-property"
          onClick={onAuction}
          disabled={isSubmitting}
        >
          Auction
        </button>
      </div>
    </section>
  );
}

export default PropertyPurchaseDecision;

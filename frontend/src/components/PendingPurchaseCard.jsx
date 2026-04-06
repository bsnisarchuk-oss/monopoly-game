function PendingPurchaseCard({
  sectionRef,
  className,
  style,
  playerName,
  cellName,
  price,
  cellTypeLabel,
}) {
  return (
    <section ref={sectionRef} className={className} style={style}>
      <h3>Buy or pass</h3>
      <p>
        {playerName} can buy <strong>{cellName}</strong> for <strong>${price}</strong>.
      </p>
      <p>
        Type: <strong>{cellTypeLabel}</strong>
      </p>
    </section>
  );
}

export default PendingPurchaseCard;

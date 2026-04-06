function DrawnCardCard({ card }) {
  return (
    <section className="drawn-card board-center-section">
      <h3>{card.deck} card</h3>
      <p>
        <strong>{card.title}</strong>
      </p>
      <p>{card.description}</p>
    </section>
  );
}

export default DrawnCardCard;

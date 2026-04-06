import { getCountLabel } from "./utils";

function BankruptcySummaryCard({ summary, title }) {
  if (!summary) {
    return null;
  }

  const transferParts = [];
  if (summary.cash_collected > 0) {
    transferParts.push(`$${summary.cash_collected} cash`);
  }
  if (summary.property_count > 0) {
    transferParts.push(getCountLabel(summary.property_count, "property"));
  }

  const transferLine =
    summary.creditor_type === "player"
      ? transferParts.length > 0
        ? `${summary.creditor_name} collected ${transferParts.join(" and ")} from the bankruptcy.`
        : `${summary.creditor_name} did not collect extra cash or properties from the bankruptcy.`
      : summary.property_count > 0
        ? `${getCountLabel(summary.property_count, "property")} returned to the bank.`
        : "No properties were left to return to the bank.";
  const liquidationLine =
    summary.liquidated_upgrade_count > 0
      ? `${getCountLabel(summary.liquidated_upgrade_count, "upgrade")} ${
          summary.liquidated_upgrade_count === 1 ? "was" : "were"
        } sold back to the bank for $${summary.liquidation_cash} before properties transferred.`
      : "No upgrades needed liquidation.";
  const mortgageLine =
    summary.mortgaged_property_count > 0
      ? `${getCountLabel(summary.mortgaged_property_count, "property")} stayed mortgaged when transferred.`
      : "No mortgaged properties were part of this transfer.";

  return (
    <section className="bankruptcy-recap">
      <h3>{title}</h3>
      <p className="bankruptcy-recap-message">{summary.message}</p>

      <div className="bankruptcy-recap-stats">
        <article className="bankruptcy-recap-stat">
          <span>Debtor</span>
          <strong>{summary.debtor_nickname}</strong>
        </article>
        <article className="bankruptcy-recap-stat">
          <span>Creditor</span>
          <strong>{summary.creditor_name}</strong>
        </article>
        <article className="bankruptcy-recap-stat">
          <span>Properties</span>
          <strong>{summary.property_count}</strong>
        </article>
        <article className="bankruptcy-recap-stat">
          <span>Liquidated</span>
          <strong>${summary.liquidation_cash}</strong>
        </article>
      </div>

      <div className="bankruptcy-recap-notes">
        <p>{transferLine}</p>
        <p>{liquidationLine}</p>
        <p>{mortgageLine}</p>
      </div>
    </section>
  );
}

export default BankruptcySummaryCard;

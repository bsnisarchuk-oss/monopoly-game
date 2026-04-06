function BoardCenterSummaryCard({
  currentTurnPlayerName = "Unknown player",
  lastRollText = "No roll yet",
  landedSummary = "No landing yet",
  lastLandedCell = null,
  lastLandedCellTypeLabel = "",
  lastLandedRentHint = null,
  lastLandedLevel = 0,
  maxPropertyLevel = 0,
  lastLandedAmountLabel = null,
  lastLandedOwnerName = null,
  isLastLandedMortgaged = false,
  lastEffects = [],
}) {
  return (
    <section className="game-summary board-center-section">
      <p>
        Current turn: <strong>{currentTurnPlayerName}</strong>
      </p>
      <p>
        Last roll: <strong>{lastRollText}</strong>
      </p>
      <p>
        Landed cell: <strong>{landedSummary}</strong>
      </p>
      {lastLandedCell && (
        <p>
          Cell type: <strong>{lastLandedCellTypeLabel}</strong> - {lastLandedCell.description}
        </p>
      )}
      {lastLandedCell?.price && (
        <p>
          Price: <strong>${lastLandedCell.price}</strong>
          {lastLandedRentHint && <> &middot; {lastLandedRentHint}</>}
        </p>
      )}
      {isLastLandedMortgaged && (
        <p>
          Mortgage: <strong>Active</strong> &middot; No rent while mortgaged
        </p>
      )}
      {lastLandedCell?.cell_type === "property" && (
        <p>
          Upgrade level: <strong>{lastLandedLevel}/{maxPropertyLevel}</strong>
        </p>
      )}
      {lastLandedAmountLabel && (
        <p>
          Amount: <strong>{lastLandedAmountLabel}</strong>
        </p>
      )}
      {lastLandedOwnerName && (
        <p>
          Owner: <strong>{lastLandedOwnerName}</strong>
        </p>
      )}
      {lastEffects.length > 0 && (
        <div className="effect-list">
          {lastEffects.map((effect, index) => (
            <p key={index}>{effect}</p>
          ))}
        </div>
      )}
    </section>
  );
}

export default BoardCenterSummaryCard;

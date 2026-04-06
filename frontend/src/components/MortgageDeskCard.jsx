import DeskSectionHeader from "./DeskSectionHeader";

function MortgageDeskCard({
  sectionRef,
  className,
  style,
  statusLabel,
  statusTone,
  note,
  isCollapsible = false,
  isCollapsed = false,
  onToggleCollapse,
  showLists = false,
  canManageDebtRecovery = false,
  mortgageableCells = [],
  unmortgageableCells = [],
  isSubmitting = false,
  canManageMortgages = false,
  canUnmortgageProperties = false,
  getMortgageValue,
  getUnmortgageCost,
  onMortgage,
  onUnmortgage,
}) {
  return (
    <section ref={sectionRef} id="desk-mortgage" className={className} style={style}>
      <DeskSectionHeader
        title="Mortgage desk"
        sectionId="desk-mortgage"
        statusLabel={statusLabel}
        statusTone={statusTone}
        note={note}
        isCollapsible={isCollapsible}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!isCollapsed &&
        (showLists ? (
          <>
            <p>
              {canManageDebtRecovery
                ? "Raise cash to escape bankruptcy. Mortgages add cash immediately and stop rent until you buy the property back."
                : "Use mortgages to raise cash before rolling. Mortgaged cells stop charging rent until you buy them back."}
            </p>

            {mortgageableCells.length > 0 && (
              <div className="mortgage-group">
                <h4>Available to mortgage</h4>
                <div className="mortgage-list">
                  {mortgageableCells.map((cell, index) => {
                    const mortgageValue = getMortgageValue(cell);
                    return (
                      <article key={cell.index} className="mortgage-option">
                        <div>
                          <h5>{cell.name}</h5>
                          <p>
                            You receive: <strong>${mortgageValue}</strong>
                          </p>
                        </div>
                        <button
                          type="button"
                          className="mortgage-button"
                          data-guide-focus={index === 0 ? "mortgage-first" : undefined}
                          onClick={() => onMortgage(cell.index)}
                          disabled={isSubmitting || !canManageMortgages}
                        >
                          Mortgage
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {unmortgageableCells.length > 0 && !canManageDebtRecovery && (
              <div className="mortgage-group">
                <h4>Currently mortgaged</h4>
                <div className="mortgage-list">
                  {unmortgageableCells.map((cell, index) => {
                    const unmortgageCost = getUnmortgageCost(cell);
                    return (
                      <article key={cell.index} className="mortgage-option is-mortgaged">
                        <div>
                          <h5>{cell.name}</h5>
                          <p>
                            Buy-back cost: <strong>${unmortgageCost}</strong>
                          </p>
                        </div>
                        <button
                          type="button"
                          className="unmortgage-button"
                          data-guide-focus={index === 0 ? "unmortgage-first" : undefined}
                          onClick={() => onUnmortgage(cell.index)}
                          disabled={isSubmitting || !canUnmortgageProperties}
                        >
                          Unmortgage
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {!canManageMortgages && !canManageDebtRecovery && (
              <p className="mortgage-note">
                Mortgages can only be managed at the start of your turn, before you roll.
              </p>
            )}
          </>
        ) : (
          <p className="mortgage-note">{note}</p>
        ))}
    </section>
  );
}

export default MortgageDeskCard;

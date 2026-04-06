import DeskSectionHeader from "./DeskSectionHeader";

function UpgradesDeskCard({
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
  upgradeableProperties = [],
  sellableProperties = [],
  propertyLevels = {},
  isSubmitting = false,
  canUpgradeProperties = false,
  canSellUpgrades = false,
  getUpgradeCost,
  getUpgradeSellValue,
  getRentHint,
  formatCellType,
  onUpgrade,
  onSellUpgrade,
}) {
  return (
    <section ref={sectionRef} id="desk-upgrade" className={className} style={style}>
      <DeskSectionHeader
        title="Upgrades desk"
        sectionId="desk-upgrade"
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
                ? "Sell upgrades to raise cash and escape bankruptcy. Building is locked until your debts are cleared."
                : "Build or sell upgrades before rolling. This is a simplified upgrade system."}
            </p>
            {!canManageDebtRecovery && upgradeableProperties.length > 0 && (
              <div className="upgrade-group">
                <h4>Build upgrades</h4>
                <div className="upgrade-list">
                  {upgradeableProperties.map((cell, index) => {
                    const level = propertyLevels[cell.index] ?? 0;
                    const nextLevel = level + 1;
                    const upgradeCost = getUpgradeCost(cell);
                    const currentRent = getRentHint(cell, level);
                    const nextRent = getRentHint(cell, nextLevel);

                    return (
                      <article key={cell.index} className="upgrade-option">
                        <div>
                          <h4>{cell.name}</h4>
                          <p>
                            Group: <strong>{formatCellType(cell.color_group ?? "property")}</strong>
                          </p>
                          <p>
                            Level <strong>{level}</strong> &rarr; <strong>{nextLevel}</strong>
                          </p>
                          <p>
                            Rent: {currentRent?.replace("Rent: ", "")} &rarr;{" "}
                            <strong>{nextRent?.replace("Rent: ", "")}</strong>
                          </p>
                          <p>
                            Cost: <strong>${upgradeCost}</strong>
                          </p>
                        </div>
                        <button
                          type="button"
                          className="upgrade-button"
                          data-guide-focus={index === 0 ? "upgrade-first" : undefined}
                          onClick={() => onUpgrade(cell.index)}
                          disabled={isSubmitting || !canUpgradeProperties}
                        >
                          Upgrade
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
            {sellableProperties.length > 0 && (
              <div className="upgrade-group">
                <h4>Sell upgrades</h4>
                <div className="upgrade-list">
                  {sellableProperties.map((cell, index) => {
                    const level = propertyLevels[cell.index] ?? 0;
                    const nextLevel = Math.max(0, level - 1);
                    const sellValue = getUpgradeSellValue(cell);
                    const currentRent = getRentHint(cell, level);
                    const nextRent = getRentHint(cell, nextLevel);

                    return (
                      <article key={cell.index} className="upgrade-option sell-option">
                        <div>
                          <h4>{cell.name}</h4>
                          <p>
                            Level <strong>{level}</strong> &rarr; <strong>{nextLevel}</strong>
                          </p>
                          <p>
                            Rent: {currentRent?.replace("Rent: ", "")} &rarr;{" "}
                            <strong>{nextRent?.replace("Rent: ", "")}</strong>
                          </p>
                          <p>
                            Cash back: <strong>${sellValue}</strong>
                          </p>
                        </div>
                        <button
                          type="button"
                          className="sell-button"
                          data-guide-focus={index === 0 ? "sell-upgrade-first" : undefined}
                          onClick={() => onSellUpgrade(cell.index)}
                          disabled={isSubmitting || !canSellUpgrades}
                        >
                          Sell upgrade
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
            {!canUpgradeProperties && !canManageDebtRecovery && (
              <p className="upgrade-note">
                Upgrade changes are only available at the start of your own turn, before you roll.
              </p>
            )}
          </>
        ) : (
          <p className="upgrade-note">{note}</p>
        ))}
    </section>
  );
}

export default UpgradesDeskCard;

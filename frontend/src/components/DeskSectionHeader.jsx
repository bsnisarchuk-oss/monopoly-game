function DeskSectionHeader({
  title,
  sectionId,
  statusLabel,
  statusTone,
  note,
  isCollapsible = false,
  isCollapsed = false,
  onToggleCollapse,
}) {
  return (
    <div className="desk-card-header">
      <div className="desk-card-title-row">
        <h3>{title}</h3>
        <div className="desk-card-header-actions">
          <span className={`desk-card-status is-${statusTone}`}>{statusLabel}</span>
          {isCollapsible && (
            <button
              type="button"
              className="desk-card-toggle"
              aria-expanded={!isCollapsed}
              aria-controls={sectionId}
              onClick={onToggleCollapse}
            >
              {isCollapsed ? "Show details" : "Hide details"}
            </button>
          )}
        </div>
      </div>
      {note && (!isCollapsible || !isCollapsed) && <p className="desk-card-note">{note}</p>}
    </div>
  );
}

export default DeskSectionHeader;

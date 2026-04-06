function ActionGuideCard({
  actionGuide,
  hasStoredUiPreference,
  jumpButtonLabel,
  onJump,
  onResetUiPreferences,
}) {
  return (
    <section className={`action-guide-card board-center-section is-${actionGuide.tone}`}>
      <p className="action-guide-eyebrow">{actionGuide.eyebrow}</p>
      <h3>{actionGuide.title}</h3>
      <p className="action-guide-summary">{actionGuide.summary}</p>
      {(actionGuide.targetKey || hasStoredUiPreference) && (
        <div className="action-guide-actions">
          {actionGuide.targetKey && (
            <button type="button" className="action-guide-jump" onClick={onJump}>
              {jumpButtonLabel}
            </button>
          )}
          {hasStoredUiPreference && (
            <button
              type="button"
              className="action-guide-reset"
              onClick={onResetUiPreferences}
            >
              Reset UI preferences
            </button>
          )}
        </div>
      )}
      <ul className="action-guide-list">
        {actionGuide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
      {actionGuide.note && <p className="action-guide-note">{actionGuide.note}</p>}
    </section>
  );
}

export default ActionGuideCard;

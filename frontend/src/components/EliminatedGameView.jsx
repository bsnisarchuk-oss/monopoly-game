import BankruptcySummaryCard from "./BankruptcySummaryCard";
import RecentEventsCard from "./RecentEventsCard";

function EliminatedGameView({
  roomCode,
  playerId,
  currentTurnPlayerName = "Unknown player",
  lastEffects = [],
  lastBankruptcySummary = null,
  bankruptcyRecapTitle = "Latest bankruptcy recap",
  recentEvents = [],
  selectedKind = "all",
  expandedGroups = {},
  freshEventIds = {},
  onSelectKind,
  onToggleGroup,
  isSubmitting = false,
  onLeaveRoom,
}) {
  return (
    <section className="game-card">
      <div className="room-card-header">
        <div>
          <h2>Eliminated</h2>
          <p>
            Room code: <strong>{roomCode}</strong>
          </p>
        </div>
        <p className="player-id">Your player id: {playerId}</p>
      </div>

      <section className="game-summary">
        <p>You went bankrupt and can no longer take turns in this match.</p>
        <p>
          Current turn: <strong>{currentTurnPlayerName}</strong>
        </p>
        {lastEffects.length > 0 && (
          <div className="effect-list">
            {lastEffects.map((effect, index) => (
              <p key={index}>{effect}</p>
            ))}
          </div>
        )}
      </section>

      {lastBankruptcySummary && (
        <BankruptcySummaryCard
          summary={lastBankruptcySummary}
          title={bankruptcyRecapTitle}
        />
      )}

      <RecentEventsCard
        events={recentEvents}
        title="Recent events before your elimination"
        maxGroups={4}
        selectedKind={selectedKind}
        expandedGroups={expandedGroups}
        freshEventIds={freshEventIds}
        onSelectKind={onSelectKind}
        onToggleGroup={onToggleGroup}
      />

      <div className="room-actions">
        <button
          type="button"
          className="leave-button"
          onClick={onLeaveRoom}
          disabled={isSubmitting}
        >
          Exit match view
        </button>
      </div>
    </section>
  );
}

export default EliminatedGameView;

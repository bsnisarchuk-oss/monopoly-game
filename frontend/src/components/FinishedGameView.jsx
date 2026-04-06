import BankruptcySummaryCard from "./BankruptcySummaryCard";
import RecentEventsCard from "./RecentEventsCard";

function FinishedGameView({
  roomCode,
  playerId,
  winnerPlayer = null,
  currentPlayer = null,
  lastBankruptcySummary = null,
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
          <h2>Game over</h2>
          <p>
            Room code: <strong>{roomCode}</strong>
          </p>
        </div>
        <p className="player-id">Your player id: {playerId}</p>
      </div>

      <section className="game-summary">
        <p>
          Winner:{" "}
          <strong>
            {winnerPlayer?.nickname ?? "Unknown player"}
            {winnerPlayer?.player_id === playerId ? " (you)" : ""}
          </strong>
        </p>
        {!currentPlayer && <p>You were eliminated before the end of the match.</p>}
      </section>

      {lastBankruptcySummary && (
        <BankruptcySummaryCard
          summary={lastBankruptcySummary}
          title="Latest bankruptcy recap"
        />
      )}

      <RecentEventsCard
        events={recentEvents}
        title="Recent events"
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
          Leave room
        </button>
      </div>
    </section>
  );
}

export default FinishedGameView;

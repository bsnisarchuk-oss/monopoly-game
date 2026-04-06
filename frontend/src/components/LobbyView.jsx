function LobbyView({
  roomCode,
  roomStatus,
  playerId,
  currentPlayer = null,
  isHost = false,
  canStartGame = false,
  isLobbyOpen = false,
  isSubmitting = false,
  players = [],
  maxPlayers = 0,
  minPlayersToStart = 0,
  onToggleReady,
  onStartGame,
  onLeaveRoom,
}) {
  return (
    <section className="room-card">
      <div className="room-card-header">
        <div>
          <h2>Lobby</h2>
          <p>
            Room code: <strong>{roomCode}</strong>
          </p>
          <p>
            Room status: <strong>{roomStatus}</strong>
          </p>
        </div>
        <p className="player-id">Your player id: {playerId}</p>
      </div>

      <div className="room-actions">
        <button
          type="button"
          className={`ready-button ${currentPlayer?.is_ready ? "is-ready" : ""}`}
          onClick={onToggleReady}
          disabled={isSubmitting || !isLobbyOpen}
        >
          {currentPlayer?.is_ready ? "Set unready" : "Set ready"}
        </button>
        {isHost && isLobbyOpen && (
          <button
            type="button"
            className="start-button"
            onClick={onStartGame}
            disabled={isSubmitting || !canStartGame}
          >
            Start game
          </button>
        )}
        <button
          type="button"
          className="leave-button"
          onClick={onLeaveRoom}
          disabled={isSubmitting}
        >
          Leave room
        </button>
      </div>

      <section className="lobby-note">
        <p>
          Players: {players.length}/{maxPlayers}
        </p>
        <p>
          Start rule: at least {minPlayersToStart} players and everyone must be ready.
        </p>
        {!isHost && roomStatus === "lobby" && <p>Only the host can start the game.</p>}
      </section>

      <ul className="player-list">
        {players.map((player) => (
          <li
            key={player.player_id}
            className={`player-item ${player.player_id === playerId ? "is-you" : ""}`}
          >
            <span>{player.nickname}</span>
            <span>
              {player.is_host ? "Host" : "Player"} - {player.is_ready ? "Ready" : "Not ready"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default LobbyView;

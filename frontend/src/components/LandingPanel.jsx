function LandingPanel({
  showEntryForm = false,
  nickname = "",
  roomCode = "",
  status = "",
  message = "",
  isSubmitting = false,
  onNicknameChange,
  onRoomCodeChange,
  onCreateRoom,
  onJoinRoom,
}) {
  return (
    <>
      <p className="eyebrow">Day 1 - React + FastAPI</p>
      <h1>Monopoly Online</h1>
      <p className="lead">
        Our first playable screen will let a player create or join a room.
      </p>

      {showEntryForm && (
        <>
          <div className="form-grid">
            <label className="field">
              <span>Nickname</span>
              <input
                type="text"
                placeholder="Enter your nickname"
                value={nickname}
                onChange={(event) => onNicknameChange(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Room code</span>
              <input
                type="text"
                placeholder="Example: ABC123"
                value={roomCode}
                maxLength={6}
                onChange={(event) => onRoomCodeChange(event.target.value.toUpperCase())}
              />
            </label>
          </div>

          <div className="actions">
            <button type="button" onClick={onCreateRoom} disabled={isSubmitting}>
              Create room
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onJoinRoom}
              disabled={isSubmitting}
            >
              Join room
            </button>
          </div>
        </>
      )}

      <section className="status-card">
        <h2>Status</h2>
        <p>{status}</p>
      </section>

      <section className="status-row">
        <span>Backend</span>
        <strong>{message}</strong>
      </section>
    </>
  );
}

export default LandingPanel;

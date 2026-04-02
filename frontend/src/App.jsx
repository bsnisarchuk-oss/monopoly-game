import { useEffect, useState } from "react";

const API_BASE_URL = "http://127.0.0.1:8000";
const SESSION_STORAGE_KEY = "monopoly_player_session";
const MAX_PROPERTY_LEVEL = 4;
const PROPERTY_RENT_MULTIPLIERS = [1, 2, 4, 7, 11];

function loadStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession);
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function saveStoredSession(session) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function formatCellType(cellType) {
  return cellType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getBasePropertyRent(cell) {
  if (!cell?.price || cell.cell_type !== "property") {
    return null;
  }

  return Math.max(10, Math.floor(cell.price / 10));
}

function getUpgradeCost(cell) {
  if (!cell?.price || cell.cell_type !== "property") {
    return null;
  }

  return Math.max(50, Math.floor(cell.price / 2));
}

function getRentHint(cell, level = 0) {
  if (!cell?.price) {
    return null;
  }

  if (cell.cell_type === "property") {
    const baseRent = getBasePropertyRent(cell);
    const safeLevel = Math.max(0, Math.min(level, MAX_PROPERTY_LEVEL));
    return `Rent: $${baseRent * PROPERTY_RENT_MULTIPLIERS[safeLevel]}`;
  }

  if (cell.cell_type === "railroad") {
    return "Rent: $25 x owned railroads";
  }

  if (cell.cell_type === "utility") {
    return "Rent: dice x4 or x10";
  }

  return null;
}

function getBoardPlacement(index) {
  if (index >= 0 && index <= 10) {
    return { row: 11, column: 11 - index };
  }

  if (index >= 11 && index <= 20) {
    return { row: 11 - (index - 10), column: 1 };
  }

  if (index >= 21 && index <= 30) {
    return { row: 1, column: index - 19 };
  }

  return { row: index - 29, column: 11 };
}

function getBoardSide(index) {
  if (index === 0 || index === 10 || index === 20 || index === 30) {
    return "corner";
  }

  if (index > 0 && index < 10) {
    return "bottom";
  }

  if (index > 10 && index < 20) {
    return "left";
  }

  if (index > 20 && index < 30) {
    return "top";
  }

  return "right";
}

function App() {
  const [message, setMessage] = useState("Loading...");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [status, setStatus] = useState("Choose an action to continue.");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [playerToken, setPlayerToken] = useState("");
  const [currentRoom, setCurrentRoom] = useState(null);
  const currentRoomCode = currentRoom?.room_code ?? null;
  const isLobbyOpen = currentRoom?.status === "lobby";
  const isGameOpen = currentRoom?.status === "in_game";
  const isFinished = currentRoom?.status === "finished";
  const boardCells = currentRoom?.game?.board ?? [];
  const propertyOwners = currentRoom?.game?.property_owners ?? {};
  const propertyLevels = currentRoom?.game?.property_levels ?? {};
  const pendingPurchase = currentRoom?.game?.pending_purchase ?? null;
  const lastDrawnCard = currentRoom?.game?.last_drawn_card ?? null;
  const winnerId = currentRoom?.game?.winner_id ?? null;
  const winnerPlayer =
    currentRoom?.players.find((player) => player.player_id === winnerId) ?? null;
  const currentPlayer =
    currentRoom?.players.find((player) => player.player_id === playerId) ?? null;
  const isEliminated = Boolean(currentRoom && isGameOpen && playerId && !currentPlayer);
  const isHost = currentPlayer?.is_host ?? false;
  const canStartGame =
    isHost &&
    isLobbyOpen &&
    currentRoom.players.length >= currentRoom.min_players_to_start &&
    currentRoom.players.every((player) => player.is_ready);
  const currentTurnPlayerId = currentRoom?.game?.turn.current_player_id ?? null;
  const currentTurnPlayer =
    currentRoom?.players.find((player) => player.player_id === currentTurnPlayerId) ?? null;
  const canRollDice =
    isGameOpen &&
    currentTurnPlayerId === playerId &&
    (currentRoom?.game?.turn.can_roll ?? false);
  const canResolvePurchase =
    isGameOpen &&
    pendingPurchase?.player_id === playerId &&
    Boolean(playerToken);
  const isCurrentPlayerInJail =
    currentRoom?.game?.in_jail?.[playerId] ?? false;
  const currentPlayerDoublesStreak =
    currentRoom?.game?.doubles_streak?.[playerId] ?? 0;
  const lastLandedPlayerId = currentRoom?.game?.last_landed_player_id ?? null;
  const lastLandedPosition = currentRoom?.game?.last_landed_position ?? null;
  const lastEffects = currentRoom?.game?.last_effects ?? [];
  const lastLandedPlayer =
    currentRoom?.players.find((player) => player.player_id === lastLandedPlayerId) ?? null;
  const lastLandedCell =
    boardCells.find((cell) => cell.index === lastLandedPosition) ?? null;
  const lastLandedCellLevel = lastLandedCell ? propertyLevels[lastLandedCell.index] ?? 0 : 0;
  const lastLandedCellOwner = lastLandedCell
    ? getPlayerById(propertyOwners[lastLandedCell.index])
    : null;
  const pendingPurchaseCell =
    boardCells.find((cell) => cell.index === pendingPurchase?.position) ?? null;
  const pendingPurchasePlayer =
    currentRoom?.players.find((player) => player.player_id === pendingPurchase?.player_id) ??
    null;

  function getCellByPosition(position) {
    return boardCells.find((cell) => cell.index === position) ?? null;
  }

  function getPlayerById(targetPlayerId) {
    return currentRoom?.players.find((player) => player.player_id === targetPlayerId) ?? null;
  }

  function ownsFullColorSet(ownerId, colorGroup) {
    if (!ownerId || !colorGroup) {
      return false;
    }

    const groupCells = boardCells.filter(
      (cell) => cell.cell_type === "property" && cell.color_group === colorGroup,
    );

    return groupCells.length > 0 &&
      groupCells.every((cell) => propertyOwners[cell.index] === ownerId);
  }

  const upgradeableProperties =
    currentPlayer == null
      ? []
      : boardCells.filter((cell) => {
          if (cell.cell_type !== "property" || !cell.color_group) {
            return false;
          }

          if (propertyOwners[cell.index] !== currentPlayer.player_id) {
            return false;
          }

          if (!ownsFullColorSet(currentPlayer.player_id, cell.color_group)) {
            return false;
          }

          return (propertyLevels[cell.index] ?? 0) < MAX_PROPERTY_LEVEL;
        });

  const canUpgradeProperties =
    isGameOpen &&
    currentTurnPlayerId === playerId &&
    (currentRoom?.game?.turn.can_roll ?? false) &&
    !pendingPurchase &&
    Boolean(playerToken);

  useEffect(() => {
    fetch(`${API_BASE_URL}/`)
      .then((response) => response.json())
      .then((data) => {
        setMessage(data.message);
      })
      .catch(() => {
        setMessage("Backend connection failed");
      });
  }, []);

  useEffect(() => {
    const storedSession = loadStoredSession();

    if (!storedSession) {
      return;
    }

    if (!storedSession.room_code || !storedSession.player_token) {
      clearStoredSession();
      return;
    }

    setNickname(storedSession.nickname ?? "");
    setRoomCode(storedSession.room_code ?? "");
    setIsSubmitting(true);
    setStatus("Restoring previous session...");

    fetch(`${API_BASE_URL}/rooms/${storedSession.room_code}/rejoin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        player_token: storedSession.player_token,
      }),
    })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Session restore failed.");
        }

        setPlayerId(data.player_id);
        setPlayerToken(data.player_token);
        setCurrentRoom(data.room);
        setRoomCode(data.room.room_code);
        setStatus(`Welcome back to room ${data.room.room_code}.`);
      })
      .catch(() => {
        clearStoredSession();
        setPlayerId("");
        setPlayerToken("");
        setCurrentRoom(null);
        setStatus("Saved session expired. Create or join a room again.");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }, []);

  useEffect(() => {
    if (!currentRoomCode) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      fetch(`${API_BASE_URL}/rooms/${currentRoomCode}`)
        .then((response) => {
          if (response.status === 404) {
            clearStoredSession();
            setCurrentRoom(null);
            setPlayerId("");
            setPlayerToken("");
            setStatus("The room no longer exists.");
            return;
          }
          return response.json().then((data) => setCurrentRoom(data));
        })
        .catch(() => {});
    }, 2500);

    return () => {
      clearInterval(intervalId);
    };
  }, [currentRoomCode]);

  async function handleCreateRoom() {
    const trimmedNickname = nickname.trim();

    if (!trimmedNickname) {
      setStatus("Enter a nickname before creating a room.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Creating room...");

    try {
      const response = await fetch(`${API_BASE_URL}/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nickname: trimmedNickname }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Room creation failed.");
      }

      setPlayerId(data.player_id);
      setPlayerToken(data.player_token);
      setCurrentRoom(data.room);
      setRoomCode(data.room.room_code);
      saveStoredSession({
        player_id: data.player_id,
        player_token: data.player_token,
        room_code: data.room.room_code,
        nickname: trimmedNickname,
      });
      setStatus(`Room ${data.room.room_code} created successfully.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleJoinRoom() {
    const trimmedNickname = nickname.trim();
    const trimmedRoomCode = roomCode.trim().toUpperCase();

    if (!trimmedNickname) {
      setStatus("Enter a nickname before joining a room.");
      return;
    }

    if (!trimmedRoomCode) {
      setStatus("Enter a room code before joining.");
      return;
    }

    setIsSubmitting(true);
    setStatus(`Joining room ${trimmedRoomCode}...`);

    try {
      const response = await fetch(`${API_BASE_URL}/rooms/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nickname: trimmedNickname,
          room_code: trimmedRoomCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Join room failed.");
      }

      setPlayerId(data.player_id);
      setPlayerToken(data.player_token);
      setCurrentRoom(data.room);
      setRoomCode(data.room.room_code);
      saveStoredSession({
        player_id: data.player_id,
        player_token: data.player_token,
        room_code: data.room.room_code,
        nickname: trimmedNickname,
      });
      setStatus(`Joined room ${data.room.room_code} successfully.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleReady() {
    if (!currentRoom || !currentPlayer || !playerToken) {
      setStatus("Create or join a room before changing ready status.");
      return;
    }

    const nextReadyState = !currentPlayer.is_ready;

    setIsSubmitting(true);
    setStatus(nextReadyState ? "Setting you as ready..." : "Removing ready status...");

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/ready`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_token: playerToken,
            is_ready: nextReadyState,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Ready status update failed.");
      }

      setPlayerId(data.player_id);
      setPlayerToken(data.player_token);
      setCurrentRoom(data.room);
      saveStoredSession({
        player_id: data.player_id,
        player_token: data.player_token,
        room_code: data.room.room_code,
        nickname: currentPlayer.nickname,
      });
      setStatus(nextReadyState ? "You are ready." : "You are no longer ready.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStartGame() {
    if (!currentRoom || !currentPlayer || !playerToken) {
      setStatus("Create or join a room before starting the game.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Starting game...");

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_token: playerToken,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Game start failed.");
      }

      setPlayerId(data.player_id);
      setPlayerToken(data.player_token);
      setCurrentRoom(data.room);
      saveStoredSession({
        player_id: data.player_id,
        player_token: data.player_token,
        room_code: data.room.room_code,
        nickname: currentPlayer.nickname,
      });
      setStatus("Game started. The room is now locked.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRollDice() {
    if (!currentRoom || !currentPlayer || !playerToken) {
      setStatus("Join the active game before rolling dice.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Rolling dice...");

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/roll`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_token: playerToken,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Roll dice failed.");
      }

      setPlayerId(data.player_id);
      setPlayerToken(data.player_token);
      setCurrentRoom(data.room);
      saveStoredSession({
        player_id: data.player_id,
        player_token: data.player_token,
        room_code: data.room.room_code,
        nickname: currentPlayer.nickname,
      });

      const roll = data.room.game?.turn.last_roll ?? [];
      const landedPosition = data.room.game?.last_landed_position ?? null;
      const landedCell =
        data.room.game?.board?.find((cell) => cell.index === landedPosition) ?? null;
      const effects = data.room.game?.last_effects ?? [];

      if (roll.length === 2 && landedCell) {
        const effectText = effects.length > 0 ? ` ${effects.join(" ")}` : "";
        setStatus(`You rolled ${roll.join(" + ")} and landed on ${landedCell.name}.${effectText}`);
      } else if (roll.length === 2) {
        const effectText = effects.length > 0 ? ` ${effects.join(" ")}` : "";
        setStatus(`You rolled ${roll.join(" + ")}.${effectText}`);
      } else {
        setStatus("Roll completed.");
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLeaveRoom() {
    if (currentRoom && !currentPlayer) {
      clearStoredSession();
      setPlayerId("");
      setPlayerToken("");
      setCurrentRoom(null);
      setStatus("You left the match view.");
      return;
    }

    if (!currentRoom || !playerToken) {
      setStatus("You are not currently in a room.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Leaving room...");

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/leave`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_token: playerToken,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Leave room failed.");
      }

      clearStoredSession();
      setPlayerId("");
      setPlayerToken("");
      setCurrentRoom(null);
      setStatus(data.room_deleted ? "You left. The room was deleted." : "You left the room.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBuyProperty() {
    if (!currentRoom || !playerToken || !pendingPurchaseCell) {
      setStatus("There is no property waiting for your decision.");
      return;
    }

    setIsSubmitting(true);
    setStatus(`Buying ${pendingPurchaseCell.name}...`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/buy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_token: playerToken,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Property purchase failed.");
      }

      setPlayerId(data.player_id);
      setPlayerToken(data.player_token);
      setCurrentRoom(data.room);
      saveStoredSession({
        player_id: data.player_id,
        player_token: data.player_token,
        room_code: data.room.room_code,
        nickname: currentPlayer?.nickname ?? nickname.trim(),
      });
      setStatus(`You bought ${pendingPurchaseCell.name} for $${pendingPurchase.price}.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSkipPurchase() {
    if (!currentRoom || !playerToken || !pendingPurchaseCell) {
      setStatus("There is no property waiting for your decision.");
      return;
    }

    setIsSubmitting(true);
    setStatus(`Passing on ${pendingPurchaseCell.name}...`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/skip-purchase`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_token: playerToken,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Skip purchase failed.");
      }

      setPlayerId(data.player_id);
      setPlayerToken(data.player_token);
      setCurrentRoom(data.room);
      saveStoredSession({
        player_id: data.player_id,
        player_token: data.player_token,
        room_code: data.room.room_code,
        nickname: currentPlayer?.nickname ?? nickname.trim(),
      });
      setStatus(`You passed on buying ${pendingPurchaseCell.name}.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpgradeProperty(position) {
    if (!currentRoom || !playerToken) {
      setStatus("Join the active game before upgrading properties.");
      return;
    }

    const propertyCell = boardCells.find((cell) => cell.index === position) ?? null;
    const upgradeCost = getUpgradeCost(propertyCell);

    if (!propertyCell || upgradeCost == null) {
      setStatus("That property cannot be upgraded.");
      return;
    }

    setIsSubmitting(true);
    setStatus(`Upgrading ${propertyCell.name}...`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/upgrade`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_token: playerToken,
            position,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Property upgrade failed.");
      }

      setPlayerId(data.player_id);
      setPlayerToken(data.player_token);
      setCurrentRoom(data.room);
      saveStoredSession({
        player_id: data.player_id,
        player_token: data.player_token,
        room_code: data.room.room_code,
        nickname: currentPlayer?.nickname ?? nickname.trim(),
      });

      const upgradedLevel = (data.room.game?.property_levels?.[position] ?? 0);
      setStatus(
        `You upgraded ${propertyCell.name} to level ${upgradedLevel} for $${upgradeCost}.`,
      );
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">Day 1 - React + FastAPI</p>
        <h1>Monopoly Online</h1>
        <p className="lead">
          Our first playable screen will let a player create or join a room.
        </p>

        {!currentRoom && (
          <>
            <div className="form-grid">
              <label className="field">
                <span>Nickname</span>
                <input
                  type="text"
                  placeholder="Enter your nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                />
              </label>

              <label className="field">
                <span>Room code</span>
                <input
                  type="text"
                  placeholder="Example: ABC123"
                  value={roomCode}
                  maxLength={6}
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                />
              </label>
            </div>

            <div className="actions">
              <button type="button" onClick={handleCreateRoom} disabled={isSubmitting}>
                Create room
              </button>
              <button
                type="button"
                className="secondary"
                onClick={handleJoinRoom}
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

        {currentRoom && isLobbyOpen && (
          <section className="room-card">
            <div className="room-card-header">
              <div>
                <h2>Lobby</h2>
                <p>
                  Room code: <strong>{currentRoom.room_code}</strong>
                </p>
                <p>
                  Room status: <strong>{currentRoom.status}</strong>
                </p>
              </div>
              <p className="player-id">Your player id: {playerId}</p>
            </div>

            <div className="room-actions">
              <button
                type="button"
                className={`ready-button ${currentPlayer?.is_ready ? "is-ready" : ""}`}
                onClick={handleToggleReady}
                disabled={isSubmitting || !isLobbyOpen}
              >
                {currentPlayer?.is_ready ? "Set unready" : "Set ready"}
              </button>
              {isHost && isLobbyOpen && (
                <button
                  type="button"
                  className="start-button"
                  onClick={handleStartGame}
                  disabled={isSubmitting || !canStartGame}
                >
                  Start game
                </button>
              )}
              <button
                type="button"
                className="leave-button"
                onClick={handleLeaveRoom}
                disabled={isSubmitting}
              >
                Leave room
              </button>
            </div>

            <section className="lobby-note">
              <p>
                Players: {currentRoom.players.length}/{currentRoom.max_players}
              </p>
              <p>
                Start rule: at least {currentRoom.min_players_to_start} players and
                everyone must be ready.
              </p>
              {!isHost && currentRoom.status === "lobby" && (
                <p>Only the host can start the game.</p>
              )}
            </section>

            <ul className="player-list">
              {currentRoom.players.map((player) => (
                <li
                  key={player.player_id}
                  className={`player-item ${player.player_id === playerId ? "is-you" : ""}`}
                >
                  <span>{player.nickname}</span>
                  <span>
                    {player.is_host ? "Host" : "Player"} -{" "}
                    {player.is_ready ? "Ready" : "Not ready"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {currentRoom && isFinished && (
          <section className="game-card">
            <div className="room-card-header">
              <div>
                <h2>Game over</h2>
                <p>
                  Room code: <strong>{currentRoom.room_code}</strong>
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
              {!currentPlayer && (
                <p>You were eliminated before the end of the match.</p>
              )}
            </section>

            <div className="room-actions">
              <button
                type="button"
                className="leave-button"
                onClick={handleLeaveRoom}
                disabled={isSubmitting}
              >
                Leave room
              </button>
            </div>
          </section>
        )}

        {currentRoom && isEliminated && (
          <section className="game-card">
            <div className="room-card-header">
              <div>
                <h2>Eliminated</h2>
                <p>
                  Room code: <strong>{currentRoom.room_code}</strong>
                </p>
              </div>
              <p className="player-id">Your player id: {playerId}</p>
            </div>

            <section className="game-summary">
              <p>You went bankrupt and can no longer take turns in this match.</p>
              <p>
                Current turn: <strong>{currentTurnPlayer?.nickname ?? "Unknown player"}</strong>
              </p>
              {lastEffects.length > 0 && (
                <div className="effect-list">
                  {lastEffects.map((effect) => (
                    <p key={effect}>{effect}</p>
                  ))}
                </div>
              )}
            </section>

            <div className="room-actions">
              <button
                type="button"
                className="leave-button"
                onClick={handleLeaveRoom}
                disabled={isSubmitting}
              >
                Exit match view
              </button>
            </div>
          </section>
        )}

        {currentRoom && isGameOpen && currentPlayer && (
          <section className="game-card">
            <div className="room-card-header">
              <div>
                <h2>Game</h2>
                <p>
                  Room code: <strong>{currentRoom.room_code}</strong>
                </p>
                <p>
                  Turn: <strong>{currentRoom.game?.turn.turn_number}</strong>
                </p>
              </div>
              <p className="player-id">Your player id: {playerId}</p>
            </div>

            <section className="monopoly-board-shell">
              <div className="monopoly-board">
                <section className="board-center">
                  <section className="game-summary board-center-section">
                    <p>
                      Current turn: <strong>{currentTurnPlayer?.nickname ?? "Unknown player"}</strong>
                    </p>
                    <p>
                      Last roll:{" "}
                      <strong>
                        {currentRoom.game?.turn.last_roll
                          ? currentRoom.game.turn.last_roll.join(" + ")
                          : "No roll yet"}
                      </strong>
                    </p>
                    <p>
                      Landed cell:{" "}
                      <strong>
                        {lastLandedCell
                          ? `${lastLandedPlayer?.nickname ?? "Player"} landed on ${lastLandedCell.name}`
                          : "No landing yet"}
                      </strong>
                    </p>
                    {lastLandedCell && (
                      <p>
                        Cell type: <strong>{formatCellType(lastLandedCell.cell_type)}</strong> -{" "}
                        {lastLandedCell.description}
                      </p>
                    )}
                    {lastLandedCell?.price && (
                      <p>
                        Price: <strong>${lastLandedCell.price}</strong>
                        {getRentHint(lastLandedCell, lastLandedCellLevel) && (
                          <> &middot; {getRentHint(lastLandedCell, lastLandedCellLevel)}</>
                        )}
                      </p>
                    )}
                    {lastLandedCell?.cell_type === "property" && (
                      <p>
                        Upgrade level: <strong>{lastLandedCellLevel}/{MAX_PROPERTY_LEVEL}</strong>
                      </p>
                    )}
                    {lastLandedCell && !lastLandedCell.price && typeof lastLandedCell.amount === "number" && (
                      <p>
                        Amount:{" "}
                        <strong>
                          {lastLandedCell.cell_type === "tax"
                            ? `-$${lastLandedCell.amount}`
                            : `+$${lastLandedCell.amount}`}
                        </strong>
                      </p>
                    )}
                    {lastLandedCellOwner && (
                      <p>
                        Owner: <strong>{lastLandedCellOwner.nickname}</strong>
                      </p>
                    )}
                    {lastEffects.length > 0 && (
                      <div className="effect-list">
                        {lastEffects.map((effect, i) => (
                          <p key={i}>{effect}</p>
                        ))}
                      </div>
                    )}
                  </section>

                  {lastDrawnCard && (
                    <section className="drawn-card board-center-section">
                      <h3>{lastDrawnCard.deck} card</h3>
                      <p>
                        <strong>{lastDrawnCard.title}</strong>
                      </p>
                      <p>{lastDrawnCard.description}</p>
                    </section>
                  )}

                  {pendingPurchaseCell && (
                    <section className="purchase-card board-center-section">
                      <h3>Pending purchase</h3>
                      <p>
                        {pendingPurchasePlayer?.nickname ?? "A player"} can buy{" "}
                        <strong>{pendingPurchaseCell.name}</strong> for{" "}
                        <strong>${pendingPurchase?.price}</strong>.
                      </p>
                      <p>
                        Type: <strong>{formatCellType(pendingPurchaseCell.cell_type)}</strong>
                      </p>
                    </section>
                  )}

                  {upgradeableProperties.length > 0 && (
                    <section className="upgrade-card board-center-section">
                      <h3>Property upgrades</h3>
                      <p>
                        Build before rolling when you control the full color group. This is our
                        simplified houses system for the MVP.
                      </p>
                      <div className="upgrade-list">
                        {upgradeableProperties.map((cell) => {
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
                                  Group:{" "}
                                  <strong>{formatCellType(cell.color_group ?? "property")}</strong>
                                </p>
                                <p>
                                  Level <strong>{level}</strong> {"->"} <strong>{nextLevel}</strong>
                                </p>
                                <p>
                                  {currentRent} {"->"} <strong>{nextRent}</strong>
                                </p>
                                <p>
                                  Cost: <strong>${upgradeCost}</strong>
                                </p>
                              </div>
                              <button
                                type="button"
                                className="upgrade-button"
                                onClick={() => handleUpgradeProperty(cell.index)}
                                disabled={isSubmitting || !canUpgradeProperties}
                              >
                                Upgrade
                              </button>
                            </article>
                          );
                        })}
                      </div>
                      {!canUpgradeProperties && (
                        <p className="upgrade-note">
                          Upgrades are only available at the start of your own turn, before you roll.
                        </p>
                      )}
                    </section>
                  )}

                  <div className="room-actions board-center-actions">
                    {pendingPurchaseCell && !canResolvePurchase && (
                      <p className="purchase-note">
                        Waiting for {pendingPurchasePlayer?.nickname ?? "the active player"} to buy or
                        pass on {pendingPurchaseCell.name}.
                      </p>
                    )}
                    {canResolvePurchase && (
                      <p className="purchase-note">
                        You can buy {pendingPurchaseCell.name} for ${pendingPurchase?.price} or pass.
                      </p>
                    )}
                    {isCurrentPlayerInJail && (
                      <p className="jail-notice">You are in jail. Roll doubles to escape.</p>
                    )}
                    {!isCurrentPlayerInJail && currentPlayerDoublesStreak > 0 && (
                      <p className="doubles-notice">
                        Doubles streak: {currentPlayerDoublesStreak}/3 - one more and you go to jail!
                      </p>
                    )}
                    <button
                      type="button"
                      className="start-button"
                      onClick={handleRollDice}
                      disabled={isSubmitting || !canRollDice}
                    >
                      {isCurrentPlayerInJail ? "Roll dice (jail)" : "Roll dice"}
                    </button>
                    {canResolvePurchase && (
                      <>
                        <button
                          type="button"
                          className="buy-button"
                          onClick={handleBuyProperty}
                          disabled={isSubmitting}
                        >
                          Buy property
                        </button>
                        <button
                          type="button"
                          className="pass-button"
                          onClick={handleSkipPurchase}
                          disabled={isSubmitting}
                        >
                          Pass on purchase
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="leave-button"
                      onClick={handleLeaveRoom}
                      disabled={isSubmitting}
                    >
                      Leave room
                    </button>
                  </div>
                </section>

                {boardCells.map((cell) => {
                  const occupants = currentRoom.players.filter(
                    (player) => (currentRoom.game?.positions[player.player_id] ?? 0) === cell.index,
                  );
                  const { row, column } = getBoardPlacement(cell.index);
                  const boardSide = getBoardSide(cell.index);
                  const groupClass = cell.color_group ? `cell-group-${cell.color_group}` : "";

                  return (
                    <article
                      key={cell.index}
                      className={`cell-tile cell-side-${boardSide} ${groupClass} ${
                        lastLandedCell?.index === cell.index ? "is-landed" : ""
                      }`}
                      style={{ gridRow: row, gridColumn: column }}
                    >
                      <span className={`cell-band cell-band-${cell.cell_type}`} aria-hidden="true" />
                      <h4>{cell.name}</h4>
                      {cell.cell_type === "property" && (propertyLevels[cell.index] ?? 0) > 0 && (
                        <p className="cell-level-badge">
                          Level {propertyLevels[cell.index]}
                        </p>
                      )}
                      {occupants.length > 0 && (
                        <div className="cell-occupants">
                          {occupants.map((player) => (
                            <span key={player.player_id} className="occupant-chip">
                              {player.nickname}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="board-grid">
              {currentRoom.players.map((player) => (
                <article
                  key={player.player_id}
                  className={`board-card ${player.player_id === playerId ? "is-you" : ""}`}
                >
                  <h3>{player.nickname}</h3>
                  <p>
                    Position:{" "}
                    <strong>{currentRoom.game?.positions[player.player_id] ?? 0}</strong>
                  </p>
                  <p>
                    Cell:{" "}
                    <strong>
                      {getCellByPosition(currentRoom.game?.positions[player.player_id] ?? 0)
                        ?.name ?? "Unknown"}
                    </strong>
                  </p>
                  {getCellByPosition(currentRoom.game?.positions[player.player_id] ?? 0)
                    ?.cell_type === "property" && (
                    <p>
                      Upgrade level:{" "}
                      <strong>
                        {
                          propertyLevels[
                            currentRoom.game?.positions[player.player_id] ?? 0
                          ] ?? 0
                        }
                      </strong>
                    </p>
                  )}
                  {getRentHint(
                    getCellByPosition(currentRoom.game?.positions[player.player_id] ?? 0),
                    propertyLevels[currentRoom.game?.positions[player.player_id] ?? 0] ?? 0,
                  ) && (
                    <p>
                      Rent rule:{" "}
                      <strong>
                        {
                          getRentHint(
                            getCellByPosition(currentRoom.game?.positions[player.player_id] ?? 0),
                            propertyLevels[currentRoom.game?.positions[player.player_id] ?? 0] ?? 0,
                          )
                        }
                      </strong>
                    </p>
                  )}
                  <p>
                    Cash: <strong>${currentRoom.game?.cash[player.player_id] ?? 0}</strong>
                  </p>
                  <p>
                    Owned cells:{" "}
                    <strong>
                      {
                        Object.values(propertyOwners).filter(
                          (ownerPlayerId) => ownerPlayerId === player.player_id,
                        ).length
                      }
                    </strong>
                  </p>
                  <p>
                    Status:{" "}
                    <strong>
                      {currentRoom.game?.in_jail?.[player.player_id]
                        ? "In jail"
                        : "Free"}
                    </strong>
                  </p>
                  <p>
                    Turn owner:{" "}
                    <strong>
                      {currentTurnPlayerId === player.player_id ? "Yes" : "No"}
                    </strong>
                  </p>
                </article>
              ))}
            </section>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;

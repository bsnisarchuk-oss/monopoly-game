import { useEffect, useState } from "react";

const API_BASE_URL = "http://127.0.0.1:8000";
const SESSION_STORAGE_KEY = "monopoly_player_session";
const JAIL_FINE_AMOUNT = 50;
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

function getUpgradeSellValue(cell) {
  const upgradeCost = getUpgradeCost(cell);

  if (upgradeCost == null) {
    return null;
  }

  return Math.max(25, Math.floor(upgradeCost / 2));
}

function getMortgageValue(cell) {
  if (!cell?.price) {
    return null;
  }

  return Math.max(30, Math.floor(cell.price / 2));
}

function getUnmortgageCost(cell) {
  const mortgageValue = getMortgageValue(cell);

  if (mortgageValue == null) {
    return null;
  }

  return mortgageValue + Math.ceil(mortgageValue / 10);
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
  const [selectedTradeTargetId, setSelectedTradeTargetId] = useState("");
  const [selectedTradePosition, setSelectedTradePosition] = useState("");
  const [tradeCashAmount, setTradeCashAmount] = useState("0");
  const [auctionBidAmount, setAuctionBidAmount] = useState("1");
  const currentRoomCode = currentRoom?.room_code ?? null;
  const isLobbyOpen = currentRoom?.status === "lobby";
  const isGameOpen = currentRoom?.status === "in_game";
  const isFinished = currentRoom?.status === "finished";
  const boardCells = currentRoom?.game?.board ?? [];
  const propertyOwners = currentRoom?.game?.property_owners ?? {};
  const propertyLevels = currentRoom?.game?.property_levels ?? {};
  const propertyMortgaged = currentRoom?.game?.property_mortgaged ?? {};
  const pendingPurchase = currentRoom?.game?.pending_purchase ?? null;
  const pendingTrade = currentRoom?.game?.pending_trade ?? null;
  const pendingAuction = currentRoom?.game?.pending_auction ?? null;
  const pendingBankruptcy = currentRoom?.game?.pending_bankruptcy ?? null;
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
    (currentRoom?.game?.turn.can_roll ?? false) &&
    !pendingTrade &&
    !pendingAuction &&
    !pendingBankruptcy;
  const canResolvePurchase =
    isGameOpen &&
    pendingPurchase?.player_id === playerId &&
    Boolean(playerToken);
  const isCurrentPlayerInJail =
    currentRoom?.game?.in_jail?.[playerId] ?? false;
  const currentPlayerDoublesStreak =
    currentRoom?.game?.doubles_streak?.[playerId] ?? 0;
  const currentPlayerTurnsInJail =
    currentRoom?.game?.turns_in_jail?.[playerId] ?? 0;
  const lastLandedPlayerId = currentRoom?.game?.last_landed_player_id ?? null;
  const lastLandedPosition = currentRoom?.game?.last_landed_position ?? null;
  const lastEffects = currentRoom?.game?.last_effects ?? [];
  const lastLandedPlayer =
    currentRoom?.players.find((player) => player.player_id === lastLandedPlayerId) ?? null;
  const lastLandedCell =
    boardCells.find((cell) => cell.index === lastLandedPosition) ?? null;
  const lastLandedCellLevel = lastLandedCell ? propertyLevels[lastLandedCell.index] ?? 0 : 0;
  const lastLandedCellMortgaged = lastLandedCell
    ? Boolean(propertyMortgaged[lastLandedCell.index])
    : false;
  const lastLandedCellOwner = lastLandedCell
    ? getPlayerById(propertyOwners[lastLandedCell.index])
    : null;
  const pendingPurchaseCell =
    boardCells.find((cell) => cell.index === pendingPurchase?.position) ?? null;
  const pendingPurchasePlayer =
    currentRoom?.players.find((player) => player.player_id === pendingPurchase?.player_id) ??
    null;
  const pendingTradeCell =
    boardCells.find((cell) => cell.index === pendingTrade?.position) ?? null;
  const pendingTradeProposer =
    currentRoom?.players.find((player) => player.player_id === pendingTrade?.proposer_id) ??
    null;
  const pendingTradeReceiver =
    currentRoom?.players.find((player) => player.player_id === pendingTrade?.receiver_id) ??
    null;
  const pendingAuctionCell =
    boardCells.find((cell) => cell.index === pendingAuction?.position) ?? null;
  const pendingAuctionInitiator =
    currentRoom?.players.find((player) => player.player_id === pendingAuction?.initiator_player_id) ??
    null;
  const pendingAuctionActivePlayer =
    currentRoom?.players.find((player) => player.player_id === pendingAuction?.active_player_id) ??
    null;
  const pendingAuctionHighestBidder =
    currentRoom?.players.find((player) => player.player_id === pendingAuction?.highest_bidder_id) ??
    null;
  const pendingAuctionPassedPlayers =
    currentRoom?.players.filter((player) =>
      pendingAuction?.passed_player_ids?.includes(player.player_id),
    ) ?? [];
  const pendingBankruptcyPlayer =
    currentRoom?.players.find((player) => player.player_id === pendingBankruptcy?.player_id) ??
    null;
  const pendingBankruptcyCreditor =
    pendingBankruptcy?.creditor_type === "player"
      ? currentRoom?.players.find((player) => player.player_id === pendingBankruptcy?.creditor_player_id) ??
        null
      : null;
  const pendingBankruptcyCreditorLabel =
    pendingBankruptcy?.creditor_type === "player"
      ? pendingBankruptcyCreditor?.nickname ?? "another player"
      : "the bank";
  const minimumAuctionBid = pendingAuction ? Math.max(1, pendingAuction.current_bid + 1) : 1;
  const currentPlayerCash = currentRoom?.game?.cash?.[playerId] ?? 0;

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

  function colorGroupHasMortgage(colorGroup) {
    if (!colorGroup) {
      return false;
    }

    return boardCells.some(
      (cell) =>
        cell.cell_type === "property" &&
        cell.color_group === colorGroup &&
        propertyMortgaged[cell.index],
    );
  }

  function colorGroupHasUpgrade(colorGroup) {
    if (!colorGroup) {
      return false;
    }

    return boardCells.some(
      (cell) =>
        cell.cell_type === "property" &&
        cell.color_group === colorGroup &&
        (propertyLevels[cell.index] ?? 0) > 0,
    );
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

          if (colorGroupHasMortgage(cell.color_group)) {
            return false;
          }

          return (propertyLevels[cell.index] ?? 0) < MAX_PROPERTY_LEVEL;
        });
  const sellableProperties =
    currentPlayer == null
      ? []
      : boardCells.filter((cell) => {
          if (cell.cell_type !== "property") {
            return false;
          }

          if (propertyOwners[cell.index] !== currentPlayer.player_id) {
            return false;
          }

          return (propertyLevels[cell.index] ?? 0) > 0;
        });

  const canUsePreRollDesk =
    isGameOpen &&
    currentTurnPlayerId === playerId &&
    (currentRoom?.game?.turn.can_roll ?? false) &&
    !pendingPurchase &&
    !pendingTrade &&
    !pendingAuction &&
    !pendingBankruptcy &&
    Boolean(playerToken);
  const canUpgradeProperties = canUsePreRollDesk;
  const canManageDebtRecovery =
    isGameOpen &&
    pendingBankruptcy?.player_id === playerId &&
    Boolean(playerToken);
  const canManageMortgages = canUsePreRollDesk || canManageDebtRecovery;
  const canSellUpgrades = canUsePreRollDesk || canManageDebtRecovery;
  const canUnmortgageProperties = canUsePreRollDesk;
  const mortgageableCells =
    currentPlayer == null
      ? []
      : boardCells.filter((cell) => {
          if (!cell.price) {
            return false;
          }

          if (propertyOwners[cell.index] !== currentPlayer.player_id) {
            return false;
          }

          if (propertyMortgaged[cell.index]) {
            return false;
          }

          if (cell.cell_type === "property" && colorGroupHasUpgrade(cell.color_group)) {
            return false;
          }

          return true;
        });
  const unmortgageableCells =
    currentPlayer == null
      ? []
      : boardCells.filter(
          (cell) =>
            cell.price &&
            propertyOwners[cell.index] === currentPlayer.player_id &&
            propertyMortgaged[cell.index],
        );
  const tradeTargets =
    currentPlayer == null
      ? []
      : currentRoom.players.filter((player) => player.player_id !== currentPlayer.player_id);
  const tradeableCells =
    currentPlayer == null
      ? []
      : boardCells.filter((cell) => {
          if (!cell.price) {
            return false;
          }

          if (propertyOwners[cell.index] !== currentPlayer.player_id) {
            return false;
          }

          if (propertyMortgaged[cell.index]) {
            return false;
          }

          if (cell.cell_type === "property" && colorGroupHasUpgrade(cell.color_group)) {
            return false;
          }

          return true;
        });
  const canProposeTrade = canUsePreRollDesk || canManageDebtRecovery;
  const canAcceptTrade =
    isGameOpen &&
    pendingTrade?.receiver_id === playerId &&
    Boolean(playerToken);
  const canRejectTrade =
    isGameOpen &&
    (pendingTrade?.receiver_id === playerId || pendingTrade?.proposer_id === playerId) &&
    Boolean(playerToken);
  const canBidInAuction =
    isGameOpen &&
    pendingAuction?.active_player_id === playerId &&
    Boolean(playerToken);
  const canPassAuction = canBidInAuction;
  const canAffordAuctionBid = currentPlayerCash >= minimumAuctionBid;
  const canPayJailFine = canUsePreRollDesk && isCurrentPlayerInJail;
  const canAffordJailFine = currentPlayerCash >= JAIL_FINE_AMOUNT;
  const canDeclareBankruptcy = canManageDebtRecovery;

  useEffect(() => {
    const nextTradeTargets =
      currentPlayer == null
        ? []
        : currentRoom?.players.filter((player) => player.player_id !== currentPlayer.player_id) ??
          [];

    if (!nextTradeTargets.some((player) => player.player_id === selectedTradeTargetId)) {
      setSelectedTradeTargetId(nextTradeTargets[0]?.player_id ?? "");
    }
  }, [selectedTradeTargetId, currentPlayer, currentRoom]);

  useEffect(() => {
    const nextBoardCells = currentRoom?.game?.board ?? [];
    const nextPropertyOwners = currentRoom?.game?.property_owners ?? {};
    const nextPropertyLevels = currentRoom?.game?.property_levels ?? {};
    const nextPropertyMortgaged = currentRoom?.game?.property_mortgaged ?? {};

    const localColorGroupHasUpgrade = (colorGroup) => {
      if (!colorGroup) {
        return false;
      }

      return nextBoardCells.some(
        (cell) =>
          cell.cell_type === "property" &&
          cell.color_group === colorGroup &&
          (nextPropertyLevels[cell.index] ?? 0) > 0,
      );
    };

    const nextTradeableCells =
      currentPlayer == null
        ? []
        : nextBoardCells.filter((cell) => {
            if (!cell.price) {
              return false;
            }

            if (nextPropertyOwners[cell.index] !== currentPlayer.player_id) {
              return false;
            }

            if (nextPropertyMortgaged[cell.index]) {
              return false;
            }

            if (cell.cell_type === "property" && localColorGroupHasUpgrade(cell.color_group)) {
              return false;
            }

            return true;
          });

    if (!nextTradeableCells.some((cell) => String(cell.index) === selectedTradePosition)) {
      setSelectedTradePosition(nextTradeableCells[0] ? String(nextTradeableCells[0].index) : "");
    }
  }, [selectedTradePosition, currentPlayer, currentRoom]);

  useEffect(() => {
    if (!pendingAuction) {
      setAuctionBidAmount("1");
      return;
    }

    const parsedBid = Number.parseInt(auctionBidAmount, 10);

    if (!Number.isInteger(parsedBid) || parsedBid < minimumAuctionBid) {
      setAuctionBidAmount(String(minimumAuctionBid));
    }
  }, [pendingAuction, auctionBidAmount, minimumAuctionBid]);

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

  async function handlePayJailFine() {
    if (!currentRoom || !playerToken || !isCurrentPlayerInJail) {
      setStatus("You must be in jail before paying the fine.");
      return;
    }

    setIsSubmitting(true);
    setStatus(`Paying $${JAIL_FINE_AMOUNT} to leave jail...`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/jail/pay-fine`,
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
        throw new Error(data.detail || "Jail fine payment failed.");
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
      setStatus(`You paid $${JAIL_FINE_AMOUNT} and left jail. Roll when ready.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeclareBankruptcy() {
    if (!currentRoom || !playerToken || !canDeclareBankruptcy) {
      setStatus("You can only declare bankruptcy during your own debt recovery.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Declaring bankruptcy...");

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/bankruptcy/declare`,
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
        throw new Error(data.detail || "Declare bankruptcy failed.");
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
      setStatus("You declared bankruptcy and were eliminated.");
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
      const effects = data.room.game?.last_effects ?? [];
      setStatus(
        effects.length > 0
          ? effects.join(" ")
          : `You passed on buying ${pendingPurchaseCell.name}.`,
      );
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBidInAuction() {
    if (!currentRoom || !playerToken || !pendingAuctionCell) {
      setStatus("There is no auction waiting for your bid.");
      return;
    }

    const bidAmount = Number.parseInt(auctionBidAmount, 10);

    if (!Number.isInteger(bidAmount) || bidAmount < minimumAuctionBid) {
      setStatus(`Enter a valid bid of at least $${minimumAuctionBid}.`);
      return;
    }

    setIsSubmitting(true);
    setStatus(`Bidding $${bidAmount} on ${pendingAuctionCell.name}...`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/auction/bid`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_token: playerToken,
            amount: bidAmount,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Auction bid failed.");
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

      const effects = data.room.game?.last_effects ?? [];
      setStatus(
        effects.length > 0
          ? effects.join(" ")
          : `You bid $${bidAmount} for ${pendingAuctionCell.name}.`,
      );
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePassAuction() {
    if (!currentRoom || !playerToken || !pendingAuctionCell) {
      setStatus("There is no auction waiting for your decision.");
      return;
    }

    setIsSubmitting(true);
    setStatus(`Passing in the auction for ${pendingAuctionCell.name}...`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/auction/pass`,
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
        throw new Error(data.detail || "Auction pass failed.");
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

      const effects = data.room.game?.last_effects ?? [];
      setStatus(
        effects.length > 0
          ? effects.join(" ")
          : `You passed in the auction for ${pendingAuctionCell.name}.`,
      );
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

  async function handleSellUpgradeProperty(position) {
    if (!currentRoom || !playerToken) {
      setStatus("Join the active game before selling upgrades.");
      return;
    }

    const propertyCell = boardCells.find((cell) => cell.index === position) ?? null;
    const sellValue = getUpgradeSellValue(propertyCell);

    if (!propertyCell || sellValue == null) {
      setStatus("That property upgrade cannot be sold.");
      return;
    }

    setIsSubmitting(true);
    setStatus(`Selling one upgrade on ${propertyCell.name}...`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/sell-upgrade`,
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
        throw new Error(data.detail || "Sell upgrade failed.");
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

      const downgradedLevel = data.room.game?.property_levels?.[position] ?? 0;
      setStatus(
        `You sold one upgrade on ${propertyCell.name} for $${sellValue}. Level is now ${downgradedLevel}.`,
      );
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMortgageProperty(position) {
    if (!currentRoom || !playerToken) {
      setStatus("Join the active game before managing mortgages.");
      return;
    }

    const cell = boardCells.find((boardCell) => boardCell.index === position) ?? null;
    const mortgageValue = getMortgageValue(cell);

    if (!cell || mortgageValue == null) {
      setStatus("That cell cannot be mortgaged.");
      return;
    }

    setIsSubmitting(true);
    setStatus(`Mortgaging ${cell.name}...`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/mortgage`,
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
        throw new Error(data.detail || "Mortgage failed.");
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
      setStatus(`You mortgaged ${cell.name} for $${mortgageValue}.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUnmortgageProperty(position) {
    if (!currentRoom || !playerToken) {
      setStatus("Join the active game before managing mortgages.");
      return;
    }

    const cell = boardCells.find((boardCell) => boardCell.index === position) ?? null;
    const unmortgageCost = getUnmortgageCost(cell);

    if (!cell || unmortgageCost == null) {
      setStatus("That cell cannot be unmortgaged.");
      return;
    }

    setIsSubmitting(true);
    setStatus(`Unmortgaging ${cell.name}...`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/unmortgage`,
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
        throw new Error(data.detail || "Unmortgage failed.");
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
      setStatus(`You unmortgaged ${cell.name} for $${unmortgageCost}.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleProposeTrade() {
    if (!currentRoom || !playerToken || !currentPlayer) {
      setStatus("Join the active game before proposing a trade.");
      return;
    }

    const targetPlayer = getPlayerById(selectedTradeTargetId);
    const position = Number(selectedTradePosition);
    const cell = boardCells.find((boardCell) => boardCell.index === position) ?? null;
    const cashAmount = Number.parseInt(tradeCashAmount, 10);

    if (!targetPlayer) {
      setStatus("Choose a player to trade with.");
      return;
    }

    if (!cell || !Number.isInteger(position)) {
      setStatus("Choose one of your tradeable cells.");
      return;
    }

    if (!Number.isInteger(cashAmount) || cashAmount < 0) {
      setStatus("Enter a valid cash amount for the trade.");
      return;
    }

    setIsSubmitting(true);
    setStatus(`Offering ${cell.name} to ${targetPlayer.nickname}...`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/trade/propose`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_token: playerToken,
            target_player_id: targetPlayer.player_id,
            position,
            cash_amount: cashAmount,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Trade proposal failed.");
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
      setStatus(`Offered ${cell.name} to ${targetPlayer.nickname} for $${cashAmount}.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRespondTrade(accept) {
    if (!currentRoom || !playerToken || !pendingTradeCell) {
      setStatus("There is no pending trade to resolve.");
      return;
    }

    const actionLabel = accept
      ? "Accepting trade..."
      : pendingTrade?.proposer_id === playerId
        ? "Cancelling trade..."
        : "Rejecting trade...";

    setIsSubmitting(true);
    setStatus(actionLabel);

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/trade/respond`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_token: playerToken,
            accept,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Trade response failed.");
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

      if (accept) {
        setStatus(`Accepted the trade for ${pendingTradeCell.name}.`);
      } else if (pendingTrade?.proposer_id === playerId) {
        setStatus(`Cancelled the trade for ${pendingTradeCell.name}.`);
      } else {
        setStatus(`Rejected the trade for ${pendingTradeCell.name}.`);
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={`app-shell${isGameOpen || isEliminated ? " is-game" : ""}`}>
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
                  {lastEffects.map((effect, i) => (
                    <p key={i}>{effect}</p>
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
                        {!lastLandedCellMortgaged && getRentHint(lastLandedCell, lastLandedCellLevel) && (
                          <> &middot; {getRentHint(lastLandedCell, lastLandedCellLevel)}</>
                        )}
                      </p>
                    )}
                    {lastLandedCellMortgaged && (
                      <p>
                        Mortgage: <strong>Active</strong> &middot; No rent while mortgaged
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

                  {pendingAuction && (
                    <section className="trade-card board-center-section">
                      <h3>Auction</h3>
                      <p>
                        <strong>{pendingAuctionCell?.name ?? pendingAuction.cell_name}</strong> is
                        now being auctioned after{" "}
                        <strong>{pendingAuctionInitiator?.nickname ?? "the active player"}</strong>{" "}
                        passed on the direct purchase.
                      </p>
                      <p className="trade-meta">
                        Type:{" "}
                        <strong>
                          {formatCellType(pendingAuctionCell?.cell_type ?? pendingAuction.cell_type)}
                        </strong>
                      </p>
                      <p className="trade-meta">
                        Printed price: <strong>${pendingAuction.price}</strong> &middot; Current bid:{" "}
                        <strong>${pendingAuction.current_bid}</strong>
                      </p>
                      <p className="trade-meta">
                        Highest bidder:{" "}
                        <strong>{pendingAuctionHighestBidder?.nickname ?? "No bids yet"}</strong>{" "}
                        &middot; Active player:{" "}
                        <strong>{pendingAuctionActivePlayer?.nickname ?? "Waiting"}</strong>
                      </p>
                      {pendingAuctionPassedPlayers.length > 0 && (
                        <p className="trade-meta">
                          Passed:{" "}
                          <strong>
                            {pendingAuctionPassedPlayers.map((player) => player.nickname).join(", ")}
                          </strong>
                        </p>
                      )}
                      {canBidInAuction ? (
                        <>
                          <div className="trade-form">
                            <label className="trade-field">
                              <span>Your bid</span>
                              <input
                                className="trade-input"
                                type="number"
                                min={minimumAuctionBid}
                                step="1"
                                value={auctionBidAmount}
                                onChange={(event) => setAuctionBidAmount(event.target.value)}
                              />
                            </label>
                          </div>
                          <div className="trade-actions">
                            <button
                              type="button"
                              className="trade-button accept-button"
                              onClick={handleBidInAuction}
                              disabled={isSubmitting || !canAffordAuctionBid}
                            >
                              Place bid
                            </button>
                            <button
                              type="button"
                              className="trade-button reject-button"
                              onClick={handlePassAuction}
                              disabled={isSubmitting || !canPassAuction}
                            >
                              Pass
                            </button>
                          </div>
                          <p className="trade-note">
                            Minimum next bid: <strong>${minimumAuctionBid}</strong> &middot; Your
                            cash: <strong>${currentPlayerCash}</strong>
                          </p>
                          {!canAffordAuctionBid && (
                            <p className="trade-note">
                              You cannot afford the next bid, so the only valid move is to pass.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="trade-note">
                          Waiting for {pendingAuctionActivePlayer?.nickname ?? "the active bidder"} to
                          bid or pass.
                        </p>
                      )}
                    </section>
                  )}

                  {!pendingAuction &&
                    (pendingTrade ||
                      (canProposeTrade && tradeableCells.length > 0 && tradeTargets.length > 0)) && (
                    <section className="trade-card board-center-section">
                      <h3>Trade desk</h3>
                      {pendingTrade ? (
                        <>
                          <p>
                            <strong>{pendingTradeProposer?.nickname ?? "A player"}</strong> offers{" "}
                            <strong>{pendingTradeCell?.name ?? pendingTrade.cell_name}</strong> to{" "}
                            <strong>{pendingTradeReceiver?.nickname ?? "another player"}</strong> for{" "}
                            <strong>${pendingTrade.cash_amount}</strong>.
                          </p>
                          <p className="trade-meta">
                            Type:{" "}
                            <strong>
                              {formatCellType(pendingTradeCell?.cell_type ?? pendingTrade.cell_type)}
                            </strong>
                          </p>
                          <div className="trade-actions">
                            {canAcceptTrade && (
                              <button
                                type="button"
                                className="trade-button accept-button"
                                onClick={() => handleRespondTrade(true)}
                                disabled={isSubmitting}
                              >
                                Accept trade
                              </button>
                            )}
                            {canRejectTrade && (
                              <button
                                type="button"
                                className="trade-button reject-button"
                                onClick={() => handleRespondTrade(false)}
                                disabled={isSubmitting}
                              >
                                {pendingTrade?.proposer_id === playerId ? "Cancel offer" : "Reject trade"}
                              </button>
                            )}
                          </div>
                          {!canAcceptTrade && !canRejectTrade && (
                            <p className="trade-note">
                              Waiting for {pendingTradeReceiver?.nickname ?? "the receiving player"} to
                              resolve the offer.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p>
                            {canManageDebtRecovery
                              ? "Offer one of your unmortgaged cells for cash to escape bankruptcy."
                              : "Offer one of your unmortgaged cells for cash before rolling."}{" "}
                            This MVP trade flow is property-for-cash only.
                          </p>
                          <div className="trade-form">
                            <label className="trade-field">
                              <span>Offer cell</span>
                              <select
                                className="trade-select"
                                value={selectedTradePosition}
                                onChange={(event) => setSelectedTradePosition(event.target.value)}
                              >
                                {tradeableCells.map((cell) => (
                                  <option key={cell.index} value={cell.index}>
                                    {cell.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="trade-field">
                              <span>Trade with</span>
                              <select
                                className="trade-select"
                                value={selectedTradeTargetId}
                                onChange={(event) => setSelectedTradeTargetId(event.target.value)}
                              >
                                {tradeTargets.map((player) => (
                                  <option key={player.player_id} value={player.player_id}>
                                    {player.nickname}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="trade-field">
                              <span>Cash requested</span>
                              <input
                                className="trade-input"
                                type="number"
                                min="0"
                                step="1"
                                value={tradeCashAmount}
                                onChange={(event) => setTradeCashAmount(event.target.value)}
                              />
                            </label>
                            <button
                              type="button"
                              className="trade-button"
                              onClick={handleProposeTrade}
                              disabled={
                                isSubmitting ||
                                !canProposeTrade ||
                                tradeableCells.length === 0 ||
                                tradeTargets.length === 0
                              }
                            >
                              Propose trade
                            </button>
                          </div>
                          {!canProposeTrade && (
                            <p className="trade-note">
                              Trades can only be proposed at the start of your own turn, before you
                              roll.
                            </p>
                          )}
                        </>
                      )}
                    </section>
                  )}

                  {!pendingAuction &&
                    (mortgageableCells.length > 0 || (unmortgageableCells.length > 0 && !canManageDebtRecovery)) && (
                    <section className="mortgage-card board-center-section">
                      <h3>Mortgage desk</h3>
                      <p>
                        {canManageDebtRecovery
                          ? "Raise cash to escape bankruptcy. Mortgages add cash immediately and stop rent until you buy the property back."
                          : "Use mortgages to raise cash before rolling. Mortgaged cells stop charging rent until you buy them back."}
                      </p>

                      {mortgageableCells.length > 0 && (
                        <div className="mortgage-group">
                          <h4>Available to mortgage</h4>
                          <div className="mortgage-list">
                            {mortgageableCells.map((cell) => {
                              const mortgageValue = getMortgageValue(cell);
                              return (
                                <article key={cell.index} className="mortgage-option">
                                  <div>
                                    <h5>{cell.name}</h5>
                                    <p>
                                      Value: <strong>${mortgageValue}</strong>
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="mortgage-button"
                                    onClick={() => handleMortgageProperty(cell.index)}
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
                            {unmortgageableCells.map((cell) => {
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
                                    onClick={() => handleUnmortgageProperty(cell.index)}
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
                    </section>
                  )}

                  {!pendingAuction &&
                    ((!canManageDebtRecovery && upgradeableProperties.length > 0) || sellableProperties.length > 0) && (
                    <section className="upgrade-card board-center-section">
                      <h3>Property management</h3>
                      <p>
                        {canManageDebtRecovery
                          ? "Sell upgrades to raise cash and escape bankruptcy. Building is locked until the debt is resolved."
                          : "Build or sell upgrades before rolling. This is our simplified houses system for the MVP."}
                      </p>
                      {!canManageDebtRecovery && upgradeableProperties.length > 0 && (
                        <div className="upgrade-group">
                          <h4>Build upgrades</h4>
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
                        </div>
                      )}
                      {sellableProperties.length > 0 && (
                        <div className="upgrade-group">
                          <h4>Sell upgrades</h4>
                          <div className="upgrade-list">
                            {sellableProperties.map((cell) => {
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
                                      Level <strong>{level}</strong> {"->"} <strong>{nextLevel}</strong>
                                    </p>
                                    <p>
                                      {currentRent} {"->"} <strong>{nextRent}</strong>
                                    </p>
                                    <p>
                                      Cash back: <strong>${sellValue}</strong>
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="sell-button"
                                    onClick={() => handleSellUpgradeProperty(cell.index)}
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
                    {pendingAuction && !canBidInAuction && (
                      <p className="purchase-note">
                        Waiting for {pendingAuctionActivePlayer?.nickname ?? "the active bidder"} to
                        resolve the auction for{" "}
                        {pendingAuctionCell?.name ?? pendingAuction.cell_name}.
                      </p>
                    )}
                    {pendingAuction && canBidInAuction && (
                      <p className="purchase-note">
                        You can bid at least ${minimumAuctionBid} for{" "}
                        {pendingAuctionCell?.name ?? pendingAuction.cell_name}, or pass.
                      </p>
                    )}
                    {pendingTrade && !canAcceptTrade && !canRejectTrade && (
                      <p className="purchase-note">
                        Waiting for {pendingTradeReceiver?.nickname ?? "the receiving player"} to
                        resolve the trade for {pendingTradeCell?.name ?? pendingTrade.cell_name}.
                      </p>
                    )}
                    {canAcceptTrade && (
                      <p className="purchase-note">
                        You can accept or reject the trade for{" "}
                        {pendingTradeCell?.name ?? pendingTrade.cell_name}.
                      </p>
                    )}
                    {pendingTrade?.proposer_id === playerId && (
                      <p className="purchase-note">
                        Your turn is paused until the trade is accepted, rejected, or cancelled.
                      </p>
                    )}
                    {pendingBankruptcy && !canManageDebtRecovery && (
                      <p className="purchase-note">
                        Waiting for {pendingBankruptcyPlayer?.nickname ?? "the active player"} to recover $
                        {pendingBankruptcy.amount_owed} owed to {pendingBankruptcyCreditorLabel} or
                        declare bankruptcy.
                      </p>
                    )}
                    {canManageDebtRecovery && (
                      <p className="purchase-note">
                        You owe {pendingBankruptcyCreditorLabel} ${pendingBankruptcy?.amount_owed ?? 0}.
                        Sell upgrades, mortgage cells, or trade property for cash to cover the debt, or
                        declare bankruptcy. If you go bankrupt, any remaining upgrades are sold back to
                        the bank automatically before assets transfer, and any already mortgaged
                        properties stay mortgaged for the new owner.
                      </p>
                    )}
                    {isCurrentPlayerInJail && (
                      <p className="jail-notice">
                        You are in jail. Turn {currentPlayerTurnsInJail}/3.{" "}
                        {currentPlayerTurnsInJail >= 2
                          ? `Next failed roll forces a $${JAIL_FINE_AMOUNT} fine and you move.`
                          : `Roll doubles to escape for free, or pay $${JAIL_FINE_AMOUNT} before rolling.`}
                      </p>
                    )}
                    {canPayJailFine && (
                      <button
                        type="button"
                        className="buy-button"
                        onClick={handlePayJailFine}
                        disabled={isSubmitting || !canAffordJailFine}
                      >
                        Pay ${JAIL_FINE_AMOUNT} fine
                      </button>
                    )}
                    {canPayJailFine && !canAffordJailFine && (
                      <p className="purchase-note">
                        You need at least ${JAIL_FINE_AMOUNT} cash to pay your way out before rolling.
                      </p>
                    )}
                    {canDeclareBankruptcy && (
                      <button
                        type="button"
                        className="pass-button"
                        onClick={handleDeclareBankruptcy}
                        disabled={isSubmitting}
                      >
                        Declare bankruptcy
                      </button>
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
                      {propertyMortgaged[cell.index] && (
                        <p className="cell-mortgaged-badge">Mortgaged</p>
                      )}
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
                    Mortgaged cells:{" "}
                    <strong>
                      {
                        Object.entries(propertyMortgaged).filter(
                          ([position, isMortgaged]) =>
                            isMortgaged &&
                            propertyOwners[Number(position)] === player.player_id,
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

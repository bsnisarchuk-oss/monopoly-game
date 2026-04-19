import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildActionGuide,
  buildActionGuideJumpAnnouncement,
  buildGuideFocusSelector,
} from "./components/actionGuideHelpers";
import EliminatedGameView from "./components/EliminatedGameView";
import FinishedGameView from "./components/FinishedGameView";
import GameView from "./components/GameView";
import { buildGameViewProps } from "./components/gameViewHelpers";
import LandingPanel from "./components/LandingPanel";
import LobbyView from "./components/LobbyView";
import PlayerToken from "./components/PlayerToken";
import { splitJailOccupants } from "./components/boardHelpers";
import {
  EMPTY_RECENT_EVENTS,
  filterRecentEventsByKind,
  hasRecentEventReferences,
} from "./components/recentEventsHelpers";
import { useDeskCollapse } from "./hooks/useDeskCollapse";
import { useTokenMovement } from "./hooks/useTokenMovement";

const API_BASE_URL = "http://127.0.0.1:8000";
const SESSION_STORAGE_KEY = "monopoly_player_session";
const RECENT_EVENTS_HELP_COLLAPSED_KEY = "monopoly_recent_events_help_collapsed";
const JAIL_FINE_AMOUNT = 50;
const MAX_PROPERTY_LEVEL = 4;
const JAIL_POSITION = 10;
const PROPERTY_RENT_MULTIPLIERS = [1, 2, 4, 7, 11];
const RECENT_EVENT_HIGHLIGHT_MS = 4500;
const MOBILE_RECENT_EVENTS_BREAKPOINT = "(max-width: 640px)";
const PLAYER_TOKEN_COLORS = ["#d94f3d", "#3b7fd4", "#3aaa5e", "#e09b2a"];
const ACTION_GUIDE_FLASH_MS = 900;
const ACTION_SECTION_FOCUS_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const EMPTY_PLAYERS = Object.freeze([]);
const EMPTY_RECORD = Object.freeze({});

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

function loadStoredRecentEventsHelpCollapsed() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(RECENT_EVENTS_HELP_COLLAPSED_KEY);

  if (rawValue == null) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    window.localStorage.removeItem(RECENT_EVENTS_HELP_COLLAPSED_KEY);
    return null;
  }
}

function saveStoredRecentEventsHelpCollapsed(isCollapsed) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    RECENT_EVENTS_HELP_COLLAPSED_KEY,
    JSON.stringify(Boolean(isCollapsed)),
  );
}

function getResponsiveRecentEventsHelpCollapsed() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(MOBILE_RECENT_EVENTS_BREAKPOINT).matches;
}

function clearStoredRecentEventsHelpCollapsed() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(RECENT_EVENTS_HELP_COLLAPSED_KEY);
}


function getDefaultRecentEventsHelpCollapsed() {
  const storedPreference = loadStoredRecentEventsHelpCollapsed();

  if (typeof storedPreference === "boolean") {
    return storedPreference;
  }

  return getResponsiveRecentEventsHelpCollapsed();
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

function getRoomVersion(room) {
  return Number.isInteger(room?.room_version) ? room.room_version : null;
}

function extractBoardCellsFromRoom(room) {
  return Array.isArray(room?.game?.board) ? room.game.board : null;
}

function stripBoardFromRoom(room) {
  if (!room?.game) {
    return room;
  }

  const { board, ...dynamicGame } = room.game;

  if (board === undefined) {
    return room;
  }

  return {
    ...room,
    game: dynamicGame,
  };
}

function shouldApplyIncomingRoomState({
  nextRoom,
  prevRoom,
  activeRoomCode = null,
  expectedRoomCode = null,
  allowRoomActivation = false,
}) {
  if (!nextRoom?.room_code) {
    return false;
  }

  if (expectedRoomCode && nextRoom.room_code !== expectedRoomCode) {
    return false;
  }

  if (!prevRoom) {
    if (activeRoomCode && nextRoom.room_code !== activeRoomCode) {
      return false;
    }

    return allowRoomActivation;
  }

  if (prevRoom.room_code !== nextRoom.room_code) {
    return false;
  }

  const nextVersion = getRoomVersion(nextRoom);
  const prevVersion = getRoomVersion(prevRoom);

  if (nextVersion != null && prevVersion != null) {
    return nextVersion > prevVersion;
  }

  return (nextRoom.last_activity ?? 0) > (prevRoom.last_activity ?? 0);
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
  const [staticBoardCells, setStaticBoardCells] = useState([]);
  const [recentEventsSelectedKinds, setRecentEventsSelectedKinds] = useState({});
  const [recentEventsExpandedGroups, setRecentEventsExpandedGroups] = useState({});
  const [freshRecentEventIds, setFreshRecentEventIds] = useState({});
  const [focusedRecentEventId, setFocusedRecentEventId] = useState(null);
  const [focusedEventCellIndex, setFocusedEventCellIndex] = useState(null);
  const [focusedEventPlayerIds, setFocusedEventPlayerIds] = useState([]);
  const [recentEventsEntityFilter, setRecentEventsEntityFilter] = useState(null);
  const [recentEventsClearFocusAnnouncementId, setRecentEventsClearFocusAnnouncementId] = useState(0);
  const [isRecentEventsHelpCollapsed, setIsRecentEventsHelpCollapsed] = useState(
    getDefaultRecentEventsHelpCollapsed,
  );
  const [hasStoredHelpPreference, setHasStoredHelpPreference] = useState(
    () => loadStoredRecentEventsHelpCollapsed() !== null,
  );
  const [selectedTradeTargetId, setSelectedTradeTargetId] = useState("");
  const [selectedTradePosition, setSelectedTradePosition] = useState("");
  const [tradeCashAmount, setTradeCashAmount] = useState("0");
  const [auctionBidAmount, setAuctionBidAmount] = useState("1");
  const [actionGuideFlash, setActionGuideFlash] = useState({ sectionKey: null, pulseId: 0 });
  const recentEventsRoomCodeRef = useRef(null);
  const highestSeenRecentEventIdRef = useRef(0);
  const recentEventHighlightTimeoutsRef = useRef({});
  const boardCellRefs = useRef({});
  const boardRef = useRef(null);
  const playerCardRefs = useRef({});
  const actionSectionRefs = useRef({});
  const actionGuideLiveStatusRef = useRef(null);
  const actionGuideLiveAnnouncementFrameRef = useRef(null);
  const actionGuideFlashTimeoutRef = useRef(null);
  const currentRoomRef = useRef(null);
  const activeRoomCodeRef = useRef(null);
  const actionInFlightCountRef = useRef(0);
  const isActionInFlightRef = useRef(false);
  const applyIncomingRoomStateRef = useRef(() => false);
  const clearCurrentRoomStateRef = useRef(() => {});
  const currentRoomCode = currentRoom?.room_code ?? null;
  currentRoomRef.current = currentRoom;
  activeRoomCodeRef.current = currentRoomCode;
  const isLobbyOpen = currentRoom?.status === "lobby";
  const isGameOpen = currentRoom?.status === "in_game";
  const isFinished = currentRoom?.status === "finished";
  const boardCells = staticBoardCells;
  const players = currentRoom?.players ?? EMPTY_PLAYERS;
  const playerPositions = currentRoom?.game?.positions;
  const currentRoomCash = currentRoom?.game?.cash ?? {};
  const inJailByPlayer = currentRoom?.game?.in_jail ?? {};
  const turnsInJailByPlayer = currentRoom?.game?.turns_in_jail ?? {};
  const doublesStreakByPlayer = currentRoom?.game?.doubles_streak ?? {};
  const propertyOwners = currentRoom?.game?.property_owners ?? EMPTY_RECORD;
  const propertyLevels = currentRoom?.game?.property_levels ?? EMPTY_RECORD;
  const propertyMortgaged = currentRoom?.game?.property_mortgaged ?? EMPTY_RECORD;
  const pendingPurchase = currentRoom?.game?.pending_purchase ?? null;
  const pendingTrade = currentRoom?.game?.pending_trade ?? null;
  const pendingAuction = currentRoom?.game?.pending_auction ?? null;
  const pendingBankruptcy = currentRoom?.game?.pending_bankruptcy ?? null;
  const lastBankruptcySummary = currentRoom?.game?.last_bankruptcy_summary ?? null;
  const recentEvents = currentRoom?.game?.recent_events ?? EMPTY_RECENT_EVENTS;
  const lastDrawnCard = currentRoom?.game?.last_drawn_card ?? null;
  const winnerId = currentRoom?.game?.winner_id ?? null;
  const cellsByIndex = useMemo(() => {
    const nextCellsByIndex = {};

    for (const cell of boardCells) {
      nextCellsByIndex[cell.index] = cell;
    }

    return nextCellsByIndex;
  }, [boardCells]);
  const playersById = useMemo(() => {
    const nextPlayersById = {};

    for (const player of players) {
      nextPlayersById[player.player_id] = player;
    }

    return nextPlayersById;
  }, [players]);
  const playerColorById = useMemo(() => {
    const nextPlayerColorById = {};

    players.forEach((player, playerIndex) => {
      nextPlayerColorById[player.player_id] =
        PLAYER_TOKEN_COLORS[playerIndex % PLAYER_TOKEN_COLORS.length];
    });

    return nextPlayerColorById;
  }, [players]);
  const occupantsByCellIndex = useMemo(() => {
    const nextOccupantsByCellIndex = {};

    for (const player of players) {
      const playerPosition = playerPositions?.[player.player_id];

      if (!Number.isInteger(playerPosition)) {
        continue;
      }

      if (!nextOccupantsByCellIndex[playerPosition]) {
        nextOccupantsByCellIndex[playerPosition] = [];
      }

      nextOccupantsByCellIndex[playerPosition].push(player);
    }

    return nextOccupantsByCellIndex;
  }, [playerPositions, players]);
  const ownedCellsByPlayer = useMemo(() => {
    const nextOwnedCellsByPlayer = {};

    for (const cell of boardCells) {
      const ownerId = propertyOwners[cell.index];

      if (!ownerId) {
        continue;
      }

      if (!nextOwnedCellsByPlayer[ownerId]) {
        nextOwnedCellsByPlayer[ownerId] = [];
      }

      nextOwnedCellsByPlayer[ownerId].push(cell);
    }

    return nextOwnedCellsByPlayer;
  }, [boardCells, propertyOwners]);
  const mortgagedOwnedCellCountByPlayer = useMemo(() => {
    const nextCounts = {};

    for (const [positionValue, isMortgaged] of Object.entries(propertyMortgaged)) {
      if (!isMortgaged) {
        continue;
      }

      const ownerId = propertyOwners[Number(positionValue)];

      if (!ownerId) {
        continue;
      }

      nextCounts[ownerId] = (nextCounts[ownerId] ?? 0) + 1;
    }

    return nextCounts;
  }, [propertyMortgaged, propertyOwners]);
  const propertyCellsByColorGroup = useMemo(() => {
    const nextPropertyCellsByColorGroup = {};

    for (const cell of boardCells) {
      if (cell.cell_type !== "property" || !cell.color_group) {
        continue;
      }

      if (!nextPropertyCellsByColorGroup[cell.color_group]) {
        nextPropertyCellsByColorGroup[cell.color_group] = [];
      }

      nextPropertyCellsByColorGroup[cell.color_group].push(cell);
    }

    return nextPropertyCellsByColorGroup;
  }, [boardCells]);
  const colorGroupsWithMortgage = useMemo(() => {
    const nextColorGroupsWithMortgage = new Set();

    for (const cell of boardCells) {
      if (
        cell.cell_type === "property" &&
        cell.color_group &&
        propertyMortgaged[cell.index]
      ) {
        nextColorGroupsWithMortgage.add(cell.color_group);
      }
    }

    return nextColorGroupsWithMortgage;
  }, [boardCells, propertyMortgaged]);
  const colorGroupsWithUpgrade = useMemo(() => {
    const nextColorGroupsWithUpgrade = new Set();

    for (const cell of boardCells) {
      if (
        cell.cell_type === "property" &&
        cell.color_group &&
        (propertyLevels[cell.index] ?? 0) > 0
      ) {
        nextColorGroupsWithUpgrade.add(cell.color_group);
      }
    }

    return nextColorGroupsWithUpgrade;
  }, [boardCells, propertyLevels]);
  const fullColorSetsByOwner = useMemo(() => {
    const nextFullColorSetsByOwner = {};

    for (const [colorGroup, groupCells] of Object.entries(propertyCellsByColorGroup)) {
      const firstOwnerId = propertyOwners[groupCells[0]?.index];

      if (!firstOwnerId) {
        continue;
      }

      if (!groupCells.every((cell) => propertyOwners[cell.index] === firstOwnerId)) {
        continue;
      }

      if (!nextFullColorSetsByOwner[firstOwnerId]) {
        nextFullColorSetsByOwner[firstOwnerId] = new Set();
      }

      nextFullColorSetsByOwner[firstOwnerId].add(colorGroup);
    }

    return nextFullColorSetsByOwner;
  }, [propertyCellsByColorGroup, propertyOwners]);
  const winnerPlayer = winnerId ? playersById[winnerId] ?? null : null;
  const currentPlayer = playerId ? playersById[playerId] ?? null : null;

  const {
    movingPlayerIds,
    movingTokenEffects,
    movedCellIndexSet,
    renderedPlayerPositions,
  } = useTokenMovement({ currentRoom, currentRoomCode, playerPositions });

  const {
    hasStoredCollapsedDeskPreference,
    isDeskCollapsible,
    isDeskCollapsed,
    toggleDeskCollapsed,
    handleResetDeskLayout,
  } = useDeskCollapse();

  const hasStoredUiPreference = hasStoredCollapsedDeskPreference || hasStoredHelpPreference;
  const isEliminated = Boolean(currentRoom && isGameOpen && playerId && !currentPlayer);
  const isHost = currentPlayer?.is_host ?? false;
  const canStartGame =
    isHost &&
    isLobbyOpen &&
    players.length >= (currentRoom?.min_players_to_start ?? 0) &&
    players.every((player) => player.is_ready);
  const currentTurnPlayerId = currentRoom?.game?.turn.current_player_id ?? null;
  const currentTurnPlayer = currentTurnPlayerId ? playersById[currentTurnPlayerId] ?? null : null;
  const canRollDice =
    isGameOpen &&
    currentTurnPlayerId === playerId &&
    (currentRoom?.game?.turn.can_roll ?? false) &&
    !pendingPurchase &&
    !pendingTrade &&
    !pendingAuction &&
    !pendingBankruptcy;
  const canResolvePurchase =
    isGameOpen &&
    pendingPurchase?.player_id === playerId &&
    currentPlayer != null;
  const isCurrentPlayerInJail = inJailByPlayer[playerId] ?? false;
  const currentPlayerDoublesStreak = doublesStreakByPlayer[playerId] ?? 0;
  const currentPlayerTurnsInJail = turnsInJailByPlayer[playerId] ?? 0;
  const lastLandedPlayerId = currentRoom?.game?.last_landed_player_id ?? null;
  const lastLandedPosition = currentRoom?.game?.last_landed_position ?? null;
  const lastEffects = currentRoom?.game?.last_effects ?? [];
  const lastLandedPlayer = lastLandedPlayerId ? playersById[lastLandedPlayerId] ?? null : null;
  const lastLandedCell = Number.isInteger(lastLandedPosition)
    ? cellsByIndex[lastLandedPosition] ?? null
    : null;
  const lastLandedCellLevel = lastLandedCell ? propertyLevels[lastLandedCell.index] ?? 0 : 0;
  const lastLandedCellMortgaged = lastLandedCell
    ? Boolean(propertyMortgaged[lastLandedCell.index])
    : false;
  const lastLandedRentHint =
    lastLandedCell && !lastLandedCellMortgaged
      ? getRentHint(lastLandedCell, lastLandedCellLevel)
      : null;
  const lastLandedCellOwner = lastLandedCell
    ? playersById[propertyOwners[lastLandedCell.index]] ?? null
    : null;
  const pendingPurchaseCell = Number.isInteger(pendingPurchase?.position)
    ? cellsByIndex[pendingPurchase.position] ?? null
    : null;
  const pendingPurchasePlayer = pendingPurchase?.player_id
    ? playersById[pendingPurchase.player_id] ?? null
    : null;
  const isPropertyPurchaseDecisionActive = canResolvePurchase && pendingPurchaseCell != null;
  const pendingTradeCell = Number.isInteger(pendingTrade?.position)
    ? cellsByIndex[pendingTrade.position] ?? null
    : null;
  const pendingTradeProposer = pendingTrade?.proposer_id
    ? playersById[pendingTrade.proposer_id] ?? null
    : null;
  const pendingTradeReceiver = pendingTrade?.receiver_id
    ? playersById[pendingTrade.receiver_id] ?? null
    : null;
  const pendingAuctionCell = Number.isInteger(pendingAuction?.position)
    ? cellsByIndex[pendingAuction.position] ?? null
    : null;
  const pendingAuctionInitiator = pendingAuction?.initiator_player_id
    ? playersById[pendingAuction.initiator_player_id] ?? null
    : null;
  const pendingAuctionActivePlayer = pendingAuction?.active_player_id
    ? playersById[pendingAuction.active_player_id] ?? null
    : null;
  const activeUiPlayerId =
    pendingAuction?.active_player_id ??
    pendingPurchase?.player_id ??
    pendingTrade?.receiver_id ??
    pendingBankruptcy?.player_id ??
    currentTurnPlayerId;
  const activeUiPlayer = activeUiPlayerId ? playersById[activeUiPlayerId] ?? null : null;
  const shouldShowCenterActionUi =
    isGameOpen && activeUiPlayerId === playerId && currentPlayer != null;
  const pendingAuctionHighestBidder = pendingAuction?.highest_bidder_id
    ? playersById[pendingAuction.highest_bidder_id] ?? null
    : null;
  const pendingAuctionPassedPlayerIdSet = useMemo(
    () => new Set(pendingAuction?.passed_player_ids ?? []),
    [pendingAuction?.passed_player_ids],
  );
  const pendingAuctionPassedPlayers = useMemo(
    () => players.filter((player) => pendingAuctionPassedPlayerIdSet.has(player.player_id)),
    [pendingAuctionPassedPlayerIdSet, players],
  );
  const pendingBankruptcyPlayer = pendingBankruptcy?.player_id
    ? playersById[pendingBankruptcy.player_id] ?? null
    : null;
  const pendingBankruptcyCreditor =
    pendingBankruptcy?.creditor_type === "player"
      ? playersById[pendingBankruptcy?.creditor_player_id] ?? null
      : null;
  const pendingBankruptcyCreditorLabel =
    pendingBankruptcy?.creditor_type === "player"
      ? pendingBankruptcyCreditor?.nickname ?? "another player"
      : "the bank";
  const priorRecentEvents = useMemo(
    () => (recentEvents.length > 1 ? recentEvents.slice(1) : EMPTY_RECENT_EVENTS),
    [recentEvents],
  );
  const gameRecentEventsKind = recentEventsSelectedKinds.game ?? "all";
  const gameScopedRecentEvents = useMemo(
    () => filterRecentEventsByKind(priorRecentEvents, gameRecentEventsKind),
    [gameRecentEventsKind, priorRecentEvents],
  );
  const minimumAuctionBid = pendingAuction ? Math.max(1, pendingAuction.current_bid + 1) : 1;
  const currentPlayerCash = currentRoomCash[playerId] ?? 0;
  const canAffordPendingPurchase = currentPlayerCash >= (pendingPurchase?.price ?? Infinity);
  const focusedPlayerIdSet = useMemo(() => new Set(focusedEventPlayerIds), [focusedEventPlayerIds]);
  const { cellRecentEventCounts, playerRecentEventCounts } = useMemo(() => {
    const nextCellRecentEventCounts = {};
    const nextPlayerRecentEventCounts = {};

    for (const event of gameScopedRecentEvents) {
      if (Number.isInteger(event.cell_index)) {
        nextCellRecentEventCounts[event.cell_index] =
          (nextCellRecentEventCounts[event.cell_index] ?? 0) + 1;
      }

      const relatedPlayerIds = [...new Set([event.player_id, event.target_player_id].filter(Boolean))];
      for (const relatedPlayerId of relatedPlayerIds) {
        nextPlayerRecentEventCounts[relatedPlayerId] =
          (nextPlayerRecentEventCounts[relatedPlayerId] ?? 0) + 1;
      }
    }

    return {
      cellRecentEventCounts: nextCellRecentEventCounts,
      playerRecentEventCounts: nextPlayerRecentEventCounts,
    };
  }, [gameScopedRecentEvents]);

  const inspectedCell = Number.isInteger(focusedEventCellIndex)
    ? cellsByIndex[focusedEventCellIndex] ?? null
    : null;
  const inspectedCellLevel = inspectedCell ? propertyLevels[inspectedCell.index] ?? 0 : 0;
  const inspectedCellMortgaged = inspectedCell
    ? Boolean(propertyMortgaged[inspectedCell.index])
    : false;
  const inspectedCellOwner = inspectedCell
    ? playersById[propertyOwners[inspectedCell.index]] ?? null
    : null;
  const inspectedCellRentHint = inspectedCell
    ? getRentHint(inspectedCell, inspectedCellLevel)
    : null;
  const inspectedCellOccupants = inspectedCell
    ? occupantsByCellIndex[inspectedCell.index] ?? []
    : [];
  const inspectedCellLinkedEventCount = inspectedCell
    ? cellRecentEventCounts[inspectedCell.index] ?? 0
    : 0;
  const inspectedCellJailGroups =
    inspectedCell?.index === JAIL_POSITION
      ? splitJailOccupants(inspectedCellOccupants, currentRoom?.game?.in_jail ?? {})
      : null;
  const inspectedPlayerId =
    recentEventsEntityFilter?.type === "player" && recentEventsEntityFilter.playerIds.length === 1
      ? recentEventsEntityFilter.playerIds[0]
      : focusedEventPlayerIds.length === 1
        ? focusedEventPlayerIds[0]
        : null;
  const inspectedPlayer = inspectedPlayerId ? playersById[inspectedPlayerId] ?? null : null;
  const inspectedPlayerColor = inspectedPlayer
    ? playerColorById[inspectedPlayer.player_id] ?? null
    : null;
  const inspectedPlayerPosition = inspectedPlayer
    ? playerPositions?.[inspectedPlayer.player_id] ?? 0
    : 0;
  const inspectedPlayerCell = inspectedPlayer
    ? cellsByIndex[inspectedPlayerPosition] ?? null
    : null;
  const inspectedPlayerOwnedCells = inspectedPlayer
    ? ownedCellsByPlayer[inspectedPlayer.player_id] ?? []
    : [];
  const inspectedPlayerOwnedCellsPreview = inspectedPlayerOwnedCells.slice(0, 3);
  const inspectedPlayerCash = inspectedPlayer
    ? currentRoomCash[inspectedPlayer.player_id] ?? 0
    : 0;
  const inspectedPlayerMortgagedCellCount = inspectedPlayer
    ? mortgagedOwnedCellCountByPlayer[inspectedPlayer.player_id] ?? 0
    : 0;
  const inspectedPlayerInJail = inspectedPlayer
    ? inJailByPlayer[inspectedPlayer.player_id] ?? false
    : false;
  const inspectedPlayerTurnsInJail = inspectedPlayer
    ? turnsInJailByPlayer[inspectedPlayer.player_id] ?? 0
    : 0;
  const inspectedPlayerLinkedEventCount = inspectedPlayer
    ? playerRecentEventCounts[inspectedPlayer.player_id] ?? 0
    : 0;
  const inspectedPlayerIsCurrentTurn = inspectedPlayer?.player_id === activeUiPlayerId;
  const inspectedPlayerCanBeTradeTarget =
    inspectedPlayer != null &&
    canProposeTrade &&
    inspectedPlayer.player_id !== playerId &&
    tradeTargets.some((player) => player.player_id === inspectedPlayer.player_id);
  const inspectedPlayerIsSelectedTradeTarget =
    inspectedPlayerCanBeTradeTarget && selectedTradeTargetId === inspectedPlayer.player_id;
  let inspectedPlayerTradeMessage = null;
  let inspectedPlayerDebtMessage = null;

  if (inspectedPlayer && pendingBankruptcy?.player_id === inspectedPlayer.player_id) {
    inspectedPlayerDebtMessage = `${inspectedPlayer.nickname} owes ${
      pendingBankruptcyCreditorLabel
    } $${pendingBankruptcy.amount_owed} and is handling their debts.`;
  } else if (
    pendingBankruptcy?.creditor_type === "player" &&
    pendingBankruptcy.creditor_player_id === inspectedPlayer?.player_id
  ) {
    inspectedPlayerDebtMessage = `${inspectedPlayer.nickname} is waiting to collect $${
      pendingBankruptcy.amount_owed
    } from ${pendingBankruptcyPlayer?.nickname ?? "the debtor"}.`;
  }

  function getRecentEventsSelectedKind(cardKey) {
    return recentEventsSelectedKinds[cardKey] ?? "all";
  }

  function getRecentEventsExpandedState(cardKey) {
    return recentEventsExpandedGroups[cardKey] ?? {};
  }

  function clearRecentEventHighlightTimeouts() {
    Object.values(recentEventHighlightTimeoutsRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    recentEventHighlightTimeoutsRef.current = {};
  }

  function resetRecentEventsUiState() {
    setRecentEventsSelectedKinds({});
    setRecentEventsExpandedGroups({});
    setFreshRecentEventIds({});
    setFocusedRecentEventId(null);
    setFocusedEventCellIndex(null);
    setFocusedEventPlayerIds([]);
    setRecentEventsEntityFilter(null);
    setRecentEventsClearFocusAnnouncementId(0);
    setIsRecentEventsHelpCollapsed(getDefaultRecentEventsHelpCollapsed());
    setHasStoredHelpPreference(loadStoredRecentEventsHelpCollapsed() !== null);
    clearRecentEventHighlightTimeouts();
    recentEventsRoomCodeRef.current = null;
    highestSeenRecentEventIdRef.current = 0;
  }

  applyIncomingRoomStateRef.current = (nextRoom, options = {}) => {
    const nextBoardCells = extractBoardCellsFromRoom(nextRoom);
    const sanitizedNextRoom = stripBoardFromRoom(nextRoom);
    const shouldApply = shouldApplyIncomingRoomState({
      nextRoom: sanitizedNextRoom,
      prevRoom: currentRoomRef.current,
      activeRoomCode: activeRoomCodeRef.current,
      expectedRoomCode: options.expectedRoomCode ?? null,
      allowRoomActivation: options.allowRoomActivation ?? false,
    });

    if (!shouldApply) {
      return false;
    }

    if (nextBoardCells) {
      startTransition(() => {
        setStaticBoardCells(nextBoardCells);
      });
    }

    currentRoomRef.current = sanitizedNextRoom;
    activeRoomCodeRef.current = sanitizedNextRoom.room_code ?? null;
    startTransition(() => {
      setCurrentRoom(sanitizedNextRoom);
    });
    return true;
  };

  clearCurrentRoomStateRef.current = () => {
    currentRoomRef.current = null;
    activeRoomCodeRef.current = null;
    startTransition(() => {
      setCurrentRoom(null);
    });
  };

  function beginRoomActionRequest() {
    actionInFlightCountRef.current += 1;
    isActionInFlightRef.current = true;
  }

  function endRoomActionRequest() {
    actionInFlightCountRef.current = Math.max(0, actionInFlightCountRef.current - 1);
    isActionInFlightRef.current = actionInFlightCountRef.current > 0;
  }

  function handleRecentEventsHelpToggle() {
    setIsRecentEventsHelpCollapsed((current) => {
      const nextValue = !current;
      saveStoredRecentEventsHelpCollapsed(nextValue);
      setHasStoredHelpPreference(true);
      return nextValue;
    });
  }

  function handleRecentEventsHelpReset() {
    clearStoredRecentEventsHelpCollapsed();
    setHasStoredHelpPreference(false);
    setIsRecentEventsHelpCollapsed(getResponsiveRecentEventsHelpCollapsed());
  }

  function handleRecentEventsKindChange(cardKey, kind) {
    setRecentEventsSelectedKinds((current) => {
      if (current[cardKey] === kind) {
        return current;
      }

      return {
        ...current,
        [cardKey]: kind,
      };
    });
  }

  function handleRecentEventsGroupToggle(cardKey, groupKey) {
    setRecentEventsExpandedGroups((current) => {
      const cardExpandedGroups = current[cardKey] ?? {};

      return {
        ...current,
        [cardKey]: {
          ...cardExpandedGroups,
          [groupKey]: !cardExpandedGroups[groupKey],
        },
      };
    });
  }

  const clearRecentEventFocus = useCallback(() => {
    const hadFocusState =
      focusedRecentEventId != null ||
      focusedEventCellIndex != null ||
      focusedEventPlayerIds.length > 0 ||
      recentEventsEntityFilter != null;

    setFocusedRecentEventId(null);
    setFocusedEventCellIndex(null);
    setFocusedEventPlayerIds([]);
    setRecentEventsEntityFilter(null);

    if (hadFocusState) {
      setRecentEventsClearFocusAnnouncementId((current) => current + 1);
    }
  }, [
    focusedEventCellIndex,
    focusedEventPlayerIds.length,
    focusedRecentEventId,
    recentEventsEntityFilter,
  ]);

  const registerBoardCellRef = useCallback((cellIndex, element) => {
    if (element) {
      boardCellRefs.current[cellIndex] = element;
    } else {
      delete boardCellRefs.current[cellIndex];
    }
  }, []);

  const registerPlayerCardRef = useCallback((playerId, element) => {
    if (element) {
      playerCardRefs.current[playerId] = element;
    } else {
      delete playerCardRefs.current[playerId];
    }
  }, []);

  const scrollToRecentEventTarget = useCallback((event) => {
    const hasCellTarget = Number.isInteger(event.cell_index);
    const primaryPlayerId = event.player_id ?? event.target_player_id ?? null;
    const targetElement =
      (hasCellTarget ? boardCellRefs.current[event.cell_index] : null) ??
      (primaryPlayerId ? playerCardRefs.current[primaryPlayerId] : null);

    targetElement?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }, []);

  const handleRecentEventFocus = useCallback((event) => {
    if (!hasRecentEventReferences(event)) {
      return;
    }

    if (focusedRecentEventId === event.event_id) {
      clearRecentEventFocus();
      return;
    }

    const playerIds = [...new Set([event.player_id, event.target_player_id].filter(Boolean))];

    const hasCellRef = Number.isInteger(event.cell_index);

    setRecentEventsEntityFilter(null);
    setFocusedRecentEventId(event.event_id ?? null);
    setFocusedEventCellIndex(hasCellRef ? event.cell_index : null);
    setFocusedEventPlayerIds(hasCellRef ? [] : playerIds);
    scrollToRecentEventTarget(event);
  }, [clearRecentEventFocus, focusedRecentEventId, scrollToRecentEventTarget]);

  const handleBoardCellFocus = useCallback((cell) => {
    if (recentEventsEntityFilter?.type === "cell" && recentEventsEntityFilter.cellIndex === cell.index) {
      clearRecentEventFocus();
      return;
    }

    setFocusedRecentEventId(null);
    setFocusedEventCellIndex(cell.index);
    setFocusedEventPlayerIds([]);
    setRecentEventsEntityFilter({
      type: "cell",
      cellIndex: cell.index,
      label: cell.name,
    });
  }, [clearRecentEventFocus, recentEventsEntityFilter]);

  const handlePlayerCardFocus = useCallback((player) => {
    if (
      recentEventsEntityFilter?.type === "player" &&
      recentEventsEntityFilter.playerIds.length === 1 &&
      recentEventsEntityFilter.playerIds[0] === player.player_id
    ) {
      clearRecentEventFocus();
      return;
    }

    setFocusedRecentEventId(null);
    setFocusedEventCellIndex(null);
    setFocusedEventPlayerIds([player.player_id]);
    setRecentEventsEntityFilter({
      type: "player",
      playerIds: [player.player_id],
      label: player.nickname,
    });
  }, [clearRecentEventFocus, recentEventsEntityFilter]);

  const getPlayerById = useCallback(
    (targetPlayerId) => playersById[targetPlayerId] ?? null,
    [playersById],
  );

  const getPlayerPosition = useCallback(
    (targetPlayerId) => playerPositions?.[targetPlayerId] ?? 0,
    [playerPositions],
  );

  const getPlayerCell = useCallback(
    (targetPlayerId) => {
      const targetPosition = playerPositions?.[targetPlayerId];

      return Number.isInteger(targetPosition) ? cellsByIndex[targetPosition] ?? null : null;
    },
    [cellsByIndex, playerPositions],
  );

  const getOwnedCellsByPlayer = useCallback(
    (targetPlayerId) => {
      if (!targetPlayerId) {
        return [];
      }

      return ownedCellsByPlayer[targetPlayerId] ?? [];
    },
    [ownedCellsByPlayer],
  );

  const getMortgagedOwnedCellCount = useCallback(
    (targetPlayerId) => {
      if (!targetPlayerId) {
        return 0;
      }

      return mortgagedOwnedCellCountByPlayer[targetPlayerId] ?? 0;
    },
    [mortgagedOwnedCellCountByPlayer],
  );

  const getPlayerColor = useCallback(
    (targetPlayerId, fallbackIndex = 0) =>
      playerColorById[targetPlayerId] ??
      PLAYER_TOKEN_COLORS[fallbackIndex % PLAYER_TOKEN_COLORS.length],
    [playerColorById],
  );

  const renderPlayerToken = useCallback((player, occupantIndex) => {
    const tokenColor = getPlayerColor(player.player_id, occupantIndex);

    return (
      <PlayerToken
        key={player.player_id}
        player={player}
        occupantIndex={occupantIndex}
        tokenColor={tokenColor}
        isActiveTurn={activeUiPlayerId === player.player_id}
      />
    );
  }, [activeUiPlayerId, getPlayerColor]);

  const currentPlayerOwnedCells = useMemo(
    () => (currentPlayer ? ownedCellsByPlayer[currentPlayer.player_id] ?? [] : []),
    [currentPlayer, ownedCellsByPlayer],
  );
  const ownedBuyableCells = useMemo(
    () => currentPlayerOwnedCells.filter((cell) => Boolean(cell.price)),
    [currentPlayerOwnedCells],
  );
  const ownedStandardProperties = useMemo(
    () => currentPlayerOwnedCells.filter((cell) => cell.cell_type === "property"),
    [currentPlayerOwnedCells],
  );
  const upgradeableProperties = useMemo(
    () =>
      currentPlayerOwnedCells.filter((cell) => {
        if (cell.cell_type !== "property" || !cell.color_group) {
          return false;
        }

        if (!(fullColorSetsByOwner[currentPlayer?.player_id]?.has(cell.color_group) ?? false)) {
          return false;
        }

        if (colorGroupsWithMortgage.has(cell.color_group)) {
          return false;
        }

        return (propertyLevels[cell.index] ?? 0) < MAX_PROPERTY_LEVEL;
      }),
    [
      colorGroupsWithMortgage,
      currentPlayer?.player_id,
      currentPlayerOwnedCells,
      fullColorSetsByOwner,
      propertyLevels,
    ],
  );
  const sellableProperties = useMemo(
    () =>
      ownedStandardProperties.filter((cell) => (propertyLevels[cell.index] ?? 0) > 0),
    [ownedStandardProperties, propertyLevels],
  );

  const canUsePreRollDesk =
    isGameOpen &&
    currentTurnPlayerId === playerId &&
    (currentRoom?.game?.turn.can_roll ?? false) &&
    !pendingPurchase &&
    !pendingTrade &&
    !pendingAuction &&
    !pendingBankruptcy &&
    currentPlayer != null;
  const canUpgradeProperties = canUsePreRollDesk;
  const canManageDebtRecovery =
    isGameOpen &&
    pendingBankruptcy?.player_id === playerId &&
    currentPlayer != null;
  const canManageMortgages = canUsePreRollDesk || canManageDebtRecovery;
  const canSellUpgrades = canUsePreRollDesk || canManageDebtRecovery;
  const canUnmortgageProperties = canUsePreRollDesk;
  const mortgageableCells = useMemo(
    () =>
      ownedBuyableCells.filter((cell) => {
        if (propertyMortgaged[cell.index]) {
          return false;
        }

        if (cell.cell_type === "property" && colorGroupsWithUpgrade.has(cell.color_group)) {
          return false;
        }

        return true;
      }),
    [colorGroupsWithUpgrade, ownedBuyableCells, propertyMortgaged],
  );
  const unmortgageableCells = useMemo(
    () => ownedBuyableCells.filter((cell) => propertyMortgaged[cell.index]),
    [ownedBuyableCells, propertyMortgaged],
  );
  const tradeTargets = useMemo(
    () =>
      currentPlayer == null
        ? []
        : players.filter((player) => player.player_id !== currentPlayer.player_id),
    [currentPlayer, players],
  );
  const tradeableCells = useMemo(
    () =>
      ownedBuyableCells.filter((cell) => {
        if (propertyMortgaged[cell.index]) {
          return false;
        }

        if (cell.cell_type === "property" && colorGroupsWithUpgrade.has(cell.color_group)) {
          return false;
        }

        return true;
      }),
    [colorGroupsWithUpgrade, ownedBuyableCells, propertyMortgaged],
  );
  const canProposeTrade = canUsePreRollDesk || canManageDebtRecovery;
  const canAcceptTrade =
    isGameOpen &&
    pendingTrade?.receiver_id === playerId &&
    currentPlayer != null;
  const canRejectTrade =
    isGameOpen &&
    (pendingTrade?.receiver_id === playerId || pendingTrade?.proposer_id === playerId) &&
    currentPlayer != null;
  const canBidInAuction =
    isGameOpen &&
    pendingAuction?.active_player_id === playerId &&
    currentPlayer != null;
  const canPassAuction = canBidInAuction;
  const canAffordAuctionBid = currentPlayerCash >= minimumAuctionBid;
  const canPayJailFine = canUsePreRollDesk && isCurrentPlayerInJail;
  const canAffordJailFine = currentPlayerCash >= JAIL_FINE_AMOUNT;
  const canDeclareBankruptcy = canManageDebtRecovery;
  const inspectedCellPosition = inspectedCell?.index ?? null;
  const inspectedCellOwnedByYou = inspectedCellOwner?.player_id === playerId;
  const inspectedCellIsPendingPurchase =
    inspectedCellPosition != null && pendingPurchaseCell?.index === inspectedCellPosition;
  const inspectedCellCanUpgrade =
    inspectedCellPosition != null &&
    canUpgradeProperties &&
    upgradeableProperties.some((cell) => cell.index === inspectedCellPosition);
  const inspectedCellCanSellUpgrade =
    inspectedCellPosition != null &&
    canSellUpgrades &&
    sellableProperties.some((cell) => cell.index === inspectedCellPosition);
  const inspectedCellCanMortgage =
    inspectedCellPosition != null &&
    canManageMortgages &&
    mortgageableCells.some((cell) => cell.index === inspectedCellPosition);
  const inspectedCellCanUnmortgage =
    inspectedCellPosition != null &&
    canUnmortgageProperties &&
    unmortgageableCells.some((cell) => cell.index === inspectedCellPosition);
  const inspectedCellCanUseTradeDesk =
    inspectedCellPosition != null &&
    canProposeTrade &&
    tradeTargets.length > 0 &&
    tradeableCells.some((cell) => cell.index === inspectedCellPosition);
  const inspectedCellIsSelectedInTradeDesk =
    inspectedCellCanUseTradeDesk && selectedTradePosition === String(inspectedCellPosition);
  const inspectedCellHasQuickActions =
    inspectedCellCanUpgrade ||
    inspectedCellCanSellUpgrade ||
    inspectedCellCanMortgage ||
    inspectedCellCanUnmortgage ||
    inspectedCellCanUseTradeDesk;
  let inspectedCellQuickActionMessage = null;

  if (inspectedCellIsPendingPurchase && canResolvePurchase) {
    inspectedCellQuickActionMessage =
      canAffordPendingPurchase
        ? "Use the purchase panel in the center of the board to buy this cell or send it straight to auction."
        : "Use the purchase panel in the center of the board to send this cell straight to auction. The buy option stays disabled until you have enough cash.";
  } else if (inspectedCellIsPendingPurchase && !canResolvePurchase) {
    inspectedCellQuickActionMessage = `${
      pendingPurchasePlayer?.nickname ?? "The active player"
    } is deciding whether to buy this.`;
  } else if (inspectedCell?.price && !inspectedCellOwner) {
    inspectedCellQuickActionMessage =
      "This cell is unowned. The purchase panel opens in the board center when you land on it.";
  } else if (inspectedCellOwnedByYou && inspectedCell.price && !inspectedCellHasQuickActions) {
    if (pendingTrade) {
      inspectedCellQuickActionMessage = "Quick actions are paused while a trade offer is waiting for a response.";
    } else if (pendingAuction) {
      inspectedCellQuickActionMessage = "Quick actions are paused while the auction is still in progress.";
    } else if (pendingPurchase) {
      inspectedCellQuickActionMessage = `Quick actions return after ${pendingPurchasePlayer?.nickname ?? "the active player"} decides on the purchase.`;
    } else if (pendingBankruptcy && !canManageDebtRecovery) {
      inspectedCellQuickActionMessage = "Quick actions are paused while another player handles their debts.";
    } else if (currentTurnPlayerId !== playerId) {
      inspectedCellQuickActionMessage =
        "Quick actions for your cells open at the start of your own turn before rolling.";
    } else if (!(currentRoom?.game?.turn.can_roll ?? false)) {
      inspectedCellQuickActionMessage =
        "Quick actions are only available at the start of your turn, before you roll.";
    } else {
      inspectedCellQuickActionMessage = "No quick action is available for this cell right now.";
    }
  } else if (inspectedCellIsSelectedInTradeDesk) {
    inspectedCellQuickActionMessage = "This property is already selected in the trade form below.";
  }

  if (inspectedPlayerIsSelectedTradeTarget) {
    inspectedPlayerTradeMessage = "This player is already selected in the trade form below.";
  } else if (inspectedPlayer && inspectedPlayer.player_id === playerId) {
    inspectedPlayerTradeMessage =
      "This is your player summary. Pick another player here when you want to prepare a trade.";
  } else if (inspectedPlayer && !inspectedPlayerCanBeTradeTarget) {
    if (pendingTrade) {
      inspectedPlayerTradeMessage = "Trade target selection is paused while a trade offer is waiting for a response.";
    } else if (pendingAuction) {
      inspectedPlayerTradeMessage = "Trade target selection is paused while the auction is still in progress.";
    } else if (pendingPurchase) {
      inspectedPlayerTradeMessage = `Trade target selection returns after ${
        pendingPurchasePlayer?.nickname ?? "the active player"
      } decides on the purchase.`;
    } else if (pendingBankruptcy && !canManageDebtRecovery) {
      inspectedPlayerTradeMessage =
        "Trade target selection is paused while another player handles their debts.";
    } else if (!canProposeTrade) {
      inspectedPlayerTradeMessage =
        "Trade target selection opens at the start of your turn, before you roll.";
    } else if (tradeableCells.length === 0) {
      inspectedPlayerTradeMessage =
        "You need at least one unmortgaged cell without upgrades before you can prepare a trade.";
      } else if (tradeTargets.length === 0) {
        inspectedPlayerTradeMessage = "There is no other player available to trade with right now.";
      }
  }

  function getDeskLockReason(deskLabel) {
    if (pendingPurchase) {
      return `${deskLabel} unlocks after ${
        pendingPurchasePlayer?.nickname ?? "the active player"
      } resolves the property decision.`;
    }

    if (pendingTrade) {
      return `${deskLabel} unlocks after the current trade offer is resolved.`;
    }

    if (pendingBankruptcy && !canManageDebtRecovery) {
      return `${deskLabel} is locked while another player handles debt recovery.`;
    }

    if (currentTurnPlayerId !== playerId) {
      return `${deskLabel} opens on your turn, before you roll.`;
    }

    if (!(currentRoom?.game?.turn.can_roll ?? false)) {
      return `${deskLabel} is only available before you roll.`;
    }

    return `${deskLabel} is not available right now.`;
  }

  function handleResetUiPreferences() {
    handleResetDeskLayout();
    handleRecentEventsHelpReset();
    setStatus("UI preferences restored to default.");
    queueActionGuideAnnouncement("UI preferences restored to default.");
  }

  const showTradeDesk = !pendingPurchase && !pendingAuction && (pendingTrade || ownedBuyableCells.length > 0);
  const canShowTradeForm =
    !pendingTrade && canProposeTrade && tradeableCells.length > 0 && tradeTargets.length > 0;
  const tradeDeskState = pendingTrade
    ? {
        statusLabel: canAcceptTrade ? "Action needed" : "Waiting",
        statusTone: canAcceptTrade ? "action" : "waiting",
        note: canAcceptTrade
          ? "A trade offer is waiting for your response."
          : pendingTrade.proposer_id === playerId
            ? "Your trade offer is waiting for the other player's answer."
            : "A trade offer is currently blocking new trade actions.",
      }
    : canShowTradeForm
      ? {
          statusLabel: "Open",
          statusTone: "open",
          note: canManageDebtRecovery
            ? "You can prepare a cash-for-property offer right now to help cover the debt."
            : "You can prepare a cash-for-property offer before rolling.",
        }
      : !canProposeTrade
        ? {
            statusLabel: "Locked",
            statusTone: "locked",
            note: getDeskLockReason("Trade desk"),
          }
        : tradeTargets.length === 0
          ? {
              statusLabel: "Empty",
              statusTone: "empty",
              note: "No other player is available to trade with right now.",
            }
          : {
              statusLabel: "Empty",
              statusTone: "empty",
              note: "No cells to trade. Mortgaged or upgraded color groups are excluded.",
            };

  const showMortgageDesk = !pendingPurchase && !pendingAuction && ownedBuyableCells.length > 0;
  const showMortgageLists =
    mortgageableCells.length > 0 || (unmortgageableCells.length > 0 && !canManageDebtRecovery);
  const mortgageDeskState =
    canManageDebtRecovery && mortgageableCells.length > 0
      ? {
          statusLabel: "Action needed",
          statusTone: "action",
          note: "Use mortgages now if you need quick cash to stay in the game.",
        }
      : canManageMortgages && showMortgageLists
        ? {
            statusLabel: "Open",
            statusTone: "open",
            note: canManageDebtRecovery
              ? "You can mortgage properties right now to raise cash."
              : "You can mortgage or buy back properties before rolling.",
          }
        : canManageDebtRecovery
          ? {
              statusLabel: "Empty",
              statusTone: "empty",
              note:
                unmortgageableCells.length > 0
                  ? "Buy-backs are paused during debt recovery. Only new mortgages can help right now."
                  : "No mortgage options are available from your current properties.",
            }
          : canManageMortgages
            ? {
                statusLabel: "Empty",
                statusTone: "empty",
                note: "No mortgage changes are available. Sell upgrades in a color group before mortgaging it.",
              }
            : {
                statusLabel: "Locked",
                statusTone: "locked",
                note: getDeskLockReason("Mortgage desk"),
              };

  const showUpgradeDesk = !pendingPurchase && !pendingAuction && ownedStandardProperties.length > 0;
  const showUpgradeLists =
    (!canManageDebtRecovery && upgradeableProperties.length > 0) || sellableProperties.length > 0;
  const upgradeDeskState =
    canManageDebtRecovery && sellableProperties.length > 0
      ? {
          statusLabel: "Action needed",
          statusTone: "action",
          note: "Sell upgrades now if you need cash to avoid bankruptcy.",
        }
      : !canManageDebtRecovery && canUpgradeProperties && showUpgradeLists
        ? {
            statusLabel: "Open",
            statusTone: "open",
            note: "You can build or sell upgrades before rolling.",
          }
        : canManageDebtRecovery
          ? {
              statusLabel: "Empty",
              statusTone: "empty",
              note: "No upgrades are available to sell from your current properties.",
            }
          : canUpgradeProperties
            ? {
                statusLabel: "Empty",
                statusTone: "empty",
                note: "Nothing to build or sell. Building needs a full unmortgaged color set; selling needs an existing upgrade.",
              }
            : {
                statusLabel: "Locked",
                statusTone: "locked",
                note: getDeskLockReason("Upgrades desk"),
              };
  const tradeDeskCollapsed = isDeskCollapsed("trade", tradeDeskState.statusTone);
  const mortgageDeskCollapsed = isDeskCollapsed("mortgage", mortgageDeskState.statusTone);
  const upgradeDeskCollapsed = isDeskCollapsed("upgrade", upgradeDeskState.statusTone);

  function setActionSectionRef(sectionKey, element) {
    if (element) {
      actionSectionRefs.current[sectionKey] = element;
    } else {
      delete actionSectionRefs.current[sectionKey];
    }
  }

  function triggerActionGuideFlash(sectionKey) {
    if (!sectionKey) {
      return;
    }

    if (actionGuideFlashTimeoutRef.current != null) {
      window.clearTimeout(actionGuideFlashTimeoutRef.current);
      actionGuideFlashTimeoutRef.current = null;
    }

    setActionGuideFlash((current) => ({
      sectionKey,
      pulseId: current.pulseId + 1,
    }));

    actionGuideFlashTimeoutRef.current = window.setTimeout(() => {
      setActionGuideFlash((current) =>
        current.sectionKey === sectionKey
          ? {
              ...current,
              sectionKey: null,
            }
          : current,
      );
      actionGuideFlashTimeoutRef.current = null;
    }, ACTION_GUIDE_FLASH_MS);
  }

  function getActionGuideFlashClassName(sectionKey) {
    return actionGuideFlash.sectionKey === sectionKey ? "is-guide-flash" : "";
  }

  function getActionGuideFlashStyle(sectionKey) {
    if (actionGuideFlash.sectionKey !== sectionKey) {
      return undefined;
    }

    return {
      "--guide-target-flash-name":
        actionGuideFlash.pulseId % 2 === 0 ? "guide-target-flash-a" : "guide-target-flash-b",
    };
  }

  function queueActionGuideAnnouncement(message) {
    if (!actionGuideLiveStatusRef.current || !message) {
      return;
    }

    if (actionGuideLiveAnnouncementFrameRef.current != null) {
      window.cancelAnimationFrame(actionGuideLiveAnnouncementFrameRef.current);
      actionGuideLiveAnnouncementFrameRef.current = null;
    }

    actionGuideLiveStatusRef.current.textContent = "";
    actionGuideLiveAnnouncementFrameRef.current = window.requestAnimationFrame(() => {
      if (actionGuideLiveStatusRef.current) {
        actionGuideLiveStatusRef.current.textContent = message;
      }
      actionGuideLiveAnnouncementFrameRef.current = null;
    });
  }

  function scrollToActionSection(sectionKey, focusKey = null) {
    if (!sectionKey) {
      return;
    }

    const section = actionSectionRefs.current[sectionKey];

    if (!section) {
      return;
    }

    section.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });

    const preferredFocusable =
      buildGuideFocusSelector(focusKey) == null
        ? null
        : section.querySelector(buildGuideFocusSelector(focusKey));
    const firstFocusable = preferredFocusable ?? section.querySelector(ACTION_SECTION_FOCUS_SELECTOR);
    const resolvedFocusKey = firstFocusable?.getAttribute("data-guide-focus") ?? null;
    const announcement = buildActionGuideJumpAnnouncement(sectionKey, resolvedFocusKey);

    triggerActionGuideFlash(sectionKey);

    window.requestAnimationFrame(() => {
      if (firstFocusable) {
        firstFocusable.focus({ preventScroll: true });
      }
      queueActionGuideAnnouncement(announcement);
    });
  }

  const actionGuide = buildActionGuide({
    currentTurnPlayer,
    canProposeTrade,
    tradeableCells,
    tradeTargets,
    canUpgradeProperties,
    upgradeableProperties,
    canSellUpgrades,
    canManageDebtRecovery,
    sellableProperties,
    canManageMortgages,
    mortgageableCells,
    canUnmortgageProperties,
    unmortgageableCells,
    canResolvePurchase,
    canAffordPendingPurchase,
    pendingPurchaseCell,
    pendingPurchase,
    pendingPurchasePlayer,
    pendingAuction,
    pendingAuctionCell,
    canBidInAuction,
    canAffordAuctionBid,
    minimumAuctionBid,
    pendingAuctionActivePlayer,
    pendingTrade,
    pendingTradeCell,
    canAcceptTrade,
    pendingTradeProposer,
    playerId,
    canRejectTrade,
    pendingTradeReceiver,
    pendingBankruptcy,
    pendingBankruptcyCreditor,
    pendingBankruptcyCreditorLabel,
    pendingBankruptcyPlayer,
    currentTurnPlayerId,
    isCurrentPlayerInJail,
    canPayJailFine,
    canAffordJailFine,
    jailFineAmount: JAIL_FINE_AMOUNT,
    currentPlayerTurnsInJail,
    canUsePreRollDesk,
    currentPlayerDoublesStreak,
  });

  useEffect(() => {
    if (!tradeTargets.some((player) => player.player_id === selectedTradeTargetId)) {
      setSelectedTradeTargetId(tradeTargets[0]?.player_id ?? "");
    }
  }, [selectedTradeTargetId, tradeTargets]);

  useEffect(() => {
    return () => {
      if (actionGuideLiveAnnouncementFrameRef.current != null) {
        window.cancelAnimationFrame(actionGuideLiveAnnouncementFrameRef.current);
        actionGuideLiveAnnouncementFrameRef.current = null;
      }
      if (actionGuideFlashTimeoutRef.current != null) {
        window.clearTimeout(actionGuideFlashTimeoutRef.current);
        actionGuideFlashTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!tradeableCells.some((cell) => String(cell.index) === selectedTradePosition)) {
      setSelectedTradePosition(tradeableCells[0] ? String(tradeableCells[0].index) : "");
    }
  }, [selectedTradePosition, tradeableCells]);

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
    if (staticBoardCells.length > 0 || currentRoom?.status !== "in_game") {
      return;
    }

    let ignore = false;

    fetch(`${API_BASE_URL}/board`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Board load failed.");
        }

        return response.json();
      })
      .then((data) => {
        if (ignore || !Array.isArray(data.board)) {
          return;
        }

        startTransition(() => {
          setStaticBoardCells(data.board);
        });
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [currentRoom?.status, staticBoardCells.length]);

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
        applyIncomingRoomStateRef.current(data.room, {
          expectedRoomCode: storedSession.room_code,
          allowRoomActivation: true,
        });
        setRoomCode(data.room.room_code);
        setStatus(`Welcome back to room ${data.room.room_code}.`);
      })
      .catch(() => {
        clearStoredSession();
        setPlayerId("");
        setPlayerToken("");
        clearCurrentRoomStateRef.current();
        setRecentEventsSelectedKinds({});
        setRecentEventsExpandedGroups({});
        setFreshRecentEventIds({});
        setFocusedRecentEventId(null);
        setFocusedEventCellIndex(null);
        setFocusedEventPlayerIds([]);
        Object.values(recentEventHighlightTimeoutsRef.current).forEach((timeoutId) => {
          window.clearTimeout(timeoutId);
        });
        recentEventHighlightTimeoutsRef.current = {};
        recentEventsRoomCodeRef.current = null;
        highestSeenRecentEventIdRef.current = 0;
        setStatus("Saved session expired. Create or join a room again.");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }, []);

  useEffect(() => {
    if (!currentRoomCode) {
      setRecentEventsSelectedKinds({});
      setRecentEventsExpandedGroups({});
      setFreshRecentEventIds({});
      setFocusedRecentEventId(null);
      setFocusedEventCellIndex(null);
      setFocusedEventPlayerIds([]);
      Object.values(recentEventHighlightTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      recentEventHighlightTimeoutsRef.current = {};
      recentEventsRoomCodeRef.current = null;
      highestSeenRecentEventIdRef.current = 0;
      return undefined;
    }

    const intervalId = setInterval(() => {
      if (isActionInFlightRef.current) {
        return;
      }

      fetch(`${API_BASE_URL}/rooms/${currentRoomCode}`)
        .then((response) => {
          if (response.status === 404) {
            clearStoredSession();
            clearCurrentRoomStateRef.current();
            setRecentEventsSelectedKinds({});
            setRecentEventsExpandedGroups({});
            setFreshRecentEventIds({});
            setFocusedRecentEventId(null);
            setFocusedEventCellIndex(null);
            setFocusedEventPlayerIds([]);
            Object.values(recentEventHighlightTimeoutsRef.current).forEach((timeoutId) => {
              window.clearTimeout(timeoutId);
            });
            recentEventHighlightTimeoutsRef.current = {};
            recentEventsRoomCodeRef.current = null;
            highestSeenRecentEventIdRef.current = 0;
            setPlayerId("");
            setPlayerToken("");
            setStatus("The room no longer exists.");
            return;
          }
          return response.json().then((data) => {
            if (isActionInFlightRef.current) {
              return;
            }

            applyIncomingRoomStateRef.current(data, {
              expectedRoomCode: currentRoomCode,
            });
          });
        })
        .catch(() => {});
    }, 2500);

    return () => {
      clearInterval(intervalId);
    };
  }, [currentRoomCode]);

  useEffect(() => {
    if (!currentRoomCode) {
      return;
    }

    const currentEventIds = recentEvents
      .map((event) => event.event_id)
      .filter((eventId) => Number.isInteger(eventId));

    if (recentEventsRoomCodeRef.current !== currentRoomCode) {
      recentEventsRoomCodeRef.current = currentRoomCode;
      highestSeenRecentEventIdRef.current =
        currentEventIds.length > 0 ? Math.max(...currentEventIds) : 0;
      setFreshRecentEventIds({});
      clearRecentEventHighlightTimeouts();
      return;
    }

    const highestEventId = currentEventIds.length > 0 ? Math.max(...currentEventIds) : 0;
    const newEventIds = currentEventIds.filter(
      (eventId) => eventId > highestSeenRecentEventIdRef.current,
    );

    highestSeenRecentEventIdRef.current = Math.max(
      highestSeenRecentEventIdRef.current,
      highestEventId,
    );

    if (newEventIds.length === 0) {
      return;
    }

    setFreshRecentEventIds((current) => {
      const next = { ...current };
      for (const eventId of newEventIds) {
        next[eventId] = true;
      }
      return next;
    });

    for (const eventId of newEventIds) {
      if (recentEventHighlightTimeoutsRef.current[eventId]) {
        window.clearTimeout(recentEventHighlightTimeoutsRef.current[eventId]);
      }

      recentEventHighlightTimeoutsRef.current[eventId] = window.setTimeout(() => {
        setFreshRecentEventIds((current) => {
          if (!current[eventId]) {
            return current;
          }

          const next = { ...current };
          delete next[eventId];
          return next;
        });

        delete recentEventHighlightTimeoutsRef.current[eventId];
      }, RECENT_EVENT_HIGHLIGHT_MS);
    }
  }, [currentRoomCode, recentEvents]);

  useEffect(() => {
    return () => {
      clearRecentEventHighlightTimeouts();
    };
  }, []);

  useEffect(() => {
    if (focusedRecentEventId == null) {
      return;
    }

    if (!recentEvents.some((event) => event.event_id === focusedRecentEventId)) {
      setFocusedRecentEventId(null);
      setFocusedEventCellIndex(null);
      setFocusedEventPlayerIds([]);
      setRecentEventsEntityFilter(null);
    }
  }, [focusedRecentEventId, recentEvents]);

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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      applyIncomingRoomStateRef.current(data.room, {
        expectedRoomCode: trimmedRoomCode,
        allowRoomActivation: true,
      });
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
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
      setIsSubmitting(false);
    }
  }

  async function handleStartGame() {
    if (!currentRoom || !currentPlayer || !playerToken) {
      setStatus("Create or join a room before starting the game.");
      return;
    }

    setIsSubmitting(true);
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
      setIsSubmitting(false);
    }
  }

  async function handleRollDice() {
    if (!currentRoom || !currentPlayer || !playerToken) {
      setStatus("Join the active game before rolling dice.");
      return;
    }

    if (!canRollDice) {
      setStatus(
        currentTurnPlayerId !== playerId
          ? "It is not your turn to roll."
          : "Roll dice is not available right now.",
      );
      return;
    }

    setIsSubmitting(true);
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
      saveStoredSession({
        player_id: data.player_id,
        player_token: data.player_token,
        room_code: data.room.room_code,
        nickname: currentPlayer.nickname,
      });

      const roll = data.room.game?.turn.last_roll ?? [];
      const landedPosition = data.room.game?.last_landed_position ?? null;
      const landedCell = boardCells.find((cell) => cell.index === landedPosition) ?? null;
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
      endRoomActionRequest();
      setIsSubmitting(false);
    }
  }

  async function handlePayJailFine() {
    if (!currentRoom || !playerToken || !isCurrentPlayerInJail) {
      setStatus("You must be in jail before paying the fine.");
      return;
    }

    setIsSubmitting(true);
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
      setIsSubmitting(false);
    }
  }

  async function handleDeclareBankruptcy() {
    if (!currentRoom || !playerToken || !canDeclareBankruptcy) {
      setStatus("You can only declare bankruptcy when you're the one in debt.");
      return;
    }

    setIsSubmitting(true);
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
      setIsSubmitting(false);
    }
  }

  async function handleLeaveRoom() {
    if (currentRoom && !currentPlayer) {
      clearStoredSession();
      setPlayerId("");
      setPlayerToken("");
      clearCurrentRoomStateRef.current();
      resetRecentEventsUiState();
      setStatus("You left the match view.");
      return;
    }

    if (!currentRoom || !playerToken) {
      setStatus("You are not currently in a room.");
      return;
    }

    setIsSubmitting(true);
    beginRoomActionRequest();
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
      clearCurrentRoomStateRef.current();
      resetRecentEventsUiState();
      setStatus(data.room_deleted ? "You left. The room was deleted." : "You left the room.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      endRoomActionRequest();
      setIsSubmitting(false);
    }
  }

  async function handleBuyProperty() {
    if (!currentRoom || !playerToken || !pendingPurchaseCell) {
      setStatus("There is no property waiting for your decision.");
      return;
    }

    setIsSubmitting(true);
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
      setIsSubmitting(false);
    }
  }

  async function handleAuctionProperty() {
    if (!currentRoom || !playerToken || !pendingPurchaseCell) {
      setStatus("There is no property waiting for your decision.");
      return;
    }

    setIsSubmitting(true);
    beginRoomActionRequest();
    setStatus(`Sending ${pendingPurchaseCell.name} to auction...`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/rooms/${currentRoom.room_code}/auction/start`,
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
        throw new Error(data.detail || "Starting auction failed.");
      }

      setPlayerId(data.player_id);
      setPlayerToken(data.player_token);
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
          : `Sent ${pendingPurchaseCell.name} to auction.`,
      );
    } catch (error) {
      setStatus(error.message);
    } finally {
      endRoomActionRequest();
      setIsSubmitting(false);
    }
  }

  async function handleSkipPurchase() {
    if (!currentRoom || !playerToken || !pendingPurchaseCell) {
      setStatus("There is no property waiting for your decision.");
      return;
    }

    setIsSubmitting(true);
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
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
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
      setIsSubmitting(false);
    }
  }

  async function handlePassAuction() {
    if (!currentRoom || !playerToken || !pendingAuctionCell) {
      setStatus("There is no auction waiting for your decision.");
      return;
    }

    setIsSubmitting(true);
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
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
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
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
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
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
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
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
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
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
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
      setIsSubmitting(false);
    }
  }

  async function handleRespondTrade(accept) {
    if (!currentRoom || !playerToken || !pendingTradeCell) {
      setStatus("No active trade offer to respond to.");
      return;
    }

    const actionLabel = accept
      ? "Accepting trade..."
      : pendingTrade?.proposer_id === playerId
        ? "Cancelling trade..."
        : "Rejecting trade...";

    setIsSubmitting(true);
    beginRoomActionRequest();
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
      applyIncomingRoomStateRef.current(data.room, {
        allowRoomActivation: true,
      });
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
      endRoomActionRequest();
      setIsSubmitting(false);
    }
  }

  function handleSelectCellForTrade(cellIndex, cellName) {
    const isAlreadySelected = String(cellIndex) === selectedTradePosition;
    setSelectedTradePosition(String(cellIndex));
    setStatus(
      isAlreadySelected
        ? `${cellName} is already selected in the trade desk.`
        : `Prepared ${cellName} in the trade desk below.`,
    );
  }

  function handleSelectPlayerAsTradeTarget(targetPlayerId, targetNickname) {
    const isAlreadySelected = targetPlayerId === selectedTradeTargetId;
    setSelectedTradeTargetId(targetPlayerId);
    setStatus(
      isAlreadySelected
        ? `${targetNickname} is already selected in the trade form.`
        : `Prepared ${targetNickname} in the trade form below.`,
    );
  }

  const gameViewProps =
    currentRoom && isGameOpen && currentPlayer
      ? buildGameViewProps({
          room: currentRoom,
          playerId,
          actionGuide,
          hasStoredUiPreference,
          isSubmitting,
          lastBankruptcySummary,
          lastDrawnCard,
          summaryState: {
            currentTurnPlayer: activeUiPlayer,
            lastLandedCell,
            lastLandedPlayer,
            lastLandedRentHint,
            lastLandedCellLevel,
            lastLandedCellOwner,
            lastLandedCellMortgaged,
            lastEffects,
          },
          selectedCellState: {
            inspectedCell,
            inspectedCellOwner,
            inspectedCellRentHint,
            inspectedCellMortgaged,
            inspectedCellLevel,
            inspectedCellOccupants,
            inspectedCellLinkedEventCount,
            inspectedCellJailGroups,
            inspectedCellQuickActionMessage,
            inspectedCellCanUpgrade,
            inspectedCellCanSellUpgrade,
            inspectedCellCanMortgage,
            inspectedCellCanUnmortgage,
            inspectedCellCanUseTradeDesk,
            inspectedCellIsSelectedInTradeDesk,
          },
          selectedPlayerState: {
            inspectedPlayer,
            inspectedPlayerColor,
            inspectedPlayerIsCurrentTurn,
            inspectedPlayerCash,
            inspectedPlayerPosition,
            inspectedPlayerCell,
            pendingBankruptcy,
            inspectedPlayerInJail,
            inspectedPlayerTurnsInJail,
            inspectedPlayerOwnedCells,
            inspectedPlayerOwnedCellsPreview,
            inspectedPlayerMortgagedCellCount,
            inspectedPlayerLinkedEventCount,
            inspectedPlayerCanBeTradeTarget,
            inspectedPlayerIsSelectedTradeTarget,
            inspectedPlayerTradeMessage,
            inspectedPlayerDebtMessage,
          },
          actionState: {
            pendingPurchaseCell,
            pendingPurchasePlayer,
            pendingPurchase,
            canResolvePurchase,
            canAffordPendingPurchase,
            pendingAuction,
            pendingAuctionCell,
            pendingAuctionActivePlayer,
            canBidInAuction,
            minimumAuctionBid,
            pendingTrade,
            pendingTradeCell,
            pendingTradeReceiver,
            canAcceptTrade,
            canRejectTrade,
            pendingBankruptcy,
            pendingBankruptcyPlayer,
            pendingBankruptcyCreditorLabel,
            canManageDebtRecovery,
            isCurrentPlayerInJail,
            currentPlayerTurnsInJail,
            canPayJailFine,
            canAffordJailFine,
            canDeclareBankruptcy,
            currentPlayerDoublesStreak,
            canRollDice,
          },
          auctionState: {
            pendingAuctionInitiator,
            pendingAuctionHighestBidder,
            pendingAuctionPassedPlayers,
            auctionBidAmount,
            currentPlayerCash,
            canAffordAuctionBid,
            canPassAuction,
          },
          tradeState: {
            showTradeDesk,
            tradeDeskState,
            tradeDeskCollapsed,
            pendingTradeProposer,
            canShowTradeForm,
            canManageDebtRecovery,
            tradeableCells,
            selectedTradePosition,
            tradeTargets,
            selectedTradeTargetId,
            tradeCashAmount,
            canProposeTrade,
          },
          mortgageState: {
            showMortgageDesk,
            mortgageDeskState,
            mortgageDeskCollapsed,
            showMortgageLists,
            mortgageableCells,
            unmortgageableCells,
            canManageMortgages,
            canUnmortgageProperties,
          },
          upgradeState: {
            showUpgradeDesk,
            upgradeDeskState,
            upgradeDeskCollapsed,
            showUpgradeLists,
            upgradeableProperties,
            sellableProperties,
            propertyLevels,
            canUpgradeProperties,
            canSellUpgrades,
          },
          recentEventsState: {
            priorRecentEvents,
            selectedKind: getRecentEventsSelectedKind("game"),
            expandedGroups: getRecentEventsExpandedState("game"),
            freshRecentEventIds,
            focusedRecentEventId,
            recentEventsEntityFilter,
            isRecentEventsHelpCollapsed,
            recentEventsClearFocusAnnouncementId,
          },
          boardState: {
            boardCells,
            playerPositions: renderedPlayerPositions,
            cellRecentEventCounts,
            propertyOwners,
            propertyMortgaged,
            propertyLevels,
            focusedEventCellIndex,
            movedCellIndexSet,
            getPlayerById,
            playerRecentEventCounts,
            currentTurnPlayerId: activeUiPlayerId,
            movingPlayerIds,
            movingTokenEffects,
            focusedPlayerIdSet,
            getPlayerPosition,
            getPlayerCell,
            getOwnedCellsByPlayer,
            getMortgagedOwnedCellCount,
          },
          helpers: {
            formatCellType,
            getPlayerColor,
            getMortgageValue,
            getUpgradeCost,
            getUnmortgageCost,
            getUpgradeSellValue,
            getRentHint,
            isDeskCollapsible,
            getActionGuideFlashClassName,
            getActionGuideFlashStyle,
            renderPlayerToken,
          },
          handlers: {
            scrollToActionSection,
            handleResetUiPreferences,
            clearRecentEventFocus,
            handleBuyProperty,
            handleSkipPurchase,
            handleUpgradeProperty,
            handleSellUpgradeProperty,
            handleMortgageProperty,
            handleUnmortgageProperty,
            handlePayJailFine,
            handleDeclareBankruptcy,
            handleRollDice,
            handleLeaveRoom,
            handleAuctionProperty,
            handleBidInAuction,
            handlePassAuction,
            handleRespondTrade,
            handleProposeTrade,
            handleRecentEventsKindChange,
            handleRecentEventsGroupToggle,
            handleRecentEventFocus,
            handleRecentEventsHelpToggle,
            handleBoardCellFocus,
            handlePlayerCardFocus,
            handleSelectCellForTrade,
            handleSelectPlayerAsTradeTarget,
          },
          setters: {
            setSelectedTradePosition,
            setSelectedTradeTargetId,
            setAuctionBidAmount,
            setTradeCashAmount,
            toggleDeskCollapsed,
          },
          refs: {
            boardRef,
            setActionSectionRef,
            boardCellRefs,
            playerCardRefs,
            registerBoardCellRef,
            registerPlayerCardRef,
          },
          constants: {
            maxPropertyLevel: MAX_PROPERTY_LEVEL,
            jailFineAmount: JAIL_FINE_AMOUNT,
            jailPosition: JAIL_POSITION,
          },
          uiVisibilityState: {
            shouldShowCenterActionUi: shouldShowCenterActionUi || isPropertyPurchaseDecisionActive,
          },
        })
      : null;

  return (
    <main className={`app-shell${isGameOpen || isEliminated ? " is-game" : ""}`}>
      <section className="panel">
        <div
          ref={actionGuideLiveStatusRef}
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
        />
        <LandingPanel
          showEntryForm={!currentRoom}
          nickname={nickname}
          roomCode={roomCode}
          status={status}
          message={message}
          isSubmitting={isSubmitting}
          onNicknameChange={setNickname}
          onRoomCodeChange={setRoomCode}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />

        {currentRoom && isLobbyOpen && (
          <LobbyView
            roomCode={currentRoom.room_code}
            roomStatus={currentRoom.status}
            playerId={playerId}
            currentPlayer={currentPlayer}
            isHost={isHost}
            canStartGame={canStartGame}
            isLobbyOpen={isLobbyOpen}
            isSubmitting={isSubmitting}
            players={currentRoom.players}
            maxPlayers={currentRoom.max_players}
            minPlayersToStart={currentRoom.min_players_to_start}
            onToggleReady={handleToggleReady}
            onStartGame={handleStartGame}
            onLeaveRoom={handleLeaveRoom}
          />
        )}

        {currentRoom && isFinished && (
          <FinishedGameView
            roomCode={currentRoom.room_code}
            playerId={playerId}
            winnerPlayer={winnerPlayer}
            currentPlayer={currentPlayer}
            lastBankruptcySummary={lastBankruptcySummary}
            recentEvents={recentEvents}
            selectedKind={getRecentEventsSelectedKind("finished")}
            expandedGroups={getRecentEventsExpandedState("finished")}
            freshEventIds={freshRecentEventIds}
            onSelectKind={(kind) => handleRecentEventsKindChange("finished", kind)}
            onToggleGroup={(groupKey) => handleRecentEventsGroupToggle("finished", groupKey)}
            isSubmitting={isSubmitting}
            onLeaveRoom={handleLeaveRoom}
          />
        )}

        {currentRoom && isEliminated && (
          <EliminatedGameView
            roomCode={currentRoom.room_code}
            playerId={playerId}
            currentTurnPlayerName={activeUiPlayer?.nickname ?? "Unknown player"}
            lastEffects={lastEffects}
            lastBankruptcySummary={lastBankruptcySummary}
            bankruptcyRecapTitle={
              lastBankruptcySummary?.debtor_player_id === playerId
                ? "Your bankruptcy recap"
                : "Latest bankruptcy recap"
            }
            recentEvents={priorRecentEvents}
            selectedKind={getRecentEventsSelectedKind("eliminated")}
            expandedGroups={getRecentEventsExpandedState("eliminated")}
            freshEventIds={freshRecentEventIds}
            onSelectKind={(kind) => handleRecentEventsKindChange("eliminated", kind)}
            onToggleGroup={(groupKey) => handleRecentEventsGroupToggle("eliminated", groupKey)}
            isSubmitting={isSubmitting}
            onLeaveRoom={handleLeaveRoom}
          />
        )}

        {gameViewProps && <GameView {...gameViewProps} />}
      </section>
    </main>
  );
}

export default App;

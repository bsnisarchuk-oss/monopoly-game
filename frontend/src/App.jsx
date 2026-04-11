import { useEffect, useRef, useState } from "react";
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
import {
  getTokenMovementOffset,
  splitJailOccupants,
} from "./components/boardHelpers";
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
  const playerCardRefs = useRef({});
  const actionSectionRefs = useRef({});
  const actionGuideLiveStatusRef = useRef(null);
  const actionGuideLiveAnnouncementFrameRef = useRef(null);
  const actionGuideFlashTimeoutRef = useRef(null);
  const currentRoomRef = useRef(null);
  const activeRoomCodeRef = useRef(null);
  const applyIncomingRoomStateRef = useRef(() => false);
  const clearCurrentRoomStateRef = useRef(() => {});
  const currentRoomCode = currentRoom?.room_code ?? null;
  currentRoomRef.current = currentRoom;
  activeRoomCodeRef.current = currentRoomCode;
  const isLobbyOpen = currentRoom?.status === "lobby";
  const isGameOpen = currentRoom?.status === "in_game";
  const isFinished = currentRoom?.status === "finished";
  const boardCells = currentRoom?.game?.board ?? [];
  const playerPositions = currentRoom?.game?.positions;
  const propertyOwners = currentRoom?.game?.property_owners ?? {};
  const propertyLevels = currentRoom?.game?.property_levels ?? {};
  const propertyMortgaged = currentRoom?.game?.property_mortgaged ?? {};
  const pendingPurchase = currentRoom?.game?.pending_purchase ?? null;
  const pendingTrade = currentRoom?.game?.pending_trade ?? null;
  const pendingAuction = currentRoom?.game?.pending_auction ?? null;
  const pendingBankruptcy = currentRoom?.game?.pending_bankruptcy ?? null;
  const lastBankruptcySummary = currentRoom?.game?.last_bankruptcy_summary ?? null;
  const recentEvents = currentRoom?.game?.recent_events ?? EMPTY_RECENT_EVENTS;
  const lastDrawnCard = currentRoom?.game?.last_drawn_card ?? null;
  const winnerId = currentRoom?.game?.winner_id ?? null;
  const winnerPlayer =
    currentRoom?.players.find((player) => player.player_id === winnerId) ?? null;
  const currentPlayer =
    currentRoom?.players.find((player) => player.player_id === playerId) ?? null;

  const {
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
    (currentRoom?.players?.length ?? 0) >= (currentRoom?.min_players_to_start ?? 0) &&
    (currentRoom?.players?.every((player) => player.is_ready) ?? false);
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
  const lastLandedRentHint =
    lastLandedCell && !lastLandedCellMortgaged
      ? getRentHint(lastLandedCell, lastLandedCellLevel)
      : null;
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
  const priorRecentEvents = recentEvents.slice(1);
  const gameRecentEventsKind = getRecentEventsSelectedKind("game");
  const gameScopedRecentEvents = filterRecentEventsByKind(priorRecentEvents, gameRecentEventsKind);
  const minimumAuctionBid = pendingAuction ? Math.max(1, pendingAuction.current_bid + 1) : 1;
  const currentPlayerCash = currentRoom?.game?.cash?.[playerId] ?? 0;
  const focusedPlayerIdSet = new Set(focusedEventPlayerIds);
  const cellRecentEventCounts = {};
  const playerRecentEventCounts = {};

  for (const event of gameScopedRecentEvents) {
    if (Number.isInteger(event.cell_index)) {
      cellRecentEventCounts[event.cell_index] = (cellRecentEventCounts[event.cell_index] ?? 0) + 1;
    }

    const relatedPlayerIds = [...new Set([event.player_id, event.target_player_id].filter(Boolean))];
    for (const relatedPlayerId of relatedPlayerIds) {
      playerRecentEventCounts[relatedPlayerId] = (playerRecentEventCounts[relatedPlayerId] ?? 0) + 1;
    }
  }

  const inspectedCell = Number.isInteger(focusedEventCellIndex)
    ? boardCells.find((cell) => cell.index === focusedEventCellIndex) ?? null
    : null;
  const inspectedCellLevel = inspectedCell ? propertyLevels[inspectedCell.index] ?? 0 : 0;
  const inspectedCellMortgaged = inspectedCell
    ? Boolean(propertyMortgaged[inspectedCell.index])
    : false;
  const inspectedCellOwner = inspectedCell
    ? getPlayerById(propertyOwners[inspectedCell.index])
    : null;
  const inspectedCellRentHint = inspectedCell
    ? getRentHint(inspectedCell, inspectedCellLevel)
    : null;
  const inspectedCellOccupants = inspectedCell
    ? (currentRoom?.players ?? []).filter((player) => playerPositions?.[player.player_id] === inspectedCell.index)
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
  const inspectedPlayer = inspectedPlayerId ? getPlayerById(inspectedPlayerId) : null;
  const inspectedPlayerColor = inspectedPlayer ? getPlayerColor(inspectedPlayer.player_id) : null;
  const inspectedPlayerPosition = inspectedPlayer ? getPlayerPosition(inspectedPlayer.player_id) : 0;
  const inspectedPlayerCell = inspectedPlayer ? getPlayerCell(inspectedPlayer.player_id) : null;
  const inspectedPlayerOwnedCells = inspectedPlayer ? getOwnedCellsByPlayer(inspectedPlayer.player_id) : [];
  const inspectedPlayerOwnedCellsPreview = inspectedPlayerOwnedCells.slice(0, 3);
  const inspectedPlayerCash = inspectedPlayer
    ? currentRoom?.game?.cash?.[inspectedPlayer.player_id] ?? 0
    : 0;
  const inspectedPlayerMortgagedCellCount = inspectedPlayer
    ? getMortgagedOwnedCellCount(inspectedPlayer.player_id)
    : 0;
  const inspectedPlayerInJail = inspectedPlayer
    ? currentRoom?.game?.in_jail?.[inspectedPlayer.player_id] ?? false
    : false;
  const inspectedPlayerTurnsInJail = inspectedPlayer
    ? currentRoom?.game?.turns_in_jail?.[inspectedPlayer.player_id] ?? 0
    : 0;
  const inspectedPlayerLinkedEventCount = inspectedPlayer
    ? playerRecentEventCounts[inspectedPlayer.player_id] ?? 0
    : 0;
  const inspectedPlayerIsCurrentTurn = inspectedPlayer?.player_id === currentTurnPlayerId;
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
    const shouldApply = shouldApplyIncomingRoomState({
      nextRoom,
      prevRoom: currentRoomRef.current,
      activeRoomCode: activeRoomCodeRef.current,
      expectedRoomCode: options.expectedRoomCode ?? null,
      allowRoomActivation: options.allowRoomActivation ?? false,
    });

    if (!shouldApply) {
      return false;
    }

    currentRoomRef.current = nextRoom;
    activeRoomCodeRef.current = nextRoom.room_code ?? null;
    setCurrentRoom(nextRoom);
    return true;
  };

  clearCurrentRoomStateRef.current = () => {
    currentRoomRef.current = null;
    activeRoomCodeRef.current = null;
    setCurrentRoom(null);
  };

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

  function clearRecentEventFocus() {
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
  }

  function scrollToRecentEventTarget(event) {
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
  }

  function handleRecentEventFocus(event) {
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
  }

  function handleBoardCellFocus(cell) {
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
  }

  function handlePlayerCardFocus(player) {
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
  }

  function getCellByPosition(position) {
    return boardCells.find((cell) => cell.index === position) ?? null;
  }

  function getPlayerById(targetPlayerId) {
    return currentRoom?.players.find((player) => player.player_id === targetPlayerId) ?? null;
  }

  function getPlayerPosition(targetPlayerId) {
    return playerPositions?.[targetPlayerId] ?? 0;
  }

  function getPlayerCell(targetPlayerId) {
    return getCellByPosition(getPlayerPosition(targetPlayerId));
  }

  function getOwnedCellsByPlayer(targetPlayerId) {
    if (!targetPlayerId) {
      return [];
    }

    return boardCells.filter((cell) => propertyOwners[cell.index] === targetPlayerId);
  }

  function getMortgagedOwnedCellCount(targetPlayerId) {
    if (!targetPlayerId) {
      return 0;
    }

    return Object.entries(propertyMortgaged).filter(
      ([position, isMortgaged]) =>
        isMortgaged && propertyOwners[Number(position)] === targetPlayerId,
    ).length;
  }

  function getPlayerColor(targetPlayerId, fallbackIndex = 0) {
    const colorIndex = currentRoom?.players.findIndex(
      (candidate) => candidate.player_id === targetPlayerId,
    );
    const paletteIndex = colorIndex >= 0 ? colorIndex : fallbackIndex;
    return PLAYER_TOKEN_COLORS[paletteIndex % PLAYER_TOKEN_COLORS.length];
  }

  function renderPlayerToken(player, occupantIndex) {
    const tokenColor = getPlayerColor(player.player_id, occupantIndex);
    const movementEffect = movingTokenEffects[player.player_id] ?? null;
    const movementOffset = movementEffect
      ? getTokenMovementOffset(movementEffect.fromPosition, movementEffect.toPosition)
      : null;

    return (
      <PlayerToken
        key={`${player.player_id}-${movementEffect?.animationId ?? "idle"}`}
        player={player}
        occupantIndex={occupantIndex}
        tokenColor={tokenColor}
        movementOffset={movementOffset}
        isActiveTurn={currentTurnPlayerId === player.player_id}
        isMoving={Boolean(movementEffect)}
      />
    );
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
  const canManagePurchaseFunding =
    isGameOpen &&
    currentTurnPlayerId === playerId &&
    Boolean(pendingPurchase) &&
    currentPlayerCash < (pendingPurchase?.price ?? Infinity) &&
    Boolean(playerToken);
  const canManageMortgages = canUsePreRollDesk || canManageDebtRecovery || canManagePurchaseFunding;
  const canSellUpgrades = canUsePreRollDesk || canManageDebtRecovery || canManagePurchaseFunding;
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
  const ownedBuyableCells =
    currentPlayer == null
      ? []
      : boardCells.filter(
          (cell) => cell.price && propertyOwners[cell.index] === currentPlayer.player_id,
        );
  const ownedStandardProperties =
    currentPlayer == null
      ? []
      : boardCells.filter(
          (cell) => cell.cell_type === "property" && propertyOwners[cell.index] === currentPlayer.player_id,
        );
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
  const inspectedCellPosition = inspectedCell?.index ?? null;
  const inspectedCellOwnedByYou = inspectedCellOwner?.player_id === playerId;
  const inspectedCellIsPendingPurchase =
    inspectedCellPosition != null && pendingPurchaseCell?.index === inspectedCellPosition;
  const inspectedCellCanBuy = inspectedCellIsPendingPurchase && canResolvePurchase;
  const inspectedCellCanSkipPurchase = inspectedCellIsPendingPurchase && canResolvePurchase;
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
    inspectedCellCanBuy ||
    inspectedCellCanSkipPurchase ||
    inspectedCellCanUpgrade ||
    inspectedCellCanSellUpgrade ||
    inspectedCellCanMortgage ||
    inspectedCellCanUnmortgage ||
    inspectedCellCanUseTradeDesk;
  let inspectedCellQuickActionMessage = null;

  if (inspectedCellIsPendingPurchase && !canResolvePurchase) {
    inspectedCellQuickActionMessage = `${
      pendingPurchasePlayer?.nickname ?? "The active player"
    } is deciding whether to buy this.`;
  } else if (inspectedCell?.price && !inspectedCellOwner) {
    inspectedCellQuickActionMessage =
      "This cell is unowned. Buy or pass will appear here when you land on it.";
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

  const showTradeDesk = !pendingAuction && (pendingTrade || ownedBuyableCells.length > 0);
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

  const showMortgageDesk = !pendingAuction && ownedBuyableCells.length > 0;
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

  const showUpgradeDesk = !pendingAuction && ownedStandardProperties.length > 0;
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
      setIsSubmitting(false);
    }
  }

  async function handleDeclareBankruptcy() {
    if (!currentRoom || !playerToken || !canDeclareBankruptcy) {
      setStatus("You can only declare bankruptcy when you're the one in debt.");
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
      applyIncomingRoomStateRef.current(data.room);
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
            currentTurnPlayer,
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
            inspectedCellCanBuy,
            inspectedCellCanSkipPurchase,
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
            currentTurnPlayerId,
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
            setActionSectionRef,
            boardCellRefs,
            playerCardRefs,
          },
          constants: {
            maxPropertyLevel: MAX_PROPERTY_LEVEL,
            jailFineAmount: JAIL_FINE_AMOUNT,
            jailPosition: JAIL_POSITION,
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
            currentTurnPlayerName={currentTurnPlayer?.nickname ?? "Unknown player"}
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

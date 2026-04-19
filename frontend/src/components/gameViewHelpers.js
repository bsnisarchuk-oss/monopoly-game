import { buildActionGuideJumpButtonLabel } from "./actionGuideHelpers";

function buildFocusTargetProps({
  sectionKey,
  baseClassName,
  actionGuide,
  getActionGuideFlashClassName,
  getActionGuideFlashStyle,
  setActionSectionRef,
}) {
  return {
    sectionRef: (element) => setActionSectionRef(sectionKey, element),
    className: `${baseClassName} board-center-section board-center-focus-target ${
      actionGuide.targetKey === sectionKey ? "is-guide-target" : ""
    } ${getActionGuideFlashClassName(sectionKey)}`,
    style: getActionGuideFlashStyle(sectionKey),
  };
}

function buildBoardCenterSummaryProps({ room, summaryState, helpers, constants }) {
  const {
    currentTurnPlayer,
    lastLandedCell,
    lastLandedPlayer,
    lastLandedRentHint,
    lastLandedCellLevel,
    lastLandedCellOwner,
    lastLandedCellMortgaged,
    lastEffects,
  } = summaryState;
  const { formatCellType } = helpers;
  const { maxPropertyLevel } = constants;

  return {
    currentTurnPlayerName: currentTurnPlayer?.nickname ?? "Unknown player",
    lastRollText: room.game?.turn.last_roll ? room.game.turn.last_roll.join(" + ") : "No roll yet",
    landedSummary: lastLandedCell
      ? `${lastLandedPlayer?.nickname ?? "Player"} landed on ${lastLandedCell.name}`
      : "No landing yet",
    lastLandedCell,
    lastLandedCellTypeLabel: lastLandedCell ? formatCellType(lastLandedCell.cell_type) : "",
    lastLandedRentHint,
    lastLandedLevel: lastLandedCellLevel,
    maxPropertyLevel,
    lastLandedAmountLabel:
      lastLandedCell && !lastLandedCell.price && typeof lastLandedCell.amount === "number"
        ? lastLandedCell.cell_type === "tax"
          ? `-$${lastLandedCell.amount}`
          : `+$${lastLandedCell.amount}`
        : null,
    lastLandedOwnerName: lastLandedCellOwner?.nickname ?? null,
    isLastLandedMortgaged: lastLandedCellMortgaged,
    lastEffects,
  };
}

function buildActionGuideCardProps({
  actionGuide,
  hasStoredUiPreference,
  handlers,
}) {
  const { scrollToActionSection, handleResetUiPreferences } = handlers;

  return {
    actionGuide,
    hasStoredUiPreference,
    jumpButtonLabel: actionGuide.targetKey
      ? buildActionGuideJumpButtonLabel(actionGuide.targetKey)
      : "",
    onJump: () => scrollToActionSection(actionGuide.targetKey, actionGuide.focusKey),
    onResetUiPreferences: handleResetUiPreferences,
  };
}

function buildSelectedCellInspectorProps({
  selectedCellState,
  isSubmitting,
  constants,
  helpers,
  handlers,
}) {
  const {
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
  } = selectedCellState;
  const { maxPropertyLevel } = constants;
  const { formatCellType, getPlayerColor, getMortgageValue, getUpgradeCost } = helpers;
  const {
    clearRecentEventFocus,
    handleUpgradeProperty,
    handleSellUpgradeProperty,
    handleMortgageProperty,
    handleUnmortgageProperty,
    handleSelectCellForTrade,
  } = handlers;

  if (!inspectedCell) {
    return null;
  }

  return {
    cell: inspectedCell,
    ownerPlayer: inspectedCellOwner,
    ownerColor: inspectedCellOwner ? getPlayerColor(inspectedCellOwner.player_id) : null,
    cellTypeLabel: formatCellType(inspectedCell.cell_type),
    rentHint: inspectedCellRentHint,
    isMortgaged: inspectedCellMortgaged,
    mortgageValue: getMortgageValue(inspectedCell) ?? 0,
    propertyLevel: inspectedCellLevel,
    maxPropertyLevel,
    upgradeCost: getUpgradeCost(inspectedCell) ?? 0,
    occupants: inspectedCellOccupants,
    linkedEventCount: inspectedCellLinkedEventCount,
    jailGroups: inspectedCellJailGroups,
    quickActionMessage: inspectedCellQuickActionMessage,
    isSubmitting,
    canUpgrade: inspectedCellCanUpgrade,
    canSellUpgrade: inspectedCellCanSellUpgrade,
    canMortgage: inspectedCellCanMortgage,
    canUnmortgage: inspectedCellCanUnmortgage,
    canUseTradeDesk: inspectedCellCanUseTradeDesk,
    isSelectedInTradeDesk: inspectedCellIsSelectedInTradeDesk,
    onClear: clearRecentEventFocus,
    onUpgrade: () => handleUpgradeProperty(inspectedCell.index),
    onSellUpgrade: () => handleSellUpgradeProperty(inspectedCell.index),
    onMortgage: () => handleMortgageProperty(inspectedCell.index),
    onUnmortgage: () => handleUnmortgageProperty(inspectedCell.index),
    onSelectForTrade: () => handleSelectCellForTrade(inspectedCell.index, inspectedCell.name),
  };
}

function buildSelectedPlayerInspectorProps({
  selectedPlayerState,
  playerId,
  isSubmitting,
  handlers,
}) {
  const {
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
  } = selectedPlayerState;
  const { clearRecentEventFocus, handleSelectPlayerAsTradeTarget } = handlers;

  if (!inspectedPlayer) {
    return null;
  }

  return {
    player: inspectedPlayer,
    currentPlayerId: playerId,
    playerColor: inspectedPlayerColor,
    isCurrentTurn: inspectedPlayerIsCurrentTurn,
    cash: inspectedPlayerCash,
    position: inspectedPlayerPosition,
    cell: inspectedPlayerCell,
    isPendingBankruptcy: pendingBankruptcy?.player_id === inspectedPlayer.player_id,
    isInJail: inspectedPlayerInJail,
    turnsInJail: inspectedPlayerTurnsInJail,
    ownedCells: inspectedPlayerOwnedCells,
    ownedCellsPreview: inspectedPlayerOwnedCellsPreview,
    mortgagedCellCount: inspectedPlayerMortgagedCellCount,
    linkedEventCount: inspectedPlayerLinkedEventCount,
    canBeTradeTarget: inspectedPlayerCanBeTradeTarget,
    isSelectedTradeTarget: inspectedPlayerIsSelectedTradeTarget,
    isSubmitting,
    onClear: clearRecentEventFocus,
    onSelectTradeTarget: () =>
      handleSelectPlayerAsTradeTarget(inspectedPlayer.player_id, inspectedPlayer.nickname),
    tradeMessage: inspectedPlayerTradeMessage,
    debtMessage: inspectedPlayerDebtMessage,
  };
}

function buildBoardCenterActionsProps({
  actionGuide,
  actionState,
  playerId,
  isSubmitting,
  constants,
  helpers,
  handlers,
  refs,
}) {
  const {
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
  } = actionState;
  const { jailFineAmount } = constants;
  const { getActionGuideFlashClassName, getActionGuideFlashStyle } = helpers;
  const {
    handlePayJailFine,
    handleDeclareBankruptcy,
    handleRollDice,
    handleLeaveRoom,
  } = handlers;
  const { setActionSectionRef } = refs;

  return {
    ...buildFocusTargetProps({
      sectionKey: "actions",
      baseClassName: "room-actions board-center-actions",
      actionGuide,
      getActionGuideFlashClassName,
      getActionGuideFlashStyle,
      setActionSectionRef,
    }),
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
    playerId,
    pendingBankruptcy,
    pendingBankruptcyPlayer,
    pendingBankruptcyCreditorLabel,
    canManageDebtRecovery,
    isCurrentPlayerInJail,
    currentPlayerTurnsInJail,
    jailFineAmount,
    canPayJailFine,
    canAffordJailFine,
    canDeclareBankruptcy,
    currentPlayerDoublesStreak,
    isSubmitting,
    canRollDice,
    onPayJailFine: handlePayJailFine,
    onDeclareBankruptcy: handleDeclareBankruptcy,
    onRollDice: handleRollDice,
    onLeaveRoom: handleLeaveRoom,
  };
}

function buildPropertyPurchaseDecisionProps({
  actionGuide,
  actionState,
  isSubmitting,
  handlers,
  helpers,
  refs,
}) {
  const { pendingPurchaseCell, pendingPurchase, canResolvePurchase, canAffordPendingPurchase } =
    actionState;
  const { handleBuyProperty, handleAuctionProperty } = handlers;
  const { getActionGuideFlashClassName, getActionGuideFlashStyle } = helpers;
  const { setActionSectionRef } = refs;

  if (!pendingPurchaseCell || !canResolvePurchase) {
    return null;
  }

  return {
    ...buildFocusTargetProps({
      sectionKey: "purchase",
      baseClassName: "property-purchase-decision",
      actionGuide,
      getActionGuideFlashClassName,
      getActionGuideFlashStyle,
      setActionSectionRef,
    }),
    cellName: pendingPurchaseCell.name,
    price: pendingPurchase?.price,
    canAffordPurchase: canAffordPendingPurchase,
    isSubmitting,
    onBuy: handleBuyProperty,
    onAuction: handleAuctionProperty,
  };
}

function buildAuctionCardProps({
  actionGuide,
  actionState,
  auctionState,
  isSubmitting,
  helpers,
  handlers,
  setters,
  refs,
}) {
  const { pendingAuction, pendingAuctionCell, pendingAuctionActivePlayer } = actionState;
  const {
    pendingAuctionInitiator,
    pendingAuctionHighestBidder,
    pendingAuctionPassedPlayers,
    auctionBidAmount,
    currentPlayerCash,
    canAffordAuctionBid,
    canPassAuction,
  } = auctionState;
  const { formatCellType, getActionGuideFlashClassName, getActionGuideFlashStyle } = helpers;
  const { handleBidInAuction, handlePassAuction } = handlers;
  const { setAuctionBidAmount } = setters;
  const { setActionSectionRef } = refs;

  if (!pendingAuction) {
    return null;
  }

  const focusTargetProps = buildFocusTargetProps({
    sectionKey: "auction",
    baseClassName: "trade-card",
    actionGuide,
    getActionGuideFlashClassName,
    getActionGuideFlashStyle,
    setActionSectionRef,
  });

  return {
    ...focusTargetProps,
    className: `${focusTargetProps.className} ${
      actionState.canBidInAuction ? "is-priority-card" : "is-waiting-card"
    }`,
    cellName: pendingAuctionCell?.name ?? pendingAuction.cell_name,
    initiatorName: pendingAuctionInitiator?.nickname ?? "the active player",
    cellTypeLabel: formatCellType(pendingAuctionCell?.cell_type ?? pendingAuction.cell_type),
    printedPrice: pendingAuction.price,
    currentBid: pendingAuction.current_bid,
    highestBidderName: pendingAuctionHighestBidder?.nickname ?? "No bids yet",
    activePlayerName: pendingAuctionActivePlayer?.nickname ?? "Waiting",
    passedPlayerNames: (pendingAuctionPassedPlayers ?? []).map((player) => player.nickname),
    canBid: actionState.canBidInAuction,
    bidAmount: auctionBidAmount,
    minimumBid: actionState.minimumAuctionBid,
    currentPlayerCash,
    canAffordBid: canAffordAuctionBid,
    canPass: canPassAuction,
    isSubmitting,
    onBidAmountChange: setAuctionBidAmount,
    onPlaceBid: handleBidInAuction,
    onPass: handlePassAuction,
  };
}

function buildTradeDeskCardProps({
  actionGuide,
  actionState,
  tradeState,
  playerId,
  isSubmitting,
  helpers,
  handlers,
  setters,
  refs,
}) {
  const { pendingTrade, pendingTradeCell, pendingTradeReceiver, canAcceptTrade, canRejectTrade } =
    actionState;
  const {
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
  } = tradeState;
  const { formatCellType, getActionGuideFlashClassName, getActionGuideFlashStyle, isDeskCollapsible } =
    helpers;
  const { handleRespondTrade, handleProposeTrade } = handlers;
  const {
    toggleDeskCollapsed,
    setSelectedTradePosition,
    setSelectedTradeTargetId,
    setTradeCashAmount,
  } = setters;
  const { setActionSectionRef } = refs;

  if (!showTradeDesk) {
    return null;
  }

  return {
    ...buildFocusTargetProps({
      sectionKey: "trade",
      baseClassName: "trade-card",
      actionGuide,
      getActionGuideFlashClassName,
      getActionGuideFlashStyle,
      setActionSectionRef,
    }),
    statusLabel: tradeDeskState.statusLabel,
    statusTone: tradeDeskState.statusTone,
    note: tradeDeskState.note,
    isCollapsible: isDeskCollapsible(tradeDeskState.statusTone),
    isCollapsed: tradeDeskCollapsed,
    onToggleCollapse: () => toggleDeskCollapsed("trade"),
    pendingTrade,
    pendingTradeProposerName: pendingTradeProposer?.nickname ?? "A player",
    pendingTradeCellName: pendingTradeCell?.name ?? pendingTrade?.cell_name ?? "",
    pendingTradeReceiverName: pendingTradeReceiver?.nickname ?? "the receiving player",
    pendingTradeCashAmount: pendingTrade?.cash_amount ?? 0,
    pendingTradeCellTypeLabel: pendingTrade
      ? formatCellType(pendingTradeCell?.cell_type ?? pendingTrade.cell_type)
      : "",
    canAcceptTrade,
    canRejectTrade,
    rejectTradeLabel: pendingTrade?.proposer_id === playerId ? "Cancel offer" : "Reject trade",
    isSubmitting,
    onAcceptTrade: () => handleRespondTrade(true),
    onRejectTrade: () => handleRespondTrade(false),
    canShowTradeForm,
    canManageDebtRecovery,
    tradeableCells,
    selectedTradePosition,
    onSelectedTradePositionChange: setSelectedTradePosition,
    tradeTargets,
    selectedTradeTargetId,
    onSelectedTradeTargetIdChange: setSelectedTradeTargetId,
    tradeCashAmount,
    onTradeCashAmountChange: setTradeCashAmount,
    canProposeTrade,
    onProposeTrade: handleProposeTrade,
  };
}

function buildMortgageDeskCardProps({
  actionGuide,
  actionState,
  mortgageState,
  isSubmitting,
  helpers,
  handlers,
  setters,
  refs,
}) {
  const {
    showMortgageDesk,
    mortgageDeskState,
    mortgageDeskCollapsed,
    showMortgageLists,
    mortgageableCells,
    unmortgageableCells,
    canManageMortgages,
    canUnmortgageProperties,
  } = mortgageState;
  const { canManageDebtRecovery } = actionState;
  const {
    getMortgageValue,
    getUnmortgageCost,
    getActionGuideFlashClassName,
    getActionGuideFlashStyle,
    isDeskCollapsible,
  } = helpers;
  const { handleMortgageProperty, handleUnmortgageProperty } = handlers;
  const { toggleDeskCollapsed } = setters;
  const { setActionSectionRef } = refs;

  if (!showMortgageDesk) {
    return null;
  }

  return {
    ...buildFocusTargetProps({
      sectionKey: "mortgage",
      baseClassName: "mortgage-card",
      actionGuide,
      getActionGuideFlashClassName,
      getActionGuideFlashStyle,
      setActionSectionRef,
    }),
    statusLabel: mortgageDeskState.statusLabel,
    statusTone: mortgageDeskState.statusTone,
    note: mortgageDeskState.note,
    isCollapsible: isDeskCollapsible(mortgageDeskState.statusTone),
    isCollapsed: mortgageDeskCollapsed,
    onToggleCollapse: () => toggleDeskCollapsed("mortgage"),
    showLists: showMortgageLists,
    canManageDebtRecovery,
    mortgageableCells,
    unmortgageableCells,
    isSubmitting,
    canManageMortgages,
    canUnmortgageProperties,
    getMortgageValue,
    getUnmortgageCost,
    onMortgage: handleMortgageProperty,
    onUnmortgage: handleUnmortgageProperty,
  };
}

function buildUpgradesDeskCardProps({
  actionGuide,
  actionState,
  upgradeState,
  isSubmitting,
  helpers,
  handlers,
  setters,
  refs,
}) {
  const {
    showUpgradeDesk,
    upgradeDeskState,
    upgradeDeskCollapsed,
    showUpgradeLists,
    upgradeableProperties,
    sellableProperties,
    propertyLevels,
    canUpgradeProperties,
    canSellUpgrades,
  } = upgradeState;
  const { canManageDebtRecovery } = actionState;
  const {
    getUpgradeCost,
    getUpgradeSellValue,
    getRentHint,
    formatCellType,
    getActionGuideFlashClassName,
    getActionGuideFlashStyle,
    isDeskCollapsible,
  } = helpers;
  const { handleUpgradeProperty, handleSellUpgradeProperty } = handlers;
  const { toggleDeskCollapsed } = setters;
  const { setActionSectionRef } = refs;

  if (!showUpgradeDesk) {
    return null;
  }

  return {
    ...buildFocusTargetProps({
      sectionKey: "upgrade",
      baseClassName: "upgrade-card",
      actionGuide,
      getActionGuideFlashClassName,
      getActionGuideFlashStyle,
      setActionSectionRef,
    }),
    statusLabel: upgradeDeskState.statusLabel,
    statusTone: upgradeDeskState.statusTone,
    note: upgradeDeskState.note,
    isCollapsible: isDeskCollapsible(upgradeDeskState.statusTone),
    isCollapsed: upgradeDeskCollapsed,
    onToggleCollapse: () => toggleDeskCollapsed("upgrade"),
    showLists: showUpgradeLists,
    canManageDebtRecovery,
    upgradeableProperties,
    sellableProperties,
    propertyLevels,
    isSubmitting,
    canUpgradeProperties,
    canSellUpgrades,
    getUpgradeCost,
    getUpgradeSellValue,
    getRentHint,
    formatCellType,
    onUpgrade: handleUpgradeProperty,
    onSellUpgrade: handleSellUpgradeProperty,
  };
}

function buildRecentEventsCardProps({
  recentEventsState,
  handlers,
}) {
  const {
    priorRecentEvents,
    selectedKind,
    expandedGroups,
    freshRecentEventIds,
    focusedRecentEventId,
    recentEventsEntityFilter,
    isRecentEventsHelpCollapsed,
    recentEventsClearFocusAnnouncementId,
  } = recentEventsState;
  const {
    handleRecentEventsKindChange,
    handleRecentEventsGroupToggle,
    handleRecentEventFocus,
    clearRecentEventFocus,
    handleRecentEventsHelpToggle,
  } = handlers;

  return {
    events: priorRecentEvents,
    title: "Recent events",
    maxGroups: 4,
    selectedKind,
    expandedGroups,
    freshEventIds: freshRecentEventIds,
    focusedEventId: focusedRecentEventId,
    entityFilter: recentEventsEntityFilter,
    onSelectKind: (kind) => handleRecentEventsKindChange("game", kind),
    onToggleGroup: (groupKey) => handleRecentEventsGroupToggle("game", groupKey),
    onFocusEvent: handleRecentEventFocus,
    onClearFocus: clearRecentEventFocus,
    showNavigationHelp: true,
    isNavigationHelpCollapsed: isRecentEventsHelpCollapsed,
    onToggleNavigationHelp: handleRecentEventsHelpToggle,
    announceUpdates: true,
    clearFocusAnnouncementId: recentEventsClearFocusAnnouncementId,
  };
}

function buildBoardTilesLayerProps({
  room,
  playerId,
  summaryState,
  boardState,
  helpers,
  handlers,
  refs,
  constants,
}) {
  const {
    boardCells,
    playerPositions,
    movingPlayerIds,
    propertyOwners,
    propertyMortgaged,
    propertyLevels,
    focusedEventCellIndex,
    movedCellIndexSet,
  } = boardState;
  const { lastLandedCell } = summaryState;
  const { jailPosition } = constants;
  const { getPlayerColor, renderPlayerToken } = helpers;
  const { handleBoardCellFocus } = handlers;
  const { registerBoardCellRef } = refs;

  return {
    boardCells,
    players: room.players,
    playerPositions,
    hiddenPlayerIds: movingPlayerIds,
    inJailByPlayer: room.game?.in_jail ?? {},
    jailPosition,
    propertyOwners,
    propertyMortgaged,
    propertyLevels,
    lastLandedCellIndex: lastLandedCell?.index ?? null,
    focusedEventCellIndex,
    movedCellIndexSet,
    currentPlayerId: playerId,
    getPlayerColor,
    registerBoardCellRef,
    onFocusCell: handleBoardCellFocus,
    renderPlayerToken,
  };
}

function buildMovingTokensOverlayProps({ room, boardState, helpers, refs }) {
  const { movingPlayerIds = [], movingTokenEffects } = boardState;

  if (movingPlayerIds.length === 0) {
    return null;
  }

  return {
    boardRef: refs.boardRef,
    boardCellRefs: refs.boardCellRefs,
    players: room.players,
    movingTokenEffects,
    getPlayerColor: helpers.getPlayerColor,
  };
}

function buildBoardPlayersGridProps({
  room,
  playerId,
  tradeState,
  boardState,
  helpers,
  handlers,
  refs,
}) {
  const {
    playerRecentEventCounts,
    currentTurnPlayerId,
    focusedPlayerIdSet,
    propertyLevels,
    getPlayerPosition,
    getPlayerCell,
    getOwnedCellsByPlayer,
    getMortgagedOwnedCellCount,
  } = boardState;
  const { selectedTradeTargetId } = tradeState;
  const { getRentHint, getPlayerColor } = helpers;
  const { handlePlayerCardFocus } = handlers;
  const { registerPlayerCardRef } = refs;

  return {
    players: room.players,
    playerRecentEventCounts,
    selectedTradeTargetId,
    currentTurnPlayerId,
    inJailByPlayer: room.game?.in_jail ?? {},
    currentPlayerId: playerId,
    cashByPlayer: room.game?.cash ?? {},
    focusedPlayerIdSet,
    propertyLevels,
    getPlayerPosition,
    getPlayerCell,
    getRentHint,
    getPlayerColor,
    getOwnedCellsByPlayer,
    getMortgagedOwnedCellCount,
    onFocusPlayer: handlePlayerCardFocus,
    registerPlayerCardRef,
  };
}

export function buildGameViewProps({
  room,
  playerId,
  actionGuide,
  hasStoredUiPreference,
  isSubmitting,
  lastBankruptcySummary,
  lastDrawnCard,
  summaryState,
  selectedCellState,
  selectedPlayerState,
  actionState,
  auctionState,
  tradeState,
  mortgageState,
  upgradeState,
  recentEventsState,
  boardState,
  helpers,
  handlers,
  setters,
  refs,
  constants,
  uiVisibilityState,
}) {
  const { shouldShowCenterActionUi = false } = uiVisibilityState ?? {};
  const propertyPurchaseDecisionProps = shouldShowCenterActionUi
    ? buildPropertyPurchaseDecisionProps({
        actionGuide,
        actionState,
        isSubmitting,
        handlers,
        helpers,
        refs,
      })
    : null;

  return {
    roomCode: room.room_code,
    turnNumber: room.game?.turn.turn_number,
    playerId,
    boardRef: refs.boardRef,
    boardCenterSummaryProps: buildBoardCenterSummaryProps({
      room,
      summaryState,
      helpers,
      constants,
    }),
    actionGuideCardProps: shouldShowCenterActionUi
      ? buildActionGuideCardProps({
          actionGuide,
          hasStoredUiPreference,
          handlers,
        })
      : null,
    selectedCellInspectorProps: buildSelectedCellInspectorProps({
      selectedCellState,
      isSubmitting,
      constants,
      helpers,
      handlers,
    }),
    selectedPlayerInspectorProps: buildSelectedPlayerInspectorProps({
      selectedPlayerState,
      playerId,
      isSubmitting,
      handlers,
    }),
    bankruptcySummaryProps: lastBankruptcySummary
      ? {
          summary: lastBankruptcySummary,
          title: "Latest bankruptcy recap",
        }
      : null,
    propertyPurchaseDecisionProps,
    boardCenterActionsProps: shouldShowCenterActionUi && !propertyPurchaseDecisionProps
      ? buildBoardCenterActionsProps({
          actionGuide,
          actionState,
          playerId,
          isSubmitting,
          constants,
          helpers,
          handlers,
          refs,
        })
      : null,
    auctionCardProps: shouldShowCenterActionUi
      ? buildAuctionCardProps({
          actionGuide,
          actionState,
          auctionState,
          isSubmitting,
          helpers,
          handlers,
          setters,
          refs,
        })
      : null,
    tradeDeskCardProps: buildTradeDeskCardProps({
      actionGuide,
      actionState,
      tradeState,
      playerId,
      isSubmitting,
      helpers,
      handlers,
      setters,
      refs,
    }),
    mortgageDeskCardProps: buildMortgageDeskCardProps({
      actionGuide,
      actionState,
      mortgageState,
      isSubmitting,
      helpers,
      handlers,
      setters,
      refs,
    }),
    upgradesDeskCardProps: buildUpgradesDeskCardProps({
      actionGuide,
      actionState,
      upgradeState,
      isSubmitting,
      helpers,
      handlers,
      setters,
      refs,
    }),
    recentEventsCardProps: buildRecentEventsCardProps({
      recentEventsState,
      handlers,
    }),
    drawnCard: lastDrawnCard,
    boardTilesLayerProps: buildBoardTilesLayerProps({
      room,
      playerId,
      summaryState,
      boardState,
      helpers,
      handlers,
      refs,
      constants,
    }),
    movingTokensOverlayProps: buildMovingTokensOverlayProps({
      room,
      boardState,
      helpers,
      refs,
    }),
    boardPlayersGridProps: buildBoardPlayersGridProps({
      room,
      playerId,
      tradeState,
      boardState,
      helpers,
      handlers,
      refs,
    }),
  };
}

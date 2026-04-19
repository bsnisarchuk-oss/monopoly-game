import { getCountLabel } from "./utils";

export function buildGuideFocusSelector(focusKey) {
  return focusKey ? `[data-guide-focus="${focusKey}"]:not([disabled])` : null;
}

function getActionSectionLabel(sectionKey) {
  switch (sectionKey) {
    case "actions":
      return "Turn actions";
    case "purchase":
      return "Property decision";
    case "auction":
      return "Auction";
    case "trade":
      return "Trade desk";
    case "mortgage":
      return "Mortgage desk";
    case "upgrade":
      return "Upgrades desk";
    default:
      return "Active section";
  }
}

function getActionFocusAnnouncementLabel(focusKey) {
  switch (focusKey) {
    case "pay-jail-fine":
      return "Pay fine";
    case "declare-bankruptcy":
      return "Declare bankruptcy";
    case "roll-dice":
      return "Roll dice";
    case "buy-property":
      return "Buy property";
    case "auction-property":
      return "Auction";
    case "skip-purchase":
      return "Pass on purchase";
    case "auction-bid-input":
      return "Your bid";
    case "auction-place-bid":
      return "Place bid";
    case "auction-pass":
      return "Pass";
    case "accept-trade":
      return "Accept trade";
    case "reject-trade":
      return "Reject trade";
    case "trade-offer-cell":
      return "Offer cell";
    case "trade-target-player":
      return "Trade with";
    case "trade-cash-requested":
      return "Cash requested";
    case "propose-trade":
      return "Propose trade";
    case "mortgage-first":
      return "Mortgage";
    case "unmortgage-first":
      return "Unmortgage";
    case "upgrade-first":
      return "Upgrade";
    case "sell-upgrade-first":
      return "Sell upgrade";
    default:
      return null;
  }
}

export function buildActionGuideJumpAnnouncement(sectionKey, focusKey) {
  const sectionLabel = getActionSectionLabel(sectionKey);
  const focusLabel = getActionFocusAnnouncementLabel(focusKey);

  if (!focusLabel) {
    return `Jumped to ${sectionLabel}.`;
  }

  return `Jumped to ${sectionLabel}. Focused ${focusLabel}.`;
}

export function buildActionGuideJumpButtonLabel(sectionKey) {
  return `Jump to ${getActionSectionLabel(sectionKey)}`;
}

function getPreRollActionSectionKey({
  pendingAuction,
  upgradeableProperties,
  sellableProperties,
  mortgageableCells,
  unmortgageableCells,
  canManageDebtRecovery,
  pendingTrade,
  canPrepareTrade,
}) {
  if (!pendingAuction && (upgradeableProperties.length > 0 || sellableProperties.length > 0)) {
    return "upgrade";
  }

  if (
    !pendingAuction &&
    (mortgageableCells.length > 0 || (unmortgageableCells.length > 0 && !canManageDebtRecovery))
  ) {
    return "mortgage";
  }

  if (!pendingAuction && (pendingTrade || canPrepareTrade)) {
    return "trade";
  }

  return "actions";
}

function getPreRollActionFocusKey({
  pendingAuction,
  upgradeableProperties,
  sellableProperties,
  mortgageableCells,
  unmortgageableCells,
  canManageDebtRecovery,
  canPrepareTrade,
}) {
  if (!pendingAuction && upgradeableProperties.length > 0) {
    return "upgrade-first";
  }

  if (!pendingAuction && sellableProperties.length > 0) {
    return "sell-upgrade-first";
  }

  if (!pendingAuction && mortgageableCells.length > 0) {
    return "mortgage-first";
  }

  if (!pendingAuction && unmortgageableCells.length > 0 && !canManageDebtRecovery) {
    return "unmortgage-first";
  }

  if (!pendingAuction && canPrepareTrade) {
    return "trade-offer-cell";
  }

  return "roll-dice";
}

function getDebtRecoveryActionSectionKey({
  pendingAuction,
  mortgageableCells,
  sellableProperties,
  pendingTrade,
  canPrepareTrade,
}) {
  if (!pendingAuction && mortgageableCells.length > 0) {
    return "mortgage";
  }

  if (!pendingAuction && sellableProperties.length > 0) {
    return "upgrade";
  }

  if (!pendingAuction && (pendingTrade || canPrepareTrade)) {
    return "trade";
  }

  return "actions";
}

function getDebtRecoveryActionFocusKey({
  pendingAuction,
  mortgageableCells,
  sellableProperties,
  canPrepareTrade,
}) {
  if (!pendingAuction && mortgageableCells.length > 0) {
    return "mortgage-first";
  }

  if (!pendingAuction && sellableProperties.length > 0) {
    return "sell-upgrade-first";
  }

  if (!pendingAuction && canPrepareTrade) {
    return "trade-offer-cell";
  }

  return "declare-bankruptcy";
}

export function buildActionGuide({
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
  jailFineAmount,
  currentPlayerTurnsInJail,
  canUsePreRollDesk,
  currentPlayerDoublesStreak,
}) {
  const activePlayerName = currentTurnPlayer?.nickname ?? "the active player";
  const canPrepareTrade = canProposeTrade && tradeableCells.length > 0 && tradeTargets.length > 0;
  const preRollOptions = [];
  const debtRecoveryOptions = [];

  if (canUpgradeProperties && upgradeableProperties.length > 0) {
    preRollOptions.push(getCountLabel(upgradeableProperties.length, "upgrade option"));
  }
  if (canSellUpgrades && !canManageDebtRecovery && sellableProperties.length > 0) {
    preRollOptions.push(getCountLabel(sellableProperties.length, "upgrade sale"));
  }
  if (canManageMortgages && !canManageDebtRecovery && mortgageableCells.length > 0) {
    preRollOptions.push(getCountLabel(mortgageableCells.length, "mortgage option"));
  }
  if (canUnmortgageProperties && unmortgageableCells.length > 0) {
    preRollOptions.push(getCountLabel(unmortgageableCells.length, "unmortgage option"));
  }
  if (canPrepareTrade) {
    preRollOptions.push(getCountLabel(tradeableCells.length, "trade-ready cell"));
  }

  if (canSellUpgrades && sellableProperties.length > 0) {
    debtRecoveryOptions.push(getCountLabel(sellableProperties.length, "upgrade sale"));
  }
  if (canManageMortgages && mortgageableCells.length > 0) {
    debtRecoveryOptions.push(getCountLabel(mortgageableCells.length, "mortgage option"));
  }
  if (canPrepareTrade) {
    debtRecoveryOptions.push(getCountLabel(tradeableCells.length, "trade-ready cell"));
  }

  if (canResolvePurchase && pendingPurchaseCell) {
    if (!canAffordPendingPurchase) {
      return {
        tone: "urgent",
        eyebrow: "Decision needed",
        title: "Auction required",
        summary: `You do not have enough cash to buy ${pendingPurchaseCell.name} for $${pendingPurchase?.price ?? 0} right now.`,
        steps: [
          "Use Auction to send the property straight to bidding.",
          "Other turn actions unlock again after the property decision is resolved.",
        ],
        focusKey: "auction-property",
        targetKey: "purchase",
      };
    }

    return {
      tone: "urgent",
      eyebrow: "Decision needed",
      title: "Buy or auction",
      summary: `You landed on ${pendingPurchaseCell.name}. Buy it for $${pendingPurchase?.price ?? 0} or send it straight to auction.`,
      steps: [
        `Use Buy for $${pendingPurchase?.price ?? 0} if you want to keep this cell.`,
        "Use Auction if you want bidding to begin immediately.",
      ],
      focusKey: "buy-property",
      targetKey: "purchase",
    };
  }

  if (pendingPurchaseCell) {
    return {
      tone: "waiting",
      eyebrow: "Turn paused",
      title: `Waiting for ${pendingPurchasePlayer?.nickname ?? activePlayerName}`,
      summary: `${pendingPurchasePlayer?.nickname ?? activePlayerName} is deciding whether to buy ${pendingPurchaseCell.name} or send it to auction.`,
      steps: [
        "The turn continues after the purchase is resolved.",
        "You can inspect the board, players, and recent events while you wait.",
      ],
      focusKey: null,
      targetKey: "purchase",
    };
  }

  if (pendingAuction) {
    const auctionCellName = pendingAuctionCell?.name ?? pendingAuction.cell_name;

    if (canBidInAuction) {
      return {
        tone: "urgent",
        eyebrow: "Auction turn",
        title: "Auction",
        summary: canAffordAuctionBid
          ? `${auctionCellName} is in auction. You can bid at least $${minimumAuctionBid}, or pass and leave the auction.`
          : `${auctionCellName} is in auction. The minimum bid is $${minimumAuctionBid}, but you do not have enough cash to place it.`,
        steps: canAffordAuctionBid
          ? [
              `Enter a bid of at least $${minimumAuctionBid} if you want to stay in the auction.`,
              "Use Pass if you want to leave the auction now.",
            ]
          : ["Use Pass. It is the only valid move you can make right now."],
        focusKey: canAffordAuctionBid ? "auction-bid-input" : "auction-pass",
        targetKey: "auction",
      };
    }

    return {
      tone: "waiting",
      eyebrow: "Auction in progress",
      title: `Waiting for ${pendingAuctionActivePlayer?.nickname ?? activePlayerName}`,
      summary: `${pendingAuctionActivePlayer?.nickname ?? activePlayerName} is deciding the next move for ${auctionCellName}.`,
      steps: [
        "The turn resumes after the auction finishes.",
        "You can review the current bid and highest bidder in the auction card below.",
      ],
      focusKey: null,
      targetKey: "auction",
    };
  }

  if (pendingTrade) {
    const tradeCellName = pendingTradeCell?.name ?? pendingTrade.cell_name;

    if (canAcceptTrade) {
      return {
        tone: "urgent",
        eyebrow: "Trade response",
        title: `Answer the offer for ${tradeCellName}`,
        summary: `${pendingTradeProposer?.nickname ?? "Another player"} wants to trade ${tradeCellName} for $${pendingTrade.cash_amount}.`,
        steps: [
          "Use Accept trade if the deal looks good to you.",
          "Use Reject trade if you do not want this deal.",
        ],
        focusKey: "accept-trade",
        targetKey: "trade",
      };
    }

    if (pendingTrade.proposer_id === playerId && canRejectTrade) {
      return {
        tone: "active",
        eyebrow: "Offer sent",
        title: "Waiting for the trade answer",
        summary: `${pendingTradeReceiver?.nickname ?? "The other player"} is deciding whether to accept your offer for ${tradeCellName}.`,
        steps: [
          "Wait for the response if you still want the deal.",
          "Use Cancel offer if you want to stop waiting.",
        ],
        focusKey: "reject-trade",
        targetKey: "trade",
      };
    }

    return {
      tone: "waiting",
      eyebrow: "Trade in progress",
      title: `Waiting for ${pendingTradeReceiver?.nickname ?? "the receiving player"}`,
      summary: `${pendingTradeReceiver?.nickname ?? "The receiving player"} is reviewing the offer for ${tradeCellName}.`,
      steps: [
        "The turn continues after the trade is accepted, rejected, or cancelled.",
        "You can still inspect the property and player cards while you wait.",
      ],
      focusKey: null,
      targetKey: "trade",
    };
  }

  if (pendingBankruptcy) {
    if (canManageDebtRecovery) {
      const creditorLabel = pendingBankruptcyCreditor?.nickname ?? pendingBankruptcyCreditorLabel;
      const steps = [];

      if (debtRecoveryOptions.length > 0) {
        steps.push(`Recovery tools ready: ${debtRecoveryOptions.join(", ")}.`);
        steps.push("Use the debt actions below to raise cash before you give up the turn.");
      } else {
        steps.push("No recovery tools are available from your current board state.");
      }

      steps.push("Use Declare bankruptcy only if you cannot cover the debt.");

      return {
        tone: "urgent",
        eyebrow: "Debt recovery",
        title: "Raise cash or go bankrupt",
        summary: `You owe ${creditorLabel} $${pendingBankruptcy.amount_owed}. Clear the debt to keep playing.`,
        steps,
        focusKey: getDebtRecoveryActionFocusKey({
          pendingAuction,
          mortgageableCells,
          sellableProperties,
          canPrepareTrade,
        }),
        targetKey: getDebtRecoveryActionSectionKey({
          pendingAuction,
          mortgageableCells,
          sellableProperties,
          pendingTrade,
          canPrepareTrade,
        }),
      };
    }

    return {
      tone: "waiting",
      eyebrow: "Debt recovery",
      title: `Waiting for ${pendingBankruptcyPlayer?.nickname ?? activePlayerName}`,
      summary: `${pendingBankruptcyPlayer?.nickname ?? activePlayerName} is trying to raise $${pendingBankruptcy.amount_owed} owed to ${pendingBankruptcyCreditorLabel}.`,
      steps: [
        "The match continues after the debt is covered or bankruptcy is declared.",
        "You can inspect their properties and recent events while you wait.",
      ],
      focusKey: null,
      targetKey: null,
    };
  }

  if (currentTurnPlayerId === playerId) {
    if (isCurrentPlayerInJail) {
      const jailSteps = [];

      if (canPayJailFine) {
        jailSteps.push(
          canAffordJailFine
            ? `Optional: pay $${jailFineAmount} now if you want to leave jail before rolling.`
            : `You cannot afford the $${jailFineAmount} fine right now, so your only way out is to roll.`,
        );
      }

      jailSteps.push("Roll dice to try for doubles and leave jail.");

      return {
        tone: "active",
        eyebrow: "Your turn",
        title: "Handle your jail turn",
        summary:
          currentPlayerTurnsInJail >= 2
            ? "This is your last free attempt. If you miss doubles, the fine is forced and you move."
            : "You can try to roll doubles for free, or pay before you roll if you have enough cash.",
        steps: jailSteps,
        focusKey: "roll-dice",
        targetKey: "actions",
      };
    }

    if (canUsePreRollDesk) {
      return {
        tone: "active",
        eyebrow: "Your turn",
        title: preRollOptions.length > 0 ? "Prepare, then roll" : "Roll to continue",
        summary:
          preRollOptions.length > 0
            ? "You still have optional pre-roll actions available before you commit to the dice."
            : "No extra setup is available right now. Your next move is simply to roll the dice.",
        steps:
          preRollOptions.length > 0
            ? [
                `Optional tools ready: ${preRollOptions.join(", ")}.`,
                "Use Roll dice when you are ready to continue the turn.",
              ]
            : ["Use Roll dice to continue the turn."],
        note:
          currentPlayerDoublesStreak > 0
            ? `Careful: your doubles streak is ${currentPlayerDoublesStreak}/3, so one more doubles result sends you to jail.`
            : null,
        focusKey: getPreRollActionFocusKey({
          pendingAuction,
          upgradeableProperties,
          sellableProperties,
          mortgageableCells,
          unmortgageableCells,
          canManageDebtRecovery,
          canPrepareTrade,
        }),
        targetKey: getPreRollActionSectionKey({
          pendingAuction,
          upgradeableProperties,
          sellableProperties,
          mortgageableCells,
          unmortgageableCells,
          canManageDebtRecovery,
          pendingTrade,
          canPrepareTrade,
        }),
      };
    }

    return {
      tone: "active",
      eyebrow: "Your turn",
      title: "Turn state updated",
      summary: "Your turn is between actions right now. Follow the visible prompt or action card below.",
      steps: ["Check the active purchase, auction, trade, or debt section if one is open."],
      focusKey: "roll-dice",
      targetKey: "actions",
    };
  }

  return {
    tone: "waiting",
    eyebrow: "Waiting",
    title: `Waiting for ${activePlayerName}`,
    summary: `${activePlayerName} is taking the current turn.`,
    steps: [
      "You can inspect cells, players, and recent events while you wait.",
      "Watch the center cards for the next prompt that opens to you.",
    ],
    focusKey: null,
    targetKey: null,
  };
}

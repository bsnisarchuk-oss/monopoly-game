export const EMPTY_RECENT_EVENTS = [];
export const KIND_ORDER = ["roll", "property", "auction", "trade", "jail", "bankruptcy", "system"];

export function formatRecentEventKind(kind) {
  switch (kind) {
    case "auction":
      return "Auction";
    case "bankruptcy":
      return "Bankruptcy";
    case "jail":
      return "Jail";
    case "property":
      return "Property";
    case "roll":
      return "Roll";
    case "trade":
      return "Trade";
    default:
      return "System";
  }
}

export function groupRecentEvents(events) {
  if (!events || events.length === 0) {
    return [];
  }

  const groups = [];
  for (const event of events) {
    const eventKind = event.kind ?? "system";
    const currentGroup = groups.at(-1);

    if (currentGroup && currentGroup.kind === eventKind) {
      currentGroup.events.push(event);
      currentGroup.oldestTurnNumber = event.turn_number;
      continue;
    }

    groups.push({
      kind: eventKind,
      newestTurnNumber: event.turn_number,
      oldestTurnNumber: event.turn_number,
      events: [event],
    });
  }

  return groups;
}

export function formatRecentEventTurnLabel(group) {
  if (group.newestTurnNumber === group.oldestTurnNumber) {
    return `Turn ${group.newestTurnNumber}`;
  }

  return `Turns ${group.newestTurnNumber}-${group.oldestTurnNumber}`;
}

export function buildRecentEventGroupKey(group) {
  const oldestEvent = group.events[group.events.length - 1];
  const anchorEventId = oldestEvent?.event_id ?? oldestEvent?.turn_number ?? group.oldestTurnNumber ?? 0;

  return `${group.kind}-${anchorEventId}`;
}

export function hasRecentEventReferences(event) {
  return (
    Number.isInteger(event?.cell_index) ||
    Boolean(event?.player_id) ||
    Boolean(event?.target_player_id)
  );
}

export function recentEventMatchesEntityFilter(event, entityFilter) {
  if (!entityFilter) {
    return true;
  }

  if (entityFilter.type === "cell") {
    return event.cell_index === entityFilter.cellIndex;
  }

  if (entityFilter.type === "player") {
    return entityFilter.playerIds.some(
      (playerId) => event.player_id === playerId || event.target_player_id === playerId,
    );
  }

  return true;
}

export function filterRecentEventsByKind(events, selectedKind) {
  if (selectedKind === "all") {
    return events;
  }

  return events.filter((event) => (event.kind ?? "system") === selectedKind);
}

export function formatLinkedEventCount(count) {
  return count > 9 ? "9+" : String(count);
}

export function formatLinkedEventLabel(count, subjectLabel) {
  return `${count} linked event${count === 1 ? "" : "s"} for ${subjectLabel}`;
}

export function formatRecentEventsAnnouncementScope(activeKind, entityFilter) {
  const baseScope =
    activeKind === "all"
      ? "the current recent events view"
      : `${formatRecentEventKind(activeKind).toLowerCase()} events`;

  if (!entityFilter?.label) {
    return baseScope;
  }

  if (activeKind === "all") {
    return `events linked to ${entityFilter.label}`;
  }

  return `${baseScope} linked to ${entityFilter.label}`;
}

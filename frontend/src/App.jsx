import { useEffect, useRef, useState } from "react";

const API_BASE_URL = "http://127.0.0.1:8000";
const SESSION_STORAGE_KEY = "monopoly_player_session";
const RECENT_EVENTS_HELP_COLLAPSED_KEY = "monopoly_recent_events_help_collapsed";
const JAIL_FINE_AMOUNT = 50;
const MAX_PROPERTY_LEVEL = 4;
const JAIL_POSITION = 10;
const PROPERTY_RENT_MULTIPLIERS = [1, 2, 4, 7, 11];
const RECENT_EVENT_HIGHLIGHT_MS = 4500;
const TOKEN_MOVE_FEEDBACK_MS = 1200;
const TOKEN_MOVE_MAX_OFFSET_PX = 26;
const MOBILE_RECENT_EVENTS_BREAKPOINT = "(max-width: 640px)";
const EMPTY_RECENT_EVENTS = [];
const PLAYER_TOKEN_COLORS = ["#d94f3d", "#3b7fd4", "#3aaa5e", "#e09b2a"];

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

function getCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function BankruptcySummaryCard({ summary, title }) {
  if (!summary) {
    return null;
  }

  const transferParts = [];
  if (summary.cash_collected > 0) {
    transferParts.push(`$${summary.cash_collected} cash`);
  }
  if (summary.property_count > 0) {
    transferParts.push(getCountLabel(summary.property_count, "property"));
  }

  const transferLine =
    summary.creditor_type === "player"
      ? transferParts.length > 0
        ? `${summary.creditor_name} collected ${transferParts.join(" and ")} from the bankruptcy.`
        : `${summary.creditor_name} did not collect extra cash or properties from the bankruptcy.`
      : summary.property_count > 0
        ? `${getCountLabel(summary.property_count, "property")} returned to the bank.`
        : "No properties were left to return to the bank.";
  const liquidationLine =
    summary.liquidated_upgrade_count > 0
      ? `${getCountLabel(summary.liquidated_upgrade_count, "upgrade")} ${
          summary.liquidated_upgrade_count === 1 ? "was" : "were"
        } liquidated for $${summary.liquidation_cash} before assets moved.`
      : "No upgrades needed liquidation.";
  const mortgageLine =
    summary.mortgaged_property_count > 0
      ? `${getCountLabel(summary.mortgaged_property_count, "property")} stayed mortgaged after the takeover.`
      : "No mortgaged properties were part of this transfer.";

  return (
    <section className="bankruptcy-recap">
      <h3>{title}</h3>
      <p className="bankruptcy-recap-message">{summary.message}</p>

      <div className="bankruptcy-recap-stats">
        <article className="bankruptcy-recap-stat">
          <span>Debtor</span>
          <strong>{summary.debtor_nickname}</strong>
        </article>
        <article className="bankruptcy-recap-stat">
          <span>Creditor</span>
          <strong>{summary.creditor_name}</strong>
        </article>
        <article className="bankruptcy-recap-stat">
          <span>Properties</span>
          <strong>{summary.property_count}</strong>
        </article>
        <article className="bankruptcy-recap-stat">
          <span>Liquidated</span>
          <strong>${summary.liquidation_cash}</strong>
        </article>
      </div>

      <div className="bankruptcy-recap-notes">
        <p>{transferLine}</p>
        <p>{liquidationLine}</p>
        <p>{mortgageLine}</p>
      </div>
    </section>
  );
}

function formatRecentEventKind(kind) {
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

function groupRecentEvents(events) {
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

function formatRecentEventTurnLabel(group) {
  if (group.newestTurnNumber === group.oldestTurnNumber) {
    return `Turn ${group.newestTurnNumber}`;
  }

  return `Turns ${group.newestTurnNumber}-${group.oldestTurnNumber}`;
}

function buildRecentEventGroupKey(group) {
  const oldestEvent = group.events[group.events.length - 1];
  const anchorEventId = oldestEvent?.event_id ?? oldestEvent?.turn_number ?? group.oldestTurnNumber ?? 0;

  return `${group.kind}-${anchorEventId}`;
}

function hasRecentEventReferences(event) {
  return (
    Number.isInteger(event?.cell_index) ||
    Boolean(event?.player_id) ||
    Boolean(event?.target_player_id)
  );
}

function recentEventMatchesEntityFilter(event, entityFilter) {
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

function filterRecentEventsByKind(events, selectedKind) {
  if (selectedKind === "all") {
    return events;
  }

  return events.filter((event) => (event.kind ?? "system") === selectedKind);
}

function formatLinkedEventCount(count) {
  return count > 9 ? "9+" : String(count);
}

function formatLinkedEventLabel(count, subjectLabel) {
  return `${count} linked event${count === 1 ? "" : "s"} for ${subjectLabel}`;
}

function getPlayerTokenLabel(nickname) {
  return (nickname?.trim()?.[0] ?? "?").toUpperCase();
}

function formatRecentEventsAnnouncementScope(activeKind, entityFilter) {
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

const KIND_ORDER = ["roll", "property", "auction", "trade", "jail", "bankruptcy", "system"];

function RecentEventsCard({
  events,
  title,
  maxGroups = 4,
  selectedKind = "all",
  expandedGroups = {},
  freshEventIds = {},
  focusedEventId = null,
  entityFilter = null,
  onSelectKind,
  onToggleGroup,
  onFocusEvent,
  onClearFocus,
  showNavigationHelp = false,
  isNavigationHelpCollapsed = false,
  onToggleNavigationHelp,
  onResetNavigationHelp,
  announceUpdates = false,
  clearFocusAnnouncementId = 0,
}) {
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const actionsMenuContainerRef = useRef(null);
  const actionsMenuToggleRef = useRef(null);
  const actionsMenuItemRefs = useRef([]);
  const liveStatusRef = useRef(null);
  const liveAnnouncementFrameRef = useRef(null);
  const previousLiveSnapshotRef = useRef(null);
  const shouldRestoreMenuFocusRef = useRef(false);
  const pendingActionsMenuFocusIndexRef = useRef(null);
  const safeEvents = events ?? EMPTY_RECENT_EVENTS;

  function closeActionsMenu({ returnFocus = false } = {}) {
    setIsActionsMenuOpen(false);
    shouldRestoreMenuFocusRef.current = returnFocus;
    pendingActionsMenuFocusIndexRef.current = null;
  }

  function focusActionsMenuItem(index) {
    const target = actionsMenuItemRefs.current[index];
    if (target && target.offsetParent !== null) {
      target.focus();
    }
  }

  function openActionsMenu({ focusIndex = null } = {}) {
    pendingActionsMenuFocusIndexRef.current = focusIndex;
    setIsActionsMenuOpen(true);
  }

  useEffect(() => {
    if (!isActionsMenuOpen && shouldRestoreMenuFocusRef.current) {
      const toggle = actionsMenuToggleRef.current;
      if (toggle && toggle.offsetParent !== null) {
        toggle.focus();
      }
      shouldRestoreMenuFocusRef.current = false;
    }
  }, [isActionsMenuOpen]);

  useEffect(() => {
    if (isActionsMenuOpen && pendingActionsMenuFocusIndexRef.current != null) {
      focusActionsMenuItem(pendingActionsMenuFocusIndexRef.current);
      pendingActionsMenuFocusIndexRef.current = null;
    }
  }, [isActionsMenuOpen]);

  useEffect(() => {
    if (!isActionsMenuOpen) return undefined;

    function handleMouseDown(e) {
      if (actionsMenuContainerRef.current && !actionsMenuContainerRef.current.contains(e.target)) {
        closeActionsMenu();
      }
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        closeActionsMenu({ returnFocus: true });
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActionsMenuOpen]);

  const availableKinds = KIND_ORDER.filter((k) => safeEvents.some((e) => (e.kind ?? "system") === k));
  const activeKind =
    selectedKind !== "all" && !availableKinds.includes(selectedKind) ? "all" : selectedKind;
  const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const sectionHeadingId = `${titleSlug}-heading`;
  const navigationHelpId = `${titleSlug}-navigation-help`;
  const actionsMenuId = `${titleSlug}-actions-menu`;
  const actionsMenuToggleId = `${titleSlug}-actions-toggle`;
  const headerActions = [];

  const filteredEvents = filterRecentEventsByKind(safeEvents, activeKind);
  const entityScopedEvents = filteredEvents.filter((event) =>
    recentEventMatchesEntityFilter(event, entityFilter),
  );
  const groupedEvents = groupRecentEvents(entityScopedEvents).slice(0, maxGroups);
  const hasFocusControls = (focusedEventId != null || entityFilter != null) && onClearFocus;
  const entityFilterKey = entityFilter
    ? `${entityFilter.type}:${entityFilter.label}:${entityFilter.cellIndex ?? ""}:${(entityFilter.playerIds ?? []).join(",")}`
    : "all";
  const visibleFreshEventIds = entityScopedEvents
    .filter((event) => freshEventIds[event.event_id])
    .map((event) => event.event_id);
  const visibleFreshKey = visibleFreshEventIds.join(",");
  const announcementScopeLabel = formatRecentEventsAnnouncementScope(activeKind, entityFilter);
  const clearFocusScopeLabel =
    activeKind !== "all" ? `${formatRecentEventKind(activeKind).toLowerCase()} events` : null;

  function queueLiveAnnouncement(message) {
    if (!liveStatusRef.current || !message) {
      return;
    }

    if (liveAnnouncementFrameRef.current != null) {
      window.cancelAnimationFrame(liveAnnouncementFrameRef.current);
      liveAnnouncementFrameRef.current = null;
    }

    liveStatusRef.current.textContent = "";
    liveAnnouncementFrameRef.current = window.requestAnimationFrame(() => {
      if (liveStatusRef.current) {
        liveStatusRef.current.textContent = message;
      }
      liveAnnouncementFrameRef.current = null;
    });
  }

  useEffect(() => {
    const currentSnapshot = {
      activeKind,
      clearFocusAnnouncementId,
      entityFilterKey,
      visibleFreshKey,
      eventCount: entityScopedEvents.length,
      groupCount: groupedEvents.length,
    };

    const previousSnapshot = previousLiveSnapshotRef.current;
    previousLiveSnapshotRef.current = currentSnapshot;

    if (!announceUpdates || !previousSnapshot || !liveStatusRef.current) {
      return undefined;
    }

    const filterChanged =
      previousSnapshot.activeKind !== activeKind || previousSnapshot.entityFilterKey !== entityFilterKey;
    const clearFocusTriggered =
      clearFocusAnnouncementId > 0 &&
      previousSnapshot.clearFocusAnnouncementId !== clearFocusAnnouncementId;
    const freshEventsChanged = visibleFreshKey !== previousSnapshot.visibleFreshKey && visibleFreshEventIds.length > 0;

    if ((!filterChanged || clearFocusTriggered) && !freshEventsChanged) {
      return undefined;
    }

    let announcement = "";

    if (filterChanged) {
      if (entityScopedEvents.length === 0) {
        announcement = `Recent events updated for ${announcementScopeLabel}. No events currently match this view.`;
      } else {
        announcement = `Recent events updated for ${announcementScopeLabel}. Showing ${getCountLabel(entityScopedEvents.length, "event")} in ${getCountLabel(groupedEvents.length, "group")}.`;
      }
    } else if (freshEventsChanged) {
      announcement = `${getCountLabel(visibleFreshEventIds.length, "new event")} in ${announcementScopeLabel}.`;
    }

    if (!announcement) {
      return undefined;
    }

    queueLiveAnnouncement(announcement);

    return () => {
      if (liveAnnouncementFrameRef.current != null) {
        window.cancelAnimationFrame(liveAnnouncementFrameRef.current);
        liveAnnouncementFrameRef.current = null;
      }
    };
  }, [
    activeKind,
    announceUpdates,
    announcementScopeLabel,
    clearFocusAnnouncementId,
    entityFilterKey,
    entityScopedEvents.length,
    groupedEvents.length,
    visibleFreshEventIds.length,
    visibleFreshKey,
  ]);

  useEffect(() => {
    const previousClearFocusAnnouncementId = previousLiveSnapshotRef.current?.clearFocusAnnouncementId ?? 0;

    if (
      !announceUpdates ||
      !liveStatusRef.current ||
      clearFocusAnnouncementId === 0 ||
      clearFocusAnnouncementId === previousClearFocusAnnouncementId
    ) {
      return undefined;
    }

    queueLiveAnnouncement(
      clearFocusScopeLabel
        ? `Recent events focus cleared. Showing ${clearFocusScopeLabel}.`
        : "Recent events focus cleared.",
    );

    return () => {
      if (liveAnnouncementFrameRef.current != null) {
        window.cancelAnimationFrame(liveAnnouncementFrameRef.current);
        liveAnnouncementFrameRef.current = null;
      }
    };
  }, [announceUpdates, clearFocusAnnouncementId, clearFocusScopeLabel]);

  if (showNavigationHelp && onToggleNavigationHelp) {
    headerActions.push({
      key: "toggle-help",
      label: isNavigationHelpCollapsed ? "Show help" : "Hide help",
      className: "recent-events-help-toggle",
      ariaExpanded: !isNavigationHelpCollapsed,
      ariaControls: navigationHelpId,
    });
  }

  if (showNavigationHelp && onResetNavigationHelp) {
    headerActions.push({
      key: "reset-help",
      label: "Reset UI hints",
      className: "recent-events-reset-hints",
    });
  }

  if (hasFocusControls) {
    headerActions.push({
      key: "clear-focus",
      label: "Clear focus",
      className: "recent-events-clear-focus",
    });
  }

  function handleHeaderAction(actionKey) {
    if (actionKey === "toggle-help") {
      onToggleNavigationHelp?.();
    } else if (actionKey === "reset-help") {
      onResetNavigationHelp?.();
    } else if (actionKey === "clear-focus") {
      onClearFocus?.();
    }

    closeActionsMenu({ returnFocus: true });
  }

  function handleActionsMenuToggleKeyDown(event) {
    if (headerActions.length === 0) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isActionsMenuOpen) {
        closeActionsMenu();
      } else {
        openActionsMenu({ focusIndex: 0 });
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "Home") {
      event.preventDefault();
      openActionsMenu({ focusIndex: 0 });
      return;
    }

    if (event.key === "ArrowUp" || event.key === "End") {
      event.preventDefault();
      openActionsMenu({ focusIndex: headerActions.length - 1 });
    }
  }

  function handleActionsMenuItemKeyDown(event, actionIndex) {
    if (headerActions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusActionsMenuItem((actionIndex + 1) % headerActions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusActionsMenuItem((actionIndex - 1 + headerActions.length) % headerActions.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusActionsMenuItem(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      focusActionsMenuItem(headerActions.length - 1);
      return;
    }

    if (event.key === "Tab") {
      closeActionsMenu({ returnFocus: false });
    }
  }

  if (safeEvents.length === 0) {
    return null;
  }

  return (
    <section className="recent-events-card" aria-labelledby={sectionHeadingId}>
      {announceUpdates && (
        <div ref={liveStatusRef} className="sr-only" aria-live="polite" aria-atomic="true" />
      )}
      <div className="recent-events-header-row">
        <h3 id={sectionHeadingId}>{title}</h3>
        {headerActions.length > 0 && (
          <>
            <div className="recent-events-header-actions recent-events-header-actions-inline">
              {headerActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  className={action.className}
                  onClick={() => handleHeaderAction(action.key)}
                  aria-expanded={action.ariaExpanded}
                  aria-controls={action.ariaControls}
                >
                  {action.label}
                </button>
              ))}
            </div>
            <div className="recent-events-actions-menu" ref={actionsMenuContainerRef}>
              <button
                ref={actionsMenuToggleRef}
                type="button"
                id={actionsMenuToggleId}
                className="recent-events-actions-menu-toggle"
                onClick={() => {
                  if (isActionsMenuOpen) {
                    closeActionsMenu();
                  } else {
                    openActionsMenu();
                  }
                }}
                onKeyDown={handleActionsMenuToggleKeyDown}
                aria-haspopup="menu"
                aria-expanded={isActionsMenuOpen}
                aria-controls={actionsMenuId}
                aria-label="More options"
              >
                More
              </button>
              {isActionsMenuOpen && (
                <div
                  id={actionsMenuId}
                  className="recent-events-actions-menu-panel"
                  role="menu"
                  aria-orientation="vertical"
                  aria-labelledby={actionsMenuToggleId}
                >
                  {headerActions.map((action, actionIndex) => (
                    <button
                      key={action.key}
                      ref={(element) => {
                        actionsMenuItemRefs.current[actionIndex] = element;
                      }}
                      type="button"
                      className={`recent-events-actions-menu-item ${action.className}`}
                      onClick={() => handleHeaderAction(action.key)}
                      onKeyDown={(event) => handleActionsMenuItemKeyDown(event, actionIndex)}
                      role="menuitem"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {availableKinds.length > 1 && (
        <div className="recent-events-filters" role="group" aria-label="Filter by event type">
          <button
            type="button"
            className={`recent-events-filter ${activeKind === "all" ? "is-active" : ""}`}
            onClick={() => onSelectKind?.("all")}
            aria-pressed={activeKind === "all"}
          >
            All
          </button>
          {availableKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`recent-events-filter recent-events-filter-${kind} ${
                activeKind === kind ? "is-active" : ""
              }`}
              onClick={() => onSelectKind?.(kind)}
              aria-pressed={activeKind === kind}
            >
              {formatRecentEventKind(kind)}
            </button>
          ))}
        </div>
      )}
      {entityFilter && (
        <p className="recent-events-context-note">
          Showing linked events for <strong>{entityFilter.label}</strong>.
        </p>
      )}
      {showNavigationHelp && !isNavigationHelpCollapsed && (
        <div
          id={navigationHelpId}
          className="recent-events-legend"
          aria-label="Recent events navigation help"
        >
          <p className="recent-events-legend-title">How to use</p>
          <div className="recent-events-legend-items">
            <span className="recent-events-legend-pill">Click event {"\u2192"} highlight on board</span>
            <span className="recent-events-legend-pill">Click cell {"\u2192"} filter by cell</span>
            <span className="recent-events-legend-pill">Click player {"\u2192"} filter by player</span>
          </div>
        </div>
      )}
      <div className="recent-events-list">
        {groupedEvents.length === 0 && (
          <p className="recent-events-empty">
            No recent events match this focus yet.
          </p>
        )}
        {groupedEvents.map((group) => (
          (() => {
            const groupKey = buildRecentEventGroupKey(group);
            const canCollapse = group.events.length > 2;
            const groupHasFocus = group.events.some((event) => event.event_id === focusedEventId);
            const isExpanded = expandedGroups[groupKey] ?? false;
            const freshEventCount = group.events.filter((event) => freshEventIds[event.event_id]).length;
            const visibleEvents = canCollapse && !isExpanded ? group.events.slice(0, 2) : group.events;
            const hiddenCount = group.events.length - visibleEvents.length;

            const clusterRegionId = `${groupKey}-cluster`;

            return (
              <article
                key={groupKey}
                className={`recent-event-item ${group.events.length > 1 ? "is-grouped" : ""} ${
                  freshEventCount > 0 ? "is-fresh" : ""
                } ${groupHasFocus ? "is-focused" : ""}`}
                aria-label={group.events[0].summary}
              >
                <div className="recent-event-header">
                  <p className="recent-event-meta">{formatRecentEventTurnLabel(group)}</p>
                  <div className="recent-event-badges">
                    <span className={`recent-event-kind recent-event-kind-${group.kind}`}>
                      {formatRecentEventKind(group.kind)}
                    </span>
                    {freshEventCount > 0 && (
                      <span className="recent-event-new">
                        {freshEventCount === 1 ? "New" : `${freshEventCount} new`}
                      </span>
                    )}
                    {group.events.length > 1 && (
                      <span className="recent-event-count" aria-hidden="true">{group.events.length}x</span>
                    )}
                    {group.events.length > 1 && (
                      <span className="sr-only">{group.events.length} events</span>
                    )}
                  </div>
                </div>

                {group.events.length === 1 ? (
                  (() => {
                    const event = group.events[0];
                    const isActionable = Boolean(onFocusEvent) && hasRecentEventReferences(event);
                    const EntryTag = isActionable ? "button" : "div";

                    return (
                      <EntryTag
                        type={isActionable ? "button" : undefined}
                        className={`recent-event-entry ${isActionable ? "is-actionable" : ""} ${
                          focusedEventId === event.event_id ? "is-focused" : ""
                        }`}
                        onClick={isActionable ? () => onFocusEvent(event) : undefined}
                        aria-pressed={isActionable ? focusedEventId === event.event_id : undefined}
                      >
                        <p className="recent-event-summary">{event.summary}</p>
                        {event.details.length > 1 && (
                          <div className="recent-event-details">
                            {event.details.slice(1).map((detail, detailIndex) => (
                              <p key={detailIndex}>{detail}</p>
                            ))}
                          </div>
                        )}
                      </EntryTag>
                    );
                  })()
                ) : (
                  <>
                    <div className="recent-event-cluster" id={clusterRegionId}>
                      {visibleEvents.map((event, eventIndex) => {
                        const isActionable = Boolean(onFocusEvent) && hasRecentEventReferences(event);
                        const EntryTag = isActionable ? "button" : "div";

                        return (
                          <EntryTag
                            key={event.event_id ?? `${event.turn_number}-${eventIndex}-${event.summary}`}
                            type={isActionable ? "button" : undefined}
                            className={`recent-event-cluster-item ${
                              freshEventIds[event.event_id] ? "is-fresh" : ""
                            } ${isActionable ? "is-actionable" : ""} ${
                              focusedEventId === event.event_id ? "is-focused" : ""
                            }`}
                            onClick={isActionable ? () => onFocusEvent(event) : undefined}
                            aria-pressed={isActionable ? focusedEventId === event.event_id : undefined}
                          >
                            <p className="recent-event-cluster-turn">Turn {event.turn_number}</p>
                            <p className="recent-event-summary">{event.summary}</p>
                            {event.details.length > 1 && (
                              <div className="recent-event-details">
                                {event.details.slice(1).map((detail, detailIndex) => (
                                  <p key={detailIndex}>{detail}</p>
                                ))}
                              </div>
                            )}
                          </EntryTag>
                        );
                      })}
                    </div>

                    {canCollapse && (
                      <button
                        type="button"
                        className="recent-event-toggle"
                        onClick={() => onToggleGroup?.(groupKey)}
                        aria-expanded={isExpanded}
                        aria-controls={clusterRegionId}
                        aria-label={
                          isExpanded
                            ? "Show fewer events in this group"
                            : `Show ${hiddenCount} more events in this group`
                        }
                      >
                        {isExpanded ? "Show less" : `Show ${hiddenCount} more`}
                      </button>
                    )}
                  </>
                )}
              </article>
            );
          })()
        ))}
      </div>
    </section>
  );
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

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getTokenMovementOffset(fromPosition, toPosition) {
  if (
    !Number.isInteger(fromPosition) ||
    !Number.isInteger(toPosition) ||
    fromPosition === toPosition
  ) {
    return { x: 0, y: 0 };
  }

  const fromPlacement = getBoardPlacement(fromPosition);
  const toPlacement = getBoardPlacement(toPosition);

  return {
    x: clampNumber(
      (fromPlacement.column - toPlacement.column) * 10,
      -TOKEN_MOVE_MAX_OFFSET_PX,
      TOKEN_MOVE_MAX_OFFSET_PX,
    ),
    y: clampNumber(
      (fromPlacement.row - toPlacement.row) * 10,
      -TOKEN_MOVE_MAX_OFFSET_PX,
      TOKEN_MOVE_MAX_OFFSET_PX,
    ),
  };
}

function splitJailOccupants(players, inJailByPlayerId) {
  const jailPlayers = [];
  const visitingPlayers = [];

  for (const player of players) {
    if (inJailByPlayerId?.[player.player_id]) {
      jailPlayers.push(player);
    } else {
      visitingPlayers.push(player);
    }
  }

  return { jailPlayers, visitingPlayers };
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
  const [movingTokenEffects, setMovingTokenEffects] = useState({});
  const recentEventsRoomCodeRef = useRef(null);
  const highestSeenRecentEventIdRef = useRef(0);
  const recentEventHighlightTimeoutsRef = useRef({});
  const tokenMovementTimeoutsRef = useRef({});
  const previousPositionsRef = useRef({});
  const boardCellRefs = useRef({});
  const playerCardRefs = useRef({});
  const currentRoomCode = currentRoom?.room_code ?? null;
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

  const movedCellIndexSet = new Set(
    Object.values(movingTokenEffects)
      .map((movementEffect) => movementEffect.toPosition)
      .filter((position) => Number.isInteger(position)),
  );
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

  if (pendingBankruptcy?.player_id === inspectedPlayer?.player_id) {
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

    setRecentEventsEntityFilter(null);
    setFocusedRecentEventId(event.event_id ?? null);
    setFocusedEventCellIndex(Number.isInteger(event.cell_index) ? event.cell_index : null);
    setFocusedEventPlayerIds(playerIds);
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
      <div
        key={player.player_id}
        className={`player-token ${
          currentTurnPlayerId === player.player_id ? "is-active-turn" : ""
        } ${movementEffect ? "is-moving" : ""}`}
        style={{
          "--player-token-color": tokenColor,
          ...(movementOffset
            ? {
                "--token-move-from-x": `${movementOffset.x}px`,
                "--token-move-from-y": `${movementOffset.y}px`,
              }
            : {}),
          zIndex: Math.max(1, 8 - occupantIndex) + (movementEffect ? 20 : 0),
        }}
        title={player.nickname}
        aria-label={`${player.nickname} token${movementEffect ? " just moved" : ""}`}
      >
        {getPlayerTokenLabel(player.nickname)}
      </div>
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
    previousPositionsRef.current = {};
    setMovingTokenEffects({});
    Object.values(tokenMovementTimeoutsRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    tokenMovementTimeoutsRef.current = {};
  }, [currentRoomCode]);

  useEffect(() => {
    if (!currentRoomCode || !currentRoom) {
      return;
    }

    const nextKnownPositions = {};
    const nextMovementEffects = [];

    for (const player of currentRoom.players) {
      const nextPosition = playerPositions?.[player.player_id];

      if (!Number.isInteger(nextPosition)) {
        continue;
      }

      nextKnownPositions[player.player_id] = nextPosition;

      const previousPosition = previousPositionsRef.current[player.player_id];
      if (Number.isInteger(previousPosition) && previousPosition !== nextPosition) {
        nextMovementEffects.push({
          playerId: player.player_id,
          fromPosition: previousPosition,
          toPosition: nextPosition,
        });
      }
    }

    previousPositionsRef.current = nextKnownPositions;

    if (nextMovementEffects.length === 0) {
      return;
    }

    setMovingTokenEffects((current) => {
      const next = { ...current };
      for (const movementEffect of nextMovementEffects) {
        next[movementEffect.playerId] = movementEffect;
      }
      return next;
    });

    for (const movementEffect of nextMovementEffects) {
      if (tokenMovementTimeoutsRef.current[movementEffect.playerId]) {
        window.clearTimeout(tokenMovementTimeoutsRef.current[movementEffect.playerId]);
      }

      tokenMovementTimeoutsRef.current[movementEffect.playerId] = window.setTimeout(() => {
        setMovingTokenEffects((current) => {
          if (!current[movementEffect.playerId]) {
            return current;
          }

          const next = { ...current };
          delete next[movementEffect.playerId];
          return next;
        });

        delete tokenMovementTimeoutsRef.current[movementEffect.playerId];
      }, TOKEN_MOVE_FEEDBACK_MS);
    }
  }, [currentRoomCode, currentRoom, playerPositions]);

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
            setCurrentRoom(null);
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
          return response.json().then((data) => setCurrentRoom(data));
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
      Object.values(tokenMovementTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      tokenMovementTimeoutsRef.current = {};
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
      setCurrentRoom(null);
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

            {lastBankruptcySummary && (
              <BankruptcySummaryCard summary={lastBankruptcySummary} title="Latest bankruptcy recap" />
            )}

            <RecentEventsCard
              events={recentEvents}
              title="Recent events"
              maxGroups={4}
              selectedKind={getRecentEventsSelectedKind("finished")}
              expandedGroups={getRecentEventsExpandedState("finished")}
              freshEventIds={freshRecentEventIds}
              onSelectKind={(kind) => handleRecentEventsKindChange("finished", kind)}
              onToggleGroup={(groupKey) => handleRecentEventsGroupToggle("finished", groupKey)}
            />

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

            {lastBankruptcySummary && (
              <BankruptcySummaryCard
                summary={lastBankruptcySummary}
                title={
                  lastBankruptcySummary.debtor_player_id === playerId
                    ? "Your bankruptcy recap"
                    : "Latest bankruptcy recap"
                }
              />
            )}

            <RecentEventsCard
              events={priorRecentEvents}
              title="Recent events before your elimination"
              maxGroups={4}
              selectedKind={getRecentEventsSelectedKind("eliminated")}
              expandedGroups={getRecentEventsExpandedState("eliminated")}
              freshEventIds={freshRecentEventIds}
              onSelectKind={(kind) => handleRecentEventsKindChange("eliminated", kind)}
              onToggleGroup={(groupKey) => handleRecentEventsGroupToggle("eliminated", groupKey)}
            />

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

                  {inspectedCell && (
                    <section
                      className="game-summary cell-inspector board-center-section"
                      style={
                        inspectedCellOwner
                          ? { "--cell-owner-color": getPlayerColor(inspectedCellOwner.player_id) }
                          : undefined
                      }
                    >
                      <div className="cell-inspector-header">
                        <div>
                          <h3>Selected cell</h3>
                          <p className="cell-inspector-title">
                            <strong>{inspectedCell.name}</strong> &middot; Cell {inspectedCell.index}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="recent-events-clear-focus"
                          onClick={clearRecentEventFocus}
                        >
                          Clear
                        </button>
                      </div>
                      <p className="cell-inspector-description">
                        <strong>{formatCellType(inspectedCell.cell_type)}</strong> &middot;{" "}
                        {inspectedCell.description}
                      </p>
                      <div className="cell-inspector-meta">
                        {inspectedCell.price && (
                          <article className="cell-inspector-stat">
                            <span>Price</span>
                            <strong>${inspectedCell.price}</strong>
                          </article>
                        )}
                        {inspectedCellRentHint && (
                          <article className="cell-inspector-stat">
                            <span>Rent</span>
                            <strong>{inspectedCellRentHint.replace("Rent: ", "")}</strong>
                          </article>
                        )}
                        {inspectedCell.price && (
                          <article className="cell-inspector-stat">
                            <span>Owner</span>
                            <strong>{inspectedCellOwner?.nickname ?? "Unowned"}</strong>
                          </article>
                        )}
                        {inspectedCell.price && (
                          <article className="cell-inspector-stat">
                            <span>Mortgage</span>
                            <strong>
                              {inspectedCellMortgaged
                                ? "Active"
                                : `$${getMortgageValue(inspectedCell) ?? 0}`}
                            </strong>
                          </article>
                        )}
                        {inspectedCell.cell_type === "property" && (
                          <article className="cell-inspector-stat">
                            <span>Level</span>
                            <strong>
                              {inspectedCellLevel}/{MAX_PROPERTY_LEVEL}
                            </strong>
                          </article>
                        )}
                        {inspectedCell.cell_type === "property" && (
                          <article className="cell-inspector-stat">
                            <span>Upgrade</span>
                            <strong>${getUpgradeCost(inspectedCell) ?? 0}</strong>
                          </article>
                        )}
                        {!inspectedCell.price && typeof inspectedCell.amount === "number" && (
                          <article className="cell-inspector-stat">
                            <span>Amount</span>
                            <strong>
                              {inspectedCell.cell_type === "tax"
                                ? `-$${inspectedCell.amount}`
                                : `+$${inspectedCell.amount}`}
                            </strong>
                          </article>
                        )}
                        <article className="cell-inspector-stat">
                          <span>Occupants</span>
                          <strong>{inspectedCellOccupants.length}</strong>
                        </article>
                        {inspectedCellLinkedEventCount > 0 && (
                          <article className="cell-inspector-stat">
                            <span>Recent events</span>
                            <strong>{inspectedCellLinkedEventCount}</strong>
                          </article>
                        )}
                      </div>
                      {inspectedCellHasQuickActions && (
                        <div className="cell-inspector-actions">
                          {inspectedCellCanBuy && (
                            <button
                              type="button"
                              className="buy-button"
                              onClick={handleBuyProperty}
                              disabled={isSubmitting}
                            >
                              Buy property
                            </button>
                          )}
                          {inspectedCellCanSkipPurchase && (
                            <button
                              type="button"
                              className="pass-button"
                              onClick={handleSkipPurchase}
                              disabled={isSubmitting}
                            >
                              Pass on purchase
                            </button>
                          )}
                          {inspectedCellCanUpgrade && (
                            <button
                              type="button"
                              className="upgrade-button"
                              onClick={() => handleUpgradeProperty(inspectedCell.index)}
                              disabled={isSubmitting}
                            >
                              Upgrade
                            </button>
                          )}
                          {inspectedCellCanSellUpgrade && (
                            <button
                              type="button"
                              className="sell-button"
                              onClick={() => handleSellUpgradeProperty(inspectedCell.index)}
                              disabled={isSubmitting}
                            >
                              Sell upgrade
                            </button>
                          )}
                          {inspectedCellCanMortgage && (
                            <button
                              type="button"
                              className="mortgage-button"
                              onClick={() => handleMortgageProperty(inspectedCell.index)}
                              disabled={isSubmitting}
                            >
                              Mortgage
                            </button>
                          )}
                          {inspectedCellCanUnmortgage && (
                            <button
                              type="button"
                              className="unmortgage-button"
                              onClick={() => handleUnmortgageProperty(inspectedCell.index)}
                              disabled={isSubmitting}
                            >
                              Unmortgage
                            </button>
                          )}
                          {inspectedCellCanUseTradeDesk && (
                            <button
                              type="button"
                              className="trade-button accept-button"
                              onClick={() => {
                                setSelectedTradePosition(String(inspectedCell.index));
                                setStatus(
                                  inspectedCellIsSelectedInTradeDesk
                                    ? `${inspectedCell.name} is already selected in the trade desk.`
                                    : `Prepared ${inspectedCell.name} in the trade desk below.`,
                                );
                              }}
                              disabled={isSubmitting}
                            >
                              {inspectedCellIsSelectedInTradeDesk
                                ? "Selected for trade"
                                : "Select for trade"}
                            </button>
                          )}
                        </div>
                      )}
                      {inspectedCellQuickActionMessage && (
                        <p className="cell-inspector-helper">{inspectedCellQuickActionMessage}</p>
                      )}
                      {inspectedCellOccupants.length > 0 && (
                        <p className="cell-inspector-note">
                          Occupants:{" "}
                          <strong>{inspectedCellOccupants.map((player) => player.nickname).join(", ")}</strong>
                        </p>
                      )}
                      {inspectedCellJailGroups &&
                        (inspectedCellJailGroups.jailPlayers.length > 0 ||
                          inspectedCellJailGroups.visitingPlayers.length > 0) && (
                          <p className="cell-inspector-note">
                            Jail split:{" "}
                            <strong>
                              {inspectedCellJailGroups.jailPlayers.length} jailed
                            </strong>{" "}
                            &middot;{" "}
                            <strong>{inspectedCellJailGroups.visitingPlayers.length} visiting</strong>
                          </p>
                        )}
                      {inspectedCellMortgaged && (
                        <p className="cell-inspector-note">
                          Mortgage is active, so this cell is not charging rent right now.
                        </p>
                      )}
                    </section>
                  )}

                  {inspectedPlayer && (
                    <section
                      className="game-summary player-inspector board-center-section"
                      style={
                        inspectedPlayerColor
                          ? { "--player-inspector-color": inspectedPlayerColor }
                          : undefined
                      }
                    >
                      <div className="cell-inspector-header">
                        <div>
                          <h3>Selected player</h3>
                          <p className="cell-inspector-title">
                            <strong>
                              {inspectedPlayer.nickname}
                              {inspectedPlayer.player_id === playerId ? " (you)" : ""}
                            </strong>
                          </p>
                        </div>
                        <button
                          type="button"
                          className="recent-events-clear-focus"
                          onClick={clearRecentEventFocus}
                        >
                          Clear
                        </button>
                      </div>
                      <p className="cell-inspector-description">
                        {inspectedPlayerIsCurrentTurn
                          ? "This player is taking the current turn."
                          : "This player is waiting for their next turn."}
                      </p>
                      <div className="cell-inspector-meta">
                        <article className="cell-inspector-stat">
                          <span>Cash</span>
                          <strong>${inspectedPlayerCash}</strong>
                        </article>
                        <article className="cell-inspector-stat">
                          <span>Position</span>
                          <strong>
                            Cell {inspectedPlayerPosition}
                            {inspectedPlayerCell ? ` - ${inspectedPlayerCell.name}` : ""}
                          </strong>
                        </article>
                        <article className="cell-inspector-stat">
                          <span>Status</span>
                          <strong>
                            {pendingBankruptcy?.player_id === inspectedPlayer.player_id
                              ? "In debt"
                              : inspectedPlayerInJail
                                ? "In jail"
                                : inspectedPlayerIsCurrentTurn
                                  ? "Current turn"
                                  : "Waiting"}
                          </strong>
                        </article>
                        <article className="cell-inspector-stat">
                          <span>Owned cells</span>
                          <strong>{inspectedPlayerOwnedCells.length}</strong>
                        </article>
                        <article className="cell-inspector-stat">
                          <span>Mortgaged cells</span>
                          <strong>{inspectedPlayerMortgagedCellCount}</strong>
                        </article>
                        {inspectedPlayerLinkedEventCount > 0 && (
                          <article className="cell-inspector-stat">
                            <span>Recent events</span>
                            <strong>{inspectedPlayerLinkedEventCount}</strong>
                          </article>
                        )}
                      </div>
                      {inspectedPlayerCanBeTradeTarget && (
                        <div className="cell-inspector-actions">
                          <button
                            type="button"
                            className="trade-button accept-button"
                            onClick={() => {
                              setSelectedTradeTargetId(inspectedPlayer.player_id);
                              setStatus(
                                inspectedPlayerIsSelectedTradeTarget
                                  ? `${inspectedPlayer.nickname} is already selected in the trade form.`
                                  : `Prepared ${inspectedPlayer.nickname} in the trade form below.`,
                              );
                            }}
                            disabled={isSubmitting}
                          >
                            {inspectedPlayerIsSelectedTradeTarget
                              ? "Selected for trade"
                              : "Select for trade"}
                          </button>
                        </div>
                      )}
                      {inspectedPlayerTradeMessage && (
                        <p className="cell-inspector-helper">{inspectedPlayerTradeMessage}</p>
                      )}
                      {inspectedPlayerInJail && (
                        <p className="cell-inspector-note">
                          In jail — turn <strong>{inspectedPlayerTurnsInJail}/3</strong>.{" "}
                          {inspectedPlayerTurnsInJail >= 2
                            ? "Next failed roll forces the fine and movement."
                            : "They can roll doubles to leave or pay before rolling."}
                        </p>
                      )}
                      {inspectedPlayerDebtMessage && (
                        <p className="cell-inspector-note">{inspectedPlayerDebtMessage}</p>
                      )}
                      {inspectedPlayerOwnedCellsPreview.length > 0 && (
                        <p className="cell-inspector-note">
                          Properties:{" "}
                          <strong>
                            {inspectedPlayerOwnedCellsPreview.map((cell) => cell.name).join(", ")}
                            {inspectedPlayerOwnedCells.length > inspectedPlayerOwnedCellsPreview.length
                              ? ` +${inspectedPlayerOwnedCells.length - inspectedPlayerOwnedCellsPreview.length} more`
                              : ""}
                          </strong>
                        </p>
                      )}
                    </section>
                  )}

                  {lastBankruptcySummary && (
                    <BankruptcySummaryCard
                      summary={lastBankruptcySummary}
                      title="Latest bankruptcy recap"
                    />
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
                        Waiting for {pendingAuctionActivePlayer?.nickname ?? "the current bidder"} to
                        bid or pass on{" "}
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
                        respond to the trade offer for {pendingTradeCell?.name ?? pendingTrade.cell_name}.
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
                        Waiting for {pendingBankruptcyPlayer?.nickname ?? "the active player"} to raise $
                        {pendingBankruptcy.amount_owed} owed to {pendingBankruptcyCreditorLabel} or
                        declare bankruptcy.
                      </p>
                    )}
                    {canManageDebtRecovery && (
                      <p className="purchase-note">
                        You owe {pendingBankruptcyCreditorLabel} ${pendingBankruptcy?.amount_owed ?? 0}.
                        Sell upgrades, mortgage cells, or trade property for cash to cover the debt, or
                        declare bankruptcy. If you go bankrupt, any remaining upgrades are sold back to
                        the bank automatically before your properties go to the creditor, and any already mortgaged
                        properties stay mortgaged when they transfer.
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
                              accept or reject the offer.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p>
                            {canManageDebtRecovery
                              ? "Offer one of your unmortgaged cells for cash to escape bankruptcy."
                              : "Offer one of your unmortgaged cells for cash before rolling."}{" "}
                            Property-for-cash only in this version.
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
                                      You receive: <strong>${mortgageValue}</strong>
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
                          ? "Sell upgrades to raise cash and escape bankruptcy. Building is locked until your debts are cleared."
                          : "Build or sell upgrades before rolling. This is a simplified upgrade system."}
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
                                      Level <strong>{level}</strong> {"→"} <strong>{nextLevel}</strong>
                                    </p>
                                    <p>
                                      Rent: {currentRent?.replace("Rent: ", "")} {"→"} <strong>{nextRent?.replace("Rent: ", "")}</strong>
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
                                      Level <strong>{level}</strong> {"→"} <strong>{nextLevel}</strong>
                                    </p>
                                    <p>
                                      Rent: {currentRent?.replace("Rent: ", "")} {"→"} <strong>{nextRent?.replace("Rent: ", "")}</strong>
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

                  <RecentEventsCard
                    events={priorRecentEvents}
                    title="Recent events"
                    maxGroups={4}
                    selectedKind={getRecentEventsSelectedKind("game")}
                    expandedGroups={getRecentEventsExpandedState("game")}
                    freshEventIds={freshRecentEventIds}
                    focusedEventId={focusedRecentEventId}
                    entityFilter={recentEventsEntityFilter}
                    onSelectKind={(kind) => handleRecentEventsKindChange("game", kind)}
                    onToggleGroup={(groupKey) => handleRecentEventsGroupToggle("game", groupKey)}
                    onFocusEvent={handleRecentEventFocus}
                    onClearFocus={clearRecentEventFocus}
                    showNavigationHelp
                    isNavigationHelpCollapsed={isRecentEventsHelpCollapsed}
                    onToggleNavigationHelp={handleRecentEventsHelpToggle}
                    onResetNavigationHelp={hasStoredHelpPreference ? handleRecentEventsHelpReset : undefined}
                    announceUpdates
                    clearFocusAnnouncementId={recentEventsClearFocusAnnouncementId}
                  />

                  {lastDrawnCard && (
                    <section className="drawn-card board-center-section">
                      <h3>{lastDrawnCard.deck} card</h3>
                      <p>
                        <strong>{lastDrawnCard.title}</strong>
                      </p>
                      <p>{lastDrawnCard.description}</p>
                    </section>
                  )}
                </section>

                {boardCells.map((cell) => {
                  const occupants = currentRoom.players.filter((player) => {
                    const playerPosition = playerPositions?.[player.player_id];
                    return Number.isInteger(playerPosition) && playerPosition === cell.index;
                  });
                  const { jailPlayers, visitingPlayers } =
                    cell.index === JAIL_POSITION
                      ? splitJailOccupants(occupants, currentRoom.game?.in_jail ?? {})
                      : { jailPlayers: [], visitingPlayers: occupants };
                  const { row, column } = getBoardPlacement(cell.index);
                  const boardSide = getBoardSide(cell.index);
                  const groupClass = cell.color_group ? `cell-group-${cell.color_group}` : "";
                  const linkedEventCount = cellRecentEventCounts[cell.index] ?? 0;
                  const linkedEventLabel = formatLinkedEventLabel(linkedEventCount, cell.name);
                  const ownerPlayerId = propertyOwners[cell.index] ?? null;
                  const ownerPlayer = ownerPlayerId ? getPlayerById(ownerPlayerId) : null;
                  const ownerColor = ownerPlayer ? getPlayerColor(ownerPlayer.player_id) : null;

                  return (
                    <article
                      key={cell.index}
                      ref={(element) => {
                        if (element) {
                          boardCellRefs.current[cell.index] = element;
                        } else {
                          delete boardCellRefs.current[cell.index];
                        }
                      }}
                      className={`cell-tile cell-side-${boardSide} ${groupClass} ${
                        lastLandedCell?.index === cell.index ? "is-landed" : ""
                      } ${focusedEventCellIndex === cell.index ? "is-focused" : ""} ${
                        movedCellIndexSet.has(cell.index) ? "is-move-target" : ""
                      } ${ownerPlayer ? "is-owned" : ""} ${
                        ownerPlayer?.player_id === playerId ? "is-owned-by-you" : ""
                      } is-actionable`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleBoardCellFocus(cell)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleBoardCellFocus(cell);
                        }
                      }}
                      style={{
                        gridRow: row,
                        gridColumn: column,
                        ...(ownerColor ? { "--cell-owner-color": ownerColor } : {}),
                      }}
                    >
                      <span className={`cell-band cell-band-${cell.cell_type}`} aria-hidden="true" />
                      {linkedEventCount > 0 && (
                        <span
                          className="cell-event-count-badge"
                          title={linkedEventLabel}
                          aria-label={linkedEventLabel}
                        >
                          {formatLinkedEventCount(linkedEventCount)}
                        </span>
                      )}
                      <h4>{cell.name}</h4>
                      {ownerPlayer && (
                        <p
                          className="cell-owner-badge"
                          title={`Owned by ${ownerPlayer.nickname}`}
                          aria-label={`Owned by ${ownerPlayer.nickname}`}
                        >
                          <span className="cell-owner-dot" aria-hidden="true" />
                          <span className="cell-owner-label">
                            {getPlayerTokenLabel(ownerPlayer.nickname)}
                          </span>
                        </p>
                      )}
                      {propertyMortgaged[cell.index] && (
                        <p className="cell-mortgaged-badge">Mortgaged</p>
                      )}
                      {cell.cell_type === "property" && (propertyLevels[cell.index] ?? 0) > 0 && (
                        <p className="cell-level-badge">
                          Level {propertyLevels[cell.index]}
                        </p>
                      )}
                      {cell.index === JAIL_POSITION ? (
                        <div className="cell-jail-layout">
                          {visitingPlayers.length > 0 && (
                            <div className="cell-occupants cell-visiting-zone">
                              {visitingPlayers.map((player, occupantIndex) =>
                                renderPlayerToken(player, occupantIndex),
                              )}
                            </div>
                          )}
                          {jailPlayers.length > 0 && (
                            <div className="cell-occupants cell-jail-zone">
                              {jailPlayers.map((player, occupantIndex) =>
                                renderPlayerToken(player, occupantIndex),
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        occupants.length > 0 && (
                          <div className="cell-occupants">
                            {occupants.map((player, occupantIndex) =>
                              renderPlayerToken(player, occupantIndex),
                            )}
                          </div>
                        )
                      )}
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="board-grid">
	              {currentRoom.players.map((player) => (
	                (() => {
	                  const linkedEventCount = playerRecentEventCounts[player.player_id] ?? 0;
	                  const linkedEventLabel = formatLinkedEventLabel(
	                    linkedEventCount,
	                    player.nickname,
	                  );
	                  const playerPosition = getPlayerPosition(player.player_id);
	                  const playerCell = getPlayerCell(player.player_id);
	                  const playerLevel = propertyLevels[playerPosition] ?? 0;
	                  const playerRentHint = getRentHint(playerCell, playerLevel);
	                  const playerOwnedCellCount = getOwnedCellsByPlayer(player.player_id).length;
	                  const playerMortgagedCellCount = getMortgagedOwnedCellCount(player.player_id);
	                  const isTradeTargetReady = selectedTradeTargetId === player.player_id;

	                  return (
	                <article
	                  key={player.player_id}
                  ref={(element) => {
                    if (element) {
                      playerCardRefs.current[player.player_id] = element;
                    } else {
                      delete playerCardRefs.current[player.player_id];
                    }
                  }}
	                  className={`board-card ${player.player_id === playerId ? "is-you" : ""} ${
	                    focusedPlayerIdSet.has(player.player_id) ? "is-focused" : ""
	                  } ${isTradeTargetReady ? "is-trade-target" : ""} ${
	                    currentTurnPlayerId === player.player_id ? "is-current-turn" : ""
	                  }`}
	                  role="button"
	                  tabIndex={0}
                  onClick={() => handlePlayerCardFocus(player)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handlePlayerCardFocus(player);
                    }
                  }}
	                  >
	                    <div className="board-card-header">
	                      <h3>{player.nickname}</h3>
	                      <div className="board-card-badges">
	                        {isTradeTargetReady && (
	                          <span className="board-card-target-badge">Trade target</span>
	                        )}
	                        {linkedEventCount > 0 && (
	                          <span
	                            className="board-card-event-count"
	                            title={linkedEventLabel}
	                            aria-label={linkedEventLabel}
	                          >
	                            {formatLinkedEventCount(linkedEventCount)}
	                          </span>
	                        )}
	                      </div>
	                  </div>
	                  <p>
	                    On:{" "}
	                    <strong>
	                      {playerCell?.name ?? `Cell ${playerPosition}`}
	                    </strong>
	                  </p>
	                  {playerCell?.cell_type === "property" && (
	                    <p>
	                      Upgrade level:{" "}
	                      <strong>{playerLevel}</strong>
	                    </p>
	                  )}
	                  {playerRentHint && (
	                    <p><strong>{playerRentHint}</strong></p>
	                  )}
	                  <p>
	                    Cash: <strong>${currentRoom.game?.cash[player.player_id] ?? 0}</strong>
	                  </p>
	                  <p>
	                    Owned cells:{" "}
	                    <strong>{playerOwnedCellCount}</strong>
	                  </p>
	                  <p>
	                    Mortgaged cells:{" "}
	                    <strong>{playerMortgagedCellCount}</strong>
	                  </p>
                  <p>
                    Status:{" "}
                    <strong>
                      {currentTurnPlayerId === player.player_id
                        ? "Their turn"
                        : currentRoom.game?.in_jail?.[player.player_id]
                          ? "In jail"
                          : "Waiting"}
                    </strong>
                  </p>
                </article>
                  );
                })()
              ))}
            </section>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;

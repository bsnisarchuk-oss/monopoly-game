import { useEffect, useRef, useState } from "react";
import {
  EMPTY_RECENT_EVENTS,
  KIND_ORDER,
  buildRecentEventGroupKey,
  filterRecentEventsByKind,
  formatRecentEventKind,
  formatRecentEventTurnLabel,
  formatRecentEventsAnnouncementScope,
  groupRecentEvents,
  hasRecentEventReferences,
  recentEventMatchesEntityFilter,
} from "./recentEventsHelpers";
import { getCountLabel } from "./utils";

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

    function handleMouseDown(event) {
      if (
        actionsMenuContainerRef.current &&
        !actionsMenuContainerRef.current.contains(event.target)
      ) {
        closeActionsMenu();
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
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

  const availableKinds = KIND_ORDER.filter((kind) =>
    safeEvents.some((event) => (event.kind ?? "system") === kind),
  );
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
      previousSnapshot.activeKind !== activeKind ||
      previousSnapshot.entityFilterKey !== entityFilterKey;
    const clearFocusTriggered =
      clearFocusAnnouncementId > 0 &&
      previousSnapshot.clearFocusAnnouncementId !== clearFocusAnnouncementId;
    const freshEventsChanged =
      visibleFreshKey !== previousSnapshot.visibleFreshKey && visibleFreshEventIds.length > 0;

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
    const previousClearFocusAnnouncementId =
      previousLiveSnapshotRef.current?.clearFocusAnnouncementId ?? 0;

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

export default RecentEventsCard;

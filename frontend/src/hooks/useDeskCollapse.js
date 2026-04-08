import { useState } from "react";

const DESK_COLLAPSED_SECTIONS_KEY = "monopoly_collapsed_desk_sections";

function loadStoredCollapsedDeskSections() {
  if (typeof window === "undefined") {
    return {};
  }

  const rawValue = window.localStorage.getItem(DESK_COLLAPSED_SECTIONS_KEY);

  if (rawValue == null) {
    return {};
  }

  try {
    const parsedValue = JSON.parse(rawValue);

    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      window.localStorage.removeItem(DESK_COLLAPSED_SECTIONS_KEY);
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsedValue).filter(
        ([sectionKey, isCollapsed]) =>
          typeof sectionKey === "string" && typeof isCollapsed === "boolean",
      ),
    );
  } catch {
    window.localStorage.removeItem(DESK_COLLAPSED_SECTIONS_KEY);
    return {};
  }
}

function saveStoredCollapsedDeskSections(collapsedSections) {
  if (typeof window === "undefined") {
    return;
  }

  if (Object.keys(collapsedSections).length === 0) {
    clearStoredCollapsedDeskSections();
    return;
  }

  window.localStorage.setItem(DESK_COLLAPSED_SECTIONS_KEY, JSON.stringify(collapsedSections));
}

function clearStoredCollapsedDeskSections() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(DESK_COLLAPSED_SECTIONS_KEY);
}

export function useDeskCollapse() {
  const [collapsedDeskSections, setCollapsedDeskSections] = useState(
    loadStoredCollapsedDeskSections,
  );

  const hasStoredCollapsedDeskPreference = Object.keys(collapsedDeskSections).length > 0;

  function isDeskCollapsible(statusTone) {
    return statusTone === "locked" || statusTone === "empty";
  }

  function isDeskCollapsed(sectionKey, statusTone) {
    if (!isDeskCollapsible(statusTone)) {
      return false;
    }

    return collapsedDeskSections[sectionKey] ?? true;
  }

  function toggleDeskCollapsed(sectionKey) {
    setCollapsedDeskSections((current) => {
      const nextValue = !(current[sectionKey] ?? true);
      let nextState;

      if (nextValue) {
        const { [sectionKey]: _ignoredSection, ...remainingSections } = current;
        nextState = remainingSections;
      } else {
        nextState = {
          ...current,
          [sectionKey]: false,
        };
      }

      saveStoredCollapsedDeskSections(nextState);
      return nextState;
    });
  }

  function handleResetDeskLayout() {
    clearStoredCollapsedDeskSections();
    setCollapsedDeskSections({});
  }

  return {
    collapsedDeskSections,
    hasStoredCollapsedDeskPreference,
    isDeskCollapsible,
    isDeskCollapsed,
    toggleDeskCollapsed,
    handleResetDeskLayout,
  };
}

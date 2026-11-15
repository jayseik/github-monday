// Monday First for GitHub - Content Script
// Shifts GitHub's contribution calendar from Sunday-first to Monday-first

(function () {
  'use strict';

  const MARKER = 'data-monday-first';
  const CALENDAR_SELECTOR = 'table.ContributionCalendar-grid';
  let enabled = true;

  // Load enabled state from storage. The synchronous shift below may have
  // already run with the default `enabled=true`; if storage says disabled,
  // revert what we just did.
  chrome.storage.sync.get({ enabled: true }, (data) => {
    setEnabled(data.enabled);
  });

  // The popup toggle only writes to storage, so every open GitHub tab (not
  // just the active one) picks up the change here.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.enabled) {
      setEnabled(changes.enabled.newValue);
    }
  });

  // The popup pings the active tab to check this script is alive. It isn't in
  // tabs opened before the extension was installed or updated.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'ping') {
      sendResponse({ ok: true });
    }
  });

  function setEnabled(value) {
    // A removed key (e.g. storage cleared) means the default: enabled
    enabled = value !== false;
    if (enabled) {
      shiftAllCalendars();
    } else {
      revertAllCalendars();
    }
  }

  // --- Calendar layout ---
  // GitHub renders the calendar as a <table>: one row per weekday (Sunday
  // first), one column per week, each day cell carrying a data-date.

  function getDayRows(tbody) {
    // Filter to only actual day rows (skip spacer/header rows)
    return Array.from(tbody.querySelectorAll('tr')).filter(
      (row) => row.querySelector('[data-date]')
    );
  }

  function findSundayRow(dayRows) {
    return dayRows.find((row) => {
      const cell = row.querySelector('[data-date]');
      if (!cell) return false;
      const dateStr = cell.getAttribute('data-date');
      const date = new Date(dateStr + 'T12:00:00');
      return date.getDay() === 0; // 0 = Sunday
    });
  }

  function shiftTableCalendar(table) {
    if (table.hasAttribute(MARKER)) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const dayRows = getDayRows(tbody);
    if (dayRows.length < 7) return;

    // Find Sunday row by checking actual dates, not position
    const sundayRow = findSundayRow(dayRows);
    if (!sundayRow) return;

    // Calculate row height from rendered dimensions
    const rect0 = dayRows[0].getBoundingClientRect();
    const rect1 = dayRows[1].getBoundingClientRect();
    const rowHeight = rect1.top - rect0.top;
    if (rowHeight <= 0) return;

    // Calculate column width from adjacent Sunday data cells
    const sundayCells = Array.from(sundayRow.querySelectorAll('td[data-date]'));
    let colWidth = 0;
    if (sundayCells.length >= 2) {
      const cRect0 = sundayCells[0].getBoundingClientRect();
      const cRect1 = sundayCells[1].getBoundingClientRect();
      colWidth = cRect1.left - cRect0.left;
    }

    const sundayIndex = dayRows.indexOf(sundayRow);
    const positionsDown = dayRows.length - 1 - sundayIndex;

    // Use CSS transforms to visually reposition rows (no DOM mutation)
    dayRows.forEach((row, idx) => {
      if (row === sundayRow) {
        // Sunday: move down to the last position
        row.style.transform = `translateY(${positionsDown * rowHeight}px)`;
      } else if (idx > sundayIndex) {
        // Rows after Sunday: shift up by one row
        row.style.transform = `translateY(${-rowHeight}px)`;
      }
      // Rows before Sunday (if any): stay in place
    });

    // Sunday cells also shift LEFT by one column so each Sunday
    // joins the previous week (Mon-first weeks end on Sunday)
    if (colWidth > 0) {
      sundayCells.forEach((cell, i) => {
        cell.style.transform = `translateX(${-colWidth}px)`;
        if (i === 0) {
          // First Sunday cell shifts off-screen — hide it
          cell.style.visibility = 'hidden';
        }
      });
    }

    table.setAttribute(MARKER, 'true');
  }

  function revertTableCalendar(table) {
    if (!table.hasAttribute(MARKER)) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const dayRows = getDayRows(tbody);
    dayRows.forEach((row) => {
      row.style.transform = '';
      // Clear per-cell transforms and visibility (Sunday horizontal shift)
      row.querySelectorAll('td[data-date]').forEach((cell) => {
        cell.style.transform = '';
        cell.style.visibility = '';
      });
    });

    table.removeAttribute(MARKER);
  }

  // --- Main orchestration ---

  function shiftAllCalendars() {
    if (!enabled) return;
    document.querySelectorAll(CALENDAR_SELECTOR).forEach(shiftTableCalendar);
  }

  function revertAllCalendars() {
    document.querySelectorAll(CALENDAR_SELECTOR).forEach(revertTableCalendar);
  }

  // --- Debounce utility ---

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // --- Initialization and observation ---

  const debouncedShift = debounce(shiftAllCalendars, 150);

  // Initial run (calendar might already be in DOM)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', shiftAllCalendars);
  } else {
    shiftAllCalendars();
  }

  // Handle GitHub's Turbo SPA navigation
  document.addEventListener('turbo:load', shiftAllCalendars);
  document.addEventListener('turbo:render', shiftAllCalendars);

  // MutationObserver for dynamically loaded content
  const observer = new MutationObserver((mutations) => {
    // Quick check: only run if mutations might contain calendar elements
    let hasNewNodes = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        hasNewNodes = true;
        break;
      }
    }
    if (hasNewNodes) {
      debouncedShift();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();

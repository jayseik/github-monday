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
    applyState();
  }

  // Bring every calendar on the page in line with the current setting
  function applyState() {
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
    let firstSundayInFirstColumn = false;
    if (sundayCells.length >= 2) {
      const cRect0 = sundayCells[0].getBoundingClientRect();
      const cRect1 = sundayCells[1].getBoundingClientRect();
      colWidth = cRect1.left - cRect0.left;

      // The calendar's first column is where the leftmost day of any weekday
      // sits. When the calendar starts mid-week (e.g. a year view where Jan 1
      // is a Wednesday), the Sunday slot of that column is an empty
      // placeholder and the first real Sunday sits one column further right.
      const firstColumnLeft = Math.min(
        ...dayRows.map(
          (row) => row.querySelector('[data-date]').getBoundingClientRect().left
        )
      );
      firstSundayInFirstColumn = cRect0.left - firstColumnLeft < colWidth / 2;
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
      sundayCells.forEach((cell) => {
        cell.style.transform = `translateX(${-colWidth}px)`;
      });
      // A Sunday in the first column has no earlier week to join (it would
      // land on the weekday labels), so hide it
      if (firstSundayInFirstColumn) {
        sundayCells[0].style.visibility = 'hidden';
      }
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

  const debouncedApply = debounce(applyState, 150);

  // Initial run (calendar might already be in DOM)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyState);
  } else {
    applyState();
  }

  // Handle GitHub's Turbo SPA navigation. Going back restores a cached
  // snapshot of the page, which still carries the shift from when it was
  // cached, so this must also revert if the toggle was turned off since.
  document.addEventListener('turbo:load', applyState);
  document.addEventListener('turbo:render', applyState);

  function containsCalendar(node) {
    return (
      node.nodeType === Node.ELEMENT_NODE &&
      (node.matches(CALENDAR_SELECTOR) ||
        node.querySelector(CALENDAR_SELECTOR) !== null)
    );
  }

  // MutationObserver for dynamically loaded content. Switching years on a
  // profile swaps in a new calendar with no Turbo event; observer callbacks
  // run before the next paint, so handling it right away means the
  // Sunday-first layout never flashes on screen.
  const observer = new MutationObserver((mutations) => {
    const added = mutations.flatMap((mutation) => Array.from(mutation.addedNodes));
    if (added.length === 0) return;
    if (added.some(containsCalendar)) {
      applyState();
    }
    // Catch-all retry (e.g. for a calendar that had no layout yet when it
    // was inserted)
    debouncedApply();
  });

  // Observe <html>, not <body>: Turbo navigation replaces the <body> element,
  // which would leave an observer on the old one watching a detached tree.
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();

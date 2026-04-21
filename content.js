// Monday First for GitHub - Content Script
// Shifts GitHub's contribution calendar from Sunday-first to Monday-first

(function () {
  'use strict';

  const MARKER = 'data-monday-first';
  let enabled = true;

  // Load enabled state from storage. The synchronous shift below may have
  // already run with the default `enabled=true`; if storage says disabled,
  // revert what we just did.
  chrome.storage.sync.get({ enabled: true }, (data) => {
    enabled = data.enabled;
    if (enabled) {
      shiftAllCalendars();
    } else {
      revertAllCalendars();
    }
  });

  // Listen for toggle messages from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'toggle') {
      enabled = msg.enabled;
      if (enabled) {
        shiftAllCalendars();
      } else {
        revertAllCalendars();
      }
      sendResponse({ ok: true });
    }
    if (msg.type === 'getStatus') {
      sendResponse({ enabled });
    }
  });

  // --- Table-based calendar (current GitHub layout, 2024+) ---

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

  // --- SVG-based calendar (legacy GitHub layout) ---

  function getSvgRects(svg) {
    let rects = svg.querySelectorAll('rect.ContributionCalendar-day');
    if (rects.length === 0) rects = svg.querySelectorAll('rect.day');
    return Array.from(rects);
  }

  function findSundayYPosition(rects) {
    // Find a rect with a Sunday date and return its y-position
    for (const rect of rects) {
      const dateStr = rect.getAttribute('data-date');
      if (!dateStr) continue;
      const date = new Date(dateStr + 'T12:00:00');
      if (date.getDay() === 0) {
        return parseFloat(rect.getAttribute('y'));
      }
    }
    return null;
  }

  function shiftSvgCalendar(svg) {
    if (svg.hasAttribute(MARKER)) return;

    const rects = getSvgRects(svg);
    if (rects.length < 14) return; // Need at least 2 weeks of data

    // Get all unique y-positions (row positions)
    const ySet = new Set(rects.map((r) => parseFloat(r.getAttribute('y'))));
    const yPositions = Array.from(ySet).sort((a, b) => a - b);
    if (yPositions.length < 7) return;

    const rowHeight = yPositions[1] - yPositions[0];
    const minY = yPositions[0];
    const maxY = yPositions[yPositions.length - 1];

    // Get column width from unique x-positions
    const xSet = new Set(rects.map((r) => parseFloat(r.getAttribute('x'))));
    const xPositions = Array.from(xSet).sort((a, b) => a - b);
    const colWidth = xPositions.length >= 2 ? xPositions[1] - xPositions[0] : 0;
    const minX = xPositions[0];

    // Find Sunday's y-position by checking actual dates
    const sundayY = findSundayYPosition(rects);
    if (sundayY === null) return;

    // Store original positions and shift all rects
    rects.forEach((rect) => {
      rect.setAttribute('data-orig-x', rect.getAttribute('x'));
      rect.setAttribute('data-orig-y', rect.getAttribute('y'));

      const currentY = parseFloat(rect.getAttribute('y'));
      const currentX = parseFloat(rect.getAttribute('x'));
      let newY;

      if (Math.abs(currentY - sundayY) < 1) {
        // Sunday row -> move to bottom AND shift left one column
        newY = maxY;
        if (colWidth > 0) {
          const newX = currentX - colWidth;
          rect.setAttribute('x', newX);
          if (newX < minX) {
            // First Sunday rect shifts off-screen — hide it
            rect.setAttribute('visibility', 'hidden');
          }
        }
      } else if (currentY > sundayY) {
        // Rows below Sunday -> shift up by one
        newY = currentY - rowHeight;
      } else {
        // Rows above Sunday -> stay (shouldn't exist if Sunday is first)
        newY = currentY;
      }
      rect.setAttribute('y', newY);
    });

    // Update day-of-week text labels
    shiftSvgDayLabels(svg, rowHeight, sundayY, maxY);

    svg.setAttribute(MARKER, 'true');
  }

  function shiftSvgDayLabels(svg, rowHeight, sundayY, maxY) {
    let textElements = svg.querySelectorAll('text.ContributionCalendar-label');
    if (textElements.length === 0) {
      textElements = svg.querySelectorAll('text.wday');
    }
    if (textElements.length === 0) return;

    const dayLabels = Array.from(textElements).filter((t) => {
      const content = t.textContent.trim().toLowerCase();
      return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].some((d) =>
        content.startsWith(d)
      );
    });

    dayLabels.forEach((label) => {
      const attr = label.hasAttribute('y') ? 'y' : 'dy';
      const currentY = parseFloat(label.getAttribute(attr));
      if (isNaN(currentY)) return;

      // Store original position for revert
      label.setAttribute('data-orig-attr', attr);
      label.setAttribute('data-orig-val', currentY);

      let newY;
      if (Math.abs(currentY - sundayY) < rowHeight) {
        // Sunday label -> move to bottom (no horizontal shift for labels)
        newY = currentY + (maxY - sundayY);
      } else if (currentY > sundayY) {
        // Labels below Sunday -> shift up by one row
        newY = currentY - rowHeight;
      } else {
        newY = currentY;
      }

      label.setAttribute(attr, newY);
    });
  }

  function revertSvgCalendar(svg) {
    if (!svg.hasAttribute(MARKER)) return;

    // Restore original rect positions
    const rects = getSvgRects(svg);
    rects.forEach((rect) => {
      const origX = rect.getAttribute('data-orig-x');
      const origY = rect.getAttribute('data-orig-y');
      if (origY !== null) rect.setAttribute('y', origY);
      if (origX !== null) rect.setAttribute('x', origX);
      rect.removeAttribute('data-orig-x');
      rect.removeAttribute('data-orig-y');
      rect.removeAttribute('visibility');
    });

    // Restore original day label positions
    let textElements = svg.querySelectorAll('text.ContributionCalendar-label');
    if (textElements.length === 0) {
      textElements = svg.querySelectorAll('text.wday');
    }
    Array.from(textElements).forEach((label) => {
      const attr = label.getAttribute('data-orig-attr');
      const val = label.getAttribute('data-orig-val');
      if (attr && val !== null) {
        label.setAttribute(attr, val);
      }
      label.removeAttribute('data-orig-attr');
      label.removeAttribute('data-orig-val');
    });

    svg.removeAttribute(MARKER);
  }

  // --- Main orchestration ---

  function shiftAllCalendars() {
    if (!enabled) return;

    // Strategy 1: Table-based (current)
    document
      .querySelectorAll('table.ContributionCalendar-grid')
      .forEach(shiftTableCalendar);

    // Strategy 2: SVG-based (legacy)
    document
      .querySelectorAll('svg.js-calendar-graph-svg')
      .forEach(shiftSvgCalendar);
  }

  function revertAllCalendars() {
    document
      .querySelectorAll('table.ContributionCalendar-grid')
      .forEach(revertTableCalendar);

    document
      .querySelectorAll('svg.js-calendar-graph-svg')
      .forEach(revertSvgCalendar);
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

  // Legacy Turbolinks support (just in case)
  document.addEventListener('turbolinks:load', shiftAllCalendars);

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

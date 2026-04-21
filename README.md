# Monday First for GitHub

**Your week starts on Monday. Your GitHub should too.**

A Chrome extension that shifts GitHub's contribution calendar to start on Monday instead of Sunday. No configuration. No data collected. No network requests. Just the calendar, the way most of the world reads it.

---

## The problem

GitHub's contribution calendar starts every week on Sunday. This is a US convention that doesn't match the [ISO 8601](https://en.wikipedia.org/wiki/ISO_week_date) standard, or the way most of the world reads a week.

The change has been [requested since 2016](https://github.com/isaacs/github/issues/644) with 85+ upvotes on that one thread alone. GitHub has declined to add it as a setting.

## The fix

Install the extension. That's it.

```
Before:  Sun Mon Tue Wed Thu Fri Sat
After:   Mon Tue Wed Thu Fri Sat Sun
```

Profile pages reorder automatically. Tooltips, hover states, and colors are untouched.

## Features

- Reorders the contribution heatmap on every GitHub profile
- Works across GitHub's Turbo (SPA) navigation
- Preserves tooltips, hover states, streaks, and totals
- Simple on/off toggle in the popup (state persists across browsers via `chrome.storage.sync`)
- "M" badge on the toolbar icon when active on a GitHub tab
- Dark mode popup
- No data collection, no tracking, no network requests
- Entirely client-side — only touches DOM in your browser
- Under 15 KB total

## Installation

### From source (developer mode)

1. Clone the repo:
   ```bash
   git clone https://github.com/jayseik/github-monday.git
   ```
2. Open `chrome://extensions/` in Chrome (or `edge://extensions/` in Edge, `brave://extensions/` in Brave).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the cloned directory.
5. Navigate to any GitHub profile — the calendar now starts on Monday.

### Chrome Web Store

Not yet published.

## How it works

GitHub renders the contribution calendar as a `<table>` of seven rows (one row per weekday, Sunday first) and ~53 columns (one column per week). Each cell has a `data-date` attribute.

The extension:

1. Locates the calendar table on GitHub profile pages, and again after every Turbo navigation via a `MutationObserver`.
2. Detects the Sunday row by checking actual `data-date` values (no reliance on row position).
3. Uses CSS transforms (no DOM mutation) to:
   - shift the Sunday row to the bottom,
   - shift all other rows up by one,
   - shift every Sunday cell left by one column so each Sunday joins the end of the previous week.
4. Reverts cleanly when toggled off — every change is a CSS transform that can be cleared.

There's also a fallback code path for GitHub's legacy SVG calendar, which you'd only hit on very old cached pages.

## Known limitations

- **The leftmost Sunday cell is hidden.** When every Sunday shifts one column to the left, the first Sunday in the calendar has nowhere to go — it would land off-screen. This is one day out of ~365 being visually hidden at the far-left edge of the graph. The underlying data is untouched; it just isn't drawn.
- **Only `github.com`.** GitHub Enterprise (`ghe.com` and self-hosted instances) isn't matched by the manifest. If you need it there, add the host to `manifest.json` and reload.
- **Profile pages only.** The extension targets the contribution calendar; it doesn't touch other calendars on the site.

## Technical details

| Property           | Value                                    |
| ------------------ | ---------------------------------------- |
| Manifest version   | V3                                       |
| Permissions        | `storage`                                |
| Host permissions   | `https://github.com/*`                   |
| Content script     | Injected at `document_end` on `github.com` |
| External requests  | None                                     |
| Data collected     | None                                     |
| Build step         | None — loads as-is                       |

## Browser support

| Browser        | Status                                             |
| -------------- | -------------------------------------------------- |
| Google Chrome  | Supported                                          |
| Microsoft Edge | Supported (via Load unpacked, same files)          |
| Brave          | Supported (via Load unpacked, same files)          |
| Arc / Vivaldi  | Supported (any Chromium-based browser)             |
| Firefox        | Not yet — needs manifest tweaks for WebExtensions  |
| Safari         | Not planned                                        |

## Privacy

The extension stores one boolean (`enabled`) in `chrome.storage.sync`. It makes no network requests, loads no remote scripts, and communicates with no third parties. All code runs locally in your browser. Review [content.js](content.js) and [background.js](background.js) — they're short.

## Contributing

Bugs and PRs welcome. When filing an issue, please include:

- Your browser and version
- A screenshot of the problem
- The profile URL where it happens (yours or a public profile)

## License

[MIT](LICENSE).

// Monday First for GitHub - Background Service Worker
// Manages toolbar badge state

function updateBadge(tabId, url) {
  // If url is undefined we can't read it (no host_permission match) -> not GitHub
  const isGitHub = url && url.includes('github.com');

  if (isGitHub) {
    chrome.storage.sync.get({ enabled: true }, (data) => {
      chrome.action.setBadgeText({
        text: data.enabled ? 'M' : '',
        tabId,
      });
      chrome.action.setBadgeBackgroundColor({
        color: '#24292f',
        tabId,
      });
      chrome.action.setBadgeTextColor({
        color: '#ffffff',
        tabId,
      });
    });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

// Update badge when tab is updated (navigation, URL change)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  updateBadge(tabId, tab.url);
});

// Update badge when tab is activated (switched to)
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    updateBadge(tabId, tab.url);
  });
});

// Update all GitHub tabs when enabled state changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) {
    // A removed key means the default (enabled), same as in content.js
    const newEnabled = changes.enabled.newValue !== false;
    chrome.tabs.query({ url: 'https://github.com/*' }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.action.setBadgeText({
          text: newEnabled ? 'M' : '',
          tabId: tab.id,
        });
      });
    });
  }
});

// Installing or updating the extension resets its badges, so restore them on
// GitHub tabs that are already open (otherwise they stay blank until the tab
// navigates or is switched to)
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({ url: 'https://github.com/*' }, (tabs) => {
    tabs.forEach((tab) => updateBadge(tab.id, tab.url));
  });
});

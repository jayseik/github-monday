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
    const newEnabled = changes.enabled.newValue;
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

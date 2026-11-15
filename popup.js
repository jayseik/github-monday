// Monday First for GitHub - Popup Logic

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('enableToggle');
  const status = document.getElementById('status');
  const statusText = status.querySelector('.status-text');

  // Load current state
  chrome.storage.sync.get({ enabled: true }, (data) => {
    toggle.checked = data.enabled;
    updateStatusUI(data.enabled);
  });

  // Handle toggle change
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;

    // Update popup UI
    updateStatusUI(enabled);

    // Saving is all it takes: the content script in every GitHub tab and the
    // badge logic in background.js both listen for this storage change.
    chrome.storage.sync.set({ enabled }, reloadActiveTabIfStale);
  });

  // A GitHub tab opened before the extension was installed or updated has no
  // live content script to receive the change. If that's the tab the user is
  // looking at, reload it so the toggle visibly takes effect.
  function reloadActiveTabIfStale() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.url || !tab.url.includes('github.com')) return;
      chrome.tabs.sendMessage(tab.id, { type: 'ping' }, () => {
        if (chrome.runtime.lastError) {
          chrome.tabs.reload(tab.id);
        }
      });
    });
  }

  function updateStatusUI(enabled) {
    if (enabled) {
      status.classList.remove('inactive');
      statusText.textContent = 'Active on GitHub';
    } else {
      status.classList.add('inactive');
      statusText.textContent = 'Paused';
    }
  }
});

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

    // Save to storage
    chrome.storage.sync.set({ enabled });

    // Update popup UI
    updateStatusUI(enabled);

    // Notify the active tab's content script. Badge updates for all GitHub
    // tabs are handled by the storage.onChanged listener in background.js.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('github.com')) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: 'toggle', enabled },
          () => {
            // Ignore errors if content script not ready
            if (chrome.runtime.lastError) {
              // Content script not loaded - reload the tab to apply
              chrome.tabs.reload(tabs[0].id);
            }
          }
        );
      }
    });
  });

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

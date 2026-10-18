'use strict';

const DEFAULTS = { enabled: true };

async function load() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  document.getElementById('enabled').checked = !!stored.enabled;
}

document.getElementById('enabled').addEventListener('change', (e) => {
  chrome.storage.local.set({ enabled: e.target.checked });
});

load();

'use strict';

const DEFAULTS = { enabled: true, learningMode: false, hideProgressBar: false, fuzzyTime: false };
const IDS = ['enabled', 'learningMode', 'hideProgressBar', 'fuzzyTime'];

function syncDisabled() {
  const on = document.getElementById('enabled').checked;
  ['learningMode', 'hideProgressBar', 'fuzzyTime'].forEach((id) => {
    document.getElementById(id).disabled = !on;
  });
}

async function load() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  for (const id of IDS) {
    document.getElementById(id).checked = !!stored[id];
  }
  syncDisabled();
}

for (const id of IDS) {
  document.getElementById(id).addEventListener('change', (e) => {
    chrome.storage.local.set({ [id]: e.target.checked });
    syncDisabled();
  });
}

load();

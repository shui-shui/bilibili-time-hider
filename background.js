'use strict';

const TEMP_REVEAL_MS = 4000;

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-time-view') return;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (tab && tab.id != null) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'temporary-reveal',
        duration: TEMP_REVEAL_MS
      });
    }
  } catch (e) {
    // 当前页面没有注入 content script（非 B 站页面），忽略即可
  }
});

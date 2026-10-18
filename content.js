(() => {
  'use strict';

  const DEFAULTS = { enabled: true };
  const REVEAL_DEFAULT_MS = 4000;

  // 兜底扫描范围：仅限播放器控制栏区域，避免误伤弹幕时间戳等
  const CONTROL_SCOPE_SELECTORS = [
    '.bpx-player-control-wrap',
    '.bpx-player-ctrl-progress',
    '.bpx-player-ctrl-time',
    '.bilibili-player-video-control',
    '.bilibili-player-video-control-wrap',
    '.bilibili-player-video-progress'
  ];

  // 时间文本：11:30 / 1:11:30 / 11:30 / 11:33
  const TIME_TEXT_RE = /^\s*\d{1,3}:\d{2}(:\d{2})?(\s*\/\s*\d{1,3}:\d{2}(:\d{2})?)?\s*$/;

  let settings = { ...DEFAULTS };
  let revealTimer = null;
  let fallbackEls = new Set();
  let scanScheduled = false;

  // ---------- 按文本兜底隐藏 ----------
  function hideEl(el) {
    el.style.setProperty('display', 'none', 'important');
    fallbackEls.add(el);
  }

  function showEl(el) {
    el.style.removeProperty('display');
    fallbackEls.delete(el);
  }

  function isTimeText(el) {
    if (el.childElementCount > 0) return false;
    return TIME_TEXT_RE.test(el.textContent || '');
  }

  function scanFallback() {
    if (!settings.enabled) return;
    const reveal = document.documentElement.hasAttribute('data-bth-reveal');
    const seen = new Set();
    const scopes = document.querySelectorAll(CONTROL_SCOPE_SELECTORS.join(', '));
    for (const scope of scopes) {
      const els = scope.querySelectorAll('span, div, i, em, b, p, time');
      for (const el of els) {
        if (!isTimeText(el)) continue;
        seen.add(el);
        if (reveal) showEl(el);
        else hideEl(el);
      }
    }
    for (const el of [...fallbackEls]) {
      if (!seen.has(el)) showEl(el);
    }
  }

  function cleanupFallback() {
    for (const el of [...fallbackEls]) showEl(el);
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scanFallback();
    });
  }

  // ---------- 临时查看 ----------
  function reveal(duration) {
    if (!settings.enabled) return;
    document.documentElement.setAttribute('data-bth-reveal', 'on');
    scheduleScan();
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = setTimeout(() => {
      document.documentElement.removeAttribute('data-bth-reveal');
      revealTimer = null;
      scheduleScan();
    }, duration || REVEAL_DEFAULT_MS);
  }

  function clearReveal() {
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    document.documentElement.removeAttribute('data-bth-reveal');
  }

  // ---------- 应用状态 ----------
  function applyState() {
    const root = document.documentElement;
    if (!root) return;
    if (!settings.enabled) {
      root.removeAttribute('data-bth');
      clearReveal();
      cleanupFallback();
      return;
    }
    root.setAttribute('data-bth', 'on');
    scheduleScan();
  }

  // ---------- 初始化 ----------
  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(DEFAULTS, resolve);
      } catch (e) {
        resolve({ ...DEFAULTS });
      }
    });
  }

  function startObserver() {
    const body = document.body;
    if (!body) { setTimeout(startObserver, 50); return; }
    const mo = new MutationObserver((muts) => {
      if (!settings.enabled) return;
      for (const m of muts) {
        if (m.type === 'childList' && m.addedNodes.length) {
          scheduleScan();
          break;
        }
      }
    });
    mo.observe(body, { childList: true, subtree: true });
  }

  async function init() {
    // 乐观地先隐藏，避免默认开启时闪烁
    document.documentElement.setAttribute('data-bth', 'on');

    try {
      const stored = await loadSettings();
      settings = { ...DEFAULTS, ...stored };
    } catch (e) {}

    applyState();

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.enabled) {
          settings.enabled = changes.enabled.newValue;
          applyState();
        }
      });
    } catch (e) {}

    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'temporary-reveal') reveal(msg.duration);
      });
    } catch (e) {}
  }

  init();
  startObserver();
  setInterval(() => { if (settings.enabled) scheduleScan(); }, 800);
})();

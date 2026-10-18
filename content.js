(() => {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    learningMode: false,
    hideProgressBar: false,
    fuzzyTime: false
  };
  const REVEAL_DEFAULT_MS = 4000;

  const ROOT_ATTRS = [
    'data-bth',
    'data-bth-learning',
    'data-bth-progress',
    'data-bth-fuzzy',
    'data-bth-reveal'
  ];

  // 伪装时间要写入的容器（按新旧播放器备选）
  const TIME_CONTAINER_SELECTORS = [
    '.bpx-player-ctrl-time',
    '.bilibili-player-video-time'
  ];

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
  let fuzzyEl = null;
  let fuzzyContainer = null;
  let fuzzyTimer = null;
  let scanScheduled = false;

  function setAttr(name, on) {
    const root = document.documentElement;
    if (!root) return;
    if (on) root.setAttribute(name, 'on');
    else root.removeAttribute(name);
  }

  function getVideo() {
    return document.querySelector(
      '#bpx-player video, .bpx-player-container video, #bilibili-player video, ' +
      '.squirtle-video-wrap video, .bwp-video video, video.video-js'
    ) || document.querySelector('video');
  }

  function computeFuzzy(v) {
    const d = v && isFinite(v.duration) ? v.duration : 0;
    const t = v && isFinite(v.currentTime) ? v.currentTime : 0;
    if (!d || d <= 0) return '加载中…';
    const remain = d - t;
    if (remain <= 0) return '已看完';
    const ratio = t / d;
    if (ratio < 0.05) return '刚开始';
    if (ratio >= 0.45 && ratio <= 0.55) return '已看一半';
    if (ratio > 0.95) return '快看完了';
    const rounded = Math.max(5, Math.round((remain / 60) / 5) * 5);
    return '还剩约 ' + rounded + ' 分钟';
  }

  // ---------- 伪装时间 ----------
  function removeFuzzy() {
    if (fuzzyEl) { fuzzyEl.remove(); fuzzyEl = null; }
    fuzzyContainer = null;
    if (fuzzyTimer) { clearInterval(fuzzyTimer); fuzzyTimer = null; }
  }

  function ensureFuzzy() {
    if (!settings.enabled || !settings.fuzzyTime) return;
    if (!fuzzyContainer || !document.contains(fuzzyContainer)) {
      fuzzyContainer = null;
      for (const sel of TIME_CONTAINER_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) { fuzzyContainer = el; break; }
      }
    }
    if (!fuzzyContainer) return;
    if (!fuzzyEl || !document.contains(fuzzyEl)) {
      fuzzyEl = document.createElement('span');
      fuzzyEl.className = 'bth-fuzzy';
      fuzzyContainer.appendChild(fuzzyEl);
    }
    fuzzyEl.textContent = computeFuzzy(getVideo());
  }

  function startFuzzy() {
    removeFuzzy();
    ensureFuzzy();
    if (!fuzzyTimer) fuzzyTimer = setInterval(ensureFuzzy, 1000);
  }

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
      if (settings.enabled && settings.fuzzyTime) ensureFuzzy();
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
      for (const a of ROOT_ATTRS) root.removeAttribute(a);
      clearReveal();
      removeFuzzy();
      cleanupFallback();
      return;
    }
    root.setAttribute('data-bth', 'on');
    setAttr('data-bth-learning', settings.learningMode);
    setAttr('data-bth-progress', settings.hideProgressBar);
    setAttr('data-bth-fuzzy', settings.fuzzyTime);
    if (settings.fuzzyTime) startFuzzy();
    else removeFuzzy();
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
    setAttr('data-bth', true);

    try {
      const stored = await loadSettings();
      settings = { ...DEFAULTS, ...stored };
    } catch (e) {}

    applyState();

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        let changed = false;
        for (const k of Object.keys(DEFAULTS)) {
          if (changes[k]) {
            settings[k] = changes[k].newValue;
            changed = true;
          }
        }
        if (changed) applyState();
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

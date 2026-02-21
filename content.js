// content.js — CodeMentor AI Content Script

'use strict';

let sidebarIframe = null;
let isSidebarVisible = false;
let toggleBtn = null;
let lastUrl = location.href;
let injected = false;
let navDebounceTimer = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
function boot() {
  if (injected) return;
  injected = true;
  injectSidebar();
  watchNavigation();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// ── Sidebar injection ─────────────────────────────────────────────────────────
function injectSidebar() {
  if (document.getElementById('codementor-sidebar')) return;

  sidebarIframe = document.createElement('iframe');
  sidebarIframe.id = 'codementor-sidebar';
  sidebarIframe.src = chrome.runtime.getURL('sidebar.html');
  setSidebarStyles(false);
  document.body.appendChild(sidebarIframe);

  toggleBtn = buildToggleButton();
  document.body.appendChild(toggleBtn);

  sidebarIframe.addEventListener('load', sendPlatformAndProblem, { once: true });
}

function setSidebarStyles(visible) {
  if (!sidebarIframe) return;
  sidebarIframe.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    right: 0 !important;
    width: 400px !important;
    height: 100vh !important;
    border: none !important;
    z-index: 2147483646 !important;
    box-shadow: -4px 0 24px rgba(0,0,0,0.45) !important;
    transition: transform 0.3s cubic-bezier(.4,0,.2,1) !important;
    transform: ${visible ? 'translateX(0)' : 'translateX(100%)'} !important;
    background: #0d1117 !important;
  `;
}

function buildToggleButton() {
  const btn = document.createElement('button');
  btn.id = 'codementor-toggle';
  btn.setAttribute('aria-label', 'Toggle CodeMentor AI');
  // Use logo image; fall back to text if image fails
  const img = document.createElement('img');
  img.src = chrome.runtime.getURL('assets/logo-32.png');
  img.style.cssText = 'width:22px;height:22px;border-radius:5px;display:block;';
  img.onerror = () => { img.style.display = 'none'; btn.textContent = 'CM'; };
  btn.appendChild(img);
  btn.style.cssText = `
    position: fixed !important;
    bottom: 24px !important;
    right: 24px !important;
    width: 46px !important;
    height: 46px !important;
    border-radius: 12px !important;
    background: #7c3aed !important;
    border: none !important;
    cursor: pointer !important;
    z-index: 2147483645 !important;
    box-shadow: 0 4px 16px rgba(124,58,237,0.5) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: transform 0.15s !important;
    padding: 0 !important;
  `;
  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.1)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  btn.addEventListener('click', toggleSidebar);
  return btn;
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function toggleSidebar() {
  isSidebarVisible = !isSidebarVisible;
  if (sidebarIframe) {
    sidebarIframe.style.transform = isSidebarVisible ? 'translateX(0)' : 'translateX(100%)';
  }
  if (toggleBtn) {
    toggleBtn.style.background = isSidebarVisible ? '#6d28d9' : '#7c3aed';
  }
}

// ── Platform detection ────────────────────────────────────────────────────────
function detectPlatform() {
  const h = location.hostname;
  if (h === 'leetcode.com')         return 'leetcode';
  if (h === 'codeforces.com')       return 'codeforces';
  if (h === 'www.hackerrank.com')   return 'hackerrank';
  if (h === 'www.codechef.com')     return 'codechef';
  return 'unknown';
}

function isProblemPage(platform) {
  const url = location.href;
  const patterns = {
    leetcode:   /leetcode\.com\/problems\//,
    codeforces: /codeforces\.com\/(problemset\/problem|contest\/\d+\/problem|gym\/\d+\/problem)\//,
    hackerrank: /hackerrank\.com\/(challenges|contests\/.+\/challenges)\//,
    codechef:   /codechef\.com\/(problems|[A-Z0-9]+\/problems)\//
  };
  return patterns[platform] ? patterns[platform].test(url) : false;
}

// ── Problem scraping ──────────────────────────────────────────────────────────
function scrapeProblem(platform) {
  const base = { platform, url: location.href, title: '', description: '', difficulty: 'Unknown' };
  const scraper = window.CodeMentorPlatforms?.[platform];
  if (!scraper) return base;

  try {
    const scraped = scraper.scrape?.() || {};
    const difficulty = scraper.getDifficulty?.() || 'Unknown';
    return {
      ...base, ...scraped, difficulty,
      fullProblemText: getFullText(platform),
      scrapedSolutions: getSolutions(platform)
    };
  } catch (err) {
    console.warn('[CodeMentor] scrape error:', err.message);
    return { ...base, _error: err.message };
  }
}

function getFullText(platform) {
  const selectors = {
    leetcode:   ['.elfjS', '.xFUwe', '[data-cy="question-content"]'],
    codeforces: ['.problem-statement'],
    hackerrank: ['.challenge-body-html', '[class*="challenge-body"]'],
    codechef:   ['.problem-statement', '[class*="problem-statement"]', '.statement-body']
  };
  for (const sel of (selectors[platform] || [])) {
    const el = document.querySelector(sel);
    const text = el?.innerText?.trim();
    if (text) return text.replace(/\n{3,}/g, '\n\n');
  }
  return null;
}

function getSolutions(platform) {
  const solutions = [];
  try {
    if (platform === 'leetcode') {
      const el = document.querySelector('.view-lines');
      if (el) {
        const code = Array.from(el.querySelectorAll('span')).map(s => s.innerText).join('\n').trim();
        if (code) solutions.push(code);
      }
    } else if (platform === 'codeforces') {
      const code = document.querySelector('#sourceCodeTextarea')?.value?.trim();
      if (code) solutions.push(code);
    } else {
      const code = document.querySelector('.CodeMirror-code')?.innerText?.trim();
      if (code) solutions.push(code);
    }
  } catch (e) {
    console.warn('[CodeMentor] getSolutions error:', e.message);
  }
  return solutions;
}

// ── Send to sidebar ───────────────────────────────────────────────────────────
function sendPlatformAndProblem() {
  if (!sidebarIframe?.contentWindow) return;
  const platform = detectPlatform();

  sidebarIframe.contentWindow.postMessage({ type: 'PLATFORM_INFO', platform, url: location.href }, '*');

  if (!isProblemPage(platform)) return;

  // SPA platforms need DOM to settle after route change
  const delay = ['leetcode', 'codechef', 'hackerrank'].includes(platform) ? 1200 : 400;

  setTimeout(() => {
    const data = scrapeProblem(platform);
    if (data._error) {
      sidebarIframe.contentWindow.postMessage({ type: 'PARSE_ERROR', data: { error: data._error } }, '*');
    }
    sidebarIframe.contentWindow.postMessage({ type: 'PROBLEM_DATA', data }, '*');
  }, delay);
}

// ── SPA navigation watcher ────────────────────────────────────────────────────
function watchNavigation() {
  const wrap = (method) => {
    const orig = history[method];
    history[method] = function (...args) {
      const result = orig.apply(this, args);
      scheduleNavCheck();
      return result;
    };
  };
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', scheduleNavCheck);

  // Fallback: MutationObserver on body for SPA title changes
  const obs = new MutationObserver(debounce(() => {
    if (location.href !== lastUrl) scheduleNavCheck();
  }, 600));
  obs.observe(document.body, { childList: true, subtree: false });
}

function scheduleNavCheck() {
  clearTimeout(navDebounceTimer);
  navDebounceTimer = setTimeout(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    // Ensure sidebar iframe is still alive
    if (!document.getElementById('codementor-sidebar')) {
      injectSidebar();
    } else {
      sendPlatformAndProblem();
    }
  }, 800);
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Message bridge ────────────────────────────────────────────────────────────
window.addEventListener('message', (e) => {
  if (!sidebarIframe || e.source !== sidebarIframe.contentWindow) return;
  if (e.data?.type === 'TOGGLE_SIDEBAR') toggleSidebar();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TOGGLE_SIDEBAR') toggleSidebar();
});

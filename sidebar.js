// sidebar.js — CodeMentor AI Sidebar Logic

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let currentProblem = null;
let currentPlatform = 'unknown';
let hintsUsed = 0;
let hintLocked = false;
let hintContents = {};
let timerInterval = null;
let secondsElapsed = 0;
let isTimerRunning = false;
let chatHistory = [];
let storedApproaches = [];
let stuckNudgeShown = false;
let settings = { stuckEnabled: true, stuckThreshold: 15, mistakeRadarEnabled: true };

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  setupTabs();
  setupChat();
  setupHints();
  setupProgress();
  setupSettings();
  setupMessages();
});

function initSidebar() {
  chrome.storage.local.get(['consentGiven', 'geminiApiKey', 'settings'], (r) => {
    if (!r.consentGiven) {
      showEl('consentOverlay');
    } else if (!r.geminiApiKey) {
      showEl('apiKeyOverlay');
    } else {
      setDot('statusApi', 'on');
    }
    if (r.settings) Object.assign(settings, r.settings);
    applySettings();
  });

  document.getElementById('consentAccept').addEventListener('click', () => {
    chrome.storage.local.set({ consentGiven: true }, () => {
      hideEl('consentOverlay');
      chrome.storage.local.get('geminiApiKey', (r) => {
        if (!r.geminiApiKey) showEl('apiKeyOverlay');
      });
    });
  });

  document.getElementById('overlayApiKeySave').addEventListener('click', () => {
    const key = document.getElementById('overlayApiKeyInput').value.trim();
    if (!key) { document.getElementById('overlayApiKeyError').style.display = 'block'; return; }
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      hideEl('apiKeyOverlay');
      setDot('statusApi', 'on');
      toast('API key saved', 'success');
    });
  });

  document.getElementById('overlayApiKeySkip').addEventListener('click', () => hideEl('apiKeyOverlay'));
  document.getElementById('closeSidebar').addEventListener('click', () => {
    window.parent.postMessage({ type: 'TOGGLE_SIDEBAR' }, '*');
  });
}

function applySettings() {
  setCheck('stuckEnabled', settings.stuckEnabled);
  setCheck('mistakeRadarEnabled', settings.mistakeRadarEnabled);
  const t = document.getElementById('stuckThreshold');
  if (t) t.value = settings.stuckThreshold;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.cm-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(id) {
  document.querySelectorAll('.cm-tab').forEach(b => b.classList.toggle('cm-tab--active', b.dataset.tab === id));
  document.querySelectorAll('.cm-pane').forEach(p => p.classList.toggle('cm-pane--active', p.id === `pane-${id}`));
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function setupChat() {
  document.getElementById('sendMessage').addEventListener('click', sendMessage);
  document.getElementById('userInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('nudgeClose').addEventListener('click', () => hideEl('stuckNudge'));
  document.getElementById('explainBarClose').addEventListener('click', () => hideEl('explainBar'));
  document.getElementById('explainLinesBtn').addEventListener('click', explainSelectedCode);

  document.getElementById('userInput').addEventListener('input', (e) => {
    const val = e.target.value.trim();
    const lines = val.split('\n').length;
    const hasCode = /[{};()=>]/.test(val);
    document.getElementById('explainBar').style.display =
      (lines >= 3 && lines <= 30 && hasCode) ? 'flex' : 'none';
  });
}

function sendMessage() {
  const input = document.getElementById('userInput');
  const text = input.value.trim();
  if (!text) return;

  addUserMsg(text);
  input.value = '';
  hideEl('explainBar');

  const sendBtn = document.getElementById('sendMessage');
  sendBtn.disabled = true;
  showTyping();

  if (settings.mistakeRadarEnabled) runMistakeRadar(text);

  chrome.runtime.sendMessage({
    type: 'USER_QUERY',
    query: text,
    problemData: currentProblem,
    chatHistory: chatHistory.slice(-10)
  }, (resp) => {
    hideTyping();
    sendBtn.disabled = false;

    if (resp?.success) {
      addAIMsg(resp.reply);
      if (resp.approaches?.length) {
        storedApproaches = resp.approaches;
        saveProblemState();
        setStat('statApproaches', storedApproaches.length);
        buildComparatorTable(storedApproaches);
      }
    } else if (resp?.error === 'NO_API_KEY') {
      addAIMsg('⚠️ API key not set. Go to Settings tab to add your Gemini key.');
      showEl('apiKeyOverlay');
    } else {
      addAIMsg("I couldn't process that. Please rephrase.");
    }
    setStat('statMessages', chatHistory.filter(m => m.role === 'user').length);
  });
}

function runMistakeRadar(text) {
  chrome.runtime.sendMessage({ type: 'MISTAKE_RADAR', userText: text, platform: currentPlatform }, (resp) => {
    if (resp?.pitfalls?.length) {
      const chips = document.getElementById('radarChips');
      chips.innerHTML = resp.pitfalls.map(p => `<span class="cm-chip">${esc(p)}</span>`).join('');
      document.getElementById('mistakeRadar').style.display = 'flex';
    }
  });
}

function explainSelectedCode() {
  const code = document.getElementById('userInput').value.trim();
  if (!code) return;
  hideEl('explainBar');
  addUserMsg(`[Explain this code]\n${code}`);
  document.getElementById('userInput').value = '';
  const sendBtn = document.getElementById('sendMessage');
  sendBtn.disabled = true;
  showTyping();

  chrome.runtime.sendMessage({ type: 'EXPLAIN_LINES', code }, (resp) => {
    hideTyping();
    sendBtn.disabled = false;
    addAIMsg(resp?.success ? resp.explanation : (resp?.error || 'Could not explain this snippet.'));
  });
}

// ── Hints / Hint Ladder ───────────────────────────────────────────────────────
function setupHints() {
  document.getElementById('nextHintBtn').addEventListener('click', revealNextHint);
  document.getElementById('hintLockToggle').addEventListener('change', (e) => {
    hintLocked = e.target.checked;
    const btn = document.getElementById('nextHintBtn');
    btn.disabled = hintLocked || hintsUsed >= 4;
    btn.textContent = hintLocked ? '🔒 Locked' : (hintsUsed >= 4 ? 'All hints revealed' : 'Next Hint →');
  });
}

function revealNextHint() {
  if (hintLocked || hintsUsed >= 4) return;
  const level = hintsUsed + 1;
  const rung = document.getElementById(`rung-${level}`);

  rung.classList.replace('cm-rung--locked', 'cm-rung--active');
  rung.querySelector('.cm-rung__status').textContent = 'Loading…';

  const content = document.createElement('div');
  content.className = 'cm-rung__content cm-skeleton';
  content.style.height = '40px';
  content.id = `rung-content-${level}`;
  rung.appendChild(content);

  document.getElementById('nextHintBtn').disabled = true;

  chrome.runtime.sendMessage({ type: 'HINT_LADDER', level, problemData: currentProblem }, (resp) => {
    const el = document.getElementById(`rung-content-${level}`);
    if (resp?.success && resp.hint) {
      hintContents[level] = resp.hint;
      hintsUsed++;
      if (el) { el.classList.remove('cm-skeleton'); el.style.height = ''; el.textContent = resp.hint; }
      rung.querySelector('.cm-rung__status').textContent = 'Revealed';
      rung.classList.replace('cm-rung--active', 'cm-rung--unlocked');
    } else {
      if (el) el.textContent = resp?.error === 'NO_API_KEY' ? '⚠️ API key required.' : 'Could not load hint.';
      rung.querySelector('.cm-rung__status').textContent = 'Error';
    }
    document.getElementById('hintsUsed').textContent = hintsUsed;
    setStat('statHints', hintsUsed);
    const btn = document.getElementById('nextHintBtn');
    btn.disabled = hintsUsed >= 4 || hintLocked;
    btn.textContent = hintsUsed >= 4 ? 'All hints revealed' : 'Next Hint →';
  });
}

// ── Progress ──────────────────────────────────────────────────────────────────
function setupProgress() {
  document.getElementById('startTimer').addEventListener('click', startTimer);
  document.getElementById('pauseTimer').addEventListener('click', pauseTimer);
  document.getElementById('resetTimer').addEventListener('click', resetTimer);
  document.getElementById('copySessionBtn').addEventListener('click', copySession);

  const clearBtn = document.getElementById('clearData');
  let armed = false, armTimer;
  clearBtn.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      clearBtn.textContent = 'Tap again to confirm';
      clearBtn.style.background = '#d29922';
      armTimer = setTimeout(() => {
        armed = false; clearBtn.textContent = 'Clear all my data'; clearBtn.style.background = '';
      }, 3000);
    } else {
      clearTimeout(armTimer);
      chrome.storage.local.clear(() => {
        hintsUsed = 0; secondsElapsed = 0; chatHistory = [];
        storedApproaches = []; hintContents = {};
        pauseTimer(); resetHintRungs(); updateTimerDisplay();
        document.getElementById('chatMessages').innerHTML = '';
        showEl('consentOverlay');
        armed = false; clearBtn.textContent = 'Clear all my data'; clearBtn.style.background = '';
      });
    }
  });
}

function startTimer() {
  if (isTimerRunning) return;
  isTimerRunning = true;
  timerInterval = setInterval(() => { secondsElapsed++; updateTimerDisplay(); checkStuck(); }, 1000);
  setDot('statusTimer', 'on');
}

function pauseTimer() {
  isTimerRunning = false; clearInterval(timerInterval);
  setDot('statusTimer', secondsElapsed > 0 ? 'warn' : 'off');
}

function resetTimer() {
  pauseTimer(); secondsElapsed = 0; stuckNudgeShown = false;
  updateTimerDisplay(); setDot('statusTimer', 'off');
}

function updateTimerDisplay() {
  const m = Math.floor(secondsElapsed / 60);
  const s = secondsElapsed % 60;
  const str = `${pad(m)}:${pad(s)}`;
  document.getElementById('timer').textContent = str;
  document.getElementById('statusTimerText').textContent = `${m}:${pad(s)}`;
  setStat('statTime', `${m} min`);
}

function checkStuck() {
  if (!settings.stuckEnabled || stuckNudgeShown) return;
  const threshold = (settings.stuckThreshold || 15) * 60;
  if (secondsElapsed < threshold) return;
  stuckNudgeShown = true;
  chrome.runtime.sendMessage({
    type: 'STUCK_NUDGE', minutes: Math.floor(secondsElapsed / 60), problemData: currentProblem
  }, (resp) => {
    const el = document.getElementById('nudgeText');
    if (el) el.textContent = resp?.nudge || 'Check edge cases and constraints.';
    document.getElementById('stuckNudge').style.display = 'flex';
  });
}

function copySession() {
  const btn = document.getElementById('copySessionBtn');
  btn.disabled = true; btn.textContent = 'Generating…';
  chrome.runtime.sendMessage({
    type: 'SESSION_SUMMARY',
    problem: currentProblem, chatHistory, hintsRevealed: hintsUsed,
    approaches: storedApproaches, timeElapsed: secondsElapsed
  }, (resp) => {
    btn.disabled = false; btn.textContent = 'Copy Session Summary';
    if (resp?.success && resp.summary) {
      navigator.clipboard.writeText(resp.summary)
        .then(() => toast('Session summary copied!', 'success'))
        .catch(() => toast('Copy failed', 'error'));
    } else {
      toast(resp?.error === 'NO_API_KEY' ? 'API key required' : 'Could not generate summary', 'error');
    }
  });
}

function buildComparatorTable(approaches) {
  if (!approaches?.length) return;
  const card = document.getElementById('approachComparatorCard');
  const container = document.getElementById('comparatorTable');
  const rows = approaches.map(a => `
    <tr>
      <td><strong>${esc(a.name || '')}</strong></td>
      <td>${esc(a.intuition || a.idea || '')}</td>
      <td>${esc(a.time || '')}</td>
      <td>${esc(a.space || '')}</td>
    </tr>`).join('');
  container.innerHTML = `<table>
    <thead><tr><th>Approach</th><th>Idea</th><th>Time</th><th>Space</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  card.style.display = 'block';
}

// ── Settings ──────────────────────────────────────────────────────────────────
function setupSettings() {
  document.getElementById('saveApiKey').addEventListener('click', () => {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (!key) { toast('Enter a valid API key', 'error'); return; }
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      toast('API key saved', 'success'); setDot('statusApi', 'on');
    });
  });

  ['stuckEnabled', 'stuckThreshold', 'mistakeRadarEnabled'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', saveSettings);
  });
}

function saveSettings() {
  settings.stuckEnabled = document.getElementById('stuckEnabled')?.checked ?? true;
  settings.stuckThreshold = parseInt(document.getElementById('stuckThreshold')?.value || '15', 10);
  settings.mistakeRadarEnabled = document.getElementById('mistakeRadarEnabled')?.checked ?? true;
  chrome.storage.local.set({ settings });
}

// ── Messages from content.js ──────────────────────────────────────────────────
function setupMessages() {
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    const { type, data, platform } = e.data || {};
    if (type === 'PLATFORM_INFO') { currentPlatform = platform || 'unknown'; updatePlatformBadge(platform); setDiag('diagPlatform', platform || '—'); }
    if (type === 'PROBLEM_DATA')  { onProblemData(data); }
    if (type === 'PARSE_ERROR')   { setDot('statusParse', 'off'); setDiag('diagError', data?.error || 'Parse error'); }
  });
}

function onProblemData(data) {
  if (!data) return;
  const isNew = !currentProblem || currentProblem.url !== data.url;

  if (isNew) {
    hintsUsed = 0; hintContents = {}; chatHistory = [];
    storedApproaches = []; stuckNudgeShown = false;
    secondsElapsed = 0; pauseTimer(); updateTimerDisplay();
    resetHintRungs();
    document.getElementById('chatMessages').innerHTML = '';
    document.getElementById('mistakeRadar').style.display = 'none';
    document.getElementById('stuckNudge').style.display = 'none';
    document.getElementById('approachComparatorCard').style.display = 'none';
  }

  currentProblem = data;

  document.getElementById('problemTitle').textContent = data.title || 'Unknown Problem';
  setDifficultyBadge(data.difficulty || '');

  const parsed = !!(data.title || data.description);
  setDot('statusParse', parsed ? 'on' : 'off');
  setDiag('diagPageType', data.url?.includes('/problems/') ? 'problem' : 'other');
  setDiag('diagTitleLen', `${(data.title || '').length} chars`);
  setDiag('diagStmtLen', `${(data.fullProblemText || data.description || '').length} chars`);
  setDiag('diagTimestamp', new Date().toLocaleTimeString());
  setDiag('diagError', '—');

  if (isNew) {
    chrome.storage.local.get([`prog_${data.url}`, `appr_${data.url}`], (r) => {
      const saved = r[`prog_${data.url}`];
      if (saved) {
        secondsElapsed = saved.secondsElapsed || 0;
        hintsUsed = saved.hintsUsed || 0;
        hintContents = saved.hintContents || {};
        updateTimerDisplay();
        document.getElementById('hintsUsed').textContent = hintsUsed;
        for (let i = 1; i <= hintsUsed; i++) restoreRung(i, hintContents[i] || '');
        const btn = document.getElementById('nextHintBtn');
        btn.disabled = hintsUsed >= 4;
        btn.textContent = hintsUsed >= 4 ? 'All hints revealed' : 'Next Hint →';
      }
      const savedAppr = r[`appr_${data.url}`];
      if (savedAppr?.length) {
        storedApproaches = savedAppr;
        buildComparatorTable(storedApproaches);
        setStat('statApproaches', storedApproaches.length);
      }
    });

    addAIMsg(parsed
      ? `I see you're working on **${data.title || 'this problem'}**. What's your initial thought process?`
      : `⚠️ I couldn't detect a problem on this page. Navigate to a specific problem to get started.`
    );
  }
}

// ── Badge helpers ─────────────────────────────────────────────────────────────
function updatePlatformBadge(platform) {
  const badge = document.getElementById('platformBadge');
  badge.textContent = platform ? (platform.charAt(0).toUpperCase() + platform.slice(1)) : '—';
  badge.className = 'cm-badge' + (platform ? ` cm-badge--${platform}` : '');
}

function setDifficultyBadge(difficulty) {
  const el = document.getElementById('difficulty');
  const lower = difficulty.toLowerCase();
  const cls = lower.includes('easy') ? 'easy' : lower.includes('hard') ? 'hard' : lower.includes('medium') ? 'medium' : '';
  el.className = `cm-difficulty${cls ? ` cm-difficulty--${cls}` : ''}`;
  el.textContent = difficulty;
}

// ── Chat helpers ──────────────────────────────────────────────────────────────
function addUserMsg(text) {
  appendMsg('user', esc(text).replace(/\n/g, '<br>'));
  chatHistory.push({ role: 'user', content: text });
  setStat('statMessages', chatHistory.filter(m => m.role === 'user').length);
}

function addAIMsg(text) {
  const html = esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n🔹\s?/g, '<br><span class="cm-ai-section">🔹 </span>')
    .replace(/\n/g, '<br>');
  appendMsg('ai', html);
  chatHistory.push({ role: 'assistant', content: text });
}

function appendMsg(role, html) {
  const chat = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `cm-msg cm-msg--${role}`;
  div.innerHTML = `<div class="cm-msg__avatar">${role === 'ai' ? '🎯' : '👤'}</div><div class="cm-msg__bubble">${html}</div>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function showTyping() {
  const chat = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.id = 'typingIndicator'; div.className = 'cm-msg cm-msg--ai';
  div.innerHTML = `<div class="cm-msg__avatar">🎯</div><div class="cm-msg__bubble"><div class="cm-typing"><div class="cm-typing__dot"></div><div class="cm-typing__dot"></div><div class="cm-typing__dot"></div></div></div>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function hideTyping() { document.getElementById('typingIndicator')?.remove(); }

// ── Rung helpers ──────────────────────────────────────────────────────────────
function resetHintRungs() {
  for (let i = 1; i <= 4; i++) {
    const rung = document.getElementById(`rung-${i}`);
    if (!rung) continue;
    rung.className = 'cm-rung cm-rung--locked';
    rung.querySelector('.cm-rung__status').textContent = 'Locked';
    document.getElementById(`rung-content-${i}`)?.remove();
  }
  document.getElementById('hintsUsed').textContent = '0';
  const btn = document.getElementById('nextHintBtn');
  btn.disabled = false; btn.textContent = 'Next Hint →';
  document.getElementById('hintLockToggle').checked = false;
  hintLocked = false;
}

function restoreRung(level, text) {
  const rung = document.getElementById(`rung-${level}`);
  if (!rung) return;
  rung.className = 'cm-rung cm-rung--unlocked';
  rung.querySelector('.cm-rung__status').textContent = 'Revealed';
  if (text && !document.getElementById(`rung-content-${level}`)) {
    const el = document.createElement('div');
    el.className = 'cm-rung__content'; el.id = `rung-content-${level}`; el.textContent = text;
    rung.appendChild(el);
  }
}

// ── Persist ───────────────────────────────────────────────────────────────────
setInterval(() => {
  if (!currentProblem) return;
  saveProblemState();
}, 5000);

function saveProblemState() {
  if (!currentProblem) return;
  chrome.storage.local.set({
    [`prog_${currentProblem.url}`]: { hintsUsed, secondsElapsed, hintContents, lastUpdated: Date.now() },
    [`appr_${currentProblem.url}`]: storedApproaches
  });
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function showEl(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
function hideEl(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function setDot(parentId, state) {
  const dot = document.getElementById(parentId)?.querySelector('.cm-dot');
  if (dot) dot.className = `cm-dot cm-dot--${state}`;
}
function setStat(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setDiag(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setCheck(id, val) { const el = document.getElementById(id); if (el) el.checked = val; }

function toast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `cm-toast cm-toast--${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pad(n) { return String(n).padStart(2, '0'); }

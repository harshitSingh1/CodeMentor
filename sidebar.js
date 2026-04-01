/**
 * sidebar.js — CodeMentor AI Sidebar Logic (Enhanced)
 * 
 * NOTE ON API KEYS:
 * In v2.0, we migrated from client-side Gemini API calls to a central, 
 * stateless API Gateway (Featherless Backend). This removes the need for
 * users to input their own 'Google Gemini API key' in the extension UI,
 * significantly improving onboarding. Old references to user setup keys
 * have been cleaned up to prevent tech debt confusion.
 */

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
let lastProblemUrl = null; // Track problem URL changes

// Wraps chrome.runtime.sendMessage with lastError handling
function sendMsg(msg, cb) {
  chrome.runtime.sendMessage(msg, (resp) => {
    if (chrome.runtime.lastError) {
      console.warn('[CodeMentor]', chrome.runtime.lastError.message);
      cb({ success: false, error: 'Extension disconnected — reload the page.' });
      return;
    }
    cb(resp || {});
  });
}

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
  // Check if backend is healthy
  fetch('https://codementor-backend-ocuk.onrender.com/health')
    .then(res => res.json())
    .then(data => {
      console.log('Backend connected:', data);
      setDot('statusApi', 'on');
    })
    .catch(err => {
      console.warn('Backend not reachable:', err);
      setDot('statusApi', 'off');
    });

  chrome.storage.local.get(['consentGiven', 'settings'], (r) => {
    if (!r.consentGiven) {
      showEl('consentOverlay');
    }
    if (r.settings) Object.assign(settings, r.settings);
    applySettings();
  });

  document.getElementById('consentAccept').addEventListener('click', () => {
    chrome.storage.local.set({ consentGiven: true }, () => {
      hideEl('consentOverlay');
    });
  });

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

// ── Chat with Visualizations ──────────────────────────────────────────────────
function setupChat() {
  document.getElementById('sendMessage').addEventListener('click', sendMessage);
  document.getElementById('userInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('nudgeClose').addEventListener('click', () => hideEl('stuckNudge'));
  document.getElementById('explainBarClose').addEventListener('click', () => hideEl('explainBar'));
  document.getElementById('explainLinesBtn').addEventListener('click', explainSelectedCode);
  document.getElementById('analyzeCodeBtn').addEventListener('click', analyzeCurrentCode);

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

  // Add user message to UI and history BEFORE sending
  addUserMsg(text);
  input.value = '';
  hideEl('explainBar');

  const sendBtn = document.getElementById('sendMessage');
  sendBtn.disabled = true;
  showTyping();

  if (settings.mistakeRadarEnabled) runMistakeRadar(text);

  /**
   * ARCHITECTURE NOTE:
   * We send the ENTIRE chat history for context because our hosted proxy 
   * backend (Featherless Backend) is entirely stateless. 
   * It performs server-side token management, truncation, and database
   * routing securely without the client needing to hold an API key. 
   * This guarantees user privacy as we do not persist sessions in a DB.
   */
  console.log('[Sidebar] Sending message. Chat history length:', chatHistory.length);
  console.log('[Sidebar] Current problem:', currentProblem?.title);

  sendMsg({
    type: 'USER_QUERY',
    query: text,
    problemData: currentProblem,
    chatHistory: chatHistory
  }, (resp) => {
    hideTyping();
    sendBtn.disabled = false;

    if (resp?.success) {
      console.log('[Sidebar] Got response, adding AI message');
      addAIMsg(resp.reply);
      if (resp.approaches?.length) {
        storedApproaches = resp.approaches;
        saveProblemState();
        setStat('statApproaches', storedApproaches.length);
        buildComparatorTable(storedApproaches);
      }
    } else if (resp?.error) {
      console.error('[Sidebar] Error:', resp.error);
      addAIMsg(`⚠️ Error: ${resp.error}. Please try again.`);
    } else {
      addAIMsg("I couldn't process that. Please rephrase.");
    }
    setStat('statMessages', chatHistory.filter(m => m.role === 'user').length);
  });
}

function debugChatHistory() {
  console.log('=== Chat History Debug ===');
  console.log('Total messages:', chatHistory.length);
  chatHistory.forEach((msg, idx) => {
    console.log(`${idx + 1}. ${msg.role}: ${msg.content.substring(0, 100)}...`);
  });
  console.log('Current problem:', currentProblem?.title);
  console.log('=========================');
}

function detectAndGenerateVisual(text) {
  const algorithms = ['binary search', 'bubble sort', 'quick sort', 'merge sort', 'dfs', 'bfs', 'dijkstra'];
  const lowerText = text.toLowerCase();
  
  for (const algo of algorithms) {
    if (lowerText.includes(algo)) {
      sendMsg({
        type: 'GENERATE_VISUAL',
        algorithm: algo,
        type: 'flowchart'
      }, (resp) => {
        if (resp?.success && resp.steps) {
          addVisualizationCard(algo, resp);
        }
      });
      break;
    }
  }
}

function addVisualizationCard(algorithm, visualData) {
  const chat = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'cm-msg cm-msg--visualization';
  div.innerHTML = `
    <div class="cm-visualization-card">
      <div class="cm-visualization-header">
        <span>📊 ${algorithm.toUpperCase()} Visualization</span>
        <button class="cm-icon-btn" onclick="copyToClipboard(this)">📋</button>
      </div>
      <div class="cm-visualization-steps">
        ${visualData.steps?.map(s => `<div class="cm-step">${s}</div>`).join('') || ''}
      </div>
      <div class="cm-visualization-complexity">
        ${visualData.complexity || ''}
      </div>
    </div>
  `;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function analyzeCurrentCode() {
  // Get code from editor on the page
  const code = getCodeFromPage();
  if (!code) {
    addAIMsg("No code detected on the current page. Please write or paste code in the chat to analyze.");
    return;
  }
  
  addUserMsg("[Analyze my current code]");
  showTyping();
  
  sendMsg({ type: 'ANALYZE_CODE', code, language: 'javascript' }, (resp) => {
    hideTyping();
    if (resp?.success) {
      let analysis = `## 🔍 Code Analysis\n\n`;
      analysis += `**Time Complexity:** ${resp.timeComplexity || 'N/A'}\n`;
      analysis += `**Space Complexity:** ${resp.spaceComplexity || 'N/A'}\n\n`;
      if (resp.patterns?.length) {
        analysis += `**Patterns:** ${resp.patterns.join(', ')}\n\n`;
      }
      if (resp.suggestions?.length) {
        analysis += `**Suggestions:**\n${resp.suggestions.map(s => `- ${s}`).join('\n')}\n`;
      }
      addAIMsg(analysis);
    } else {
      addAIMsg("Could not analyze code. " + (resp?.error || ''));
    }
  });
}

function getCodeFromPage() {
  // Try to get code from various editors
  const selectors = [
    '.view-lines',           // LeetCode
    '.CodeMirror-code',      // CodeMirror
    '#sourceCodeTextarea',   // Codeforces
    '.monaco-editor .view-lines'
  ];
  
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      if (el.tagName === 'TEXTAREA') return el.value;
      return el.innerText;
    }
  }
  return null;
}

function runMistakeRadar(text) {
  sendMsg({ type: 'MISTAKE_RADAR', userText: text, platform: currentPlatform }, (resp) => {
    if (resp?.pitfalls?.length) {
      const chips = document.getElementById('radarChips');
      chips.innerHTML = resp.pitfalls.map(p => `<span class="cm-chip">⚠️ ${esc(p)}</span>`).join('');
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

  sendMsg({ type: 'EXPLAIN_LINES', code }, (resp) => {
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

  sendMsg({ type: 'HINT_LADDER', level, problemData: currentProblem }, (resp) => {
    const el = document.getElementById(`rung-content-${level}`);
    if (resp?.success && resp.hint) {
      hintContents[level] = resp.hint;
      hintsUsed++;
      if (el) { el.classList.remove('cm-skeleton'); el.style.height = ''; el.textContent = resp.hint; }
      rung.querySelector('.cm-rung__status').textContent = 'Revealed';
      rung.classList.remove('cm-rung--active');
      rung.classList.add('cm-rung--unlocked');
    } else {
      el?.remove();
      rung.className = 'cm-rung cm-rung--locked';
      rung.querySelector('.cm-rung__status').textContent = 'Locked';
      toast(resp?.error || 'Could not load hint, try again', 'error');
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
        currentProblem = null; currentPlatform = 'unknown';
        stuckNudgeShown = false;
        settings = { stuckEnabled: true, stuckThreshold: 15, mistakeRadarEnabled: true };

        pauseTimer(); resetHintRungs(); updateTimerDisplay(); applySettings();
        document.getElementById('chatMessages').innerHTML = '';
        document.getElementById('problemTitle').textContent = 'Detecting problem…';
        document.getElementById('difficulty').textContent = '';
        document.getElementById('mistakeRadar').style.display = 'none';
        document.getElementById('stuckNudge').style.display = 'none';
        document.getElementById('approachComparatorCard').style.display = 'none';
        updatePlatformBadge('unknown');
        setDot('statusApi', 'off'); setDot('statusParse', 'off'); setDot('statusTimer', 'off');

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
  sendMsg({
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
  sendMsg({
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
      toast(resp?.error || 'Could not generate summary', 'error');
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
      <td>${esc(a.idea || '')}</td>
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

function checkProblemChanged(newProblem) {
  if (!newProblem || !newProblem.url) return false;
  
  if (lastProblemUrl !== newProblem.url) {
    console.log('[Sidebar] Problem changed from', lastProblemUrl, 'to', newProblem.url);
    lastProblemUrl = newProblem.url;
    
    // Clear old chat history when problem changes
    if (chatHistory.length > 0) {
      chatHistory = [];
      document.getElementById('chatMessages').innerHTML = '';
      
      // Add a system message about problem change
      const systemMsg = document.createElement('div');
      systemMsg.className = 'cm-msg cm-msg--system';
      systemMsg.innerHTML = `<div class="cm-msg__bubble cm-msg__bubble--system">
        🔄 Problem changed to <strong>${newProblem.title || 'new problem'}</strong>. Previous context cleared.
      </div>`;
      document.getElementById('chatMessages').appendChild(systemMsg);
    }
    
    return true;
  }
  return false;
}

function onProblemData(data) {
  if (!data) return;
  
  // Check if problem changed
  const problemChanged = checkProblemChanged(data);
  
  if (problemChanged || !currentProblem || currentProblem.url !== data.url) {
    // Reset all state for new problem
    hintsUsed = 0;
    hintContents = {};
    storedApproaches = [];
    stuckNudgeShown = false;
    secondsElapsed = 0;
    
    pauseTimer();
    updateTimerDisplay();
    resetHintRungs();
    
    document.getElementById('mistakeRadar').style.display = 'none';
    document.getElementById('stuckNudge').style.display = 'none';
    document.getElementById('approachComparatorCard').style.display = 'none';
    
    // Reset stats display
    document.getElementById('hintsUsed').textContent = '0';
    setStat('statHints', 0);
    setStat('statApproaches', 0);
  }

  currentProblem = data;
  currentPlatform = data.platform || 'unknown';

  document.getElementById('problemTitle').textContent = data.title || 'Unknown Problem';
  setDifficultyBadge(data.difficulty || '');
  updatePlatformBadge(currentPlatform);

  const parsed = !!(data.title || data.description);
  setDot('statusParse', parsed ? 'on' : 'off');
  setDiag('diagPlatform', currentPlatform || '—');
  setDiag('diagPageType', /\/(problems?|challenges?|contest[^/]*\/problem)/i.test(data.url || '') ? 'problem' : 'other');
  setDiag('diagTitleLen', `${(data.title || '').length} chars`);
  setDiag('diagStmtLen', `${(data.fullProblemText || data.description || '').length} chars`);
  setDiag('diagTimestamp', new Date().toLocaleTimeString());
  setDiag('diagError', '—');

  // Only add welcome message for new problem
  if (problemChanged) {
    addAIMsg(parsed
      ? `🎯 I see you're working on **${data.title || 'this problem'}**. What's your initial thought process?`
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

// Enhanced AI response formatting
function formatAIResponse(text) {
  if (!text) return '';
  
  let formatted = text;
  
  // Remove any raw JSON that might be showing
  formatted = formatted.replace(/```json\s*\{[\s\S]*?\}\s*```/g, '');
  formatted = formatted.replace(/^\{\s*"reply":\s*"/, '');
  formatted = formatted.replace(/"\s*\}$/, '');
  
  // Format headings
  formatted = formatted.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  formatted = formatted.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  formatted = formatted.replace(/^# (.*$)/gm, '<h1>$1</h1>');
  
  // Format approach sections
  formatted = formatted.replace(/\*\*(\d+\.\s*[^*]+)\*\*/g, (match, content) => {
    return `<div class="cm-approach-card">
      <div class="cm-approach-header">
        <span class="cm-approach-icon">💡</span>
        <span class="cm-approach-name">${esc(content)}</span>
      </div>`;
  });
  
  // Close approach cards
  formatted = formatted.replace(/(Time: O\([^)]+\))/g, '<span class="cm-complexity-badge cm-complexity-good">⏱️ $1</span>');
  formatted = formatted.replace(/(Space: O\([^)]+\))/g, '<span class="cm-complexity-badge cm-complexity-good">💾 $1</span>');
  
  // Format code blocks
  formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<div class="cm-code-block">
      <div class="cm-code-header">
        <span>${lang || 'code'}</span>
        <button class="cm-copy-btn" onclick="copyCode(this)">📋 Copy</button>
      </div>
      <div class="cm-code-content"><pre><code>${esc(code.trim())}</code></pre></div>
    </div>`;
  });
  
  // Format inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Format bold
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Format lists
  formatted = formatted.replace(/^[-*] (.*)$/gm, '<li>$1</li>');
  formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // Format line breaks
  formatted = formatted.replace(/\n/g, '<br>');
  
  return formatted;
}

// Add copy code function
window.copyCode = function(btn) {
  const codeBlock = btn.closest('.cm-code-block').querySelector('.cm-code-content code');
  const text = codeBlock.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const originalText = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = originalText; }, 2000);
  });
};

function addAIMsg(text) {
  const html = formatAIResponse(text);
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

// Global function for copy button
window.copyToClipboard = function(btn) {
  const card = btn.closest('.cm-visualization-card');
  const text = card.innerText;
  navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success'));
};
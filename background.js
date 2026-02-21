// background.js — CodeMentor AI Service Worker

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      settings: { autoAnalyze: true, stuckEnabled: true, stuckThreshold: 15, mistakeRadarEnabled: true },
      stats: { problemsHelped: 0, hintsGiven: 0 }
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get('geminiApiKey', (r) => resolve(r.geminiApiKey || ''));
  });
}

async function callGemini(prompt) {
  const key = await getApiKey();
  if (!key) throw new Error('NO_API_KEY');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

  let attempt = 0;
  while (attempt < 3) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    if (resp.status === 429 || resp.status >= 500) {
      attempt++;
      await new Promise(r => setTimeout(r, 1000 * attempt));
      continue;
    }

    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || 'Gemini API error');

    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    return text;
  }
  throw new Error('Gemini: max retries exceeded');
}

// ── Message router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = {
    USER_QUERY:          () => handleUserQuery(msg, sendResponse),
    HINT_LADDER:         () => handleHintLadder(msg, sendResponse),
    APPROACH_COMPARATOR: () => handleApproachComparator(msg, sendResponse),
    MISTAKE_RADAR:       () => handleMistakeRadar(msg, sendResponse),
    EXPLAIN_LINES:       () => handleExplainLines(msg, sendResponse),
    SESSION_SUMMARY:     () => handleSessionSummary(msg, sendResponse),
    STUCK_NUDGE:         () => handleStuckNudge(msg, sendResponse),
    // Legacy handlers kept for backwards compat
    REQUEST_HINT:        () => handleHintLadder({ ...msg, level: msg.hintLevel || 1 }, sendResponse),
    GET_STORAGE:         () => { chrome.storage.local.get(msg.keys, sendResponse); },
    SAVE_DATA:           () => { chrome.storage.local.set(msg.data, () => sendResponse({ success: true })); },
    SAVE_API_KEY:        () => { chrome.storage.local.set({ geminiApiKey: msg.key }, () => sendResponse({ success: true })); },
    CHECK_API_KEY:       () => { getApiKey().then(k => sendResponse({ hasKey: !!k })); },
  };

  const fn = handlers[msg.type];
  if (fn) { fn(); return true; }
});

// ── Feature handlers ──────────────────────────────────────────────────────────

async function handleUserQuery(msg, sendResponse) {
  try {
    const problem = msg.problemData || {};
    const prompt = `You are an elite DSA mentor. Teach thinking, not copying. Never give full solutions or full code.

PROBLEM:
${problem.fullProblemText || problem.description || 'Not provided'}

CHAT HISTORY:
${(msg.chatHistory || []).map(m => `${m.role}: ${m.content}`).join('\n')}

USER: ${msg.query}

Return VALID JSON only — no text outside JSON:
{
  "reply": "Mentor explanation. Use sections like \\n🔹 Label\\n for structure.",
  "approaches": [
    {"name":"...", "intuition":"...", "steps":"...", "time":"O(...)", "space":"O(...)", "example":"..."}
  ]
}

Generate at least 2 approaches. No complete code solutions.`;

    const raw = await callGemini(prompt);
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { parsed = { reply: raw, approaches: [] }; }
    if (!Array.isArray(parsed.approaches)) parsed.approaches = [];
    sendResponse({ success: true, reply: parsed.reply || '', approaches: parsed.approaches });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function handleHintLadder(msg, sendResponse) {
  try {
    const { level, problemData } = msg;
    const levelLabels = ['', 'Intuition (tiny nudge)', 'Approach outline', 'Key observation', 'Pseudo-code (no full code)'];
    const prompt = `You are a DSA mentor providing a LEVEL ${level} hint (${levelLabels[level] || ''}).
Problem: ${problemData?.fullProblemText || problemData?.description || 'Unknown'}
Rules: No full code. No complete algorithm. Just the hint for level ${level}.
Return ONLY the hint text (plain text, no JSON, no markdown headers).`;
    const hint = await callGemini(prompt);
    sendResponse({ success: true, hint: hint.trim() });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function handleApproachComparator(msg, sendResponse) {
  try {
    const problem = msg.problemData || {};
    const prompt = `You are a DSA expert. Compare 2-3 approaches for this problem.
Problem: ${problem.fullProblemText || problem.description || 'Unknown'}
Return VALID JSON array only (no other text):
[{"name":"...","idea":"1-sentence idea","time":"O(...)","space":"O(...)","pitfalls":"common mistake","when":"when to use"}]
No full code. 2-3 approaches max.`;
    const raw = await callGemini(prompt);
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { parsed = []; }
    if (!Array.isArray(parsed)) parsed = [];
    sendResponse({ success: true, comparisons: parsed });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function handleMistakeRadar(msg, sendResponse) {
  try {
    const { userText, platform } = msg;
    const prompt = `DSA pitfall detector. Analyze this text for common mistakes.
Platform: ${platform}
Text: ${userText}
Return JSON array of pitfall names only (max 5, short labels like "Off-by-one"):
["Pitfall 1", "Pitfall 2"]
Common ones: Off-by-one, Integer overflow, Null pointer, Stack overflow, Wrong base case, Infinite loop, Empty input, Modulo error, Wrong invariant`;
    const raw = await callGemini(prompt);
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { parsed = []; }
    if (!Array.isArray(parsed)) parsed = [];
    sendResponse({ success: true, pitfalls: parsed.slice(0, 5) });
  } catch (e) {
    sendResponse({ success: false, pitfalls: [] });
  }
}

async function handleExplainLines(msg, sendResponse) {
  try {
    const { code } = msg;
    const lines = code.trim().split('\n');
    if (lines.length > 30) {
      sendResponse({ success: false, error: 'Snippet too long (max 30 lines)' });
      return;
    }
    const prompt = `Explain this code snippet line-by-line for a DSA learner.
Do NOT rewrite or provide a solution. Just explain what each line does.
Code:
${code}
Return plain text with "Line N: explanation" format.`;
    const explanation = await callGemini(prompt);
    sendResponse({ success: true, explanation: explanation.trim() });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function handleSessionSummary(msg, sendResponse) {
  try {
    const { problem, chatHistory, hintsRevealed, approaches, timeElapsed } = msg;
    const prompt = `Create a concise DSA session summary in markdown.
Problem: ${problem?.title || 'Unknown'} (${problem?.platform || ''})
Time: ${Math.floor((timeElapsed || 0) / 60)} minutes | Hints: ${hintsRevealed} | Messages: ${chatHistory?.length || 0}
Approaches: ${approaches?.map(a => a.name).join(', ') || 'None'}
Chat highlights:
${(chatHistory || []).slice(-6).map(m => `${m.role}: ${m.content.slice(0, 120)}`).join('\n')}

Write markdown with sections: ## Problem, ## Approaches Explored, ## Key Insights, ## Pitfalls to Watch, ## Next Steps`;
    const summary = await callGemini(prompt);
    sendResponse({ success: true, summary: summary.trim() });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function handleStuckNudge(msg, sendResponse) {
  try {
    const problem = msg.problemData || {};
    const prompt = `A student is stuck on a DSA problem for ${msg.minutes || 15} minutes.
Problem: ${problem.title || 'Unknown'} — ${(problem.fullProblemText || '').slice(0, 300)}
Generate ONE short guiding question (1-2 sentences) that nudges without spoiling.
Ask about constraints, edge cases, or data structures. Return plain text only.`;
    const nudge = await callGemini(prompt);
    sendResponse({ success: true, nudge: nudge.trim() });
  } catch (e) {
    sendResponse({ success: false, nudge: 'Have you considered all edge cases and constraints?' });
  }
}

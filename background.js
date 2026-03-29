// background.js — CodeMentor AI Service Worker with Featherless Backend

const BACKEND_URL = 'https://codementor-backend-ocuk.onrender.com/api';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      settings: { autoAnalyze: true, stuckEnabled: true, stuckThreshold: 15, mistakeRadarEnabled: true },
      stats: { problemsHelped: 0, hintsGiven: 0 }
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' }, () => {
    void chrome.runtime.lastError;
  });
});

// Helper: Call backend API
async function callBackend(endpoint, data) {
  console.log(`[Background] Calling ${endpoint} with:`, { ...data, chatHistory: data.chatHistory?.length || 0 });
  
  const response = await fetch(`${BACKEND_URL}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`[Background] Backend error:`, error);
    throw new Error(`Backend error (${response.status}): ${error}`);
  }
  
  const result = await response.json();
  console.log(`[Background] Response from ${endpoint}:`, { success: result.success, replyLength: result.reply?.length });
  return result;
}

// Message router
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[Background] Received message:', msg.type);
  
  const handlers = {
    USER_QUERY: () => handleUserQuery(msg, sendResponse),
    HINT_LADDER: () => handleHintLadder(msg, sendResponse),
    APPROACH_COMPARATOR: () => handleApproachComparator(msg, sendResponse),
    MISTAKE_RADAR: () => handleMistakeRadar(msg, sendResponse),
    EXPLAIN_LINES: () => handleExplainLines(msg, sendResponse),
    SESSION_SUMMARY: () => handleSessionSummary(msg, sendResponse),
    STUCK_NUDGE: () => handleStuckNudge(msg, sendResponse),
    ANALYZE_CODE: () => handleAnalyzeCode(msg, sendResponse),
    GENERATE_VISUAL: () => handleGenerateVisual(msg, sendResponse),
    GET_STORAGE: () => { chrome.storage.local.get(msg.keys, sendResponse); return true; },
    SAVE_DATA: () => { chrome.storage.local.set(msg.data, () => sendResponse({ success: true })); return true; }
  };

  const fn = handlers[msg.type];
  if (fn) { fn(); return true; }
  return false;
});

// Handlers with proper context
async function handleUserQuery(msg, sendResponse) {
  try {
    console.log('[Background] Processing user query:', msg.query);
    console.log('[Background] Chat history length:', msg.chatHistory?.length);
    
    // Ensure we're sending the full chat history for context
    const result = await callBackend('chat', {
      query: msg.query,
      problemData: msg.problemData,
      chatHistory: msg.chatHistory || []  // Make sure this is sent
    });
    
    sendResponse({ success: true, reply: result.reply, approaches: result.approaches || [] });
  } catch (error) {
    console.error('[Background] UserQuery error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleHintLadder(msg, sendResponse) {
  try {
    const result = await callBackend('hint', {
      level: msg.level,
      problemData: msg.problemData
    });
    sendResponse({ success: true, hint: result.hint });
  } catch (error) {
    console.error('[Background] Hint error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleApproachComparator(msg, sendResponse) {
  try {
    const result = await callBackend('compare-approaches', {
      problemData: msg.problemData
    });
    sendResponse({ success: true, comparisons: result.comparisons || [] });
  } catch (error) {
    console.error('[Background] Compare error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleMistakeRadar(msg, sendResponse) {
  try {
    const result = await callBackend('mistake-radar', {
      code: msg.code || msg.userText,
      userText: msg.userText,
      platform: msg.platform
    });
    sendResponse({ success: true, pitfalls: result.pitfalls || [] });
  } catch (error) {
    console.error('[Background] Mistake radar error:', error);
    sendResponse({ success: false, pitfalls: [] });
  }
}

async function handleExplainLines(msg, sendResponse) {
  try {
    const result = await callBackend('analyze-code', {
      code: msg.code,
      language: 'javascript'
    });
    const explanation = formatCodeExplanation(result, msg.code);
    sendResponse({ success: true, explanation });
  } catch (error) {
    console.error('[Background] Explain error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSessionSummary(msg, sendResponse) {
  try {
    const result = await callBackend('session-summary', {
      problem: msg.problem,
      chatHistory: msg.chatHistory,
      hintsRevealed: msg.hintsRevealed,
      approaches: msg.approaches,
      timeElapsed: msg.timeElapsed
    });
    sendResponse({ success: true, summary: result.summary });
  } catch (error) {
    console.error('[Background] Session summary error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleStuckNudge(msg, sendResponse) {
  try {
    const result = await callBackend('stuck-nudge', {
      minutes: msg.minutes,
      problemData: msg.problemData
    });
    sendResponse({ success: true, nudge: result.nudge });
  } catch (error) {
    console.error('[Background] Stuck nudge error:', error);
    sendResponse({ success: false, nudge: 'Have you considered all edge cases and constraints?' });
  }
}

async function handleAnalyzeCode(msg, sendResponse) {
  try {
    const result = await callBackend('analyze-code', {
      code: msg.code,
      language: msg.language || 'javascript'
    });
    sendResponse({ success: true, ...result });
  } catch (error) {
    console.error('[Background] Analyze code error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGenerateVisual(msg, sendResponse) {
  try {
    const result = await callBackend('generate-visual', {
      algorithm: msg.algorithm,
      data: msg.data,
      type: msg.type
    });
    sendResponse({ success: true, ...result });
  } catch (error) {
    console.error('[Background] Generate visual error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function formatCodeExplanation(analysis, code) {
  const lines = code.split('\n');
  let explanation = '## 📝 Code Analysis\n\n';
  
  explanation += `**Time Complexity:** ${analysis.timeComplexity || 'Not determined'}\n`;
  explanation += `**Space Complexity:** ${analysis.spaceComplexity || 'Not determined'}\n\n`;
  
  if (analysis.patterns && analysis.patterns.length) {
    explanation += `**📚 Patterns Detected:** ${analysis.patterns.join(', ')}\n\n`;
  }
  
  if (analysis.suggestions && analysis.suggestions.length) {
    explanation += `**💡 Suggestions:**\n`;
    analysis.suggestions.forEach(s => explanation += `- ${s}\n`);
    explanation += '\n';
  }
  
  return explanation;
}
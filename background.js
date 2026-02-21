// background.js - Service Worker

console.log('CodeMentor AI Background Service Started');

// Listen for when extension is installed
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('CodeMentor AI installed for the first time');
    
    // Initialize default settings
    chrome.storage.local.set({
      settings: {
        autoAnalyze: true,
        hintLevel: 'gentle', // gentle, moderate, detailed
        darkMode: false,
        totalSessions: 0
      },
      stats: {
        problemsHelped: 0,
        hintsGiven: 0
      }
    });
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received:', message);

  // Handle AI chat
if (message.type === 'USER_QUERY') {
  handleUserQuery(message, sendResponse);
  return true; // async response
}

// Handle hint request
if (message.type === 'REQUEST_HINT') {
  handleHintRequest(message, sendResponse);
  return true;
}
  
  if (message.type === 'ANALYZE_PROBLEM') {
    // We'll handle problem analysis here later
    handleProblemAnalysis(message.data, sender.tab.id);
  }
  
  if (message.type === 'GET_STORAGE') {
    chrome.storage.local.get(message.keys, (result) => {
      sendResponse(result);
    });
    return true; // Required for async response
  }
  
  if (message.type === 'SAVE_DATA') {
    chrome.storage.local.set(message.data, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Handle analysis requests
async function handleProblemAnalysis(problemData, tabId) {
  console.log('Analyzing problem:', problemData);
  
  // Show badge to indicate processing
  chrome.action.setBadgeText({ text: '...', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
  
  try {
    // We'll add actual AI analysis here later
    // For now, just send a mock response
    const mockAnalysis = {
      intuition: "This problem can be solved using a two-pointer approach...",
      approaches: [
        "Brute Force: Check all pairs O(n²)",
        "Optimized: Use hash map O(n)"
      ],
      hints: ["Think about using a hash map to store complements"]
    };
    
    // Send analysis back to content script
    chrome.tabs.sendMessage(tabId, {
      type: 'ANALYSIS_COMPLETE',
      data: mockAnalysis
    });
    
    // Update badge
    chrome.action.setBadgeText({ text: '✓', tabId });
    
    // Clear badge after 3 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '', tabId });
    }, 3000);
    
  } catch (error) {
    console.error('Analysis failed:', error);
    
    // Show error badge
    chrome.action.setBadgeText({ text: '!', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#F44336', tabId });
  }
}

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Send message to content script to toggle sidebar
  chrome.tabs.sendMessage(tab.id, {
    type: 'TOGGLE_SIDEBAR'
  });
});

// ================= GEMINI CONFIG =================

// 🔴 PASTE YOUR GEMINI API KEY HERE
const GEMINI_API_KEY = "";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
  GEMINI_API_KEY;


// ================= USER QUERY =================

async function handleUserQuery(message, sendResponse) {
  try {
    const problem = message.problemData || {};

    let prompt = `
You are an elite DSA mentor and competitive programmer.

STYLE:
- Visual, structured, clear, and engaging
- Use bullet points and short sections
- Avoid long paragraphs
- Teach thinking, not copying
- Never reveal full solution unless user explicitly asks

GOALS:
- Help user START thinking
- Explain intuition visually
- Suggest multiple approaches
- Highlight patterns (HashMap, DP, Sliding Window, etc.)
- Mention edge cases
- Keep it simple but insightful

PROBLEM:
${problem.fullProblemText || problem.description || "Not available"}

CHAT HISTORY:
${(message.chatHistory || [])
  .map(m => `${m.role}: ${m.content}`)
  .join("\n")}

USER MESSAGE:
${message.query}

REFERENCE SOLUTIONS (for internal reasoning only — DO NOT reveal directly):
${(problem.scrapedSolutions || []).slice(0, 3).join("\n\n")}

IMPORTANT:

ALWAYS RETURN VALID JSON.
NO MARKDOWN. NO EXPLANATION OUTSIDE JSON.

RESPONSE FORMAT:

{
  "reply": "Structured mentor explanation using sections like:\\n\\n🔹 Idea\\n🔹 How to start\\n🔹 Key insight\\n🔹 Edge cases",
  "approaches": [
    {
      "name": "Approach name",
      "intuition": "Simple intuitive reasoning",
      "steps": "Short step-by-step logic",
      "time": "O(...)",
      "space": "O(...)",
      "example": "Small walkthrough example",
      "code": "Optional short clean snippet"
    }
  ]
}

ALWAYS GENERATE AT LEAST 2 APPROACHES.
`;

    // If user explicitly asked for solving / approach → strengthen requirement
    if (message.forceApproach) {
      prompt += `
User is asking for solving guidance.
Generate clear structured approaches with intuition and example.
`;
    }

    const raw = await callGemini(prompt);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn("JSON parse failed, fallback used:", raw);
      parsed = {
        reply: raw || "I couldn't structure the response properly.",
        approaches: []
      };
    }

    // Guarantee array safety
    if (!Array.isArray(parsed.approaches)) {
      parsed.approaches = [];
    }

    sendResponse({
      success: true,
      reply: parsed.reply || "No explanation generated.",
      approaches: parsed.approaches
    });

  } catch (error) {
    console.error("Gemini error:", error);
    sendResponse({ success: false });
  }
}


// ================= HINT REQUEST =================

async function handleHintRequest(message, sendResponse) {
  try {
    const level = message.hintLevel;
    const problem = message.problemData || {};

    const hintPrompt = `
You are a DSA mentor giving progressive hints.

LEVEL ${level}:

1 → Tiny push
2 → Approach direction
3 → Strong hint (still no full solution)

Problem:
${problem.fullProblemText || problem.description}

Return ONLY the hint text.
`;

    const hint = await callGemini(hintPrompt);
    sendResponse({ hint });

  } catch (error) {
    console.error(error);
    sendResponse({ hint: "Couldn't generate hint." });
  }
}


// ================= GEMINI CALL =================

async function callGemini(prompt) {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  const data = await response.json();

  // 🔴 Show full Gemini error in console (IMPORTANT)
  if (!response.ok) {
    console.error("Gemini API Error:", data);
    throw new Error(data?.error?.message || "Gemini API failed");
  }

  console.log("Gemini RAW response:", data); // debug once

  let text =
  data?.candidates?.[0]?.content?.parts?.[0]?.text ||
  "No text generated by Gemini.";

// Remove markdown code blocks if present
text = text.replace(/```json/g, "")
           .replace(/```/g, "")
           .trim();

return text;
}
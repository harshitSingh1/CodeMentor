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
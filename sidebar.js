// sidebar.js - Sidebar functionality

// Global variables
let currentProblem = null;
let currentPlatform = 'unknown';
let hintsUsed = 0;
const MAX_HINTS = 3;
let timerInterval = null;
let secondsElapsed = 0;
let isTimerRunning = false;
let chatHistory = [];

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('CodeMentor AI Sidebar Initialized');
    initializeSidebar();
    setupEventListeners();
    setupMessageListener();
});

// Initialize sidebar components
function initializeSidebar() {
    updatePlatformBadge('unknown');
    loadSavedData();

    // Show consent overlay on first use; hide it if already acknowledged.
    chrome.storage.local.get('consentGiven', (result) => {
        if (!result.consentGiven) {
            document.getElementById('consentOverlay').style.display = 'flex';
        } else {
            document.getElementById('consentOverlay').style.display = 'none';
            document.getElementById('userInput').focus();
        }
    });
}

// Setup all event listeners
function setupEventListeners() {
    // Close button
    document.getElementById('closeSidebar').addEventListener('click', () => {
        window.parent.postMessage({ type: 'TOGGLE_SIDEBAR' }, '*');
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchTab(e.target.dataset.tab);
        });
    });

    // Send message
    document.getElementById('sendMessage').addEventListener('click', sendUserMessage);
    
    // Enter key to send (but Shift+Enter for new line)
    document.getElementById('userInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendUserMessage();
        }
    });

    // Hint button
    document.getElementById('requestHint').addEventListener('click', requestHint);

    // Timer controls
    document.getElementById('startTimer').addEventListener('click', startTimer);
    document.getElementById('pauseTimer').addEventListener('click', pauseTimer);
    document.getElementById('resetTimer').addEventListener('click', resetTimer);

    // Consent overlay accept
    document.getElementById('consentAccept').addEventListener('click', () => {
        chrome.storage.local.set({ consentGiven: true }, () => {
            document.getElementById('consentOverlay').style.display = 'none';
            document.getElementById('userInput').focus();
        });
    });

    // Clear all local data.
    // confirm() is blocked in cross-origin iframes (Chrome v92+), so we use a
    // two-tap pattern: first click arms the button, second click executes.
    const clearBtn = document.getElementById('clearData');
    let clearArmed = false;
    let clearArmTimer = null;

    clearBtn.addEventListener('click', () => {
        if (!clearArmed) {
            clearArmed = true;
            clearBtn.textContent = 'Tap again to confirm';
            clearBtn.classList.add('clear-data-btn--armed');
            clearArmTimer = setTimeout(() => {
                clearArmed = false;
                clearBtn.textContent = 'Clear all my data';
                clearBtn.classList.remove('clear-data-btn--armed');
            }, 3000);
            return;
        }

        clearTimeout(clearArmTimer);
        clearArmed = false;
        clearBtn.textContent = 'Clear all my data';
        clearBtn.classList.remove('clear-data-btn--armed');

        chrome.storage.local.clear(() => {
            hintsUsed = 0;
            secondsElapsed = 0;
            chatHistory = [];
            pauseTimer();
            updateHintsUsed();
            updateTimerDisplay();
            document.getElementById('chatMessages').innerHTML = '';
            document.getElementById('consentOverlay').style.display = 'flex';
        });
    });
}

// Listen for messages from the host page (content.js via postMessage).
// We verify that the message comes from window.parent (the tab, where content.js
// injected the iframe) to prevent a malicious sub-frame from spoofing messages.
function setupMessageListener() {
    window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;

        console.log('Sidebar received:', event.data);

        switch (event.data.type) {
            case 'PLATFORM_INFO':
                handlePlatformInfo(event.data);
                break;
            case 'PROBLEM_DATA':
                handleProblemData(event.data.data);
                break;
            case 'ANALYSIS_RESULT':
                handleAnalysisResult(event.data.data);
                break;
        }
    });
}

// Handle platform information
function handlePlatformInfo(data) {
    currentPlatform = data.platform;
    updatePlatformBadge(data.platform);
}

// Handle problem data
function handleProblemData(data) {
    currentProblem = data;

    document.getElementById('problemTitle').textContent = data.title || 'Unknown Problem';

    // Difficulty is scraped on the host page (by platforms/*.js) and passed here
    // as data.difficulty. We cannot query the host page DOM from inside the iframe.
    document.getElementById('difficulty').textContent = data.difficulty || 'Unknown';

    addAIMessage(`I see you're working on "${data.title}". What's your initial thought on how to approach this?`);
}

// Update platform badge
function updatePlatformBadge(platform) {
    const badge = document.getElementById('platformBadge');
    badge.textContent = platform.charAt(0).toUpperCase() + platform.slice(1);
    
    // Change color based on platform
    const colors = {
        leetcode: '#f89f1b',
        codeforces: '#3182ce',
        hackerrank: '#00b551',
        codechef: '#5b4638',
        unknown: '#64748b'
    };
    badge.style.background = colors[platform] || colors.unknown;
    badge.style.color = 'white';
}

// Handle AI analysis results
function handleAnalysisResult(data) {
    console.log('Analysis received:', data);
    
    // Show intuition
    if (data.intuition) {
        document.getElementById('intuitionText').textContent = data.intuition;
        document.getElementById('intuitionBox').style.display = 'block';
    }
    
    // Show approaches
    if (data.approaches) {
        displayApproaches(data.approaches);
    }
    
    // Add AI response to chat
    if (data.explanation) {
        addAIMessage(data.explanation);
    }
    
    // Update unlock progress
    updateUnlockProgress();
}

// Display approaches in Approaches tab
function displayApproaches(approaches) {
    const approachesList = document.getElementById('approachesList');
    
    if (!approaches || approaches.length === 0) {
        approachesList.innerHTML = '<div class="loading-spinner">No approaches available yet. Try discussing with AI first.</div>';
        return;
    }
    
    // All values from the AI response are escaped before being inserted as HTML
    // to prevent XSS if the AI returns unexpected content.
    let html = '';
    approaches.forEach((approach, index) => {
        const name           = escapeHtml(approach.name           || 'Solution');
        const timeComplexity = escapeHtml(approach.timeComplexity || 'N/A');
        const spaceComplexity= escapeHtml(approach.spaceComplexity|| 'N/A');
        const description    = escapeHtml(approach.description    || '');
        const source         = approach.source ? escapeHtml(approach.source) : '';

        html += `
            <div class="approach-card">
                <h4>Approach ${index + 1}: ${name}</h4>
                <div class="complexity">
                    <span class="time">⏱️ Time: ${timeComplexity}</span>
                    <span class="space">💾 Space: ${spaceComplexity}</span>
                </div>
                <p class="description">${description}</p>
                ${source ? `<span class="source-badge">📚 Source: ${source}</span>` : ''}
            </div>
        `;
    });

    approachesList.innerHTML = html;
    document.getElementById('approachesCount').textContent = approaches.length;
}

// Send user message
function sendUserMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message to chat
    addUserMessage(message);
    
    // Clear input
    input.value = '';
    
    // Disable send button temporarily
    const sendBtn = document.getElementById('sendMessage');
    sendBtn.disabled = true;
    
    // Show typing indicator
    showTypingIndicator();
    
    // Send to background for AI processing
    chrome.runtime.sendMessage({
        type: 'USER_QUERY',
        query: message,
        problemData: currentProblem,
        chatHistory: chatHistory.slice(-10) // Last 10 messages for context
    }, (response) => {
        // Hide typing indicator
        hideTypingIndicator();
        
        // Re-enable send button
        sendBtn.disabled = false;
        
        if (response && response.success) {
            addAIMessage(response.reply);
            
            // Update approaches if provided
            if (response.approaches) {
                displayApproaches(response.approaches);
            }
            
            // Update unlock progress
            updateUnlockProgress();
        } else {
            addAIMessage("I'm having trouble processing that. Could you please rephrase?");
        }
    });
}

// Request a hint
function requestHint() {
    if (hintsUsed >= MAX_HINTS) {
        addAIMessage("You've used all your hints for this problem. Try to solve it now!");
        return;
    }
    
    hintsUsed++;
    updateHintsUsed();
    
    // Disable hint button
    document.getElementById('requestHint').disabled = true;
    
    // Request hint from AI
    chrome.runtime.sendMessage({
        type: 'REQUEST_HINT',
        problemData: currentProblem,
        hintLevel: hintsUsed // Level 1, 2, or 3
    }, (response) => {
        document.getElementById('requestHint').disabled = false;
        
        if (response && response.hint) {
            displayHint(response.hint);
        }
    });
}

// Display a hint
function displayHint(hintText) {
    const hintsList = document.getElementById('hintsList');
    
    const hintElement = document.createElement('div');
    hintElement.className = 'hint-item';
    hintElement.textContent = `Hint ${hintsUsed}: ${hintText}`;
    
    hintsList.appendChild(hintElement);
    
    // Also show in chat
    addAIMessage(`💡 Hint ${hintsUsed}: ${hintText}`);
    
    // Update total hints in progress tab
    document.getElementById('totalHints').textContent = hintsUsed;
}

// Update hints used display
function updateHintsUsed() {
    document.getElementById('hintsUsed').textContent = hintsUsed;
    
    // Update dots
    for (let i = 1; i <= MAX_HINTS; i++) {
        const dot = document.getElementById(`dot${i}`);
        if (i <= hintsUsed) {
            dot.classList.add('used');
        } else {
            dot.classList.remove('used');
        }
    }
}

// Add user message to chat
function addUserMessage(text) {
    const chatMessages = document.getElementById('chatMessages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    messageDiv.innerHTML = `
        <div class="avatar">👤</div>
        <div class="message-content">
            <p>${escapeHtml(text)}</p>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Add to chat history
    chatHistory.push({ role: 'user', content: text });
}

// Add AI message to chat
function addAIMessage(text) {
    const chatMessages = document.getElementById('chatMessages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai-message';
    messageDiv.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="message-content">
            <p>${escapeHtml(text)}</p>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Add to chat history
    chatHistory.push({ role: 'assistant', content: text });
}

// Show typing indicator
function showTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    
    const indicator = document.createElement('div');
    indicator.id = 'typingIndicator';
    indicator.className = 'message ai-message';
    indicator.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="message-content">
            <p>Typing<span class="dot-animation">...</span></p>
        </div>
    `;
    
    chatMessages.appendChild(indicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Hide typing indicator
function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

// Timer functions
function startTimer() {
    if (!isTimerRunning) {
        isTimerRunning = true;
        timerInterval = setInterval(updateTimer, 1000);
    }
}

function pauseTimer() {
    isTimerRunning = false;
    clearInterval(timerInterval);
}

function resetTimer() {
    pauseTimer();
    secondsElapsed = 0;
    updateTimerDisplay();
}

function updateTimer() {
    secondsElapsed++;
    updateTimerDisplay();
    
    // Smart check: if time is running out (>30 min), offer hint
    if (secondsElapsed > 1800 && hintsUsed < MAX_HINTS) { // 30 minutes
        addAIMessage("You've been working on this for 30 minutes. Would you like a hint to help you progress?");
        pauseTimer(); // Pause to avoid spam
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(secondsElapsed / 60);
    const seconds = secondsElapsed % 60;
    document.getElementById('timer').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('timeOnProblem').textContent = `${minutes} min`;
}

// Switch between tabs
function switchTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    
    // Update tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    document.getElementById(`${tabId}Tab`).classList.add('active');
}

// Update solutions tab unlock progress
function updateUnlockProgress() {
    // Calculate progress based on hints used and chat interaction
    const chatProgress = Math.min(chatHistory.length * 10, 50); // Up to 50% from chat
    const hintProgress = hintsUsed * 15; // Up to 45% from hints
    const totalProgress = Math.min(chatProgress + hintProgress, 100);
    
    document.getElementById('unlockProgress').style.width = `${totalProgress}%`;
    
    // Unlock at 100%
    if (totalProgress >= 100) {
        document.querySelector('.status-lock').innerHTML = '🔓 Solutions Tab Unlocked!';
        document.querySelector('.status-lock').style.color = '#48bb78';
        
        // Notify parent to unlock solutions tab
        window.parent.postMessage({ 
            type: 'UNLOCK_SOLUTIONS',
            unlocked: true 
        }, '*');
    }
}

// Load saved data from storage
function loadSavedData() {
    chrome.storage.local.get(['hintsUsed', 'secondsElapsed'], (result) => {
        if (result.hintsUsed) {
            hintsUsed = result.hintsUsed;
            updateHintsUsed();
        }
        if (result.secondsElapsed) {
            secondsElapsed = result.secondsElapsed;
            updateTimerDisplay();
        }
    });
}

// Save data to storage periodically
setInterval(() => {
    chrome.storage.local.set({
        hintsUsed: hintsUsed,
        secondsElapsed: secondsElapsed
    });
}, 5000);

// Helper: Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Handle window unload
window.addEventListener('beforeunload', () => {
    pauseTimer();
    chrome.storage.local.set({
        hintsUsed: hintsUsed,
        secondsElapsed: secondsElapsed,
        chatHistory: chatHistory.slice(-20) // Save last 20 messages
    });
});
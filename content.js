// content.js - Main injection script

console.log('CodeMentor AI Content Script Loaded');

let sidebarIframe = null;
let isSidebarVisible = false;

// Create and inject the sidebar when page loads
function injectSidebar() {
  console.log('Injecting CodeMentor AI sidebar...');
  
  // Check if sidebar already exists
  if (document.getElementById('codementor-sidebar')) {
    console.log('Sidebar already exists');
    return;
  }
  
  // Create iframe for our sidebar
  sidebarIframe = document.createElement('iframe');
  sidebarIframe.id = 'codementor-sidebar';
  sidebarIframe.src = chrome.runtime.getURL('sidebar.html');
  
  // Style the iframe
  sidebarIframe.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    height: 100vh;
    border: none;
    z-index: 999999;
    box-shadow: -2px 0 10px rgba(0,0,0,0.1);
    transition: transform 0.3s ease;
    background: white;
  `;
  
  // Initially hide sidebar (slide it out)
  sidebarIframe.style.transform = 'translateX(100%)';
  
  // Add to page
  document.body.appendChild(sidebarIframe);
  
  // Add toggle button
  addToggleButton();
  
  // Wait for iframe to load
  sidebarIframe.addEventListener('load', () => {
    console.log('Sidebar loaded');
    
    // Detect which platform we're on
    const platform = detectPlatform();
    
    // Send platform info to sidebar
    sidebarIframe.contentWindow.postMessage({
      type: 'PLATFORM_INFO',
      platform: platform,
      url: window.location.href,
      title: document.title
    }, '*');
    
    // Scrape problem data
    const problemData = scrapeProblemData(platform);
    
    // Send problem data to sidebar
    sidebarIframe.contentWindow.postMessage({
      type: 'PROBLEM_DATA',
      data: problemData
    }, '*');
  });
}

// Add floating button to toggle sidebar
function addToggleButton() {
  const button = document.createElement('div');
  button.id = 'codementor-toggle';
  button.innerHTML = '🤖';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    border-radius: 25px;
    background: #4CAF50;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    cursor: pointer;
    z-index: 999998;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    transition: transform 0.2s;
  `;
  
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.1)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
  });
  
  button.addEventListener('click', toggleSidebar);
  
  document.body.appendChild(button);
}

// Toggle sidebar visibility
function toggleSidebar() {
  if (!sidebarIframe) return;
  
  isSidebarVisible = !isSidebarVisible;
  
  if (isSidebarVisible) {
    sidebarIframe.style.transform = 'translateX(0)';
  } else {
    sidebarIframe.style.transform = 'translateX(100%)';
  }
  
  // Update button appearance
  const button = document.getElementById('codementor-toggle');
  if (button) {
    button.style.background = isSidebarVisible ? '#f44336' : '#4CAF50';
    button.innerHTML = isSidebarVisible ? '✕' : '🤖';
  }
}

// Detect which platform we're on
function detectPlatform() {
  const host = window.location.hostname;

  if (host === 'leetcode.com')           return 'leetcode';
  if (host === 'codeforces.com')         return 'codeforces';
  if (host === 'www.hackerrank.com')     return 'hackerrank';
  if (host === 'www.codechef.com')       return 'codechef';

  return 'unknown';
}

// Scrape problem data based on platform.
// Each platform's scraper is defined in platforms/*.js and loaded before this
// script via the manifest. They register themselves on window.CodeMentorPlatforms.
function scrapeProblemData(platform) {
  console.log('Scraping problem data for:', platform);

  const problemData = {
    title: '',
    description: '',
    difficulty: 'Unknown',
    examples: [],
    constraints: [],
    platform,
    url: window.location.href
  };

  try {
    const scraper = window.CodeMentorPlatforms?.[platform];
    if (scraper) {
      Object.assign(problemData, scraper.scrape());
      problemData.difficulty = scraper.getDifficulty?.() ?? 'Unknown';
    } else {
      console.warn('CodeMentor: no scraper registered for platform:', platform);
    }
  } catch (error) {
    console.error('CodeMentor: error scraping problem data:', error);
  }

  return problemData;
}

// Listen for messages from the sidebar iframe.
// We verify event.source to ensure only our own iframe can trigger actions —
// without this check any script on the host page could send fake messages.
window.addEventListener('message', (event) => {
  if (!sidebarIframe || event.source !== sidebarIframe.contentWindow) return;

  if (event.data.type === 'TOGGLE_SIDEBAR') {
    toggleSidebar();
  }

  if (event.data.type === 'REQUEST_ANALYSIS') {
    chrome.runtime.sendMessage({
      type: 'ANALYZE_PROBLEM',
      data: event.data.problemData
    });
  }
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_SIDEBAR') {
    toggleSidebar();
  }
  
  if (message.type === 'ANALYSIS_COMPLETE') {
    // Send analysis to sidebar
    if (sidebarIframe && sidebarIframe.contentWindow) {
      sidebarIframe.contentWindow.postMessage({
        type: 'ANALYSIS_RESULT',
        data: message.data
      }, '*');
    }
  }
});

// Start the extension when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectSidebar);
} else {
  injectSidebar();
}
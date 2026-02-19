// utils/storage.js - Chrome storage utilities with expiration

window.CodeMentorUtils = window.CodeMentorUtils || {};

window.CodeMentorUtils.storage = {
    // Save data with expiration (default 24 hours)
    setWithExpiry: (key, value, ttlHours = 24) => {
        const now = new Date();
        const item = {
            value: value,
            expiry: now.getTime() + (ttlHours * 60 * 60 * 1000)
        };
        chrome.storage.local.set({ [key]: item });
    },

    // Get data, returns null if expired
    getWithExpiry: async (key) => {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                const item = result[key];
                if (!item) {
                    resolve(null);
                    return;
                }
                
                const now = new Date();
                if (now.getTime() > item.expiry) {
                    chrome.storage.local.remove(key);
                    resolve(null);
                } else {
                    resolve(item.value);
                }
            });
        });
    },

    // Save user consent
    setConsent: (given) => {
        chrome.storage.local.set({ 
            consentGiven: given,
            consentTimestamp: new Date().toISOString()
        });
    },

    // Check if user has given consent
    hasConsent: async () => {
        return new Promise((resolve) => {
            chrome.storage.local.get(['consentGiven'], (result) => {
                resolve(!!result.consentGiven);
            });
        });
    },

    // Clear all data
    clearAll: () => {
        return new Promise((resolve) => {
            chrome.storage.local.clear(() => {
                resolve(true);
            });
        });
    }
};
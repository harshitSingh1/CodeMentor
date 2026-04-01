<div align="center">
  <img src="assets/logo-128.png" width="80" alt="CodeMentor AI">
  <h1>CodeMentor AI</h1>
  <p><strong>AI-powered DSA mentor — Chrome Extension (MV3)</strong></p>
  <p>Guides you through DSA problems with progressive hints, approach comparisons, and real-time coaching — <em>without spoiling the solution.</em></p>
</div>

---

## Install (Load Unpacked)

1. Clone or download this repo
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select this folder
5. Open any supported problem page — the CodeMentor button appears bottom-right

---

## Supported Platforms

| Platform | Problem Parse | SPA Navigation | Code Scraping |
|---|---|---|---|
| LeetCode | ✅ | ✅ MutationObserver | ✅ Monaco |
| Codeforces | ✅ | ✅ History API | ✅ Textarea |
| HackerRank | ✅ | ✅ History API | ✅ CodeMirror |
| CodeChef | ✅ | ✅ MutationObserver | ✅ CodeMirror |

---



## Features

### 🪜 Hint Ladder
Four progressive levels — no full solution ever revealed:
1. **Intuition** — a tiny nudge in the right direction
2. **Approach outline** — the general strategy
3. **Key observation** — the insight that unlocks the solution
4. **Pseudo-code** — structure without implementation

Lock hints at any rung to prevent accidental reveals.

### 🚨 Stuck Detector
Auto-triggers after a configurable time (default: 15 min) with a AI-generated guiding question. Asks about constraints, edge cases, or patterns — never the answer.

### ⚖️ Approach Comparator
Compares 2–3 approaches in a table: name · idea · time · space. Built automatically from your chat context.

### 🔍 Mistake Pattern Radar
Detects likely pitfalls from your messages (off-by-one, integer overflow, wrong invariant, etc.) and shows them as chips above the chat.

### 📝 Explain This Line
Paste ≤30 lines of code in the chat box — CodeMentor explains each line without rewriting or solving for you.

### 📋 Session Replay
Exports a markdown summary: problem, approaches explored, key insights, pitfalls, next steps. One click to copy.

### ⏱️ Timer + Stats
Session timer with start/pause/reset. Live stats: time, hints, messages, approaches.

### ⚙️ Settings & Diagnostics
- API key management (local only)
- Stuck detector threshold (5–60 min)
- Mistake radar on/off
- Hidden diagnostics panel: platform, page type, parse status, last error

---

## Privacy

- **Data Processing:** Problem statements, your active code, and chat messages are securely routed through the CodeMentor API backend to generate AI responses.
- **Local Storage:** Your timer, hints, and settings are stored locally on your device in `chrome.storage.local`.
- **Stateless Architecture:** The backend handles requests statelessly. We do not persist your chat history or problem data on our servers after generating a response.

[Google Privacy Policy](https://policies.google.com/privacy)

---

## Project Structure

```
├── background.js          Service worker — Gemini API, feature handlers
├── content.js             Injection, SPA router, problem scraping
├── sidebar.html           Sidebar UI
├── sidebar.js             Sidebar logic (all features)
├── styles/sidebar.css     Scoped CSS (cm- prefix, no host leakage)
├── platforms/
│   ├── loader.js          Registry initializer
│   ├── leetcode.js        LeetCode scraper
│   ├── codeforces.js      Codeforces scraper
│   ├── hackerrank.js      HackerRank scraper
│   └── codechef.js        CodeChef scraper
├── utils/storage.js       Storage helpers
└── assets/                Icons
```

---

## License

MIT © Harshit Singh & Vittoria Lanzo

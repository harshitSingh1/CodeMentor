// platforms/hackerrank.js
// Scraper for HackerRank challenge pages.
//
// HackerRank is a React SPA. The DOM may not be fully rendered when
// content.js fires. If scraping returns empty strings, the sidebar will
// still open — the user can trigger a re-scrape via the chat.

window.CodeMentorPlatforms = window.CodeMentorPlatforms || {};

window.CodeMentorPlatforms.hackerrank = {
  scrape() {
    // Title: try React-rendered headings first, fall back to parsing <title>.
    // document.title format: "Solve Challenge Name | HackerRank"
    const titleEl = (
      document.querySelector('[class*="challenge-header"] h1') ||
      document.querySelector('[class*="ChallengePageHeader"] h1') ||
      document.querySelector('.challenge-view h1') ||
      document.querySelector('h1[class*="challenge"]')
    );

    const title = titleEl
      ? titleEl.textContent.trim()
      : document.title
          .replace(/\|\s*HackerRank\s*$/, '')
          .replace(/^Solve\s+/i, '')
          .trim();

    // Problem body: .challenge-body-html is the most stable selector across
    // HackerRank's UI generations. It holds the rendered problem HTML.
    const descEl = (
      document.querySelector('.challenge-body-html') ||
      document.querySelector('[class*="challenge-body"]') ||
      document.querySelector('.problem-statement')
    );
    const description = descEl?.textContent?.trim() || '';

    return { title, description };
  },

  getDifficulty() {
    // HackerRank shows "Easy", "Medium", or "Hard" in a difficulty element.
    const el = (
      document.querySelector('[class*="difficulty"] span') ||
      document.querySelector('[class*="difficulty"]') ||
      document.querySelector('.challenge-difficulty-rating')
    );
    const raw = el?.textContent?.trim() || '';
    // Only return it if it's a recognisable value — avoids returning garbage
    // from a false-positive selector match.
    return ['Easy', 'Medium', 'Hard'].includes(raw) ? raw : 'Unknown';
  }
};

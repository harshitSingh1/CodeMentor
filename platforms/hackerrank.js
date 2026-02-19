// platforms/hackerrank.js
// Scraper for HackerRank challenge pages.
//
// Selectors verified against live HTML (Feb 2026).
// HackerRank is a React SPA — DOM is populated before document_end fires
// because the server pre-renders the challenge shell.

window.CodeMentorPlatforms = window.CodeMentorPlatforms || {};

window.CodeMentorPlatforms.hackerrank = {
  scrape() {
    // Title: verified structure is:
    //   <div class="challenge-page-label-wrapper">
    //     <h1 class="ui-icon-label page-label">Challenge Name</h1>
    //   </div>
    // Fallback to document.title ("Solve X | HackerRank") which is always set.
    const titleEl = (
      document.querySelector('.challenge-page-label-wrapper h1') ||
      document.querySelector('h1.page-label') ||
      document.querySelector('[class*="challenge-header"] h1') ||
      document.querySelector('.challenge-view h1')
    );

    const title = titleEl
      ? titleEl.textContent.trim()
      : document.title
          .replace(/\|\s*HackerRank\s*$/, '')
          .replace(/^Solve\s+/i, '')
          .trim();

    // Description: .challenge-body-html verified present in live HTML.
    const descEl = (
      document.querySelector('.challenge-body-html') ||
      document.querySelector('[class*="challenge-body"]')
    );
    const description = descEl?.textContent?.trim() || '';

    return { title, description };
  },

  getDifficulty() {
    // Verified structure:
    //   <div class="difficulty-block">
    //     <p class="difficulty-label">Difficulty</p>
    //     <p class="pull-right difficulty-easy">Easy</p>   ← this is what we want
    //   </div>
    //
    // We target the value <p> directly via its level-specific class,
    // NOT the container (which would return "DifficultyEasy" as textContent).
    const el = (
      document.querySelector('p[class*="difficulty-easy"]') ||
      document.querySelector('p[class*="difficulty-medium"]') ||
      document.querySelector('p[class*="difficulty-hard"]')
    );
    const raw = el?.textContent?.trim() || '';
    return ['Easy', 'Medium', 'Hard'].includes(raw) ? raw : 'Unknown';
  }
};

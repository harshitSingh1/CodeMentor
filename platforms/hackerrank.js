// platforms/hackerrank.js
// HackerRank is a React SPA. The challenge shell is server-pre-rendered,
// so selectors work at document_end.
window.CodeMentorPlatforms = window.CodeMentorPlatforms || {};

window.CodeMentorPlatforms.hackerrank = {
  scrape() {
    const titleEl =
      document.querySelector('.challenge-page-label-wrapper h1') ||
      document.querySelector('h1.page-label') ||
      document.querySelector('[class*="challenge-header"] h1') ||
      document.querySelector('.ui-icon-label');

    const title = titleEl
      ? titleEl.textContent.trim()
      : document.title.replace(/\|\s*HackerRank\s*$/, '').replace(/^Solve\s+/i, '').trim();

    const descEl =
      document.querySelector('.challenge-body-html') ||
      document.querySelector('[class*="challenge-body"]') ||
      document.querySelector('.problem-description');
    const description = descEl?.textContent?.trim() || '';

    return { title, description };
  },

  getDifficulty() {
    // Verified: difficulty value is in a <p> with a level-specific class,
    // NOT the container (which would produce "DifficultyEasy" concatenated)
    const el =
      document.querySelector('p[class*="difficulty-easy"]') ||
      document.querySelector('p[class*="difficulty-medium"]') ||
      document.querySelector('p[class*="difficulty-hard"]') ||
      document.querySelector('[class*="difficulty"] .pull-right');
    const raw = el?.textContent?.trim() || '';
    return ['Easy', 'Medium', 'Hard'].includes(raw) ? raw : 'Unknown';
  }
};

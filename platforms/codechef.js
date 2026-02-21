// platforms/codechef.js
// CodeChef is a fully client-side React SPA. Selectors work on live DOM
// (after hydration), not raw HTML. content.js waits 1200ms before scraping
// to allow React to render the problem content.
window.CodeMentorPlatforms = window.CodeMentorPlatforms || {};

window.CodeMentorPlatforms.codechef = {
  scrape() {
    const titleEl =
      document.querySelector('h1[class*="title"]') ||
      document.querySelector('.problem-name h1') ||
      document.querySelector('[class*="ProblemPage"] h1') ||
      document.querySelector('[class*="problem-title"]') ||
      document.querySelector('h1');
    const title = titleEl?.textContent?.trim() || '';

    const descEl =
      document.querySelector('.problem-statement') ||
      document.querySelector('[class*="problem-statement"]') ||
      document.querySelector('.statement-body') ||
      document.querySelector('[class*="ProblemStatement"]');
    const description = descEl?.textContent?.trim() || '';

    return { title, description };
  },

  getDifficulty() {
    const el =
      document.querySelector('[class*="difficulty-rating"]') ||
      document.querySelector('[class*="DifficultyRating"]') ||
      document.querySelector('.problem-difficulty') ||
      document.querySelector('[class*="difficulty"]');
    return el?.textContent?.trim() || 'Unknown';
  }
};

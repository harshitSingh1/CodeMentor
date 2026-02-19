// platforms/codechef.js
// Scraper for CodeChef problem pages.
//
// CodeChef runs on Next.js. The problem content is server-side rendered,
// so selectors are available at document_end. URL patterns:
//   https://www.codechef.com/problems/CODE
//   https://www.codechef.com/CONTEST/problems/CODE

window.CodeMentorPlatforms = window.CodeMentorPlatforms || {};

window.CodeMentorPlatforms.codechef = {
  scrape() {
    // Title: CodeChef SSR puts the problem title in an <h1>.
    // The redesigned site uses CSS-module class names that change on deploy,
    // so we rely on structure (first <h1> inside the problem page) as fallback.
    const titleEl = (
      document.querySelector('h1[class*="title"]') ||
      document.querySelector('.problem-name h1') ||
      document.querySelector('.problems-page h1') ||
      document.querySelector('h1')
    );
    const title = titleEl?.textContent?.trim() || '';

    // Problem statement: .problem-statement is consistent across CodeChef
    // versions (classic and redesigned).
    const descEl = (
      document.querySelector('.problem-statement') ||
      document.querySelector('[class*="problem-statement"]') ||
      document.querySelector('.statement-body')
    );
    const description = descEl?.textContent?.trim() || '';

    return { title, description };
  },

  getDifficulty() {
    // CodeChef shows difficulty as a text label (e.g., "Easy", "Hard") or
    // a numeric rating. We grab whatever is in the difficulty region.
    const el = (
      document.querySelector('[class*="difficulty-rating"]') ||
      document.querySelector('[class*="difficulty"]') ||
      document.querySelector('.problem-difficulty')
    );
    return el?.textContent?.trim() || 'Unknown';
  }
};

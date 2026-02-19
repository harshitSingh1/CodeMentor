// platforms/codechef.js
// Scraper for CodeChef problem pages.
//
// CodeChef is a fully client-side React app — static HTML fetching returns
// only a shell <div id="root"> with no problem content. Selectors cannot be
// verified by fetching raw HTML from outside a browser.
// They will work in the extension because content scripts run against the
// live rendered DOM (after React hydration), not raw HTML.
//
// ⚠️  If CodeChef redesigns and selectors start missing, update them here.
//
// URL patterns:
//   https://www.codechef.com/problems/CODE
//   https://www.codechef.com/CONTEST/problems/CODE

window.CodeMentorPlatforms = window.CodeMentorPlatforms || {};

window.CodeMentorPlatforms.codechef = {
  scrape() {
    // Title: CodeChef renders the problem title in an <h1>.
    // CSS-module class names change on deploy, so we use multiple fallbacks
    // with a plain h1 as the last resort.
    const titleEl = (
      document.querySelector('h1[class*="title"]') ||
      document.querySelector('.problem-name h1') ||
      document.querySelector('.problems-page h1') ||
      document.querySelector('h1')
    );
    const title = titleEl?.textContent?.trim() || '';

    // Description: .problem-statement has been stable across CodeChef versions.
    const descEl = (
      document.querySelector('.problem-statement') ||
      document.querySelector('[class*="problem-statement"]') ||
      document.querySelector('.statement-body')
    );
    const description = descEl?.textContent?.trim() || '';

    return { title, description };
  },

  getDifficulty() {
    const el = (
      document.querySelector('[class*="difficulty-rating"]') ||
      document.querySelector('[class*="difficulty"]') ||
      document.querySelector('.problem-difficulty')
    );
    return el?.textContent?.trim() || 'Unknown';
  }
};

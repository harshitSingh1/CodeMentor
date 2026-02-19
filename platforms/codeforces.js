// platforms/codeforces.js
// Scraper for Codeforces problem pages.

window.CodeMentorPlatforms = window.CodeMentorPlatforms || {};

window.CodeMentorPlatforms.codeforces = {
  scrape() {
    // Codeforces uses server-rendered HTML with stable class names.
    const title = document.querySelector('.problem-statement .title')
      ?.textContent?.trim() || '';

    // The first <p> after .header is the problem statement body.
    // We grab the full problem-statement block for context.
    const description = document.querySelector('.problem-statement')
      ?.textContent?.trim() || '';

    return { title, description };
  },

  getDifficulty() {
    // Codeforces shows a numeric rating in the sidebar, tagged as difficulty.
    // e.g. "*1500" inside a tag-box with title="Difficulty".
    const ratingTag = document.querySelector('.tag-box[title="Difficulty"]');
    if (ratingTag) return `Rating: ${ratingTag.textContent.trim()}`;

    // Fallback: check for any tag starting with *
    const tags = document.querySelectorAll('.tag-box');
    for (const tag of tags) {
      if (/^\*\d+/.test(tag.textContent.trim())) {
        return `Rating: ${tag.textContent.trim()}`;
      }
    }

    return 'Unknown';
  }
};

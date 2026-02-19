// platforms/leetcode.js
// Scraper for LeetCode problem pages.
// Defines window.CodeMentorPlatforms.leetcode so content.js can call it.

window.CodeMentorPlatforms = window.CodeMentorPlatforms || {};

window.CodeMentorPlatforms.leetcode = {
  scrape() {
    // LeetCode renders its UI in React, so selectors target data-cy attributes
    // which are more stable than generated class names.
    const title = (
      document.querySelector('[data-cy="question-title"]') ||
      document.querySelector('.text-title-large')
    )?.textContent?.trim() || '';

    const description = (
      document.querySelector('[data-cy="question-content"]') ||
      document.querySelector('.elfjS')
    )?.textContent?.trim() || '';

    return { title, description };
  },

  getDifficulty() {
    // LeetCode shows difficulty as a coloured label next to the title.
    const el = (
      document.querySelector('[data-cy="question-title"] ~ div') ||
      document.querySelector('.text-difficulty-easy') ||
      document.querySelector('.text-difficulty-medium') ||
      document.querySelector('.text-difficulty-hard')
    );
    return el?.textContent?.trim() || 'Unknown';
  }
};

// platforms/leetcode.js
window.CodeMentorPlatforms = window.CodeMentorPlatforms || {};

window.CodeMentorPlatforms.leetcode = {
  scrape() {
    // LeetCode uses React with data-cy attributes (more stable than generated classes)
    const titleEl =
      document.querySelector('[data-cy="question-title"]') ||
      document.querySelector('.text-title-large a') ||
      document.querySelector('.text-title-large');
    const title = titleEl?.textContent?.trim() || '';

    const descEl =
      document.querySelector('[data-cy="question-content"]') ||
      document.querySelector('.elfjS') ||
      document.querySelector('.xFUwe');
    const description = descEl?.textContent?.trim() || '';

    return { title, description };
  },

  getDifficulty() {
    // Try explicit difficulty classes first
    const explicit =
      document.querySelector('.text-difficulty-easy') ||
      document.querySelector('.text-difficulty-medium') ||
      document.querySelector('.text-difficulty-hard');
    if (explicit) return explicit.textContent.trim();

    // Fallback: scan for standalone Easy/Medium/Hard text nodes near the title area
    const candidates = document.querySelectorAll('[class*="title"] ~ * span, [class*="Difficulty"] span');
    for (const el of candidates) {
      const t = el.textContent.trim();
      if (['Easy', 'Medium', 'Hard'].includes(t)) return t;
    }
    return 'Unknown';
  }
};

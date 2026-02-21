// platforms/codeforces.js
// Codeforces uses server-rendered HTML — selectors are stable.
window.CodeMentorPlatforms = window.CodeMentorPlatforms || {};

window.CodeMentorPlatforms.codeforces = {
  scrape() {
    const title =
      document.querySelector('.problem-statement .title')?.textContent?.trim() ||
      document.querySelector('.problem-header .title')?.textContent?.trim() ||
      document.title.replace(/[-|].*$/, '').trim();

    const descEl = document.querySelector('.problem-statement');
    const description = descEl?.innerText?.trim() || '';

    return { title, description };
  },

  getDifficulty() {
    const ratingTag = document.querySelector('.tag-box[title="Difficulty"]');
    if (ratingTag) return `Rating: ${ratingTag.textContent.trim()}`;
    for (const tag of document.querySelectorAll('.tag-box')) {
      if (/^\*\d+/.test(tag.textContent.trim())) return `Rating: ${tag.textContent.trim()}`;
    }
    return 'Unknown';
  }
};

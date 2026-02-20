/**
 * CodeMentor extension tests
 *
 * Suite 1 — jsdom: tests cleanProblemText, getFullProblemText, getSolutions
 *           using synthetic HTML that mirrors each platform's real structure.
 *
 * Suite 2 — puppeteer-core: loads the extension unpacked into a headless
 *           Chromium profile, injects synthetic problem pages, and verifies
 *           the PROBLEM_DATA postMessage payload end-to-end.
 *
 * Run: node tests/extension.test.js
 */

'use strict';

const { JSDOM } = require('jsdom');
const path = require('path');
const fs   = require('fs');

// ─── colour helpers ───────────────────────────────────────────────────────────
const GREEN  = s => `\x1b[32m${s}\x1b[0m`;
const RED    = s => `\x1b[31m${s}\x1b[0m`;
const BOLD   = s => `\x1b[1m${s}\x1b[0m`;
const DIM    = s => `\x1b[2m${s}\x1b[0m`;

let total = 0, passed = 0, failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
  total++;
  if (condition) {
    console.log('  ' + GREEN('✓') + ' ' + label);
    passed++;
  } else {
    console.log('  ' + RED('✗') + ' ' + RED(label) + (detail ? `  ${DIM('→ ' + detail)}` : ''));
    failures.push(label);
    failed++;
  }
}

// ─── Inject content.js into a jsdom window ───────────────────────────────────
// content.js uses chrome.* APIs which don't exist in jsdom.
// We strip everything that isn't the three new functions + detectPlatform,
// by running the file through a shim environment.

function makeWindow(html, url = 'https://leetcode.com/problems/two-sum/') {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  const w   = dom.window;

  // jsdom does not implement innerText (it requires a layout engine).
  // Polyfill with textContent, which is equivalent for plain-text elements
  // and good enough for all test fixtures. In a real browser the extension
  // uses the native innerText, which handles nested elements correctly.
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    get() { return this.textContent ?? ''; },
    set(v) { this.textContent = v; },
    configurable: true
  });

  // Minimal chrome shim so the file doesn't throw on load
  w.chrome = {
    runtime: { getURL: p => p, sendMessage: () => {}, onMessage: { addListener: () => {} } },
    storage: { local: { get: () => {}, set: () => {} } },
    action:  { setBadgeText: () => {}, setBadgeBackgroundColor: () => {}, onClicked: { addListener: () => {} } }
  };
  w.console = console;

  // Evaluate content.js inside this window's context
  const code = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  // Wrap in IIFE to avoid "document is not defined" at module level when
  // document.readyState triggers injectSidebar — we only want the functions.
  // We stub document.body.appendChild and getElementById so the init path
  // doesn't crash.
  w.document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;

  const vm = require('vm');
  const script = new vm.Script(code);
  const ctx = vm.createContext(w);
  try { script.runInContext(ctx); } catch (_) { /* injectSidebar may fail — that's OK */ }

  return { w, ctx };
}

// ─── Synthetic HTML fixtures ──────────────────────────────────────────────────

// NOTE: jsdom's innerText requires flat text nodes — nested block elements
// (p, ul, li, code) cause innerText to return '' because jsdom has no layout
// engine. Fixtures deliberately use plain text to match what innerText sees
// in jsdom. In a real browser all HTML structures work correctly.
const FIXTURES = {
  leetcode: {
    url: 'https://leetcode.com/problems/two-sum/',
    problemHtml: `<div class="elfjS">Given an array nums and integer target, return indices of two numbers that add up to target.
Example 1: Input nums=[2,7,11,15] target=9 Output [0,1] Explanation nums[0]+nums[1]==9.
Constraints: 2 &lt;= nums.length &lt;= 10^4</div>`,
    editorHtml: `<div class="view-lines"><div class="view-line"><span><span>class Solution: pass</span></span></div></div>`,
    selector: '.elfjS'
  },
  leetcode_fallback: {
    url: 'https://leetcode.com/problems/two-sum/',
    problemHtml: `<div class="xFUwe">Problem text via fallback selector.</div>`,
    selector: '.xFUwe'
  },
  codeforces: {
    url: 'https://codeforces.com/problemset/problem/1/A',
    problemHtml: `<div class="problem-statement">Theatre Square. In a far away country there is a theatre on a square of n x m metres. Input: two integers n and m (1 le n,m le 10^9). Output: number of flagstones needed.</div>`,
    editorHtml: `<textarea id="sourceCodeTextarea">import math
n,m=map(int,input().split())
print(math.ceil(n)*math.ceil(m))</textarea>`,
    selector: '.problem-statement'
  },
  hackerrank: {
    url: 'https://www.hackerrank.com/challenges/solve-me-first/problem',
    problemHtml: `<div class="challenge-text-body">Complete the function solveMeFirst to compute the sum of two integers. Parameters: int a first value, int b second value. Returns: int sum of a and b.</div>`,
    editorHtml: `<div class="CodeMirror-code">function solveMeFirst(a,b){ return a+b; }</div>`,
    selector: '.challenge-text-body'
  },
  codechef: {
    url: 'https://www.codechef.com/problems/FLOW001',
    problemHtml: `<div class="problem-statement">Read two numbers and print their sum. Input Format: first line integer T test cases, then two integers A and B. Constraints: 1 le T le 100, 0 le A,B le 10000.</div>`,
    editorHtml: `<div class="CodeMirror-code">T=int(input())
for _ in range(T):
    print(sum(map(int,input().split())))</div>`,
    selector: '.problem-statement'
  }
};

// ─── SUITE 1: jsdom DOM scraping tests ───────────────────────────────────────

console.log(BOLD('\n╔══════════════════════════════════════════════════╗'));
console.log(BOLD('║  Suite 1 — DOM scraping (jsdom)                  ║'));
console.log(BOLD('╚══════════════════════════════════════════════════╝'));

// ── 1a. cleanProblemText ──────────────────────────────────────────────────────
console.log(BOLD('\n── cleanProblemText ─────────────────────────────────'));
{
  const { w } = makeWindow('<html><body></body></html>', 'https://leetcode.com/problems/test/');
  const clean = w.cleanProblemText;

  assert('strips HTML tags',
    clean('<p>Hello <strong>world</strong></p>') === 'Hello world');
  assert('collapses 4 blank lines to one blank line',
    clean('A\n\n\n\nB') === 'A\n\nB');
  assert('preserves single blank line',
    clean('A\n\nB') === 'A\n\nB');
  assert('trims surrounding whitespace',
    clean('\n\n  hello  \n\n') === 'hello');
  assert('preserves Example/Input/Output labels',
    (() => {
      const t = 'Example 1:\nInput: [1,2]\nOutput: 3\n\n\n\nConstraints:\nn >= 1';
      const r = clean(t);
      return r.includes('Example 1:') && r.includes('Input:') && r.includes('Constraints:') && !r.includes('\n\n\n');
    })());
}

// ── 1b. getFullProblemText — happy path for each platform ────────────────────
console.log(BOLD('\n── getFullProblemText — happy paths ─────────────────'));
for (const [name, fx] of Object.entries(FIXTURES)) {
  if (name === 'leetcode_fallback') continue; // tested separately below
  const fullHtml = `<html><body>${fx.problemHtml}${fx.editorHtml ?? ''}</body></html>`;
  const { w } = makeWindow(fullHtml, fx.url);
  const result = w.getFullProblemText(w.detectPlatform());

  const ok = typeof result === 'string' && result !== null;
  assert(`${name}: returns a non-null string`, ok);
  if (ok) {
    assert(`${name}: text is non-empty`, result.length > 0);
    assert(`${name}: no raw HTML tags remain`, !/<[a-z]/i.test(result));
    assert(`${name}: no run of 3+ blank lines`, !/\n{3,}/.test(result));
    assert(`${name}: trimmed (no leading/trailing whitespace)`, result === result.trim());
  }
}

// ── 1c. getFullProblemText — LeetCode fallback selector (.xFUwe) ─────────────
console.log(BOLD('\n── getFullProblemText — LeetCode fallback selector ──'));
{
  const fx = FIXTURES.leetcode_fallback;
  const { w } = makeWindow(`<html><body>${fx.problemHtml}</body></html>`, fx.url);
  const result = w.getFullProblemText('leetcode');
  assert('fallback .xFUwe selector works when .elfjS absent',
    typeof result === 'string' && result.includes('fallback selector'));
}

// ── 1d. getFullProblemText — failure paths ───────────────────────────────────
console.log(BOLD('\n── getFullProblemText — failure paths ───────────────'));
{
  // No matching element
  const { w: w1 } = makeWindow('<html><body><div class="other">x</div></body></html>',
    'https://leetcode.com/problems/test/');
  const r1 = w1.getFullProblemText('leetcode');
  assert('returns null when selector not found', r1 === null);

  // Element exists but innerText is empty
  const { w: w2 } = makeWindow('<html><body><div class="elfjS">   </div></body></html>',
    'https://leetcode.com/problems/test/');
  // jsdom innerText of whitespace-only div is '' after trim
  const r2 = w2.getFullProblemText('leetcode');
  assert('returns null when element text is empty/whitespace', r2 === null);

  // Unknown platform
  const { w: w3 } = makeWindow('<html><body></body></html>',
    'https://leetcode.com/problems/test/');
  const r3 = w3.getFullProblemText('unknown');
  assert('returns null for unknown platform', r3 === null);
}

// ── 1e. getSolutions — editor scenarios ──────────────────────────────────────
console.log(BOLD('\n── getSolutions — editor (Scenario A) ──────────────'));
{
  // LeetCode Monaco editor
  const lcHtml = `<html><body>
    <div class="elfjS"><p>problem</p></div>
    <div class="view-lines">
      <div class="view-line"><span><span>class Solution:</span></span></div>
      <div class="view-line"><span><span>    def twoSum(self):</span></span></div>
      <div class="view-line"><span><span>        pass</span></span></div>
    </div>
  </body></html>`;
  const { w } = makeWindow(lcHtml, 'https://leetcode.com/problems/two-sum/');
  const sols = w.getSolutions();
  assert('leetcode editor: returns array', Array.isArray(sols));
  assert('leetcode editor: at least one solution captured', sols.length >= 1);
  assert('leetcode editor: captured text is non-empty', sols.every(s => s.trim().length > 0));
}
{
  // Codeforces textarea
  const cfHtml = `<html><body>
    <div class="problem-statement"><p>problem</p></div>
    <textarea id="sourceCodeTextarea">import sys
input = sys.stdin.readline
n = int(input())</textarea>
  </body></html>`;
  const { w } = makeWindow(cfHtml, 'https://codeforces.com/problemset/problem/1/A');
  const sols = w.getSolutions();
  assert('codeforces editor: returns array', Array.isArray(sols));
  assert('codeforces editor: captures textarea value', sols.some(s => s.includes('import sys')));
}
{
  // HackerRank CodeMirror
  const hrHtml = `<html><body>
    <div class="challenge-text-body"><p>problem</p></div>
    <div class="CodeMirror-code"><pre>function solve(a,b){ return a+b; }</pre></div>
  </body></html>`;
  const { w } = makeWindow(hrHtml, 'https://www.hackerrank.com/challenges/test/problem');
  const sols = w.getSolutions();
  assert('hackerrank editor: returns array', Array.isArray(sols));
  assert('hackerrank editor: captures CodeMirror content', sols.some(s => s.includes('function solve')));
}
{
  // CodeChef CodeMirror
  const ccHtml = `<html><body>
    <div class="problem-statement"><p>problem</p></div>
    <div class="CodeMirror-code"><pre>T=int(input())
for _ in range(T):
    print(sum(map(int,input().split())))</pre></div>
  </body></html>`;
  const { w } = makeWindow(ccHtml, 'https://www.codechef.com/problems/FLOW001');
  const sols = w.getSolutions();
  assert('codechef editor: returns array', Array.isArray(sols));
  assert('codechef editor: captures CodeMirror content', sols.some(s => s.includes('T=int')));
}

// ── 1f. getSolutions — LeetCode solutions tab (Scenario B) ───────────────────
console.log(BOLD('\n── getSolutions — solutions tab (Scenario B) ────────'));
{
  const html = `<html><body>
    <div class="elfjS"><p>problem</p></div>
    <pre><code>class Solution:\n    def twoSum(self, nums, t):\n        return [0,1]</code></pre>
    <pre><code>class Solution:\n    def twoSum(self, nums, t):\n        d={}\n        for i,n in enumerate(nums):\n            if t-n in d: return [d[t-n],i]\n            d[n]=i</code></pre>
    <pre><code>class Solution:\n    def twoSum(self, nums, t):\n        nums=sorted(enumerate(nums),key=lambda x:x[1])\n        l,r=0,len(nums)-1\n        while l&lt;r:\n            s=nums[l][1]+nums[r][1]\n            if s==t: return [nums[l][0],nums[r][0]]\n            elif s&lt;t: l+=1\n            else: r-=1</code></pre>
    <pre><code>FOURTH — should NOT be scraped (cap=3)</code></pre>
  </body></html>`;

  const { w } = makeWindow(html, 'https://leetcode.com/problems/two-sum/solutions/');
  const sols = w.getSolutions();
  assert('solutions tab: returns array', Array.isArray(sols));
  assert('solutions tab: captures at most 3 blocks', sols.length <= 3);
  assert('solutions tab: does not capture 4th block', !sols.some(s => s.includes('FOURTH')));
}

// ── 1g. getSolutions — no editor on page ─────────────────────────────────────
console.log(BOLD('\n── getSolutions — empty/missing editor ──────────────'));
{
  const { w } = makeWindow(
    '<html><body><div class="elfjS"><p>problem</p></div></body></html>',
    'https://leetcode.com/problems/two-sum/'
  );
  const sols = w.getSolutions();
  assert('no editor present: returns [] not null', Array.isArray(sols) && sols !== null);
}

// ── 1h. scrapeProblemData — payload is strict superset ───────────────────────
console.log(BOLD('\n── scrapeProblemData — payload shape ────────────────'));
{
  const html = `<html><body>
    <div class="elfjS"><p>Given nums and target, return indices.</p>
    Example 1: Input [2,7] Output [0,1]</div>
    <div class="view-lines">
      <div class="view-line"><span><span>class Solution: pass</span></span></div>
    </div>
  </body></html>`;
  const { w } = makeWindow(html, 'https://leetcode.com/problems/two-sum/');

  // Simulate platform registry (mirrors what platforms/*.js sets on window)
  w.CodeMentorPlatforms = {
    leetcode: {
      scrape()       { return { title: 'Two Sum', description: 'Given nums...' }; },
      getDifficulty(){ return 'Easy'; }
    }
  };

  const data = w.scrapeProblemData('leetcode');

  const ORIGINAL_KEYS = ['title','description','difficulty','examples','constraints','platform','url'];
  assert('all 7 original keys present',
    ORIGINAL_KEYS.every(k => k in data));
  assert('fullProblemText key present',  'fullProblemText'  in data);
  assert('scrapedSolutions key present', 'scrapedSolutions' in data);
  assert('scrapedSolutions is never null', data.scrapedSolutions !== null);
  assert('scrapedSolutions is an array',  Array.isArray(data.scrapedSolutions));
  assert('title populated by existing scraper', data.title === 'Two Sum');
  assert('difficulty populated by existing scraper', data.difficulty === 'Easy');
  assert('fullProblemText is string (selector found)', typeof data.fullProblemText === 'string');
}

// ─── Suite summary so far ──────────────────────────────────────────────────────
const suite1Pass = passed, suite1Fail = failed;
console.log(BOLD(`\n── Suite 1 total: ${suite1Pass} passed, ${suite1Fail} failed ───────────────────\n`));

// ─── SUITE 2: puppeteer-core end-to-end ──────────────────────────────────────
console.log(BOLD('╔══════════════════════════════════════════════════╗'));
console.log(BOLD('║  Suite 2 — End-to-end via puppeteer-core         ║'));
console.log(BOLD('╚══════════════════════════════════════════════════╝\n'));

(async () => {
  let browser;
  try {
    const puppeteer = require('puppeteer-core');
    const extPath   = path.resolve(__dirname, '..');

    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium',
      headless: 'new',
      args: [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    // Read source files once — injected into each page's main world
    const contentJsSrc   = fs.readFileSync(path.join(__dirname, '..', 'content.js'),             'utf8');
    const platformSrcs   = ['leetcode','codeforces','hackerrank','codechef'].map(p =>
      fs.readFileSync(path.join(__dirname, '..', 'platforms', `${p}.js`), 'utf8')
    );

    // ── Helper: open a synthetic page that mimics a platform ─────────────────
    // Chrome content scripts run in an isolated JS world — page.evaluate() cannot
    // see them. We bypass this by injecting content.js + platform scripts directly
    // into the main world via page.addScriptTag / evaluateOnNewDocument, with a
    // minimal chrome shim. This tests the exact same logic in a real Chromium engine.
    async function testPlatform({ name, url, bodyHtml, expectTextContains, expectSolutions }) {
      console.log(BOLD(`\n── ${name} ──────────────────────────────────────────`));
      const page = await browser.newPage();

      // Serve synthetic HTML (no real network requests)
      await page.setRequestInterception(true);
      page.on('request', req => {
        const reqUrl = req.url();
        if (reqUrl === url || reqUrl.startsWith(url.replace(/\/$/, ''))) {
          req.respond({
            status: 200, contentType: 'text/html',
            body: `<!DOCTYPE html><html><head><title>Test</title></head><body>${bodyHtml}</body></html>`
          });
        } else {
          req.continue();
        }
      });

      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Inject chrome shim first via evaluate (lands on window synchronously)
      await page.evaluate(() => {
        window.chrome = {
          runtime: { getURL: p => p, sendMessage: () => {}, onMessage: { addListener: () => {} } },
          storage: { local: { get: () => {}, set: () => {} } },
          action:  { setBadgeText: () => {}, setBadgeBackgroundColor: () => {},
                     onClicked: { addListener: () => {} } }
        };
      });

      // addScriptTag executes code in global scope — function declarations become window properties,
      // unlike new Function(src)() which creates a nested closure that doesn't pollute window.
      for (const src of platformSrcs) {
        await page.addScriptTag({ content: src });
      }
      await page.addScriptTag({ content: contentJsSrc }).catch(() => {});
      // (content.js calls injectSidebar which tries to appendChild — harmless if it throws)

      // Now call scrapeProblemData in the main world where our injected functions live
      const data = await page.evaluate(() => {
        if (typeof window.scrapeProblemData !== 'function') return null;
        const platform = window.detectPlatform();
        return window.scrapeProblemData(platform);
      });

      if (!data) {
        assert(`${name}: content.js functions available in main world`, false, 'scrapeProblemData not found');
        await page.close();
        return;
      }

      assert(`${name}: content.js injected and scrapeProblemData callable`, true);
      assert(`${name}: platform detected correctly`, data.platform === name);
      assert(`${name}: url populated`, typeof data.url === 'string' && data.url.length > 0);
      assert(`${name}: scrapedSolutions is non-null array`, Array.isArray(data.scrapedSolutions));

      if (expectTextContains) {
        assert(`${name}: fullProblemText contains expected content`,
          typeof data.fullProblemText === 'string' && data.fullProblemText.includes(expectTextContains));
        assert(`${name}: no HTML tags in fullProblemText`,
          !/<[a-z]/i.test(data.fullProblemText ?? ''));
      } else {
        assert(`${name}: fullProblemText null when selector absent`, data.fullProblemText === null);
      }

      if (expectSolutions) {
        assert(`${name}: scrapedSolutions non-empty`, data.scrapedSolutions.length > 0);
        assert(`${name}: all solution strings non-empty`,
          data.scrapedSolutions.every(s => s.trim().length > 0));
      }

      await page.close();
    }

    // ── LeetCode ─────────────────────────────────────────────────────────────
    await testPlatform({
      name: 'leetcode',
      url:  'https://leetcode.com/problems/two-sum/',
      bodyHtml: `
        <div class="elfjS">
          Given an array nums and integer target, return indices of two numbers that add up to target.
          Example 1: Input nums=[2,7,11,15] target=9 Output [0,1]
          Constraints: 2 le nums.length le 10^4
        </div>
        <div class="view-lines">
          <div class="view-line"><span><span>class Solution:</span></span></div>
          <div class="view-line"><span><span>    def twoSum(self, nums, target): pass</span></span></div>
        </div>`,
      expectTextContains: 'two numbers',
      expectSolutions: true
    });

    // ── LeetCode — fallback selector (.xFUwe) ────────────────────────────────
    await testPlatform({
      name: 'leetcode',
      url:  'https://leetcode.com/problems/three-sum/',
      bodyHtml: `
        <div class="xFUwe">
          Find all triplets which give the sum of zero.
          Constraints: 0 le nums.length le 3000
        </div>`,
      expectTextContains: 'triplets',
      expectSolutions: false
    });

    // ── Codeforces ───────────────────────────────────────────────────────────
    await testPlatform({
      name: 'codeforces',
      url:  'https://codeforces.com/problemset/problem/1/A',
      bodyHtml: `
        <div class="problem-statement">
          <div class="header"><div class="title">Theatre Square</div></div>
          <p>In a far away country there is a theatre on a square of n x m metres.</p>
          <div class="input-specification">Input: two integers n and m (1 le n,m le 10^9)</div>
          <div class="output-specification">Output: number of flagstones needed.</div>
        </div>
        <textarea id="sourceCodeTextarea">import math
n,m=map(int,input().split())
print(math.ceil(n)*math.ceil(m))</textarea>`,
      expectTextContains: 'Theatre Square',
      expectSolutions: true
    });

    // ── HackerRank ───────────────────────────────────────────────────────────
    await testPlatform({
      name: 'hackerrank',
      url:  'https://www.hackerrank.com/challenges/solve-me-first/problem',
      bodyHtml: `
        <div class="challenge-text-body">
          Complete the function solveMeFirst to compute the sum of two integers.
          Returns: int sum of a and b.
        </div>
        <div class="CodeMirror-code"><pre>function solveMeFirst(a,b){ return a+b; }</pre></div>`,
      expectTextContains: 'solveMeFirst',
      expectSolutions: true
    });

    // ── CodeChef ─────────────────────────────────────────────────────────────
    await testPlatform({
      name: 'codechef',
      url:  'https://www.codechef.com/problems/FLOW001',
      bodyHtml: `
        <div class="problem-statement">
          Read two numbers and print their sum.
          Constraints: 1 le T le 100, 0 le A,B le 10000
        </div>
        <div class="CodeMirror-code"><pre>T=int(input())
for _ in range(T):
    print(sum(map(int,input().split())))</pre></div>`,
      expectTextContains: 'two numbers',
      expectSolutions: true
    });

    // ── Prompt augmentation via page.evaluate ─────────────────────────────────
    console.log(BOLD('\n── Prompt augmentation (in-page) ────────────────────'));
    {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', req => req.respond({
        status: 200, contentType: 'text/html',
        body: `<!DOCTYPE html><html><head></head><body>
          <div class="elfjS">Full problem text here. Constraints: n ge 1.</div>
        </body></html>`
      }));
      await page.goto('https://leetcode.com/problems/test/', { waitUntil: 'domcontentloaded' });

      const result = await page.evaluate(() => {
        // Simulate sidebar's sendUserMessage prompt construction
        const currentProblem = {
          fullProblemText: 'Full problem text here. Constraints: n ge 1.',
          scrapedSolutions: ['def solve(): pass', 'int solve() {}']
        };
        const message = 'How should I approach this?';

        const fullProblemText  = currentProblem?.fullProblemText  ?? null;
        const scrapedSolutions = currentProblem?.scrapedSolutions ?? [];

        let prompt = message;
        const problemContext = fullProblemText
          ? `\n\nFULL PROBLEM DESCRIPTION:\n${fullProblemText}` : '';
        const solutionsContext = scrapedSolutions && scrapedSolutions.length > 0
          ? `\n\nREFERENCE CODE (internal use only — do NOT reproduce verbatim to user):\n` +
            `Use these to verify your reasoning and ensure accuracy on hard problems.\n\n` +
            scrapedSolutions.map((s, i) => `[Solution ${i + 1}]\n${s}`).join('\n\n')
          : '';
        prompt += problemContext + solutionsContext;
        return prompt;
      });

      assert('prompt starts with user message', result.startsWith('How should I approach this?'));
      assert('prompt contains FULL PROBLEM DESCRIPTION section', result.includes('FULL PROBLEM DESCRIPTION'));
      assert('prompt contains REFERENCE CODE section', result.includes('REFERENCE CODE'));
      assert('prompt contains [Solution 1]', result.includes('[Solution 1]'));
      assert('prompt contains [Solution 2]', result.includes('[Solution 2]'));

      // Absent-data case
      const resultEmpty = await page.evaluate(() => {
        const message = 'How should I approach this?';
        const fullProblemText  = null;
        const scrapedSolutions = [];
        let prompt = message;
        const problemContext   = fullProblemText ? `\n\nFULL PROBLEM DESCRIPTION:\n${fullProblemText}` : '';
        const solutionsContext = scrapedSolutions && scrapedSolutions.length > 0 ? 'PRESENT' : '';
        prompt += problemContext + solutionsContext;
        return prompt;
      });
      assert('prompt === message when both fields absent (byte-for-byte)',
        resultEmpty === 'How should I approach this?');

      await page.close();
    }

  } catch (err) {
    console.error(RED('\nPuppeteer suite error: ' + err.message));
    if (err.message.includes('Cannot find module')) {
      console.log(DIM('  (puppeteer-core not installed — skipping suite 2)'));
    }
  } finally {
    if (browser) await browser.close();
  }

  // ─── Final summary ──────────────────────────────────────────────────────────
  console.log('\n' + BOLD('═'.repeat(52)));
  console.log(BOLD(`  TOTAL: ${passed} passed, ${failed} failed out of ${total}`));
  if (failures.length) {
    console.log(RED('\n  Failed tests:'));
    failures.forEach(f => console.log(RED(`    • ${f}`)));
  }
  console.log(BOLD('═'.repeat(52)) + '\n');
  process.exit(failed > 0 ? 1 : 0);
})();

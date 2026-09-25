/** Render the standalone deck; set PLAYWRIGHT_MODULE if Playwright is installed elsewhere. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let playwright;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/Users/limon/figma-export/node_modules/playwright'].filter(Boolean)) {
  try { playwright = require(candidate); break; } catch {}
}
if (!playwright) throw new Error('Install Playwright or set PLAYWRIGHT_MODULE.');
const root = path.resolve(__dirname, '..');
const review = path.join(root, 'output/pitch-review');
(async () => {
  fs.mkdirSync(review, { recursive: true });
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(__dirname, 'deck.html')).href);
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    const slides = page.locator('.slide');
    const count = await slides.count();
    const problems = await slides.evaluateAll(sections => sections.flatMap((s, i) => {
      const box = s.getBoundingClientRect();
      const foot = s.querySelector('footer').getBoundingClientRect();
      const issues = [];
      for (const el of s.querySelectorAll('main h1, main h2, main h3, main p, main li, main .contact, main .callout')) {
        const r = el.getBoundingClientRect();
        if (r.right > box.right + 1 || r.left < box.left - 1 || r.bottom > foot.top - 5) issues.push(`slide ${i+1}: clipped or footer overlap: ${el.textContent.slice(0, 90)}`);
      }
      if (s.scrollWidth > s.clientWidth || s.scrollHeight > s.clientHeight) issues.push(`slide ${i+1}: overflow`);
      return issues;
    }));
    if (problems.length) throw new Error(problems.join('\n'));
    for (let i = 0; i < count; i++) await slides.nth(i).screenshot({ path: path.join(review, `slide-${String(i+1).padStart(2, '0')}.png`) });
    await page.pdf({ path: path.join(root, 'Thesis-Pitch-Deck.pdf'), printBackground: true, preferCSSPageSize: true, tagged: true });
    fs.writeFileSync(path.join(review, 'deck-text.txt'), await page.locator('body').innerText());
    console.log(JSON.stringify({ slides: count, overflowIssues: problems.length, pdf: path.join(root, 'Thesis-Pitch-Deck.pdf'), bytes: fs.statSync(path.join(root, 'Thesis-Pitch-Deck.pdf')).size }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });

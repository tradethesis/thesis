/**
 * The waitlist page: one centred column, one screen, no scroll.
 *
 * Checks the constraints that define it rather than how it looks — that it never scrolls at
 * any size including a short laptop, that the column is centred, that the reveal finishes,
 * that reduced motion skips it entirely, and that the form actually works against the API.
 *
 *   BASE=http://localhost:3100 node scripts/waitlist-check.cjs
 */
const { chromium } = require("/Users/limon/figma-export/node_modules/playwright");
const fs = require("node:fs");

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "/Users/limon/thesis/output/join";
const SIZES = [[320, 568], [390, 844], [768, 1024], [1280, 720], [1440, 900]];

fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  let fails = 0;
  const check = (l, c, d = "") => { if (!c) fails += 1; console.log(`  ${c ? "ok  " : "FAIL"} ${l}${d ? "  " + d : ""}`); };

  for (const [w, h] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const broken = [];
    page.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/brand/")) broken.push(r.url()); });
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1400);
    console.log(`\n${w}x${h}`);

    const m = await page.evaluate(() => {
      const img = document.querySelector(".jn-backdrop img");
      const col = document.querySelector(".jn-main").getBoundingClientRect();
      return {
        vScroll: document.documentElement.scrollHeight > window.innerHeight + 1,
        hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
        centred: Math.abs((col.left + col.right) / 2 - window.innerWidth / 2) < 3,
        revealed: [...document.querySelectorAll(".jn-reveal")].every((e) => getComputedStyle(e).opacity === "1"),
        backdrop: img ? img.currentSrc.split("/").pop() : null,
        emails: document.querySelectorAll('input[type="email"]').length,
        small: [...document.querySelectorAll("input,button,a")]
          .map((e) => Math.round(e.getBoundingClientRect().height)).filter((x) => x > 0 && x < 44),
      };
    });

    check("no vertical scroll", !m.vScroll);
    check("no horizontal scroll", !m.hScroll);
    check("column is centred", m.centred);
    check("reveal finished", m.revealed);
    check("backdrop loaded", Boolean(m.backdrop) && broken.length === 0, m.backdrop ?? "none");
    check("exactly one email field", m.emails === 1, String(m.emails));
    check("targets at least 44px", m.small.length === 0, m.small.join(","));

    // Art direction: a phone must get the portrait cut, a laptop the landscape one.
    // max-aspect-ratio: 3/4 matches inclusively, so a 768x1024 tablet in portrait gets the
    // portrait cut too. Mirror the CSS rather than guessing at the boundary.
    const portrait = w / h <= 0.75;
    check(
      portrait ? "phone gets the portrait cut" : "wide screen gets the landscape cut",
      portrait ? m.backdrop?.includes("portrait") : !m.backdrop?.includes("portrait"),
      m.backdrop ?? "",
    );

    if (w === 390 || w === 1440) await page.screenshot({ path: `${OUT}/waitlist-${w}.png` });
    await page.close();
  }

  const rm = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  await rm.goto(BASE + "/", { waitUntil: "networkidle" });
  const still = await rm.evaluate(() => {
    const e = document.querySelector(".jn-h1");
    return { opacity: getComputedStyle(e).opacity, anim: getComputedStyle(e).animationName };
  });
  check("\nreduced motion: shown at once, no animation", still.opacity === "1" && still.anim === "none", JSON.stringify(still));
  await rm.close();

  const form = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await form.goto(BASE + "/join", { waitUntil: "networkidle" });
  await form.locator('input[type="email"]').fill("nope");
  await form.getByRole("button", { name: /Join/i }).click();
  await form.waitForTimeout(400);
  check("invalid address refused inline", await form.getByText(/does not look like an email/i).isVisible());
  await form.locator('input[type="email"]').fill(`waitlist-check+${Date.now()}@example.com`);
  await form.getByRole("button", { name: /Join/i }).click();
  await form.waitForTimeout(2000);
  check("valid address confirms", await form.getByText(/on the list/i).isVisible());

  await browser.close();
  console.log(fails ? `\n${fails} failing check(s)` : "\nall waitlist checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

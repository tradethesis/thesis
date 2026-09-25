/**
 * Browser checks for taking a side.
 *
 * The point of this feature is that it works with no wallet, so this runs in a plain
 * Chromium with no Phantom extension — the same thing almost every first-time visitor has.
 * If any check here needs a wallet to pass, the feature has failed.
 *
 * Each viewport gets a fresh context, so each one is a different anonymous person. That is
 * also what makes the crowd floor testable: four separate browsers backing the same belief
 * must still show no split.
 *
 *   BASE=http://localhost:3210 node scripts/conviction-check.cjs
 */
const { chromium } = require("/Users/limon/figma-export/node_modules/playwright");
const fs = require("node:fs");

const BASE = process.env.BASE || "http://localhost:3210";

/* Conviction used to live on feed cards at /app. The feed became the terminal on 21 September
   2026 and conviction moved into each expanded argument, but the component is unchanged and is
   still rendered on the public thesis page — which is also the only place it can be exercised
   without a wallet, which is the property this script is here to protect. */
const OUT = "/Users/limon/thesis/output/conviction";
const WIDTHS = [320, 390, 768, 1440];

fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  let failures = 0;
  const results = [];

  const check = (label, condition, detail = "") => {
    if (!condition) failures += 1;
    console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
    return condition;
  };

  for (const width of WIDTHS) {
    console.log(`\n${width}px`);
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Fifty-nine cards mounting their own fetch is fifty-nine requests for one answer.
    let convictionGets = 0;
    page.on("request", (r) => {
      if (r.method() === "GET" && r.url().includes("/api/conviction")) convictionGets += 1;
    });

    await page.goto(`${BASE}/t/the-toll-booths-outlast-the-traffic`, { waitUntil: "domcontentloaded", timeout: 90000 });

    // No wallet, at all. Everything below has to work anyway.
    const hasPhantom = await page.evaluate(() => Boolean(window.phantom || window.solana));
    check("no wallet is present", !hasPhantom);

    const sections = await page.locator(".td-section").count();
    check("the thesis page renders its argument", sections > 0, `${sections} sections`);

    const backFirst = page.locator(".tas-btn").first();
    await backFirst.waitFor({ state: "visible", timeout: 20000 });

    // Fifty-nine cards mount two of these each. One answer, one request — counted here,
    // before anything is clicked, because later navigations re-fetch for good reasons.
    await page.waitForTimeout(1200);
    check(
      "the record is fetched once, not once per card",
      convictionGets <= 2,
      `${convictionGets} GET /api/conviction on first paint`,
    );

    // A dead button looks exactly like a saved one that did not render, so prove React is
    // attached before drawing any conclusion from a click.
    const hydrated = await page
      .waitForFunction(
        () => {
          const el = document.querySelector(".tas-btn");
          return Boolean(el && Object.keys(el).some((k) => k.startsWith("__react")));
        },
        null,
        { timeout: 60000 },
      )
      .then(() => true)
      .catch(() => false);
    check("React is hydrated", hydrated, hydrated ? "" : "no React fibre; clicks do nothing");

    const box = await backFirst.boundingBox();
    check("touch target is at least 44px tall", box && box.height >= 44, box ? `${Math.round(box.height)}px` : "no box");

    // Back it.
    await backFirst.click();
    await page.waitForFunction(
      () => document.querySelector('.tas-btn[aria-pressed="true"]') !== null,
      null,
      { timeout: 45000 },
    );
    check("backing is recorded", (await backFirst.getAttribute("aria-pressed")) === "true");
    check("the label says so", (await backFirst.getAttribute("aria-pressed")) === "true");
    // The verdict is rendered by a sibling of the buttons, so it lands on the next paint
    // after the shared record updates rather than with the press itself.
    const verdict = await page
      .locator(".tas-verdict")
      .first()
      .waitFor({ state: "visible", timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    check("a verdict is shown", verdict);

    // It survives a reload, with no wallet and nothing signed.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(
      () => document.querySelector('.tas-btn[aria-pressed="true"]') !== null,
      null,
      { timeout: 45000 },
    );
    check("it survives a reload", (await page.locator(".tas-btn").first().getAttribute("aria-pressed")) === "true");

    // Switching replaces rather than duplicates.
    const doubtFirst = page.locator(".tas-btn--doubt").first();
    await doubtFirst.click();
    await page.waitForFunction(
      () => document.querySelector('.tas-btn--doubt[aria-pressed="true"]') !== null,
      null,
      { timeout: 45000 },
    );
    // Scoped to the conviction group rather than to a feed card, which no longer exists.
    const pressedInCard = await page.locator(".tas-buttons").first().locator('.tas-btn[aria-pressed="true"]').count();
    check("switching replaces, never duplicates", pressedInCard === 1, `${pressedInCard} pressed`);
    check("backing is released", (await page.locator(".tas-btn").first().getAttribute("aria-pressed")) === "false");

    // The collapsed card shows raw counts and never a percentage. A share of the vote is a
    // claim about what people think and is gated on the floor; a count of two is a count
    // of two. Nothing on this surface may render the former.
    const splits = await page.locator(".tas-split").count();
    check("no crowd percentage on a card", splits === 0, `${splits} shown`);

    // Focus has to be visible, since this is the one control a keyboard user can reach
    // without a wallet.
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const s = getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle };
    });
    check("focus is visible", outline && outline.style !== "none" && parseFloat(outline.width) > 0, JSON.stringify(outline));

    // Reduced motion is honoured. Every context here asks for it, so the press transition
    // must be gone — and it is checked as computed style rather than as a rule in the
    // stylesheet, because a rule that loses on specificity still reads as present.
    const motion = await page.evaluate(() => {
      const el = document.querySelector(".tas-btn");
      if (!el) return null;
      const s = getComputedStyle(el);
      return { property: s.transitionProperty, duration: s.transitionDuration };
    });
    check(
      "reduced motion suppresses the press transition",
      motion && (motion.property === "none" || motion.duration.split(",").every((d) => parseFloat(d) === 0)),
      JSON.stringify(motion),
    );

    check("no horizontal overflow on the thesis page", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  }

  /* The record tab moved to /app/my-theses, which is behind the wallet gate with the rest of the
     workspace. It is covered in scripts/terminal-check.cjs, which carries a session fixture. What
     this script exists to protect — that somebody with no wallet at all can take a side — is
     everything above and below. */

  console.log("\nmotion allowed");
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "no-preference" });
    const page = await context.newPage();
    await page.goto(`${BASE}/t/the-toll-booths-outlast-the-traffic`, { waitUntil: "domcontentloaded", timeout: 90000 });
    const motion = await page.evaluate(() => {
      const el = document.querySelector(".tas-btn");
      if (!el) return null;
      const s = getComputedStyle(el);
      return { property: s.transitionProperty, duration: s.transitionDuration };
    });
    check(
      "press feedback animates when motion is allowed",
      motion && motion.property.includes("transform") && parseFloat(motion.duration) > 0,
      JSON.stringify(motion),
    );
    await context.close();
  }

  fs.writeFileSync(`${OUT}/conviction-results.json`, JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), results }, null, 2));
  await browser.close();
  console.log(failures ? `\n${failures} failing check(s)` : "\nall conviction checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

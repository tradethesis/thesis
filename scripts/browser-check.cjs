/**
 * Browser checks for the calls grid, thesis detail and buy flow.
 *
 * Runs against an isolated server (default :3100) so it never touches the .next a dev
 * server is holding open. The expected card count is read from the page rather than
 * hardcoded, because the catalogue grows.
 *
 *   BASE=http://localhost:3100 node scripts/browser-check.cjs
 */
const { chromium } = require("/Users/limon/figma-export/node_modules/playwright");
const fs = require("node:fs");

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = "/Users/limon/thesis/output/calls";
const WIDTHS = [320, 390, 768, 1440];

fs.mkdirSync(OUT, { recursive: true });

(async () => {
    // HOST_RESOLVE="name=1.2.3.4" pins a hostname, for when the machine's resolver has a
  // stale negative cache for a domain that was queried before its DNS record existed.
  const pin = process.env.HOST_RESOLVE;
  const browser = await chromium.launch({
    headless: true,
    args: pin ? [`--host-resolver-rules=MAP ${pin.split("=")[0]} ${pin.split("=")[1]}`, "--ignore-certificate-errors"] : [],
  });
  const results = [];
  let failures = 0;

  const check = (label, condition, detail = "") => {
    if (!condition) failures += 1;
    console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
    return condition;
  };

  for (const width of WIDTHS) {
    console.log(`\n${width}px`);
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const errors = [];
    const brokenAssets = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400 && r.url().includes("/_next/static/")) brokenAssets.push(`${r.status()} ${r.url().split("/").pop()}`);
    });

    await page.goto(`${BASE}/explore`, { waitUntil: "networkidle", timeout: 60000 });
    const total = await page.locator(".cg-card").count();
    check("grid renders cards", total > 0, `${total} cards`);

    // Check this before anything that clicks. When the client bundle fails to load, React
    // never attaches and every interaction silently does nothing -- which looks exactly
    // like a broken filter or a dead button, and sends you hunting in the wrong place.
    check("client assets all loaded", brokenAssets.length === 0, brokenAssets.slice(0, 3).join(", "));
    const hydrated = await page.evaluate(() => {
      const el = document.querySelector("button[aria-pressed]") || document.querySelector("a");
      return el ? Object.keys(el).some((k) => k.startsWith("__react")) : false;
    });
    check("React is hydrated", hydrated, hydrated ? "" : "no React fibre on the DOM; clicks will do nothing");

    // The conversation must lead, with the non-endorsement attached to it.
    const quotes = await page.locator(".source-post").count();
    check("a source post is shown", quotes > 0, `${quotes}`);
    check("non-endorsement is visible", await page.getByText("No author endorsement.").first().isVisible());

    // Filters
    const resolved = page.getByRole("button", { name: "Resolved", exact: true });
    await resolved.click();
    await page.waitForFunction(() => document.querySelector('button[aria-pressed="true"]')?.textContent?.includes("Resolved"), null, { timeout: 5000 }).catch(() => {});
    check("Resolved becomes pressed", (await resolved.getAttribute("aria-pressed")) === "true", `aria-pressed=${await resolved.getAttribute("aria-pressed")}`);
    check("empty state explains itself", await page.locator(".cg-empty").isVisible());
    await page.getByRole("button", { name: "See all calls", exact: true }).click();
    check("See all calls restores the grid", (await page.locator(".cg-card").count()) === total);

    // Search, including by the source author
    const search = page.getByRole("searchbox");
    await search.fill("naval");
    const byAuthor = await page.locator(".cg-card").count();
    check("search finds a thesis by its source author", byAuthor >= 1, `${byAuthor} card(s)`);
    await search.fill("MSFTx");
    check("search finds a thesis by ticker", (await page.locator(".cg-card").count()) >= 1);
    await search.fill("");

    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.screenshot({ path: `${OUT}/grid-${width}.png`, fullPage: true });

    const links = await page.locator(".cg-card h2 a").evaluateAll((a) => a.map((x) => x.getAttribute("href")));

    for (const path of ["/", ...links]) {
      const response = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 });
      check(`${path} responds 200`, response.status() === 200, `http=${response.status()}`);
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      check(`${path} has no horizontal overflow`, !overflows);

      if (path.startsWith("/t/")) {
        const slider = page.getByRole("slider");
        if ((await slider.count()) >= 3) {
          for (let i = 0; i < 3; i++) await slider.nth(i).fill(String([60, 20, 20][i]));
          const buy = page.getByRole("link", { name: /Buy this basket/ });
          if (await buy.count()) {
            await buy.first().click();
            await page.waitForLoadState("networkidle");
            const a = await page.getByRole("slider").nth(0).inputValue();
            const b = await page.getByRole("slider").nth(1).inputValue();
            check("weights carry into the buy flow", a === "60" && b === "20", `${a}/${b}`);

            const amount = page.getByRole("spinbutton").first();
            await amount.fill("10");
            const warned = await page.getByText(/minimum is \$75/i).isVisible().catch(() => false);
            check("a below-minimum amount is refused", warned);
            await amount.fill("150");
            check("buy screen has no horizontal overflow", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
            if (width === 390) await page.screenshot({ path: `${OUT}/buy-${width}.png`, fullPage: true });
          }
        }
        if (width === 390) {
          await page.goto(BASE + path, { waitUntil: "networkidle" });
          await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
          await page.screenshot({ path: `${OUT}/thesis-${width}.png`, fullPage: true });
        }
      }
    }

    check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 160));
    results.push({ width, cards: total, errors });
    await page.close();
  }

  fs.writeFileSync(`${OUT}/browser-results.json`, JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), results }, null, 2));
  await browser.close();
  console.log(failures ? `\n${failures} failing check(s)` : "\nall browser checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

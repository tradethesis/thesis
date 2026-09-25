/**
 * The terminal, at the three widths it has to work at.
 *
 *   BASE=http://localhost:3000 node scripts/terminal-check.cjs
 *
 * Authenticated surfaces need a session, and there is no way to sign a wallet challenge from a
 * headless browser. So this writes a session row straight into the **local development** database
 * and sets the cookie — a test fixture, not a bypass. Nothing in the application changes, the
 * server still verifies the cookie against that row the way it always does, and the script
 * refuses to run against anything that is not localhost.
 *
 * What it looks for is mostly negative: no horizontal scroll, no three columns crushed onto a
 * phone, no invented data where there is none, and no chart drawn through readings that were
 * never taken.
 */

// Playwright is not a dependency of this app; the existing checks borrow the one installed
// beside it, the same way e2e-check.cjs does.
const { chromium } = require("/Users/limon/figma-export/node_modules/playwright");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const BASE = process.env.BASE || "http://localhost:3000";
const WALLET = "38y5uxVPTmeGa4YdcnhwfGeMccQcjetbYE45D9q5PR1L";

function databaseUrl() {
  const env = fs.readFileSync(`${__dirname}/../.env.local`, "utf8");
  const line = env.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  return line.slice("DATABASE_URL=".length).trim();
}

/** A session this browser can use. Local database only — asserted, not assumed. */
function makeSession() {
  const url = databaseUrl();
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error("terminal-check writes a session row and will only do that against a local database");
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  execFileSync("psql", [
    url,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `INSERT INTO wallet_session (wallet, nonce, domain, statement, issued_at, token_hash, state, expires_at)
     VALUES ('${WALLET}', 'check-${crypto.randomUUID()}', 'localhost:3000',
             'Browser check fixture', now(), '${hash}', 'authorized', now() + interval '1 hour')`,
  ]);
  return token;
}

function cleanup() {
  try {
    execFileSync("psql", [databaseUrl(), "-c", `DELETE FROM wallet_session WHERE nonce LIKE 'check-%'`]);
  } catch {
    /* best effort */
  }
}

let failures = 0;
const step = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
};

/**
 * Wait for React to attach.
 *
 * A click on a server-rendered button before hydration does nothing, and the failure looks
 * exactly like a button that is not there.
 */
async function hydrated(page, selector) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__react")));
    },
    selector,
    { timeout: 60000 },
  );
}

async function main() {
  const token = makeSession();
  const browser = await chromium.launch();
  const errors = [];

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([
    { name: "thesis_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));

  /* ------------------------------------------------------------- entry screen */
  /* The wallet gate moved from / to /connect on 22 September 2026, when the public matching
     homepage took the root. /app still redirects here, carrying its destination — that redirect is
     asserted below and is what stops the new homepage creating a connection loop. */
  console.log("\nentry screen");
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const anonPage = await anon.newPage();
  anonPage.on("pageerror", (e) => errors.push(`entry: ${e}`));
  await anonPage.goto(`${BASE}/connect`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await anonPage.locator(".ent-cta").waitFor({ timeout: 60000 });

  step("one action, and it is connect", (await anonPage.locator(".ent-cta").innerText()).includes("Connect"));
  step("no marketing sections", (await anonPage.locator(".ln-hero, .ln-facts, .wk").count()) === 0);
  step(
    "the illustration cannot be clicked or focused",
    (await anonPage.locator(".ent-scene").evaluate((el) => getComputedStyle(el).pointerEvents)) === "none" &&
      (await anonPage.locator(".ent-scene [tabindex], .ent-scene a, .ent-scene button").count()) === 0,
  );
  step(
    "no numerals on the display boards",
    // A number on a board reads as a price. The bars carry magnitude and nothing else.
    !(await anonPage.locator(".ent-art").innerHTML()).match(/<text/),
  );
  const deep = await anonPage.goto(`${BASE}/app/my-theses`, { waitUntil: "domcontentloaded" });
  step(
    "a deep link without a session returns to the entry screen",
    anonPage.url().includes("/connect") && anonPage.url().includes("next=%2Fapp%2Fmy-theses"),
    anonPage.url().replace(BASE, ""),
  );
  step("and it is the entry screen, not an error", deep.status() === 200);
  await anon.close();

  /* ----------------------------------------------------------------- desktop */
  console.log("\n1440x900");
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator(".tml-row").first().waitFor({ timeout: 60000 });

  const cols = await page.locator(".tm-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  const [l, m, r] = cols.split(" ").map(parseFloat);
  const total = l + m + r;
  step("three columns at roughly 20/60/20", Math.abs(l / total - 0.2) < 0.03 && Math.abs(m / total - 0.6) < 0.03, cols);
  step("several baskets visible at once", (await page.locator(".tml-row").count()) >= 5, `${await page.locator(".tml-row").count()} rows`);
  step("no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  // The thesis leads; the chart is folded under it and opens on demand.
  const lead = await page.locator(".tmw-lead").boundingBox();
  const fold = await page.locator("details.tmw-chart").boundingBox();
  step("the thesis comes before the chart", Boolean(lead && fold && lead.y < fold.y));
  step("the chart starts folded", (await page.locator("details.tmw-chart").getAttribute("open")) === null);

  // The number in three places has to be one number.
  const header = await page.locator(".tmw-figure strong").first().innerText();
  const folded = await page.locator(".tmw-chart-sum b").first().innerText().catch(() => "");
  step("header and folded summary agree", header.trim() === folded.trim(), `${header.trim()} / ${folded.trim()}`);
  await page.locator("details.tmw-chart > summary").click();
  const chartH = await page.locator(".tmc-plot").evaluate((el) => el.getBoundingClientRect().height);
  step("opening it shows the full chart", chartH >= 300 && chartH <= 460, `${Math.round(chartH)}px`);
  const key = await page.locator(".tmc-key--basket strong").first().innerText();
  step("header and chart agree", header.trim() === key.trim(), `${header.trim()} / ${key.trim()}`);

  // Your holdings are the rail's first tab, always there; traders sit behind the second.
  step("the rail opens on My holdings", (await page.locator('.tmr-tabs [aria-selected="true"]').innerText()).includes("My holdings"));
  await page.locator(".tmr-tabs button", { hasText: "Top traders" }).click();
  step("the trader panel says rankings are coming rather than inventing rows", (await page.locator(".tmt-empty-head").innerText()).includes("rankings are coming") && (await page.locator(".tm-col--right tr, .tmt-row").count()) === 0);
  step("no trader rows are rendered", (await page.locator(".tmt .tmt-empty").count()) === 1);

  /* ------------------------------------------------------- selection and urls */
  console.log("\nselection");
  await hydrated(page, ".tml-row");
  const second = page.locator(".tml-row").nth(1);
  const name = (await second.locator(".tml-name").innerText()).trim();
  await second.click();
  await page.waitForFunction((n) => document.querySelector(".tmw-title h1")?.textContent?.trim() === n, name, { timeout: 30000 });
  step("selecting a row changes the workspace", (await page.locator(".tmw-title h1").innerText()).trim() === name);
  step("and the url carries it", page.url().includes("basket="), page.url().replace(BASE, ""));

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".tmw-title h1").waitFor({ timeout: 60000 });
  step("a reload keeps the selection", (await page.locator(".tmw-title h1").innerText()).trim() === name);

  // replaceState is deliberate — scanning ten baskets should not cost ten back presses — so
  // back leaves the terminal rather than stepping through selections. What matters is that it
  // does not break.
  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  step("back does not error", (await page.locator("body").count()) === 1);
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });

  await page.goto(`${BASE}/app?basket=not-a-real-basket`, { waitUntil: "domcontentloaded" });
  await page.locator(".tmw-title h1").waitFor({ timeout: 60000 });
  step("an unknown basket falls back rather than erroring", (await page.locator(".tmw-title h1").count()) === 1);

  /* ------------------------------------------------------------------ theses */
  console.log("\nattached theses");
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.locator(".tmw-case > summary").first().waitFor({ timeout: 60000 });
  await hydrated(page, ".tmw-case > summary");
  await page.locator(".tmw-case > summary").first().click();
  const body = (await page.locator(".tmw-case").first().innerText()).toLowerCase();
  step("the lead thesis opens to the case against", body.includes("the case against"));
  step("and what would change the call", body.includes("change the call"));

  /* ------------------------------------------------------------------- tablet */
  console.log("\n768x1024");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.locator(".tml-row").first().waitFor({ timeout: 60000 });
  step("traders move out of the way", await page.locator(".tm-col--right").evaluate((el) => getComputedStyle(el).display === "none"));
  step("no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  /* ------------------------------------------------------------------- phone */
  console.log("\n390x844");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.locator(".tml-row").first().waitFor({ timeout: 60000 });

  step("three states, not three columns", await page.locator(".tm-tabs").isVisible());
  step(
    "only the list is showing",
    await page.locator(".tm-col--main").evaluate((el) => getComputedStyle(el).display === "none"),
  );
  await hydrated(page, ".tml-row");
  await page.locator(".tml-row").first().click();
  await page.locator(".tmw-title h1").waitFor({ timeout: 30000 });
  step("picking one opens its detail", await page.locator(".tm-col--main").isVisible());
  step("and there is a way back", await page.locator('.tm-tabs button:has-text("Baskets")').isVisible());

  await page.locator('.tm-tabs button:has-text("Baskets")').click();
  step("back to the list keeps the selection in the url", page.url().includes("basket="));

  step("no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  step(
    "every action clears 44px",
    await page.evaluate(() => {
      const small = [...document.querySelectorAll("button, a, summary")]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => el.getBoundingClientRect().height < 44);
      return small.length === 0;
    }),
  );

  /* ------------------------------------------------- every route, every width
     The terminal was the only route checked when the shell was stripped, which is how three
     sibling routes shipped with an unstyled nav, no side padding and the fixed bar over their
     last control. They are all walked now. */
  for (const width of [390, 768, 1440]) {
    console.log(`\nall /app routes at ${width}px`);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });

    for (const route of ["/app", "/app/create", "/app/my-theses", "/app/leaderboard"]) {
      // networkidle, not domcontentloaded: these lists arrive with the data, and scrolling before
      // they have finished growing leaves a row straddling the bar.
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 120000 });
      await page.locator(".tm-nav").waitFor({ timeout: 60000 });
      /* Scroll every scroller to its end, and keep going until nothing moves.
         "Is the last control covered" is only a real question once somebody has scrolled to it.
         A fixed number of passes is not enough: these lists render on the client and the content
         is still growing, so the scroll lands short and a row is left straddling the bar. Loop
         until the positions agree twice running. */
      const scrollEverything = () =>
        page.evaluate(() => {
          const marks = [];
          const se = document.scrollingElement || document.documentElement;
          se.scrollTop = se.scrollHeight;
          marks.push(se.scrollTop);
          for (const el of document.querySelectorAll("*")) {
            const oy = getComputedStyle(el).overflowY;
            if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) {
              el.scrollTop = el.scrollHeight;
              marks.push(el.scrollTop);
            }
          }
          return marks.join(",");
        });

      let previous = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const marks = await scrollEverything();
        if (marks === previous) break;
        previous = marks;
        await page.waitForTimeout(250);
      }

      const m = await page.evaluate(() => {
        const nav = document.querySelector(".tm-nav");
        const bottom = document.querySelector(".tm-nav-bottom");
        const main = document.querySelector(".tm-page");
        const cs = (el) => (el ? getComputedStyle(el) : null);
        // The last thing somebody can press. If the fixed bar sits over it, the page is unusable
        // however good it looks.
        const pressable = [...document.querySelectorAll("button, a, input, select, summary")]
          .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0)
          .filter((el) => !el.closest(".tm-nav-bottom") && !el.closest(".tm-nav"));
        // display, not position: a `display: none` element still computes `position: fixed`, and
        // its rect is all zeros — which made every control look covered by a bar that is not there.
        const barShown = bottom && cs(bottom).display !== "none";
        const bottomTop = barShown ? bottom.getBoundingClientRect().top : Infinity;
        // Only things actually on screen after scrolling to the end.
        const onScreen = pressable.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.top < window.innerHeight && r.bottom > 0;
        });
        const last = onScreen[onScreen.length - 1];
        return {
          navSticky: cs(nav)?.position,
          navFlex: cs(nav.querySelector(".tm-nav-inner"))?.display,
          bottomShown: barShown,
          mainPadLeft: main ? parseFloat(cs(main).paddingLeft) : -1,
          mainPadBottom: main ? parseFloat(cs(main).paddingBottom) : -1,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          lastCovered: last ? last.getBoundingClientRect().bottom > bottomTop : false,
          lastWhat: last ? `${last.tagName}.${(last.className || "").toString().trim().split(/\s+/)[0] || "-"}@${Math.round(last.getBoundingClientRect().bottom)}` : "none",
          barTop: Number.isFinite(bottomTop) ? Math.round(bottomTop) : null,
          small: onScreen.filter((el) => el.getBoundingClientRect().height < 44).length,
          smallWhat: onScreen
            .filter((el) => el.getBoundingClientRect().height < 44)
            .map((el) => `${el.tagName}.${(el.className || "").toString().trim().split(/\s+/)[0] || "-"}:${Math.round(el.getBoundingClientRect().height)}`)
            .slice(0, 3)
            .join(","),
        };
      });

      // The bottom bar is shown below 1024, where the desktop links are hidden. 768 is a tablet
      // that still uses it and is still a touch device, so it holds the same 44px bar.
      const hasBar = width < 1024;
      const ok =
        m.navSticky === "sticky" &&
        m.navFlex === "flex" &&
        (hasBar ? m.bottomShown : !m.bottomShown) &&
        // The terminal sets padding-inline: 0 deliberately — its three columns carry their own.
        (route === "/app" ? m.mainPadLeft === 0 : m.mainPadLeft >= 16) &&
        /* The terminal deliberately has no bottom padding above 1024: its grid is exactly one
           viewport, the page does not scroll, and forty pixels under it is a dead band. Every
           other route, and the terminal below 1024, must clear the fixed bar. */
        (route === "/app" && !hasBar ? m.mainPadBottom === 0 : m.mainPadBottom >= 40) &&
        !m.overflow &&
        !m.lastCovered &&
        (hasBar ? m.small === 0 : true);

      step(
        route.padEnd(18),
        ok,
        `nav=${m.navSticky}/${m.navFlex} bar=${m.bottomShown ? "shown" : "hidden"} padL=${m.mainPadLeft} padB=${Math.round(m.mainPadBottom)}` +
          `${m.overflow ? " OVERFLOW" : ""}${m.lastCovered ? ` COVERED:${m.lastWhat}>bar@${m.barTop}` : ""}${m.small ? ` SMALL:${m.smallWhat}` : ""}`,
      );
    }
  }

  step("no page errors anywhere", errors.length === 0, errors.slice(0, 2).join(" | "));

  await browser.close();
  cleanup();
  console.log(failures ? `\n${failures} problem(s).` : "\nthe terminal works at every width.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  cleanup();
  console.error(e);
  process.exit(1);
});

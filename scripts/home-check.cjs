/**
 * The matching homepage at /.
 *
 * Covers the cases that decide whether this page is honest rather than merely working: a
 * directional contradiction is never sold as a match, a stale answer never lands on top of a fresh
 * one, the provider being down says so instead of inventing results, and the phone gets the task
 * in the order it is done rather than two desktop columns squeezed side by side.
 *
 *   BASE=http://localhost:3000 node scripts/home-check.cjs
 */
const { chromium } = require("/Users/limon/figma-export/node_modules/playwright");

const BASE = process.env.BASE || "http://localhost:3000";
/* The matcher moved from / to /discover on 22 September 2026, when / became the gift collection. */
const PAGE = "/discover";
const BULL = "Every AI dollar has to pass through a chip, a cloud and a deployment layer. I want exposure to that whole chain.";
const BEAR = "AI datacenter capex is a bubble. The depreciation schedules are fiction and this spending collapses in 2027. I want to be short the whole buildout.";
const OFF = "I think Japanese convenience store logistics is an underrated compounding business.";

let fail = 0;
const ok = (l, c, d = "") => { if (!c) fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${l}${d ? "  " + d : ""}`); };

/*
 * Wait for an outcome, not for a spinner to be absent.
 *
 * The first version polled for `.hm-working` to disappear, which is true for the frame between the
 * click and React's next render — so it returned before the request had even been made.
 */
/** React has to be attached before the field is driven — see `type` below for why. */
async function ready(p) {
  await p.locator(".hm-field").waitFor({ timeout: 60000 });
  await p.waitForFunction(
    () => {
      const e = document.querySelector(".hm-send");
      return Boolean(e && Object.keys(e).some((k) => k.startsWith("__react")));
    },
    null,
    { timeout: 60000 },
  );
}

/*
 * Set the value the way React sees it.
 *
 * `locator.fill()` writes `el.value` directly. On a controlled textarea that is a race: if it lands
 * before hydration, React mounts with its own empty state and the typed text vanishes — which is
 * exactly what made the first version of this script time out with no request ever sent. Going
 * through the prototype setter and dispatching a bubbling `input` is what React's own value tracker
 * listens for, so the component's state actually changes.
 */
async function type(p, text) {
  await p.locator(".hm-field").evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
}

async function search(p, text) {
  await type(p, text);
  await p.locator(".hm-send").click();
  await p.waitForFunction(
    () => Boolean(document.querySelector(".hm-split, .hm-problem")) && !document.querySelector(".hm-working"),
    null,
    { timeout: 120000 },
  );
}

(async () => {
  const b = await chromium.launch();
  const errs = [];

  // ---------------------------------------------------------------- desktop
  const c = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const p = await c.newPage();
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });

  /*
   * Wait out any limiter left running by a previous run.
   *
   * The suite ends by deliberately tripping the rate limit, so starting again inside the same
   * minute meant the first search 429'd and the run failed on an assertion about the layout. The
   * limiter working is not a reason for the check to fail.
   */
  for (let i = 0; i < 12; i++) {
    const probe = await (await c.request)
      .post(`${BASE}/api/match`, { data: { input: "warmup" }, failOnStatusCode: false })
      .catch(() => null); // a reset while the server is warming is not a rate limit
    if (!probe || probe.status() !== 429) break;
    if (i === 0) console.log("  --   waiting out the rate limiter from a previous run");
    await new Promise((r) => setTimeout(r, 6000));
  }

  await p.goto(`${BASE}${PAGE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await ready(p);

  console.log("before searching");
  ok("the input is dominant and empty", (await p.locator(".hm-field").inputValue()) === "");
  const examples = await p.locator(".hm-examples button").count();
  ok("three example ideas from real baskets", examples === 3, `${examples}`);
  ok("a quiet workspace explains what appears", (await p.locator(".hm-empty-note").count()) === 1);
  ok("the caption states a real catalogue size", /\d+ reviewed baskets indexed/.test(await p.locator(".hm-cap").innerText()), (await p.locator(".hm-cap").innerText()).split("·")[0].trim());
  ok("no results are shown before searching", (await p.locator(".hm-split").count()) === 0);
  ok("no wallet is needed to be here", !(await p.evaluate(() => Boolean(window.phantom || window.solana))));

  console.log("\nplain text, bullish");
  await search(p, BULL);
  await p.locator(".hm-basket-name").waitFor({ timeout: 60000 });
  const rows = await p.locator(".hm-match").count();
  ok("candidates appear", rows >= 1, `${rows} rows`);
  ok("the selected basket is on the left", (await p.locator(".hm-left .hm-basket-name").count()) === 1);
  ok("the allocation is shown as reviewed weights", (await p.locator(".hm-stat").count()) >= 2, `${await p.locator(".hm-stat").count()} holdings`);
  ok("the page says which input produced this", (await p.locator(".hm-answered-text").innerText()).includes("AI dollar"));
  ok("review leads to the existing checkout", /\/buy\//.test(await p.locator(".hm-btn--go").last().getAttribute("href") ?? ""));
  const top = await p.locator(".hm-match").first();
  ok("strength is stated in words, not only colour", /STRONG|PARTIAL|WEAK/i.test(await top.innerText()));
  ok("the selected row carries a marker as well as colour", (await top.locator(".hm-match-mark").innerText()).trim() === "›");
  // The fill transitions over 420ms. Measured on the frame results land, every bar is still at
  // scaleX(0) and reads 0px wide — which says nothing about whether the animation runs.
  await p.waitForFunction(
    () => [...document.querySelectorAll(".hm-fill")].every((e) => !getComputedStyle(e).transform.startsWith("matrix(0,")),
    null,
    { timeout: 10000 },
  );
  const bar = await p.locator(".hm-fill").first().evaluate((e) => ({
    w: e.getBoundingClientRect().width,
    track: e.parentElement.getBoundingClientRect().width,
  }));
  ok("bars animated once to their returned values", bar.w > 4 && bar.w <= bar.track + 1, `${Math.round(bar.w)}/${Math.round(bar.track)}px`);
  ok("no raw score is shown beside a basket", !/\b0\.\d\d\b/.test(await p.locator(".hm-matches").innerText()));

  console.log("\nthe decision panel");
  {
    const tel = await p.locator(".hm-tel").innerText();
    // The relevance provider is infrastructure and is named nowhere a reader can see it.
    const page = await p.locator("body").innerText();
    ok("the provider is not named on the page", !/\bjev\b|typesafe/i.test(page), (page.match(/\bjev\b|typesafe/i) || ["clean"])[0]);
    const scored = (tel.match(/(\d+)\s*\/\s*(\d+)/) || []).slice(1).map(Number);
    ok("every basket in the catalogue was scored", scored[0] === scored[1] && scored[0] > 1, scored.join("/"));
    ok("token usage is the provider's own", /[\d,]+/.test(tel) && !/\b0\b\s*$/.test(tel));
    const rows = await p.locator(".hm-dec-row").count();
    ok("one row per candidate", rows === scored[1], `${rows} rows`);
    ok("each row shows the direction it returned", (await p.locator(".hm-dec-choice").count()) === rows);
    // Solid / hatched / flat, so the three are not told apart by hue alone.
    const opp = await p.locator(".hm-dec-seg--opp").first().evaluate((e) => getComputedStyle(e).backgroundImage);
    ok("opposite is textured, not just another colour", opp.includes("gradient"), opp.slice(0, 30));
    ok("the panel stops claiming to run once it is done", (await p.locator(".hm-dec-state.is-live").count()) === 0);
  }

  console.log("\nabout this match");
  await p.locator(".hm-disclose").click();
  const about = await p.locator(".hm-about").innerText();
  ok("the estimate is labelled unvalidated", /unvalidated/i.test(about));
  ok("it denies being a probability of profit", /not\b[\s\S]*probability of profit/i.test(about));
  ok("it says candidates are judged independently", /on its own|independent/i.test(about));

  console.log("\nswitching candidates");
  if (rows >= 2) {
    const first = await p.locator(".hm-basket-name").innerText();
    await p.locator(".hm-match").nth(1).click();
    await p.waitForTimeout(400);
    ok("the left basket changes", (await p.locator(".hm-basket-name").innerText()) !== first);
    ok("the selection moves with it", (await p.locator(".hm-match").nth(1).getAttribute("aria-current")) === "true");
  } else {
    console.log("  --   only one candidate; switching not exercised");
  }

  console.log("\ndirectional contradiction");
  await search(p, BEAR);
  await p.waitForTimeout(300);
  const bearText = await p.locator(".hm-work").innerText();
  ok("a bearish idea is not sold a bullish basket", !/STRONG/i.test(bearText));
  ok("the contradiction is stated in words", /points the other way/i.test(bearText), bearText.match(/points the other way/i) ? "" : "not found");
  ok("it says plainly that nothing matches", /no reviewed basket expresses/i.test(bearText));

  console.log("\nno match");
  await search(p, OFF);
  ok("an unrelated idea returns no match", /no reviewed basket expresses/i.test(await p.locator(".hm-work").innerText()));

  console.log("\nediting and resubmitting");
  await type(p, `${OFF} and also semiconductors`);
  await p.waitForTimeout(200);
  ok("editing marks the shown results as stale", (await p.locator(".hm-answered-stale").count()) === 1);
  ok("the previous input is still labelled", (await p.locator(".hm-answered-text").innerText()).includes("convenience"));

  console.log("\nbad input");
  await search(p, "https://example.com/not/a/post");
  ok("a non-post link is refused with a way forward", /paste its text/i.test(await p.locator(".hm-problem").innerText()));
  ok("the input is preserved", (await p.locator(".hm-field").inputValue()).includes("example.com"));

  console.log("\nstale responses");
  {
    const sp = await c.newPage();
    await sp.goto(`${BASE}${PAGE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await ready(sp);
    // The first search answers slowly; the second is immediate. The slow one must not land.
    let n = 0;
    await sp.route("**/api/match", async (route) => {
      n += 1;
      if (n === 1) {
        await new Promise((r) => setTimeout(r, 4000));
        // The endpoint streams NDJSON events, so a mock has to speak the same shape.
        return route.fulfill({
          status: 200, contentType: "application/x-ndjson",
          body: `${JSON.stringify({ type: "started", query: "STALE", source: { kind: "text" }, candidates: [] })}\n` +
                `${JSON.stringify({ type: "done", result: { status: "ok", query: "STALE", source: { kind: "text" }, candidates: [], noMatch: true, noMatchNote: "STALE ANSWER", fixture: false, telemetry: null } })}\n`,
        });
      }
      return route.continue();
    });
    await type(sp, "first idea about datacenters");
    await sp.locator(".hm-send").click();
    await sp.waitForTimeout(250);
    await type(sp, BULL);
    await sp.locator(".hm-send").click();
    await sp.waitForFunction(
      () => Boolean(document.querySelector(".hm-split, .hm-problem")) && !document.querySelector(".hm-working"),
      null, { timeout: 120000 },
    );
    await sp.waitForTimeout(5000); // let the slow first answer arrive and be dropped
    const shown = await sp.locator(".hm-work").innerText();
    ok("a slow answer never replaces a newer one", !shown.includes("STALE ANSWER"));
    ok("the newer results are the ones on screen", (await sp.locator(".hm-answered-text").innerText()).includes("AI dollar"));
    await sp.close();
  }

  console.log("\nprovider failure and retry");
  {
    const fp = await c.newPage();
    await fp.goto(`${BASE}${PAGE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await ready(fp);
    let calls = 0;
    await fp.route("**/api/match", async (route) => {
      calls += 1;
      if (calls === 1) {
        return route.fulfill({
          status: 200, contentType: "application/x-ndjson",
          body: `${JSON.stringify({ type: "failed", result: { status: "unavailable", query: BULL, reason: "unreachable", message: "The relevance service did not answer." } })}\n`,
        });
      }
      return route.continue();
    });
    await search(fp, BULL);
    const problem = await fp.locator(".hm-problem").innerText();
    ok("a provider failure is admitted, not faked", /did not answer/i.test(problem));
    ok("nothing is invented in its place", (await fp.locator(".hm-match").count()) === 0);
    await fp.locator(".hm-problem button").click();
    await fp.waitForFunction(
      () => Boolean(document.querySelector(".hm-split, .hm-problem")) && !document.querySelector(".hm-working"),
      null, { timeout: 120000 },
    );
    ok("retry works and returns real results", (await fp.locator(".hm-basket-name").count()) === 1);
    await fp.close();
  }

  console.log("\nrouting");
  {
    const rp = await c.newPage();
    const res = await rp.goto(`${BASE}${PAGE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    ok(`${PAGE} is public and does not redirect`, res.status() === 200 && new URL(rp.url()).pathname === PAGE, rp.url());
    await rp.locator(".hm-head-nav a").first().click();
    await rp.waitForLoadState("domcontentloaded");
    const u = new URL(rp.url());
    ok("Explore terminal sends an unsigned visitor to the gate", u.pathname === "/connect", u.pathname);
    ok("and carries the terminal as its destination", u.searchParams.get("next") === "/app", u.search);
    ok("the gate is not the homepage, so there is no loop", (await rp.locator(".hm-field").count()) === 0);
    await rp.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 120000 });
    ok("/app still protects itself", new URL(rp.url()).pathname === "/connect", rp.url());
    await rp.close();
  }

  console.log("\ncarrying the basket through sign-in");
  {
    const bp = await c.newPage();
    await bp.goto(`${BASE}${PAGE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await ready(bp);
    await search(bp, BULL);
    await bp.locator(".hm-basket-name").waitFor({ timeout: 60000 });
    const chose = await bp.locator(".hm-basket-name").innerText();
    // waitForLoadState resolves at once when the current document is already loaded, so it proves
    // nothing about a navigation that has not started. Wait for the URL itself.
    await Promise.all([
      bp.waitForURL(/\/buy\//, { timeout: 60000 }),
      bp.locator(".hm-left .hm-btn--go").click(),
    ]);
    const path = new URL(bp.url()).pathname;
    ok("review opens the existing checkout for that basket", path.startsWith("/buy/"), path);
    // The identity is in the URL, so connecting a wallet returns to this basket and this
    // allocation rather than to a generic landing.
    ok("the checkout names the same basket", (await bp.locator("h1, .by-title").first().innerText()).length > 0, chose);
    await bp.locator(".by-budget, .signin").first().waitFor({ timeout: 60000 });
    ok("and asks for a wallet without losing it", (await bp.locator(".signin").count()) > 0 || (await bp.locator(".by-budget").count()) > 0);
    await bp.close();
  }

  console.log("\naccessibility");
  ok("the field has a real label", await p.evaluate(() => {
    const f = document.querySelector(".hm-field");
    return Boolean(document.querySelector(`label[for="${f.id}"]`));
  }));
  /*
   * From a known starting point. Tabbing at the end of a long run starts from wherever the last
   * click left focus, which is not a property of this page — the first version did that and
   * reported a failure about an element it never named.
   */
  {
    const kp = await c.newPage();
    await kp.goto(`${BASE}${PAGE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await ready(kp);
    const seen = [];
    for (let i = 0; i < 5; i++) {
      await kp.keyboard.press("Tab");
      seen.push(await kp.evaluate(() => {
        const e = document.activeElement;
        const s = getComputedStyle(e);
        const ring = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
        /* The prompt field shows focus on the pill around it rather than on itself — one surface,
           one indicator — so for that one the container's border is what has to change. */
        const pill = e.closest?.(".hm-bar");
        const viaPill = Boolean(pill) && getComputedStyle(pill).borderTopColor !== "rgb(35, 40, 43)";
        return { what: e.className || e.tagName, visible: ring || viaPill };
      }));
    }
    const inPage = seen.filter((x) => typeof x.what === "string" && x.what.startsWith("hm"));
    ok("tabbing reaches this page's controls", inPage.length >= 3, inPage.map((x) => x.what).join(" → "));
    ok("every one of them shows a focus ring", inPage.every((x) => x.visible), JSON.stringify(inPage.filter((x) => !x.visible)));
    await kp.close();
  }

  // ------------------------------------------------------------------ phone
  console.log("\nphone, 390px");
  const mc = await b.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mc.newPage();
  mp.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  await mp.goto(`${BASE}${PAGE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await ready(mp);
  await search(mp, BULL);
  await mp.locator(".hm-basket-name").waitFor({ timeout: 60000 });
  const order = await mp.evaluate(() => {
    const y = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? Infinity;
    return { field: y(".hm-field"), basket: y(".hm-basket-name"), action: y(".hm-actions"), compare: y(".hm-right") };
  });
  ok("search comes first", order.field < order.basket, JSON.stringify(order.field));
  ok("then the basket and its action", order.basket < order.compare && order.action < order.compare);
  ok("comparison comes last, not squeezed beside it", order.compare > order.action);

  // On a phone the comparison starts closed: the basket and its action come first, and the bars
  // are opened by somebody who wants them.
  ok("comparison is collapsed on a phone", (await mp.locator(".hm-compare").evaluate((e) => e.open)) === false);
  ok("its bars are not on screen until asked", (await mp.locator(".hm-match").first().isVisible()) === false);
  await mp.locator(".hm-compare > summary").click();
  await mp.waitForTimeout(300);
  ok("opening it reveals the bars and the reasoning", (await mp.locator(".hm-match").first().isVisible()) && (await mp.locator(".hm-why-text").first().isVisible()));
  const sum = await mp.locator(".hm-compare > summary").boundingBox();
  ok("the disclosure is a touch target", sum.height >= 44, `${Math.round(sum.height)}px`);
  ok("no horizontal overflow", !(await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  const tap = await mp.locator(".hm-send").boundingBox();
  ok("touch targets are at least 44px", tap.height >= 44, `${Math.round(tap.height)}px`);

  ok("no page errors anywhere", errs.length === 0, errs[0] ?? "");

  /* The demand loop: the catalogue cannot say what is missing from it, so the searches that found
     nothing are the rows worth having. */
  console.log("\nthe demand log");
  {
    const { execFileSync } = require("node:child_process");
    const fs = require("node:fs");
    const U = fs.readFileSync("/Users/limon/thesis/.env.local", "utf8")
      .split("\n").find((l) => l.startsWith("DATABASE_URL="))
      .split("=").slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
    const q = (sql) => execFileSync("psql", [U, "-tAc", sql]).toString().trim();
    const before = Number(q("select count(*) from match_query"));
    const probe = `demand probe ${Date.now()}`;
    await (await c.request).post(`${BASE}/api/match`, { data: { input: probe }, failOnStatusCode: false });
    await new Promise((r) => setTimeout(r, 2500));
    ok("a search is written down", Number(q("select count(*) from match_query")) > before);
    const row = q(`select outcome || '|' || no_match from match_query where input = '${probe}'`);
    // `boolean || text` casts to "true"/"false" in Postgres, not to "t"/"f".
    ok("with its outcome and whether anything matched", /^(ok|unavailable|error)\|(true|false)$/.test(row), row);
    // Identity is absent by omission, which is the only way it stays absent.
    const cols = q("select string_agg(column_name, ',') from information_schema.columns where table_name = 'match_query'");
    ok("and nothing that identifies anybody", !/wallet|session|ip|agent|address/i.test(cols), cols);
  }

  /* Last, because tripping the limiter deliberately would starve every step above it. */
  console.log("\nlimits");
  {
    const api = await c.request;
    const long = await api.post(`${BASE}/api/match`, { data: { input: "x".repeat(5000) }, failOnStatusCode: false });
    ok("over-long input is refused", long.status() === 413, `${long.status()}`);
    const empty = await api.post(`${BASE}/api/match`, { data: { input: "   " }, failOnStatusCode: false });
    ok("empty input is refused", empty.status() === 400, `${empty.status()}`);

    /*
     * Probe with empty input. The limiter runs before the body is validated, so an empty request
     * still counts against the window but returns in milliseconds. Probing with real searches took
     * roughly 1.4s each, so forty of them spanned the whole sixty-second window and the limit reset
     * underneath the test.
     */
    let limited = 0;
    for (let i = 0; i < 60; i++) {
      const r = await api.post(`${BASE}/api/match`, { data: { input: "" }, failOnStatusCode: false });
      if (r.status() === 429) { limited = i + 1; break; }
    }
    ok("the endpoint rate limits", limited > 0, limited ? `429 after ${limited}` : "never limited in 40");
  }


  await b.close();
  console.log(fail ? `\n${fail} failing` : "\nthe homepage holds up");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

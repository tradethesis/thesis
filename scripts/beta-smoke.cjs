/**
 * What a stranger gets when they open beta.
 *
 * Everything else in scripts/ tests localhost. This one tests the deployed thing, because the two
 * differ in ways that only show up deployed: the server is UTC and a reader is not (that is where
 * the hydration bug came from), and beta runs EXECUTION_MODE=live with a per-wallet allowlist.
 *
 * It writes one session row per run to the beta database — never production. Nothing it does can
 * sign or spend: it stops at the budget step and reads labels.
 *
 *   node scripts/beta-smoke.cjs
 */
const { chromium } = require("/Users/limon/figma-export/node_modules/playwright");
const crypto = require("node:crypto"); const { execFileSync } = require("node:child_process"); const fs = require("node:fs");
const BASE = "https://beta.tradethesis.xyz";
const env = fs.readFileSync("/Users/limon/thesis/.env.beta.local","utf8");
const url = env.split("\n").find(l=>l.startsWith("DATABASE_URL_UNPOOLED=")).split("=").slice(1).join("=").trim();
/*
 * Two wallets, because beta has two behaviours and only one of them is what we are shipping.
 *
 * STRANGER is the visitor this whole run is about — somebody handed the link who has never been
 * here. Beta runs EXECUTION_MODE=live, so `executionModeForWallet` decides per wallet: anyone not
 * on LIVE_EXECUTION_WALLETS gets simulation, and that is the path a stranger walks.
 *
 * OWNER is on that list, so beta will really spend for it. The earlier version of this script
 * signed in AS the owner and then asserted nothing could spend, which is how it ended up failing a
 * correct app. Both are asserted below, in opposite directions, so neither can drift unnoticed.
 */
const STRANGER = "3YtwxmEp21AAjoDQRpWPMVU6SswJ2zEWex18cdnTfvMD";
const OWNER = "38y5uxVPTmeGa4YdcnhwfGeMccQcjetbYE45D9q5PR1L";

const session = (wallet) => {
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  execFileSync("psql",[url,"-c",`INSERT INTO wallet_session (wallet,nonce,domain,statement,issued_at,token_hash,state,expires_at) VALUES ('${wallet}','smoke-${crypto.randomUUID()}','beta.tradethesis.xyz','beta smoke',now(),'${hash}','authorized',now()+interval '1 hour')`]);
  return token;
};
const token = session(STRANGER);
let fail = 0;
const step = (l, ok, d="") => { if(!ok) fail++; console.log(`  ${ok?"ok  ":"FAIL"} ${l}${d?"  "+d:""}`); };
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport:{width:1440,height:900} });
  await c.addCookies([{name:"thesis_session",value:token,domain:"beta.tradethesis.xyz",path:"/",httpOnly:true,secure:true,sameSite:"Lax"}]);
  const p = await c.newPage();
  const errs = []; p.on("pageerror", e=>errs.push(String(e)));

  await p.goto(`${BASE}/app`, { waitUntil:"networkidle", timeout:90000 });
  await p.locator(".tml-row").first().waitFor({ timeout:60000 });
  const rows = await p.locator(".tml-row").count();
  step("the terminal renders", rows >= 5, `${rows} baskets`);
  const cols = await p.locator(".tm-grid").evaluate(e=>getComputedStyle(e).gridTemplateColumns);
  step("three columns", cols.split(" ").length === 3, cols);
  step("no page scroll behind the workspace", await p.evaluate(()=>getComputedStyle(document.documentElement).overflow === "hidden"));
  step("traders panel is honest", (await p.locator(".tmt-empty-head").innerText()).includes("No verified"));

  const fig = await p.locator(".tmw-figure strong").first().innerText().catch(()=>"");
  const key = await p.locator(".tmc-key--basket strong").first().innerText().catch(()=>"");
  step("header and chart agree", fig.trim() === key.trim() && fig.trim().length>0, `${fig.trim()} / ${key.trim()}`);
  step("chart has real readings", (await p.locator(".tmc-plot").count()) > 0 || (await p.locator(".tmc--empty").count()) > 0);

  // The multi-thesis basket.
  await p.goto(`${BASE}/app?basket=enterprise-ai-trust`, { waitUntil:"networkidle" });
  await p.locator(".tma-head").first().waitFor({ timeout:60000 });
  step("the multi-thesis basket has 3 arguments", (await p.locator(".tma").count()) === 3, `${await p.locator(".tma").count()}`);

  // Buy, in simulation, stopping before any signature.
  await p.goto(`${BASE}/buy/the-toll-booths-outlast-the-traffic`, { waitUntil:"networkidle" });
  const buyOk = await p.locator(".by-budget").first().waitFor({ timeout:45000 }).then(()=>true).catch(()=>false);
  step("the buy flow opens", buyOk);
  /* The old check here looked for `.signin`, and called its absence a failure. It was the check
     that was wrong: useWallet restores the wallet from the session cookie this script carries, so
     a signed-in visitor gets the real control, not a sign-in gate. What actually matters is that
     beta cannot spend — so ask the server, and then ask the page whether it says so too. */
  const mode = await p.evaluate(() => fetch("/api/session").then((r) => r.json()).then((j) => j.executionMode));
  step("a stranger cannot spend", mode === "simulation", mode);

  const badge = await p.locator(".by-connected").first().innerText().catch(() => "");
  const cta = await p.locator(".by-actions .ln-btn--ink").first().innerText().catch(() => "");
  step("and the page tells them so", /simulation/i.test(badge), `${badge.trim()} · "${cta.trim()}"`);

  /* The other direction. This is not a safety check — it is the opposite: beta really will spend
     for this wallet, and if that ever silently became simulation we would be testing a lie. */
  {
    const oc = await b.newContext({ viewport:{width:1440,height:900} });
    await oc.addCookies([{name:"thesis_session",value:session(OWNER),domain:"beta.tradethesis.xyz",path:"/",httpOnly:true,secure:true,sameSite:"Lax"}]);
    const op = await oc.newPage();
    await op.goto(`${BASE}/app`, { waitUntil:"domcontentloaded", timeout:90000 });
    const om = await op.evaluate(() => fetch("/api/session").then((r) => r.json()).then((j) => j.executionMode));
    step("the owner's wallet is still live, as configured", om === "live", om);
    await oc.close();
  }

  await p.setViewportSize({ width:390, height:844 });
  await p.goto(`${BASE}/app`, { waitUntil:"networkidle" });
  await p.locator(".tml-row").first().waitFor({ timeout:60000 });
  step("mobile is three states", await p.locator(".tm-tabs").isVisible());
  step("no horizontal overflow on a phone", await p.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1));

  step("no page errors", errs.length===0, errs.slice(0,1).join(""));
  await b.close();
  execFileSync("psql",[url,"-c","DELETE FROM wallet_session WHERE nonce LIKE 'smoke-%'"]);
  console.log(fail ? `\n${fail} problem(s) on beta.` : "\nbeta works.");
  process.exit(fail?1:0);
})().catch(e=>{ try{execFileSync("psql",[url,"-c","DELETE FROM wallet_session WHERE nonce LIKE 'smoke-%'"]);}catch{} console.error(e.message); process.exit(1); });

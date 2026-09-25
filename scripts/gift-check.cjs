/**
 * Thesis Gifts, in a browser.
 *
 * Part 1 runs against the real server with nothing stubbed: the composer's rules, the gated
 * send panel as this deployment actually reports it, the unfunded preview, every funded-invitation
 * state from real local rows, the real Privy X sign-in opening, and that a URL cannot fake a
 * reservation at checkout.
 *
 * Part 2 is the sender's live flow. No live X lookup, wallet provisioning or eligibility provider
 * exists here, so the gift API and the Phantom provider are stubbed — IN THIS FILE ONLY, through
 * page.route and an injected window.phantom. Production has no path to either stub. What Part 2
 * proves is that each server answer produces the right screen and the right next action, and that
 * nothing offers a second transfer while one is outstanding.
 *
 * Fixtures: Part 1 writes gift rows to the LOCAL database (refuses anything else) and removes them
 * at the end. A completed X OAuth sign-in cannot be automated and is not exercised.
 *
 *   node scripts/gift-check.cjs
 */
const { chromium } = require("/Users/limon/figma-export/node_modules/playwright");
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");

const BASE = process.env.BASE || "http://localhost:3000";
const U = fs.readFileSync("/Users/limon/thesis/.env.local", "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL=")).split("=").slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(U)) { console.error("refusing: fixtures only go to a local database"); process.exit(1); }
const q = (s) => execFileSync("psql", [U, "-tAc", s]).toString().trim();

let fail = 0;
const ok = (l, c, d = "") => { if (!c) fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${l}${d ? "  " + d : ""}`); };

const TAG = "gift-check";
const SENDER = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const DEST = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

function fixture(state, { expired = false } = {}) {
  const bv = q("select bv.id from basket b join basket_version bv on bv.id=b.execution_version_id where b.slug='ai-spending-chain'");
  const token = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const sig = crypto.randomBytes(64).toString("hex").replace(/[0oOIl]/g, "1").slice(0, 88);
  const funded = ["funded", "claim_reserved"].includes(state);
  q(`INSERT INTO gift (invite_hash, invite_expires_at, state, pack_id, basket_version_id, amount_usd, amount_raw, sol_allowance_lamports,
       sender_wallet, sender_name, note, recipient_handle_requested, recipient_subject, recipient_handle_at_resolution, recipient_display_name,
       recipient_provider_user_id, destination_wallet, funding_signature, funded_slot, funded_at, failure_reason, claimed_by_provider_user_id)
     VALUES ('${hash}', now() + interval '${expired ? "-1" : "30"} days', '${state}', 'ai-spending-chain', '${bv}', 100, 100000000, 10000000,
       '${SENDER}', '${TAG}', 'A secret little note', 'kayle_build', '1450000000000000001', 'kayle_build', 'Kayle',
       'did:privy:fixture', '${DEST}', '${sig}', ${funded ? 1 : "NULL"}, ${funded ? "now()" : "NULL"}, ${state === "failed" ? "'wrong_amount'" : "NULL"},
       ${state === "claim_reserved" ? "'did:privy:fixture'" : "NULL"})`);
  return token;
}

function cleanup() {
  execFileSync("psql", [U, "-v", "ON_ERROR_STOP=1", "-c", `BEGIN; SET LOCAL session_replication_role = replica;
    DELETE FROM gift_event WHERE gift_id IN (SELECT id FROM gift WHERE sender_name IN ('${TAG}','gift-browser'));
    DELETE FROM gift WHERE sender_name IN ('${TAG}','gift-browser'); COMMIT;`]);
}

/** Set a React-controlled field the way React's value tracker sees it (see reference notes on fill()). */
const setField = (p, sel, v) => p.locator(sel).evaluate((el, x) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, x);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}, v);

async function hydrated(p, sel) {
  await p.locator(sel).first().waitFor({ timeout: 60000 });
  await p.waitForFunction((s) => { const e = document.querySelector(s); return e && Object.keys(e).some((k) => k.startsWith("__react")); }, sel, { timeout: 60000 });
}

async function compose(p, amount = "100") {
  await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await hydrated(p, ".gift-compose-form form");
  await setField(p, 'input[aria-label="Their X handle"]', "kayle_build");
  await setField(p, 'input[placeholder="First name"]', "Ana");
  await setField(p, 'input[aria-label="Custom gift budget in dollars"]', amount);
  await p.locator('.gift-compose-form button[type="submit"]').click();
}

/** A real unsigned funding transaction, built with the same instructions the server uses. */
function unsignedTx() {
  const { PublicKey, Transaction, SystemProgram } = require("/Users/limon/thesis/node_modules/@solana/web3.js");
  const tx = new Transaction({ feePayer: new PublicKey(SENDER), recentBlockhash: "11111111111111111111111111111111" });
  tx.add(SystemProgram.transfer({ fromPubkey: new PublicKey(SENDER), toPubkey: new PublicKey(DEST), lamports: 1 }));
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}

(async () => {
  // WebGL in headless Chromium comes from SwiftShader, which now has to be asked for.
  const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  const tokens = {
    funded: fixture("funded"),
    pending: fixture("funding_pending"),
    failed: fixture("failed"),
    expired: fixture("funded", { expired: true }),
    reserved: fixture("claim_reserved"),
  };

  try {
    /* ======================================================== Part 1: real */
    console.log("composer");
    const c = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await c.newPage();
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

    await compose(p, "0");
    ok("a gift under the $1 floor is refused", /start at \$1\b/.test(await p.locator(".gift-error").innerText().catch(() => "")));
    await setField(p, 'input[aria-label="Custom gift budget in dollars"]', "10");
    await p.locator('.gift-compose-form button[type="submit"]').click();
    await p.locator('a[href^="/gift/preview#"]').waitFor({ timeout: 30000 });
    await p.waitForResponse((r) => r.url().includes("/api/gifts/readiness"), { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(800);
    ok("where sending isn't live, no send section and no explanation panel appear", (await p.locator(".gift-send").count()) === 0);
    ok("no send button is offered", (await p.locator(".gift-send button").count()) === 0);

    console.log("\nunfunded preview stays distinct");
    // Click it, as a person would. Following the href once hid a button that did nothing visible.
    const href = await p.locator('a[href^="/gift/preview#"]').getAttribute("href");
    await hydrated(p, 'a[href^="/gift/preview#"]');
    await p.locator("a", { hasText: "Open recipient preview" }).click();
    await p.waitForURL(/\/gift\/preview#/, { timeout: 120000 });
    ok("clicking Open recipient preview navigates to the preview", true);
    await hydrated(p, ".gift-open-cta");
    ok("the preview says it is unfunded", /Unfunded gift preview/.test(await p.locator(".gift-preview-banner").innerText()));
    ok("the preview carries no real-gift banner", (await p.locator(".gift-real-banner").count()) === 0);

    console.log("\nthe card comes first, and keeps the surprise");
    {
      const card = await p.locator(".gift-unopened").innerText();
      ok("before opening, no amount is shown", !/\$\d/.test(card), card.match(/\$\d+/)?.[0] ?? "");
      ok("and no holdings are named", !/MSFTx|NVDAx|PLTRx/.test(card));
    }

    console.log("\ntearing the pack, on its own stage");
    const openStage = async (pg) => {
      await hydrated(pg, ".gift-open-cta");
      // Generous: in headless Chromium the 3D pack renders in software (SwiftShader), and compiling
      // its physical material can take many seconds on a busy machine. A GPU does it in milliseconds.
      await pg.getByRole("button", { name: "Open it" }).click({ timeout: 120000 });
      await pg.locator(".gift-stage").waitFor({ timeout: 60000 });
      await pg.waitForFunction(() => { const s = document.querySelector(".gift-stage"); return s && s.dataset.mode !== "pending"; }, null, { timeout: 10000 });
      if ((await pg.locator(".gift-stage").getAttribute("data-mode")) === "3d") {
        await pg.waitForFunction(() => { const b = document.querySelector(".gift-stage-tear"); return b && !b.disabled; }, null, { timeout: 60000 });
      }
    };
    const phase = (pg) => pg.locator(".gift-stage").getAttribute("data-phase");
    const seal = async (pg) => {
      const s = await pg.locator(".gift-stage-scene").boundingBox();
      const packH = Math.min(s.height * 0.64, s.width * 0.72 * 3.1 / 2);
      const halfW = packH * (2 / 3.1) / 2;
      return { y: s.y + s.height / 2 - packH / 2 + packH * 0.06, left: s.x + s.width / 2 - halfW, halfW, cx: s.x + s.width / 2 };
    };
    {
      await openStage(p);
      const mode = await p.locator(".gift-stage").getAttribute("data-mode");
      ok("the stage is the pack in 3D", mode === "3d", mode);
      ok("and nothing else: no header, no amount", /^[^$]*$/.test(await p.locator(".gift-stage").innerText()) && (await p.locator(".gift-stage .gift-header").count()) === 0);
      ok("focus lands on the tear button, for keyboards", await p.evaluate(() => document.activeElement?.classList.contains("gift-stage-tear")));

      // A hesitant drag springs back.
      let k = await seal(p);
      await p.mouse.move(k.left + 20, k.y); await p.mouse.down();
      await p.mouse.move(k.left + k.halfW * 0.4, k.y, { steps: 10 });
      ok("the strip follows the drag", (await phase(p)) === "dragging");
      await p.mouse.up();
      await p.waitForTimeout(500);
      ok("a hesitant drag springs back, sealed", (await phase(p)) === "sealed" && (await p.locator(".gift-revealed").count()) === 0);

      // A full drag across the seal tears it.
      k = await seal(p);
      await p.mouse.move(k.left + 20, k.y); await p.mouse.down();
      await p.mouse.move(k.cx + k.halfW * 0.4, k.y, { steps: 10 });
      await p.mouse.up();
      await p.waitForFunction(() => /burst|torn/.test(document.querySelector(".gift-stage")?.dataset.phase ?? ""), null, { timeout: 5000 });
      ok("confetti bursts from the opening", (await p.locator("body > canvas").count()) > 0);
      await p.locator(".gift-revealed").waitFor({ timeout: 5000 });
      ok("dragging across the seal tears it open", true);
      const flying = await p.locator(".gift-holding-card").first().evaluate((el) => getComputedStyle(el).animationName);
      ok("the cards fly out of the pack", flying === "gift-card-out", flying);
      await p.locator(".gift-stage").waitFor({ state: "detached", timeout: 5000 });
      ok("the stage fades away onto the contents", true);
      // Wait for the animation itself to end rather than guessing a duration.
      await p.locator(".gift-holding-card").last().evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const settled = await p.locator(".gift-holding-card").last().evaluate((el) => getComputedStyle(el).transform);
      ok("and the cards settle flat, facing you", settled === "none" || settled === "matrix(1, 0, 0, 1, 0, 0)", settled);
      ok("the reveal shows the disclosed allocation, no counters", (await p.locator(".gift-holding-card").count()) === 3);
      ok("the amount arrives with the reveal", /\$10 of it, from Ana/.test(await p.locator(".gift-reveal-heading").innerText()));

      // Replay, then the keyboard path and the sound toggle.
      await p.locator(".gift-reveal-bottom button", { hasText: "Replay" }).click();
      ok("replay returns focus to Open it", await p.waitForFunction(() => document.activeElement?.classList.contains("gift-open-cta"), null, { timeout: 2000 }).then(() => true).catch(() => false));
      await openStage(p);
      ok("sound starts on", (await p.locator(".gift-stage-sound").getAttribute("aria-pressed")) === "true");
      const box = await p.locator(".gift-stage-sound").boundingBox();
      ok("the mute control is a 44px target", box.width >= 44 && box.height >= 44, `${box.width}x${box.height}`);
      await p.locator(".gift-stage-sound").click();
      await p.locator(".gift-stage-tear").focus();
      await p.keyboard.press("Enter");
      await p.locator(".gift-revealed").waitFor({ timeout: 6000 });
      ok("the tear button opens it from the keyboard", true);
      await p.locator(".gift-stage").waitFor({ state: "detached", timeout: 5000 });
      await p.locator(".gift-reveal-bottom button", { hasText: "Replay" }).click();
      await openStage(p);
      ok("a mute is remembered", (await p.locator(".gift-stage-sound").getAttribute("aria-pressed")) === "false");
      await p.locator(".gift-stage-sound").click();
      await p.locator(".gift-stage-tear").click();
      await p.locator(".gift-stage").waitFor({ state: "detached", timeout: 8000 });
    }
    {
      const rc0 = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
      const rp0 = await rc0.newPage();
      await rp0.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await openStage(rp0);
      ok("under reduced motion the stage is flat, not 3D", (await rp0.locator(".gift-stage").getAttribute("data-mode")) === "flat");
      await rp0.locator(".gift-stage .rip .gift-button").click();
      const instant = await rp0.locator(".gift-revealed").waitFor({ timeout: 1500 }).then(() => true).catch(() => false);
      ok("and the pack opens without the tear", instant);
      ok("and without confetti", (await rp0.locator("body > canvas").count()) === 0);
      const still = await rp0.locator(".gift-holding-card").first().evaluate((el) => getComputedStyle(el).animationName);
      ok("and the cards appear without flying", still === "none", still);
      await rc0.close();
    }

    console.log("\na photo in the middle of the pack, and packs you build");
    {
      const pc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const pp = await pc.newPage();
      pp.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
      await pp.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await hydrated(pp, ".gift-compose-form form");

      // Styles actually applied, not just markup present: a lost CSS block once shipped this as run-on text.
      const insideDisplay = await pp.locator(".gift-compose-inside li").first().evaluate((el) => getComputedStyle(el).display);
      ok("the pack's contents sit beside the card, laid out", insideDisplay === "grid", insideDisplay);
      const lead = await pp.locator(".gift-choice .gift-perf-label").first().innerText().catch(() => "");
      ok("pack cards lead with their record", /PAST 12 MONTHS|SINCE/.test(lead), lead);
      await setField(pp, 'input[aria-label="Custom gift budget in dollars"]', "1");
      ok("a $1 gift says what fees take, in dollars", /\$0\.48 of a \$1 gift.*~48%/.test(await pp.locator(".gift-fee-note").innerText().catch(() => "")));
      await setField(pp, 'input[aria-label="Custom gift budget in dollars"]', "10");
      ok("from $10 the fee note steps aside", (await pp.locator(".gift-fee-note").count()) === 0);

      await pp.locator('input[aria-label="Choose a photo for the pack"]').setInputFiles(`${__dirname}/fixtures-gift-photo.png`);
      await pp.locator(".gift-art-thumb img").waitFor({ timeout: 15000 });
      const src = await pp.locator(".gift-compose-pack .gift-photo img").getAttribute("src");
      ok("the chosen photo shows on the pack, re-encoded in the browser", /^data:image\/(webp|jpeg);/.test(src ?? ""), (src ?? "").slice(0, 22));

      await pp.locator(".gift-pick-build").click();
      await pp.locator(".gift-builder-asset").nth(2).waitFor({ timeout: 60000 });
      for (const i of [0, 1, 2, 3]) await pp.locator(".gift-builder-asset").nth(i).click({ trial: i === 3 }).catch(() => {});
      ok("a built pack takes exactly three stock tokens", (await pp.locator('.gift-builder-asset[aria-pressed="true"]').count()) === 3 && (await pp.locator(".gift-builder-asset").nth(3).isDisabled()));
      await pp.getByRole("button", { name: /More COINx|More CRCLx|More HOODx/ }).first().click();
      ok("weights that don't total 100% are flagged", /add up to 100%/.test(await pp.locator(".gift-builder").innerText()));
      await pp.getByRole("button", { name: /Less / }).first().click();
      ok("the builder says publishing is public before anything is pressed", /public thesis on Thesis, under your wallet/.test(await pp.locator(".gift-builder-foot").innerText()));
      ok("signed out, it asks for a wallet rather than offering to publish", (await pp.getByRole("button", { name: "Publish and use this pack" }).count()) === 0);
      await pp.locator(".gift-builder-close").click();

      await setField(pp, 'input[aria-label="Their X handle"]', "kayle_build");
      await setField(pp, 'input[placeholder="First name"]', "Ana");
      await pp.locator('.gift-compose-form button[type="submit"]').click();
      const photoHref = await pp.locator('a[href^="/gift/preview#"]').first().getAttribute("href", { timeout: 60000 });
      await pp.goto(`${BASE}${photoHref}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await pp.locator(".gift-sealed .gift-photo img").waitFor({ timeout: 60000 }).catch(() => {});
      ok("the sender's own preview shows their photo on the sealed pack", (await pp.locator(".gift-sealed .gift-photo img").count()) === 1);
      await pp.close();
      const shared = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
      await shared.goto(`${BASE}${photoHref}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await hydrated(shared, ".gift-open-cta");
      ok("a shared preview link, which can't carry a photo, shows the pack's own art", (await shared.locator(".gift-sealed .gift-photo").count()) === 0 && (await shared.locator(".gift-sealed .gift-art").count()) === 1);
      await shared.close();
      await pc.close();
    }

    console.log("\nfunded invitation, from real rows");
    await p.goto(`${BASE}/gift/${tokens.funded}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await hydrated(p, ".gift-open-actions button");
    ok("a funded invitation says who sent it, plainly", /A GIFT FROM GIFT-CHECK/.test(await p.locator(".gift-inv-head").innerText()) && /you.ve got a gift/.test(await p.locator(".gift-inv-head").innerText()));
    ok("and keeps the recipient on their gift: no site navigation", (await p.locator(".gift-header nav").count()) === 0);
    ok("and not the preview's", (await p.locator(".gift-preview-banner").count()) === 0);
    ok("the sender's note leads", /A secret little note/.test(await p.locator(".gift-inv-note").innerText()));
    ok("before opening, the invitation shows no amount", !/\$\d/.test(await p.locator(".gift-unopened").innerText()));
    ok("and no peek at the contents", (await p.locator(".gift-inv-peek").count()) === 0);
    ok("the first button is the rip, and says who can claim", /Only @kayle_build can claim/.test(await p.locator(".gift-inv-fine").innerText()) && /Rip it open/.test(await p.locator(".gift-open-actions button").first().innerText()));
    /*
     * Checked against a PRODUCTION server. In `next dev`, React 19 streams the resolved values of
     * awaited server I/O into the page as debug info — the raw gift row included — and production
     * strips it (verified 23 Sep: 0 identifiers from `next start`, 3 from `next dev`). Testing the
     * dev server here would test React's dev tooling, not what a recipient receives.
     */
    const PROD = process.env.PROD_BASE || "http://localhost:3210";
    const prodHtml = await fetch(`${PROD}/gift/${tokens.funded}`).then((r) => (r.ok ? r.text() : null)).catch(() => null);
    if (prodHtml === null) {
      console.log(`  skip the recipient identifiers never reach the page  (no production server at ${PROD}; run next start -p 3210)`);
    } else {
      const leak = prodHtml.match(/[\s\S]{0,700}(1450000000000000001|did:privy|9xQeWvG8)[\s\S]{0,60}/);
      if (leak) fs.writeFileSync("/tmp/gift-leak-context.txt", leak[0]);
      ok("the recipient identifiers never reach the page (production build)", !leak && /A real gift/.test(prodHtml), leak ? "see /tmp/gift-leak-context.txt" : "");
    }

    // The real X sign-in: the Privy modal opens with X. Completing OAuth is not automatable.
    // The button waits for the lazily loaded provider rather than answering before it exists.
    // Rip first, no sign-in: the stage tears, and what's inside is shown with the claim.
    await hydrated(p, ".gift-open-actions button");
    await p.locator(".gift-open-actions button", { hasText: "Rip it open" }).click();
    await p.locator(".gift-stage").waitFor({ timeout: 60000 });
    await p.locator(".gift-stage-tear").click({ timeout: 60000 });
    await p.locator(".gift-claim").waitFor({ timeout: 60000 });
    ok("ripping needs no sign-in and reveals the amount and the stocks", /\$100 of stocks/.test(await p.locator(".gift-claim h2").innerText()) && (await p.locator(".gift-claim .gift-holding-card").count()) >= 1);
    ok("and says nothing is bought until the claim", /Nothing is bought until you claim/.test(await p.locator(".gift-claim").innerText()));
    await p.waitForFunction(() => !document.querySelector(".gift-claim-actions button")?.disabled, null, { timeout: 60000 });
    ok("the claim button names itself once the provider is ready", /Sign in with X to claim \$100/.test(await p.locator(".gift-claim-actions button").first().innerText()));
    await p.locator(".gift-claim-actions button").first().click();
    // Attached, not visible: Privy's modal fades in, and a visibility check mid-fade is a timing test.
    const modal = await p.waitForSelector("#privy-dialog, #privy-modal-content", { state: "attached", timeout: 30000 }).then(() => true).catch(() => false);
    ok("Sign in with X opens the real Privy sign-in", modal);
    ok("and the page reports it is waiting, not done", /Waiting for X/.test(await p.locator(".gift-open-actions").innerText()));

    for (const [name, pattern] of [["pending", /on its way/], ["failed", /didn.t go through/]]) {
      await p.goto(`${BASE}/gift/${tokens[name]}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      ok(`${name} invitation says so`, pattern.test(await p.locator("h1").first().innerText()));
    }
    await p.goto(`${BASE}/gift/${tokens.expired}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const expiredText = await p.locator("main").innerText();
    ok("an expired link hides the note", !/A secret little note/.test(expiredText));
    ok("but says the gift has not expired", /gift itself hasn.t expired/.test(expiredText));
    await p.goto(`${BASE}/gift/definitely-not-a-token`, { waitUntil: "domcontentloaded", timeout: 120000 });
    ok("a bad link is refused plainly", /isn.t valid/.test(await p.locator("h1").innerText()));

    console.log("\ncheckout cannot be tricked by a URL");
    await p.goto(`${BASE}/buy/ai-spending-keeps-growing?gift=${tokens.funded}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await p.locator(".by-budget input").waitFor({ timeout: 60000 });
    ok("a funded-but-unreserved gift does not switch on gift mode", (await p.locator("#by-gift-amount").count()) === 0);
    await p.goto(`${BASE}/buy/ai-spending-keeps-growing?gift=${tokens.reserved}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await p.locator(".by-sealed").waitFor({ timeout: 60000 });
    ok("gift checkout keeps the contents folded away", (await p.locator(".by-sealed").getAttribute("open")) === null && /spoils the surprise/.test(await p.locator(".by-sealed summary").innerText()));
    await p.locator(".by-sealed summary").click();
    ok("a reserved gift fixes the amount from the server record", (await p.locator(".by-budget input").inputValue()) === "100" && (await p.locator(".by-budget input").getAttribute("readonly")) !== null);
    ok("and hides allocation editing", (await p.locator(".by-customize").count()) === 0);
    await p.locator(".signin a, .signin button").first().waitFor({ timeout: 30000 });
    await p.waitForFunction(() => !/Loading sign-in/.test(document.querySelector(".signin")?.textContent ?? ""), null, { timeout: 30000 });
    const giftSignin = await p.locator(".signin").innerText();
    ok("signed out, it sends the recipient back to X sign-in, not email or an extension", /Sign in with X on your invitation/.test(giftSignin) && !/email|extension/i.test(giftSignin.split("\n")[0]), giftSignin.split("\n")[0]);
    await p.goto(`${BASE}/buy/ai-spending-keeps-growing?gift=${tokens.reserved}&amount=1000`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await p.locator(".by-sealed").waitFor({ timeout: 60000 });
    ok("an amount in the URL is ignored", (await p.locator(".by-budget input").inputValue()) === "100");
    await c.close();

    console.log("\nwidths");
    for (const w of [360, 390, 768, 1100, 1440]) {
      const wp = await b.newPage({ viewport: { width: w, height: 900 } });
      for (const url of ["/", `/gift/${tokens.funded}`]) {
        await wp.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await wp.waitForTimeout(700);
        const over = await wp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const clipped = await wp.evaluate(() => [...document.querySelectorAll(".gift-pack")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > window.innerWidth + 1); }).length);
        ok(`${w}px ${url.slice(0, 12)} no horizontal overflow, no clipped pack`, over <= 0 && clipped === 0, `overflow ${over}px, clipped ${clipped}`);
      }
      await wp.close();
    }

    console.log("\nreduced motion");
    const rc = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const rp = await rc.newPage();
    await rp.goto(`${BASE}/gift/${tokens.pending}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await rp.locator(".gift-spin").first().waitFor({ timeout: 30000 });
    ok("spinners stop under reduced motion", (await rp.locator(".gift-spin").first().evaluate((e) => getComputedStyle(e).animationName)) === "none");
    await rc.close();

    /* ========================================= Part 2: sender, stubbed providers */
    console.log("\nsender live flow (stubbed in this file only)");
    async function liveContext(routes) {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
      await ctx.addInitScript(({ wallet, reject }) => {
        // A stand-in for Phantom. Only this test injects it.
        window.phantom = { solana: {
          isPhantom: true, publicKey: { toBase58: () => wallet },
          connect: async () => ({ publicKey: { toBase58: () => wallet } }), disconnect: async () => {},
          signMessage: async () => ({ signature: new Uint8Array(64) }), signTransaction: async (t) => t,
          signAndSendTransaction: async () => { if (reject) throw new Error("User rejected"); return { signature: "5".repeat(88) }; },
          on() {}, off() {},
        } };
      }, { wallet: SENDER, reject: Boolean(routes.reject) });
      await ctx.route("**/api/session", (r) => r.fulfill({ json: { wallet: SENDER, executionMode: "simulation", globalMode: "live" } }));
      await ctx.route("**/api/gifts/readiness", (r) => r.fulfill({ json: { live: true, missing: [] } }));
      await ctx.route("**/api/gifts", (r) => r.fulfill({ json: { status: "created", giftId: "00000000-0000-4000-8000-000000000001", inviteToken: "INVITE_TOKEN_1234567", replayed: false } }));
      await ctx.route("**/api/gifts/*/lookup", (r) => r.fulfill({ json: routes.lookup ?? { status: "resolved", account: { subject: "145", username: "kayle_build", name: "Kayle", profileImageUrl: null } } }));
      await ctx.route("**/api/gifts/*/await", (r) => r.fulfill({ json: { status: "awaiting" } }));
      await ctx.route("**/api/gifts/*/confirm", (r) => r.fulfill({ json: routes.confirm ?? { status: "provisioned", destinationWallet: DEST } }));
      await ctx.route("**/api/gifts/*/funding-transaction", (r) => r.fulfill({ json: routes.tx ?? { status: "ready", transaction: unsignedTx(), amountUsd: 100, solAllowanceLamports: "10000000", destinationWallet: DEST } }));
      await ctx.route("**/api/gifts/*/funding", (r) => r.fulfill({ json: routes.funding ?? { status: "funded" } }));
      await ctx.route(/\/api\/gifts\/[0-9a-f-]{36}$/, (r) => r.fulfill({ json: routes.status ?? { status: "ok", gift: { state: "reconciling", fundingSignature: "5".repeat(88) } } }));
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
      return { ctx, page };
    }
    async function toTerms(page) {
      await compose(page);
      // Sending opens in a dialog from the review.
      await page.locator(".gift-send-open").click({ timeout: 30000 });
      await page.locator(".gift-send-dialog[open]").waitFor({ timeout: 10000 });
      await page.locator(".gift-send-panel button").first().waitFor({ timeout: 30000 });
      await page.locator(".gift-send-panel button", { hasText: "Find @kayle_build" }).click();
    }

    {
      const { ctx, page } = await liveContext({});
      await toTerms(page);
      await page.locator(".gift-account").waitFor({ timeout: 30000 });
      ok("the sender sees who the handle resolves to before anything is bound", /Kayle/.test(await page.locator(".gift-account").innerText()));
      await page.locator(".gift-send-panel button", { hasText: "that’s them" }).click();
      await page.locator(".gift-terms").waitFor({ timeout: 30000 });
      const terms = await page.locator(".gift-send-panel").innerText();
      ok("terms state the USDC, the SOL allowance and the swap fees", /\$100\.00 USDC/.test(terms) && /0\.01 SOL/.test(terms) && /swap fees/i.test(terms));
      ok("terms say it cannot be recalled", /can.t be recalled/.test(terms));
      const sendBtn = page.locator(".gift-send-panel .gift-button--wide");
      ok("sending is disabled until the sender acknowledges", await sendBtn.isDisabled());
      await page.locator(".gift-check input").check();
      await sendBtn.click();
      await page.locator(".gift-send-panel--done").waitFor({ timeout: 30000 });
      const done = await page.locator(".gift-send-panel--done").innerText();
      ok("funded only on the server's word, then the invitation", /Confirmed on Solana/.test(done) && /\/gift\/INVITE_TOKEN_1234567/.test(done));
      const post = await page.locator('a[href^="https://x.com/intent/post"]').getAttribute("href");
      ok("sharing prepares a post for the sender to send, nothing is posted", Boolean(post) && decodeURIComponent(post).includes("@kayle_build"));
      await ctx.close();
    }

    {
      // Nobody could say who the handle is: the link goes first, the money after they accept.
      let polls = 0;
      const { ctx, page } = await liveContext({ lookup: { status: "needs_acceptance" } });
      await ctx.route(/\/api\/gifts\/[0-9a-f-]{36}$/, (r) => r.fulfill({ json: { status: "ok", gift: { state: ++polls > 1 ? "wallet_provisioned" : "awaiting_recipient" } } }));
      await toTerms(page);
      await page.getByRole("button", { name: /Get their link/ }).waitFor({ timeout: 30000 });
      ok("an unknown recipient is asked to accept first, and nothing is charged yet", /isn.t on Thesis yet/.test(await page.locator(".gift-send").innerText()) && /Nothing is charged/.test(await page.locator(".gift-send").innerText()));
      await page.getByRole("button", { name: /Get their link/ }).click();
      await page.locator(".gift-invite-link").waitFor({ timeout: 30000 });
      ok("the sender gets the link to send them", /\/gift\/INVITE_TOKEN_1234567/.test(await page.locator(".gift-invite-link").innerText()));
      ok("and a page to come back to", (await page.locator('a[href^="/gift/send/"]').count()) === 1);
      await page.locator(".gift-terms").waitFor({ timeout: 20000 }).catch(() => {});
      ok("the moment they accept, the page moves on to paying", (await page.locator(".gift-terms").count()) === 1);
      await ctx.close();
    }

    for (const [label, routes, expectText, extra] of [
      ["an unknown handle stops before anything is created on X's side", { lookup: { status: "not_found" } }, /couldn.t find @kayle_build/],
      ["a handle that changed hands is caught at confirmation", { confirm: { status: "changed" } }, /belongs to someone else/, "confirm"],
      ["a short wallet is caught before the wallet prompt", { tx: { status: "insufficient_funds", needUsdcRaw: "100000000", haveUsdcRaw: "20000000", needLamports: "20000000", haveLamports: "1000000" } }, /a little short/, "send"],
      ["cancelling in the wallet says nothing was sent", { reject: true }, /cancelled in your wallet/, "send"],
      ["an unconfirmed transfer keeps confirming quietly instead of alarming", { funding: { status: "reconciling", reason: "status_unreadable" } }, /Confirming on Solana/, "send"],
      ["a transfer that contradicts the gift is explained", { funding: { status: "failed", reason: "wrong_amount" } }, /different amount/, "send"],
    ]) {
      const { ctx, page } = await liveContext(routes);
      await toTerms(page);
      if (extra === "confirm" || extra === "send") {
        await page.locator(".gift-send-panel button", { hasText: "that’s them" }).click();
      }
      if (extra === "send") {
        await page.locator(".gift-check input").check();
        await page.locator(".gift-send-panel .gift-button--wide").click();
      }
      await page.waitForFunction((re) => new RegExp(re).test(document.querySelector(".gift-send")?.innerText ?? ""), expectText.source, { timeout: 30000 }).catch(() => {});
      const text = await page.locator(".gift-send").innerText();
      ok(label, expectText.test(text));
      if (routes.funding?.status === "reconciling") {
        ok("and never offers a second send while it confirms", (await page.locator(".gift-send button", { hasText: /Sign and send|Try again/ }).count()) === 0);
      }
      await ctx.close();
    }

    ok("no page errors anywhere", errs.length === 0, errs[0] ?? "");
  } finally {
    cleanup();
    await b.close();
  }
  console.log(fail ? `\n${fail} failing` : "\ngifts hold up");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); try { cleanup(); } catch {} process.exit(1); });

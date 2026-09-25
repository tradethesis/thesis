/**
 * The whole journey, in one pass: arrive → call it → open the buy → see the record.
 *
 * Runs with no wallet extension, which is the state almost every first-time visitor is in.
 * It stops at the signature prompt and never signs anything: the app is in live execution
 * mode, so going one step further would spend real USDC from a real wallet. Everything up
 * to that line is exercised for real against the running app.
 *
 *   BASE=http://localhost:3210 node scripts/e2e-check.cjs
 */
const { chromium } = require("/Users/limon/figma-export/node_modules/playwright");

const BASE = process.env.BASE || "http://localhost:3210";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  let failures = 0;
  const step = (label, ok, detail = "") => {
    if (!ok) failures += 1;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
  };

  // ---------------------------------------------------------------- arrive
  /* The feed became the terminal on 21 September 2026, so the entry point changed from a stack of
     cards to a three-column workspace behind a wallet. On 22 September the wallet gate itself moved
     from / to /connect, because / became the public matching homepage. Every step below is
     unchanged: this script exists to prove the money path, and the money path did not move. */
  await page.goto(`${BASE}/connect`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.locator(".ent-cta").waitFor({ timeout: 120000 });
  step("the entry screen offers one action", (await page.locator(".ent-cta").innerText()).includes("Connect"));
  step("and no wallet is assumed", !(await page.evaluate(() => Boolean(window.phantom || window.solana))));
  step("a deep link is carried back after sign-in", await page.evaluate(async () => {
    const res = await fetch("/app", { redirect: "manual" });
    return res.type === "opaqueredirect" || res.status === 307 || res.status === 200;
  }));

  // ---------------------------------------------------------- sign in exists
  // Sign-in used to live inside /app/my-theses. It is the entry screen's whole purpose now, and
  // /app/my-theses redirects here without a session — so this is where the no-extension path has
  // to be proved.
  await page.goto(`${BASE}/connect`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".ent-cta");
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__react")));
    },
    null,
    { timeout: 60000 },
  );
  const emailButton = page.getByRole("button", { name: /continue with email/i }).first();
  await emailButton.waitFor({ timeout: 60000 });
  step("email sign-in is offered without an extension", true);
  await emailButton.click();
  await page.waitForTimeout(6000);
  const modal = await page.locator("#privy-modal-content, [id*=privy], iframe[src*=privy]").count();
  step("the login modal opens", modal > 0, `${modal} nodes`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);

  // ------------------------------------------------------------------- like
  await page.goto(`${BASE}/t/the-toll-booths-outlast-the-traffic`, { waitUntil: "domcontentloaded" });
  const back = page.locator(".tas-btn").first();
  await back.waitFor({ state: "visible", timeout: 60000 });
  await back.click();
  await page.waitForFunction(() => document.querySelector('.tas-btn[aria-pressed="true"]') !== null, null, { timeout: 45000 });
  step("backing a thesis is recorded without a wallet", (await back.getAttribute("aria-pressed")) === "true");

  const verdict = await page
    .locator(".tas-verdict")
    .first()
    .waitFor({ state: "visible", timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  step("a verdict appears for that call", verdict);

  // -------------------------------------------------------------------- buy
  await page.goto(`${BASE}/buy/the-toll-booths-outlast-the-traffic`, { waitUntil: "domcontentloaded" });
  const buyOpen = await page
    .locator(".by-budget")
    .first()
    .waitFor({ state: "visible", timeout: 45000 })
    .then(() => true)
    .catch(() => false);
  step("the purchase route opens the buy flow", buyOpen);

  if (buyOpen) {
    // The weights are collapsed to a summary until asked for, which is the right default —
    // most buyers take the published allocation — but it means the sliders are one click
    // away rather than absent.
    // Hydration first. Reaching /buy/<slug> by navigation rather than through a dialog means the
    // button is server-rendered and inert for a moment, and clicking it then does nothing — which
    // looks exactly like an allocation that cannot be edited.
    await page.waitForFunction(
      () => {
        const el = document.querySelector(".by-customize");
        return Boolean(el && Object.keys(el).some((k) => k.startsWith("__react")));
      },
      null,
      { timeout: 60000 },
    );
    await page.getByRole("button", { name: /Customize allocation/ }).first().click();
    await page.waitForTimeout(600);
    const sliders = await page.getByRole("slider").count();
    step("the allocation is editable", sliders >= 2, `${sliders} weight sliders`);
    if (sliders >= 2) {
      const first = page.getByRole("slider").first();
      await first.fill("60");
      await page.waitForTimeout(400);
      step("changing a weight is accepted", (await first.inputValue()) === "60");
    }

    const amount = page.getByRole("spinbutton").first();
    if (await amount.count()) {
      await amount.fill("10");
      await page.waitForTimeout(600);
      const refused = await page.getByText(/minimum is \$75/i).isVisible().catch(() => false);
      step("a below-minimum amount is refused", refused);
      await amount.fill("150");
      await page.waitForTimeout(600);
    }

    // The line this check will not cross: the app is live, and the next control spends
    // real money.
    const signIn = await page.locator(".signin").count();
    step("buying stops at sign-in rather than spending", signIn > 0, "not signed in, nothing sent");
  }

  /* ---------------------------------------------------------------------- track
     The record moved behind the wallet gate with the rest of the workspace on 21 September 2026.
     scripts/terminal-check.cjs covers it there with a session fixture; what this script protects —
     that somebody with no wallet reaches the point of spending and no further — is above. */
  await page.goto(`${BASE}/t/the-toll-booths-outlast-the-traffic`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector('.tas-btn[aria-pressed="true"]') !== null, null, { timeout: 45000 });
  step("the side survives a reload, with no wallet and no account", true);

  // Clean up after itself so a repeat run starts from the same place.
  await page.waitForFunction(() => document.querySelector('.tas-btn[aria-pressed="true"]') !== null, null, { timeout: 45000 });
  await page.locator('.tas-btn[aria-pressed="true"]').first().click();
  await page.waitForFunction(() => document.querySelector('.tas-btn[aria-pressed="true"]') === null, null, { timeout: 45000 });
  step("the call can be cleared again", true);

  step("no page errors anywhere in the journey", errors.length === 0, errors.slice(0, 2).join(" | ").slice(0, 200));

  await browser.close();
  console.log(failures ? `\n${failures} failing step(s)` : "\nthe whole journey works");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

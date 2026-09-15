/**
 * End-to-end drive of the buy flow against a running dev server.
 *
 * Signs the SIWS challenge with a throwaway keypair, so this exercises the real session
 * path rather than stubbing it: a real ed25519 signature over the exact message the server
 * issued, checked by the server against the row it wrote.
 *
 * The wallet is not on LIVE_EXECUTION_WALLETS, so the intent is created in simulation and
 * the legs settle through simulateLeg. That walks every state the live path walks except
 * the signature and the broadcast.
 */
import nacl from "tweetnacl";
import bs58 from "bs58";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const SLUG = process.env.E2E_SLUG ?? "financial-activity-moves-onchain";

let cookie = "";

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body: body as never };
}

function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
  if (!condition) process.exitCode = 1;
  return condition;
}

async function main() {
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  console.log(`test wallet ${wallet}\n`);

  console.log("session");
  const challenge = await call("/api/session/challenge", { method: "POST", body: JSON.stringify({ wallet }) });
  if (!check("challenge issued", challenge.status === 200, `http=${challenge.status}`)) return;
  const message: string = (challenge.body as { message: string }).message;
  check("message is domain-bound", message.includes("localhost") || message.includes("tradethesis"));

  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));
  const verified = await call("/api/session/verify", {
    method: "POST",
    body: JSON.stringify({ wallet, signature, signedMessage: message }),
  });
  check("signature accepted", verified.status === 200, `http=${verified.status} ${JSON.stringify(verified.body).slice(0, 90)}`);

  // A tampered message with a valid signature over it must not authenticate.
  const kp2 = nacl.sign.keyPair();
  const w2 = bs58.encode(kp2.publicKey);
  const ch2 = await call("/api/session/challenge", { method: "POST", body: JSON.stringify({ wallet: w2 }) });
  const forged = (ch2.body as { message: string }).message.replace("Sign in to Thesis", "Approve everything");
  const sig2 = bs58.encode(nacl.sign.detached(new TextEncoder().encode(forged), kp2.secretKey));
  const rejected = await call("/api/session/verify", {
    method: "POST",
    body: JSON.stringify({ wallet: w2, signature: sig2, signedMessage: forged }),
  });
  check("altered message rejected", rejected.status !== 200, `http=${rejected.status}`);

  // that second call clobbered the cookie; sign back in as the first wallet
  cookie = "";
  await call("/api/session/challenge", { method: "POST", body: JSON.stringify({ wallet }) }).then(async (c) => {
    const m = (c.body as { message: string }).message;
    const s = bs58.encode(nacl.sign.detached(new TextEncoder().encode(m), kp.secretKey));
    await call("/api/session/verify", { method: "POST", body: JSON.stringify({ wallet, signature: s, signedMessage: m }) });
  });

  console.log("\nintent");
  const tooSmall = await call("/api/intents", {
    method: "POST",
    body: JSON.stringify({ slug: SLUG, budgetUsdc: 10, idempotencyKey: crypto.randomUUID() }),
  });
  check("below minimum refused", tooSmall.status === 400 && (tooSmall.body as never as { error: { code: string } }).error.code === "below_minimum");

  const key = crypto.randomUUID();
  const created = await call("/api/intents", {
    method: "POST",
    body: JSON.stringify({ slug: SLUG, budgetUsdc: 150, idempotencyKey: key }),
  });
  if (!check("intent created", created.status === 200, `http=${created.status} ${JSON.stringify(created.body).slice(0, 120)}`)) return;
  const intent = created.body as never as { id: string; legs: { id: string; plannedInRaw: string; symbol: string }[]; budgetRaw: string; executionMode: string };
  check("three legs planned", intent.legs.length === 3);
  check("simulation mode", intent.executionMode === "simulation", intent.executionMode);

  const sum = intent.legs.reduce((a, l) => a + BigInt(l.plannedInRaw), 0n);
  check("legs sum to the budget exactly", sum === BigInt(intent.budgetRaw), `${sum} vs ${intent.budgetRaw}`);

  const again = await call("/api/intents", {
    method: "POST",
    body: JSON.stringify({ slug: SLUG, budgetUsdc: 150, idempotencyKey: key }),
  });
  check("idempotency key returns the same intent", (again.body as never as { id: string }).id === intent.id);

  console.log("\nquote");
  const quoted = await call(`/api/intents/${intent.id}/quote`, { method: "POST" });
  if (!check("all three legs priced", quoted.status === 200, `http=${quoted.status} ${JSON.stringify(quoted.body).slice(0, 160)}`)) return;
  const q = quoted.body as never as { status: string; legs: { id: string; symbol: string; quoteOutRaw: string; quoteRouter: string }[] };
  check("intent is ready", q.status === "ready", q.status);
  for (const l of q.legs) check(`  ${l.symbol} quoted via ${l.quoteRouter}`, BigInt(l.quoteOutRaw ?? "0") > 0n);

  console.log("\nsettle (simulated)");
  for (const leg of q.legs) {
    const r = await call(`/api/intents/${intent.id}/legs/${leg.id}/simulate`, { method: "POST" });
    check(`  ${leg.symbol} settled`, r.status === 200, `http=${r.status}`);
  }

  const final = await call(`/api/intents/${intent.id}`);
  const f = final.body as never as { status: string; spentRaw: string; unspentRaw: string; legs: { fill: unknown }[] };
  check("basket complete", f.status === "complete", f.status);
  check("every leg has exactly one fill", f.legs.every((l) => l.fill !== null));
  check("nothing unspent", BigInt(f.unspentRaw) === 0n, `unspent=${f.unspentRaw}`);
  check("spent equals the budget", f.spentRaw === intent.budgetRaw);

  console.log("\nownership");
  cookie = "";
  const stranger = await call(`/api/intents/${intent.id}`);
  check("a stranger cannot read the basket", stranger.status === 401, `http=${stranger.status}`);

  console.log(process.exitCode ? "\nFAILURES ABOVE" : "\nall checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Writing a thesis still works, and the coin is gone.
 *
 * A thesis used to also launch a paired Meteora bonding-curve token, with 50.4% of its trading fee
 * split to the author. That was removed on 22 September 2026: it promised something the rest of the
 * product does not — the token backed nothing and could not be redeemed — and it was the only path
 * in the app that spent real SOL without consulting `executionModeForWallet`.
 *
 * Removing a feature is not finished when the code compiles. This checks the two halves that fail
 * quietly: the endpoints are actually unreachable, and no copy is left promising a thing that no
 * longer exists. The last such promise was two lines under the submit button, still offering the
 * author a fee share, after every file that implemented it had already been deleted.
 *
 *   node scripts/create-check.cjs
 */
const { chromium } = require("/Users/limon/figma-export/node_modules/playwright");
const crypto = require("node:crypto"), { execFileSync } = require("node:child_process"), fs = require("node:fs");
const U = fs.readFileSync("/Users/limon/thesis/.env.local","utf8").split("\n").find(l=>l.startsWith("DATABASE_URL=")).split("=").slice(1).join("=").trim().replace(/^['"]|['"]$/g,"");
if (!/localhost|127\.0\.0\.1|neon/.test(U)) { console.log("refusing: unknown database"); process.exit(1); }
const W="38y5uxVPTmeGa4YdcnhwfGeMccQcjetbYE45D9q5PR1L", t=crypto.randomBytes(32).toString("base64url");
execFileSync("psql",[U,"-c",`INSERT INTO wallet_session (wallet,nonce,domain,statement,issued_at,token_hash,state,expires_at) VALUES ('${W}','c-${crypto.randomUUID()}','localhost','create check',now(),'${crypto.createHash("sha256").update(t).digest("hex")}','authorized',now()+interval '1 hour')`]);
let fail=0; const ok=(l,c,d="")=>{if(!c)fail++;console.log(`  ${c?"ok  ":"FAIL"} ${l}${d?"  "+d:""}`)};
(async()=>{
  const b=await chromium.launch(), c=await b.newContext({viewport:{width:1440,height:900}});
  await c.addCookies([{name:"thesis_session",value:t,domain:"localhost",path:"/",httpOnly:true,sameSite:"Lax"}]);
  const p=await c.newPage(); const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:3000/app/create",{waitUntil:"domcontentloaded",timeout:120000});
  await p.locator(".cr").waitFor({timeout:60000});
  await p.waitForFunction(() => !/Sign in/i.test(document.querySelector(".cr-submit .ln-btn")?.innerText||""), null, {timeout:30000}).catch(()=>{});
  const body=await p.locator("main").innerText();
  ok("the create page still works", (await p.locator(".cr-field").count()) >= 3, `${await p.locator(".cr-field").count()} fields`);
  ok("the button no longer offers a token", (await p.locator(".cr-submit .ln-btn").innerText()).trim() === "Publish",
     `"${(await p.locator(".cr-submit .ln-btn").innerText()).trim()}"`);
  ok("no token, coin or fee copy survives", !/\btokens?\b|\bcoin\b|trading fee|Meteora|bonding curve/i.test(body),
     (body.match(/\btokens?\b|\bcoin\b|trading fee|Meteora|bonding curve/i)||["none"])[0]);
  ok("no page errors", errs.length===0, errs[0]||"");
  for (const r of ["/api/tokens/launch","/api/tokens/confirm","/api/tokens/claim"]) {
    const res = await p.request.post(`http://localhost:3000${r}`, { data: {}, failOnStatusCode: false });
    ok(`${r} is gone`, res.status() === 404, `${res.status()}`);
  }
  await b.close(); console.log(fail?`\n${fail} failing`:"\ncreate works, the coin is gone"); process.exit(fail?1:0);
})();

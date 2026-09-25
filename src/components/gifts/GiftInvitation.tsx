"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, CircleAlert, KeyRound, Loader2, Lock, Mail, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { TokenLogo } from "@/components/calls/TokenLogo";
import type { GiftPack as Pack } from "@/lib/gifts";
import { usePrivySigner } from "@/lib/wallet/privy-signer";

import { GiftPack } from "./GiftPack";
import { countryOptions } from "@/lib/countries";
import { GiftNext } from "./GiftNext";
import { useWallet } from "@/components/buy/useWallet";
import { PackPreview3D } from "./PackPreview3D";
import { PackStage } from "./PackStage";
import { useOpenGift } from "./useOpenGift";

/**
 * A funded gift, from the recipient's side.
 *
 * The reveal on /gift/preview is presentation. This page is the other thing: every claim it makes
 * comes from the server — whether the gift is funded, whether this sign-in is the person it was
 * sent to, and, once opened, what was actually received. The browser holds no authority here. It
 * obtains a signed identity token from the sign-in provider and hands it over; the server decides.
 *
 * Each outcome has its own screen and its own next step, because "something went wrong" is not an
 * answer to somebody holding a gift they cannot open.
 */

type View = {
  giftId: string;
  state: string;
  packId: string;
  centerImageUrl?: string | null;
  amountUsd: number;
  senderName: string;
  note: string | null;
  intendedHandle: string;
  expired: boolean;
};

type Holding = { mint: string; symbol: string; company: string; amount: string; signature: string };

type Claim =
  | { status: "reserved"; amountUsd?: number; intentId?: string | null }
  | { status: "opened"; partial: boolean; claimedAt: string | null; holdings: Holding[]; destinationWallet: string }
  | { status: "wrong_x_account"; signedInAs: string | null; intended: string }
  | { status: "no_x_account" | "wallet_mismatch" | "identity_rejected" | "eligibility_unavailable" | "already_claimed" | "allocation_unavailable" | "invalid_invitation" }
  | { status: "not_funded"; state: string }
  | { status: "ineligible"; reason: "declared" | "located" }
  | { status: "declaration_required" }
  | { status: "unavailable"; missing: string[] };

type Stage =
  | { at: "idle" }
  | { at: "signing_in" }
  | { at: "cancelled" }
  | { at: "sign_in_failed" }
  | { at: "checking" }
  | { at: "result"; claim: Claim }
  | { at: "network" };

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** `eligibilityCheck`: this deployment asks where the recipient lives before opening (production). */
export function GiftInvitation({ token, view, pack, claimConfigured, eligibilityCheck = false }: { token: string; view: View | null; pack: Pack | null; claimConfigured: boolean; eligibilityCheck?: boolean }) {
  const signer = usePrivySigner();
  const [stage, setStage] = useState<Stage>({ at: "idle" });
  const heading = useRef<HTMLHeadingElement>(null);
  const idempotency = useRef<string | null>(null);
  const [country, setCountry] = useState("");
  const [attested, setAttested] = useState(false);
  const countries = useMemo(() => (eligibilityCheck ? countryOptions() : []), [eligibilityCheck]);
  const declared = !eligibilityCheck || (Boolean(country) && attested);

  useEffect(() => {
    if (stage.at !== "idle") heading.current?.focus();
  }, [stage]);

  /** Ask the server where this gift stands for the signed-in X account. Null: couldn't reach it. */
  async function fetchClaim(): Promise<Claim | "network"> {
    const identityToken = await signer?.getIdentityToken?.().catch(() => null);
    if (!identityToken) return { status: "identity_rejected" };
    // One key per attempt to open, reused if this same attempt is retried after a network blip.
    idempotency.current ??= crypto.randomUUID();
    try {
      const res = await fetch(`/api/gifts/invite/${encodeURIComponent(token)}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotency.current },
        body: JSON.stringify({ identityToken, ...(eligibilityCheck ? { declaration: { country, attested } } : {}) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok && !body?.status) return res.status === 401 ? { status: "identity_rejected" } : "network";
      return body as Claim;
    } catch {
      return "network";
    }
  }

  async function check() {
    setStage({ at: "checking" });
    const claim = await fetchClaim();
    setStage(claim === "network" ? { at: "network" } : { at: "result", claim });
  }

  /*
   * Reserved for them: open it right here. The pack goes up full screen at once and the purchase
   * runs behind it (useOpenGift); when the chain confirms, the pack bursts over the holdings. One
   * tap from the invitation to the tear, no checkout page in between.
   */
  const reservedAmount = stage.at === "result" && stage.claim.status === "reserved" ? stage.claim.amountUsd ?? null : null;
  const reservedIntent = stage.at === "result" && stage.claim.status === "reserved" ? stage.claim.intentId ?? null : null;
  const opener = useOpenGift({ token, pack, amountUsd: reservedAmount, intentId: reservedIntent });
  const [staging, setStaging] = useState(false);
  const [opened, setOpened] = useState<Extract<Claim, { status: "opened" }> | null>(null);
  /*
   * Buying needs the app's own wallet session, not just the X sign-in: one signed challenge from the
   * gift's wallet (no window, see PrivyBridge). The checkout page used to do this; opening in place
   * has to do it itself, or the first request comes back "Connect your wallet to continue".
   */
  const w = useWallet();

  /*
   * Rip first, claim after. Anyone with the link can tear the pack and see what's inside: that is
   * the fun, and it shouldn't wait behind a login. Nothing is bought by ripping. Claiming (the X
   * sign-in the gift names) buys it into their wallet, inline, without a second pack.
   */
  const rippedKey = `thesis:gift-ripped:${token}`;
  const [ripped, setRipped] = useState(false);
  const [ripping, setRipping] = useState(false);
  useEffect(() => {
    try { if (sessionStorage.getItem(rippedKey) === "1") setRipped(true); } catch { /* they rip again */ }
  }, [rippedKey]);
  function markRipped() {
    setRipped(true);
    // The claim that follows must not tear a second pack over the confirmed holdings.
    try { sessionStorage.setItem(rippedKey, "1"); sessionStorage.setItem(`thesis:gift-torn:${token}`, "1"); } catch { /* fine */ }
  }

  async function openWithSession() {
    // Already ripped: buy in place, on the reveal. Otherwise the waiting pack takes the screen.
    if (!ripped) setStaging(true);
    const s = (await fetch("/api/session").then((r) => r.json()).catch(() => null)) as { wallet?: string | null } | null;
    if (!s?.wallet) await w.connectWithEmail().catch(() => {});
    await opener.open();
  }
  const startedOpen = useRef(false);
  useEffect(() => {
    if (reservedAmount === null || !pack || startedOpen.current) return;
    startedOpen.current = true;
    void openWithSession();
    // Once per reservation; openWithSession reads the latest wallet and opener each call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservedAmount, pack]);

  // Bought: read back what the chain confirmed. Settling can trail the last fill by a moment.
  useEffect(() => {
    if (opener.progress.at !== "done" || opened) return;
    let dead = false;
    void (async () => {
      for (let i = 0; i < 8 && !dead; i++) {
        const claim = await fetchClaim();
        if (claim !== "network" && claim.status === "opened") {
          if (!dead) setOpened(claim);
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!dead) setStaging(false);
      if (!dead) void check();
    })();
    return () => {
      dead = true;
    };
    // fetchClaim/check read the same session; re-running on their identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opener.progress.at, opened]);

  // Claimed after a rip: the opened page arrives without replaying the pack.
  useEffect(() => {
    if (ripped && opened && !(stage.at === "result" && stage.claim.status === "opened")) setStage({ at: "result", claim: opened });
  }, [ripped, opened, stage]);

  // X sign-in can leave the page and come back. Remember that they were opening this gift, so the
  // return continues the job instead of showing "Sign in with X" to somebody who just did.
  const intentKey = `thesis:gift-open:${token}`;
  useEffect(() => {
    if (stage.at !== "idle" || !signer?.twitterHandle || !declared) return;
    let pending = false;
    try { pending = sessionStorage.getItem(intentKey) === "1"; } catch { /* no storage: they tap Open */ }
    if (!pending) return;
    try { sessionStorage.removeItem(intentKey); } catch { /* ignore */ }
    void check();
    // Run once when the returning session is known; check() is stable for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signer?.twitterHandle, stage.at, declared]);

  async function signInAndCheck() {
    if (!signer?.loginWithX) {
      setStage({ at: "result", claim: { status: "unavailable", missing: [] } });
      return;
    }
    // Already signed in with X: nothing to sign in to, just open it.
    if (signer.twitterHandle) return void (await check());
    try { sessionStorage.setItem(intentKey, "1"); } catch { /* the return just needs a tap */ }
    setStage({ at: "signing_in" });
    const outcome = await signer.loginWithX();
    try { sessionStorage.removeItem(intentKey); } catch { /* ignore */ }
    if (outcome === "cancelled") setStage({ at: "cancelled" });
    else if (outcome === "failed") setStage({ at: "sign_in_failed" });
    else await check();
  }

  async function switchAccount() {
    await signer?.logout();
    idempotency.current = null;
    await signInAndCheck();
  }

  const H = (text: string) => <h2 className="gift-inv-title" ref={heading} tabIndex={-1}>{text}</h2>;

  /* -------------------------------------------------- the invitation itself */

  if (!view) {
    return (
      <Frame>
        <section className="gift-invalid">
          <Lock size={36} aria-hidden="true" />
          <h1>This invitation isn&rsquo;t valid.</h1>
          <p>The link may be incomplete, or the gift was withdrawn before it was sent. If someone told you they sent you a gift, ask them for the link again.</p>
          <Link href="/#packs" className="gift-button">See the packs <ArrowRight size={17} /></Link>
        </section>
      </Frame>
    );
  }

  if (view.state === "funding_pending" || view.state === "reconciling") {
    return (
      <Frame>
        <section className="gift-invalid">
          <Loader2 size={32} className="gift-spin" aria-hidden="true" />
          <h1>Your gift is on its way.</h1>
          <p>{view.senderName}&rsquo;s transfer is still confirming on Solana. Check back in a few minutes — this link will work as soon as it lands.</p>
        </section>
      </Frame>
    );
  }

  if (view.state === "failed") {
    return (
      <Frame>
        <section className="gift-invalid">
          <CircleAlert size={36} aria-hidden="true" />
          <h1>This gift didn&rsquo;t go through.</h1>
          <p>The transfer behind this invitation didn&rsquo;t complete, so there&rsquo;s nothing to open. {view.senderName} can see what happened on their side.</p>
        </section>
      </Frame>
    );
  }

  if (view.state === "awaiting_recipient" || view.state === "recipient_resolved" || view.state === "wallet_provisioned") {
    return <Frame><AcceptInvitation token={token} view={view} pack={pack} claimConfigured={claimConfigured} /></Frame>;
  }

  const claim = stage.at === "result" ? stage.claim : null;
  const actions = (
        <div className="gift-open-actions" aria-live="polite">
          {stage.at === "idle" && (
            <>
              {/* The wrapping says who it's for and nothing about what's inside. The one caution lives under the button. */}
              <div className="gift-inv-before">
                {eligibilityCheck && ripped && (
                  /* The issuer's restrictions (server/gifts/eligibility.ts). A refusal never costs the gift: the USDC stays theirs. */
                  <div className="gift-inv-where">
                    <label className="gift-field">Where do you live?
                      <select value={country} onChange={(e) => setCountry(e.target.value)} required>
                        <option value="">Choose your country</option>
                        {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </select>
                    </label>
                    <label className="gift-check gift-inv-attest">
                      <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
                      <span>I&rsquo;m not a US person, and I don&rsquo;t live in a sanctioned country, a country the token issuer doesn&rsquo;t serve, or an occupied region of Ukraine.</span>
                    </label>
                  </div>
                )}
              </div>
              {claimConfigured ? (
                /*
                 * The sign-in provider loads lazily, after the page. Until it has, the button waits
                 * and says so. It used to be pressable immediately, and a fast tap before the provider
                 * arrived was answered with "opening gifts isn't switched on here" — false, and
                 * alarming to somebody holding a gift.
                 */
                <>
                  {!ripped ? (
                    <>
                      <button type="button" className="gift-button" onClick={() => setRipping(true)} disabled={!pack}>
                        Rip it open <ArrowRight size={17} aria-hidden="true" />
                      </button>
                      <p className="gift-inv-fine">No sign-in to look. Only @{view.intendedHandle} can claim what&rsquo;s inside.</p>
                    </>
                  ) : (
                    <>
                      <button type="button" className="gift-button" onClick={() => void signInAndCheck()} disabled={!signer?.loginWithX || !declared} aria-busy={!signer?.loginWithX}>
                        {signer?.twitterHandle ? <>Claim your {usd(view.amountUsd)} <ArrowRight size={17} aria-hidden="true" /></> : <><span className="gift-x-mark" aria-hidden="true">𝕏</span> {signer?.loginWithX ? `Sign in with X to claim ${usd(view.amountUsd)}` : "Loading sign-in…"}</>}
                      </button>
                      <p className="gift-inv-fine">
                        {signer?.twitterHandle ? <>Signed in as @{signer.twitterHandle}. </> : <>Claims with @{view.intendedHandle} on X. </>}
                        Bought at today&rsquo;s prices when you claim.{" "}
                        {pack?.preIpo
                          ? <>Pre-IPO tokens from PreStocks have no public share price, cost 0.5% on every transfer, and the issuer can freeze or buy them back. They can lose all their value.</>
                          : <>Tokenized stocks track the share price and can lose value.</>}
                      </p>
                    </>
                  )}
                </>
              ) : (
                <p className="gift-inv-gated">Opening gifts isn&rsquo;t switched on here yet. Your gift is safe in the meantime.</p>
              )}
            </>
          )}

          {ripped && !staging && opener.progress.at === "working" && <p className="gift-send-quiet" role="status"><Loader2 size={14} className="gift-spin" aria-hidden="true" /> {opener.progress.label}</p>}
          {ripped && !staging && opener.progress.at === "failed" && (
            <Panel tone="problem">
              <p>{opener.progress.message}</p>
              <button type="button" className="gift-button" onClick={() => void openWithSession()}>Try again <ArrowRight size={17} /></button>
            </Panel>
          )}
          {stage.at === "signing_in" && <p className="gift-send-quiet" role="status"><Loader2 size={14} className="gift-spin" aria-hidden="true" /> Waiting for X…</p>}
          {stage.at === "checking" && <p className="gift-send-quiet" role="status"><Loader2 size={14} className="gift-spin" aria-hidden="true" /> Checking this is your gift…</p>}

          {stage.at === "cancelled" && (
            <Panel tone="problem">
              {H("Sign-in didn’t finish.")}
              <p>You closed the X sign-in. Nothing changed — your gift is still here.</p>
              <button type="button" className="gift-button" onClick={() => void signInAndCheck()}>Try again <ArrowRight size={17} /></button>
            </Panel>
          )}

          {stage.at === "sign_in_failed" && (
            <Panel tone="problem">
              {H("X sign-in didn’t work.")}
              <p>That can happen if X is busy or the sign-in was blocked by the browser. Try again, or try in another browser.</p>
              <button type="button" className="gift-button" onClick={() => void signInAndCheck()}>Try again <ArrowRight size={17} /></button>
            </Panel>
          )}

          {stage.at === "network" && (
            <Panel tone="problem">
              {H("We couldn’t reach Thesis.")}
              <p>Check your connection. Nothing changed with your gift.</p>
              <button type="button" className="gift-text-link" onClick={() => void check()}><RotateCcw size={14} /> Try again</button>
            </Panel>
          )}

          {claim && !(ripped && claim.status === "reserved") && <ClaimScreen claim={claim} view={view} pack={pack} token={token} H={H} onSwitch={() => void switchAccount()} onRetry={() => void signInAndCheck()} onOpen={() => void openWithSession()} />}
        </div>
  );
  const p = opener.progress;
  const openingStage =
    staging && pack ? (
      <PackStage
        pack={pack}
        from={view.senderName}
        image={view.centerImageUrl}
        cards={opened?.holdings.length || pack.holdings.length}
        waiting={
          p.at === "failed"
            ? { label: p.message, failed: true, onRetry: () => void openWithSession() }
            : { label: p.at === "working" ? p.label : "Almost there…" }
        }
        autoTear={Boolean(opened)}
        onOpened={() => {
          // The tear has played: the opened screen underneath goes straight to the holdings.
          try { sessionStorage.setItem(`thesis:gift-torn:${token}`, "1"); } catch { /* it just replays */ }
          if (opened) setStage({ at: "result", claim: opened });
        }}
        onClosed={() => setStaging(false)}
      />
    ) : ripping && pack ? (
      <PackStage
        pack={pack}
        from={view.senderName}
        image={view.centerImageUrl}
        cards={pack.holdings.length}
        onOpened={markRipped}
        onClosed={() => setRipping(false)}
      />
    ) : null;


  // Opened: the invitation has done its job. The reveal gets the whole page, not the button column.
  if (claim?.status === "opened") {
    return (
      <Frame>
        {openingStage}
        <Opened claim={claim} pack={pack} token={token} from={view.senderName} image={view.centerImageUrl} note={view.note} />
        <Recovery />
      </Frame>
    );
  }

  // Ripped but not claimed yet: what's inside, and the one way to make it theirs.
  if (ripped && pack) {
    const n = pack.holdings.length;
    return (
      <Frame>
        {openingStage}
        <section className="gift-revealed gift-inv-opened gift-claim">
          <div className="gift-reveal-heading">
            <p className="gift-eyebrow">FROM {view.senderName.toUpperCase()} · {pack.name.toUpperCase()}</p>
            <h2 className="gift-inv-title" tabIndex={-1}>{usd(view.amountUsd)} of stocks, yours to claim.</h2>
            <p>{["One company", "Two companies", "Three companies"][n - 1] ?? `${n} companies`} inside, picked by {view.senderName}. Nothing is bought until you claim it.</p>
          </div>
          <div className="gift-claim-actions">{actions}</div>
          <div className={`gift-reveal-cards gift-reveal-cards--${Math.min(n, 3)}`}>
            {pack.holdings.map((h, i) => (
              <article className={`gift-holding-card gift-holding-card--${pack.color}`} key={h.symbol} style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}>
                <div className="gift-holding-number">0{i + 1}<span>{h.weightBps / 100}% OF PACK</span></div>
                <TokenLogo symbol={h.symbol} company={h.company} tone={i} size={60} />
                <h3>{h.company}</h3>
                <span className="gift-holding-ticker">{h.symbol}</span>
                {h.why && <p>{h.why}</p>}
                <div className="gift-holding-value"><strong>about {(view.amountUsd * h.weightBps / 10000).toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong><span>before fees, at claim</span></div>
              </article>
            ))}
          </div>
          {view.note && <div className="gift-reveal-note"><p>&ldquo;{view.note}&rdquo;</p><span>From {view.senderName}</span></div>}
          <p className="gift-claim-again"><button type="button" className="gift-text-link" onClick={() => setRipping(true)}><RotateCcw size={14} aria-hidden="true" /> Rip it again</button></p>
        </section>
      </Frame>
    );
  }

  return (
    <Frame>
      {openingStage}
      {/* One moment, one screen: who it's from, their card, the wrapped pack, and one button. */}
      {/*
        * The moment of being handed something. The real pack, in 3D, turning toward the pointer on a
        * glow in its own colour; the words and the sender's tag beside it; one button.
        */}
      <section className={`gift-unopened gift-inv gift-inv-moment${pack ? ` gift-inv--${pack.color}` : ""}`}>
        <div className="gift-inv-visual">
          {pack && !staging ? <PackPreview3D key={pack.id} pack={pack} image={view.centerImageUrl} /> : pack ? <div className="gift-pack3d" /> : null}
        </div>
        <div className="gift-inv-copy">
        <div className="gift-inv-head">
          <p className="gift-eyebrow">A GIFT FROM {view.senderName.toUpperCase()}</p>
          <h1>Hey @{view.intendedHandle},<br /><em>you&rsquo;ve got a gift.</em></h1>
        </div>
        <div className="gift-inv-stage">
          {view.note !== null ? (
            <figure className="gift-inv-note">
              <span className="gift-inv-note-hole" aria-hidden="true" />
              <span className="gift-inv-note-to">To @{view.intendedHandle}</span>
              <blockquote>{view.note || "A little something for your next chapter."}</blockquote>
              <figcaption>— {view.senderName}</figcaption>
            </figure>
          ) : (
            <p className="gift-inv-expired">This link has expired, so the note is hidden. <strong>The gift itself hasn&rsquo;t expired</strong> — sign in with X to open it.</p>
          )}
        </div>

        {actions}
        </div>
      </section>

      {claim && ["eligibility_unavailable", "opened", "reserved"].includes(claim.status) && <Recovery />}

    </Frame>
  );
}

export function ClaimScreen({ claim, view, pack, token, H, onSwitch, onRetry, onOpen }: {
  claim: Claim;
  view: View;
  pack: Pack | null;
  token: string;
  H: (t: string) => React.ReactNode;
  onSwitch: () => void;
  onRetry: () => void;
  /** Open a reserved gift in place (the stage takes over). */
  onOpen?: () => void;
}) {
  switch (claim.status) {
    case "reserved":
      return (
        <Panel tone="done">
          {H("It’s yours. Time to open it.")}
          <p><ShieldCheck size={15} aria-hidden="true" /> Confirmed: this gift was sent to your X account, and the wallet holding it is yours.</p>
          <p>Opening buys the pack from your wallet now, at current prices.</p>
          {pack ? (
            <button type="button" className="gift-button" onClick={onOpen} disabled={!onOpen}>Open the pack <ArrowRight size={17} /></button>
          ) : (
            <p className="gift-inv-gated">This pack isn&rsquo;t available to buy right now. Your {usd(view.amountUsd)} USDC stays in your wallet.</p>
          )}
        </Panel>
      );
    case "opened":
      return <Opened claim={claim} pack={pack} token={token} from={view.senderName} image={view.centerImageUrl} note={view.note} />;
    case "wrong_x_account":
      return (
        <Panel tone="problem">
          {H("This gift is for a different X account.")}
          <p>You&rsquo;re signed in as {claim.signedInAs ? <strong>@{claim.signedInAs}</strong> : "an X account"}. It was sent to <strong>@{claim.intended}</strong>.</p>
          <p className="gift-send-quiet">If you&rsquo;ve renamed your account, that&rsquo;s fine — it follows the account, not the name. This is a different account.</p>
          <button type="button" className="gift-button" onClick={onSwitch}>Sign in with another X account <ArrowRight size={17} /></button>
        </Panel>
      );
    case "no_x_account":
      return (
        <Panel tone="problem">
          {H("Link your X account.")}
          <p>You&rsquo;re signed in, but not with X. This gift is tied to @{view.intendedHandle}, so X is how we know it&rsquo;s you.</p>
          <button type="button" className="gift-button" onClick={onRetry}><span className="gift-x-mark" aria-hidden="true">𝕏</span> Link X</button>
        </Panel>
      );
    case "identity_rejected":
      return (
        <Panel tone="problem">
          {H("We couldn’t verify that sign-in.")}
          <p>Sign in with X again. If it keeps happening, your browser may be blocking the sign-in window.</p>
          <button type="button" className="gift-button" onClick={onRetry}>Sign in again <ArrowRight size={17} /></button>
        </Panel>
      );
    case "wallet_mismatch":
      return (
        <Panel tone="problem">
          {H("Your sign-in has a different wallet.")}
          <p>It&rsquo;s the right X account, but not the wallet this gift went to. We won&rsquo;t send it anywhere else. Contact support with this link and we&rsquo;ll help you reach it.</p>
        </Panel>
      );
    case "ineligible":
      return (
        <Panel tone="pending">
          {H("Opening isn’t available where you are.")}
          <p>The company that issues these tokens doesn&rsquo;t offer them to US persons or in some countries, so the pack can&rsquo;t be opened here. <strong>Your {usd(view.amountUsd)} USDC is already in your wallet</strong> and stays yours.</p>
        </Panel>
      );
    case "declaration_required":
      return (
        <Panel tone="problem">
          {H("Tell us where you live first.")}
          <p>Choose your country and confirm the statement, then open it again.</p>
          <button type="button" className="gift-text-link" onClick={onRetry}><RotateCcw size={14} /> Try again</button>
        </Panel>
      );
    case "eligibility_unavailable":
      return (
        <Panel tone="pending">
          {H("Your gift is safe. Opening isn’t available yet.")}
          <p>Opening packs isn&rsquo;t switched on here yet. <strong>{usd(view.amountUsd)} USDC is already in your wallet</strong>, and it stays yours.</p>
        </Panel>
      );
    case "already_claimed":
      return (
        <Panel tone="problem">
          {H("This gift has already been opened.")}
          <p>If that was you, sign in with the same X account to see it. If it wasn&rsquo;t, contact support with this link.</p>
        </Panel>
      );
    case "allocation_unavailable":
      return (
        <Panel tone="pending">
          {H("This pack can’t be bought right now.")}
          <p>One of its holdings isn&rsquo;t tradable at the moment. Your {usd(view.amountUsd)} USDC is safe in your wallet — try again later.</p>
          <button type="button" className="gift-text-link" onClick={onRetry}><RotateCcw size={14} /> Check again</button>
        </Panel>
      );
    case "not_funded":
      return (
        <Panel tone="pending">
          {H("This gift isn’t ready yet.")}
          <p>The transfer is still being confirmed. Try again in a few minutes.</p>
          <button type="button" className="gift-text-link" onClick={onRetry}><RotateCcw size={14} /> Check again</button>
        </Panel>
      );
    case "unavailable":
      return (
        <Panel tone="pending">
          {H("Opening gifts isn’t switched on here yet.")}
          <p>Your gift is safe in the meantime. Nothing you do here can lose it.</p>
        </Panel>
      );
    default:
      return (
        <Panel tone="problem">
          {H("This invitation isn’t valid.")}
          <p>Ask the person who sent it for the link again.</p>
        </Panel>
      );
  }
}

/**
 * After opening: what they actually hold, then what the pack aimed for, then how to get out.
 *
 * Holdings come from confirmed fills of their own purchase. The pack's weights are shown separately
 * and labelled as the aim, because a partial fill or price movement makes the two different, and
 * showing the aim as if it were the result is the dishonest version of this screen. No modelled
 * basket performance appears here as their profit or loss.
 */
function Opened({ claim, pack, token, from, image, note }: { claim: Extract<Claim, { status: "opened" }>; pack: Pack | null; token: string; from?: string; image?: string | null; note?: string | null }) {
  /*
   * The tear, once per gift per browser session. It plays here and only here: the server has just
   * said these holdings are confirmed, so the pack is being opened over something that is already
   * true. Returning later goes straight to the holdings.
   */
  const seenKey = `thesis:gift-torn:${token}`;
  const [torn, setTorn] = useState(() => {
    try {
      return typeof window !== "undefined" && sessionStorage.getItem(seenKey) === "1";
    } catch {
      return false;
    }
  });
  // The stage outlives the tear by a moment: it fades out over the holdings, which render beneath it
  // as soon as the pack bursts.
  const [staging, setStaging] = useState(() => !torn && Boolean(pack && claim.holdings.length));
  const stage = staging && pack ? (
    <PackStage
      pack={pack}
      from={from}
      image={image}
      cards={claim.holdings.length}
      onOpened={() => {
        try { sessionStorage.setItem(seenKey, "1"); } catch { /* the tear just replays next time */ }
        setTorn(true);
      }}
      onClosed={() => setStaging(false)}
    />
  ) : null;
  const [replaying, setReplaying] = useState(false);
  if (!torn && stage) return stage;
  const whyOf = (symbol: string) => pack?.holdings.find((h) => h.symbol === symbol)?.why ?? null;
  const n = claim.holdings.length;
  return (
    <section className="gift-revealed gift-inv-opened">
      {stage}
      {replaying && pack && (
        <PackStage pack={pack} from={from} image={image} cards={claim.holdings.length || pack.holdings.length} onOpened={() => {}} onClosed={() => setReplaying(false)} />
      )}
      {/* The pack stays on the page, opened, with what came out of it rising from the top. */}
      <div className="gift-opened-hero">
        {pack && (
          <div className="gift-opened-art">
            <div className="gift-opened-fan" aria-hidden="true">
              {claim.holdings.slice(0, 3).map((h, i, all) => (
                <span className="gift-opened-card" key={h.signature} style={{ "--x": `${(i - (all.length - 1) / 2) * 58}px`, "--r": `${(i - (all.length - 1) / 2) * 11}deg`, "--d": `${240 + i * 110}ms` } as React.CSSProperties}>
                  <TokenLogo symbol={h.symbol} company={h.company} tone={i} size={38} />
                  <b>{h.symbol}</b>
                </span>
              ))}
            </div>
            <GiftPack pack={pack} image={image} className="gift-opened-pack" />
            <button type="button" className="gift-text-link gift-opened-replay" onClick={() => setReplaying(true)}>
              <RotateCcw size={14} aria-hidden="true" /> Open it again
            </button>
          </div>
        )}
      <div className="gift-reveal-heading">
        <p className="gift-eyebrow">{from ? `FROM ${from.toUpperCase()}` : "YOUR GIFT"}{pack ? ` · ${pack.name.toUpperCase()}` : ""}</p>
        <h2 className="gift-inv-title" tabIndex={-1}>{claim.partial ? "Opened — partly." : "Opened. It's yours."}</h2>
        <p>
          {n ? `${["One stock", "Two stocks", "Three stocks"][n - 1] ?? `${n} stocks`}, in your own wallet, confirmed on Solana.` : "No confirmed holdings are recorded yet. If you just opened it, give it a minute."}
          {claim.partial && <><br />Some of the pack couldn&rsquo;t be bought. What wasn&rsquo;t spent is still in your wallet as USDC.</>}
        </p>
        <div className="gift-opened-actions">
          <Link href="/app/my-theses?tab=purchases" className="gift-button">See your stocks <ArrowRight size={17} /></Link>
          {pack && <Link href={`/t/${pack.thesisSlug}`} className="gift-text-link">Why these <ArrowRight size={14} /></Link>}
        </div>
      </div>
      </div>

      {n > 0 && (
        <div className={`gift-reveal-cards gift-reveal-cards--${Math.min(n, 3)}`}>
          {claim.holdings.map((h, i) => (
            <article className={`gift-holding-card${pack ? ` gift-holding-card--${pack.color}` : ""}`} key={h.signature} style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}>
              <div className="gift-holding-number">0{i + 1}<a className="gift-text-link" href={`https://solscan.io/tx/${h.signature}`} target="_blank" rel="noopener noreferrer">Proof <ArrowUpRight size={12} aria-hidden="true" /></a></div>
              <TokenLogo symbol={h.symbol} company={h.company} tone={i} size={60} />
              <h3>{h.company}</h3>
              <span className="gift-holding-ticker">{h.symbol}</span>
              {whyOf(h.symbol) && <p>{whyOf(h.symbol)}</p>}
              <div className="gift-holding-value"><strong>{h.amount}</strong><span>{h.symbol} held</span></div>
            </article>
          ))}
        </div>
      )}

      {note && (
        <div className="gift-reveal-note"><p>&ldquo;{note}&rdquo;</p><span>From {from ?? "your friend"}</span></div>
      )}

      {pack && <GiftNext pack={pack} from={from ?? "Your friend"} />}

      <div className="gift-reveal-bottom">
        <p>
          {pack && <><strong>The pack aimed for {pack.holdings.map((h) => `${h.symbol} ${h.weightBps / 100}%`).join(", ")}.</strong><br /></>}
          What you hold depends on prices when it opened, and can lose value.
        </p>
      </div>

      <div className="gift-exit">
        <p className="gift-eyebrow">GETTING OUT</p>
        <div>
          <button type="button" className="gift-button gift-button--outline" disabled aria-describedby="gift-exit-sell">Sell for USDC</button>
          <p id="gift-exit-sell"><strong>Not in Thesis yet.</strong> The tokens are in your own wallet, so you can sell them for USDC in any Solana app that lists them. Selling can happen at a loss.</p>
        </div>
        <div>
          <button type="button" className="gift-button gift-button--outline" disabled aria-describedby="gift-exit-bank">Withdraw to a bank</button>
          <p id="gift-exit-bank"><strong>Thesis doesn&rsquo;t do this.</strong> Selling gives you USDC, not money in a bank. Turning USDC into your currency needs an exchange that supports where you live.</p>
        </div>
      </div>
    </section>
  );
}

/**
 * The wallet belongs to the sign-in account, not to X. If the X account is lost, a second sign-in
 * method is the way back in, and exporting the key is the way out of Thesis entirely. Both are
 * offered as soon as there is money to protect.
 */
function Recovery() {
  const signer = usePrivySigner();
  const methods = signer?.recoveryMethods ?? [];
  const [exported, setExported] = useState(false);
  return (
    <section className="gift-recovery" aria-labelledby="gift-recovery-title">
      <p className="gift-eyebrow">KEEP IT REACHABLE</p>
      <h2 id="gift-recovery-title">Don&rsquo;t let your gift depend on one login.</h2>
      <p>Your wallet is tied to this sign-in. If you ever lose your X account, a second way in is how you get it back.</p>
      <ul className="gift-recovery-list">
        <li>
          {methods.includes("email") ? <><Check size={16} aria-hidden="true" /> Email added</> : (
            <button type="button" className="gift-button gift-button--outline" onClick={() => signer?.linkEmail?.()} disabled={!signer?.linkEmail}><Mail size={16} aria-hidden="true" /> Add an email</button>
          )}
        </li>
        <li>
          {methods.includes("passkey") ? <><Check size={16} aria-hidden="true" /> Passkey added</> : (
            <button type="button" className="gift-button gift-button--outline" onClick={() => signer?.linkPasskey?.()} disabled={!signer?.linkPasskey}><KeyRound size={16} aria-hidden="true" /> Add a passkey</button>
          )}
        </li>
        <li>
          <button type="button" className="gift-text-link" onClick={() => void signer?.exportWallet?.().then(() => setExported(true)).catch(() => {})} disabled={!signer?.exportWallet}>
            Export your wallet key <ArrowUpRight size={13} />
          </button>
          <span className="gift-send-quiet">{exported ? "Keep it somewhere safe. Anyone with it controls the wallet." : "Opens a secure window we can't see into. Take your wallet anywhere."}</span>
        </li>
      </ul>
    </section>
  );
}

function Panel({ tone, children }: { tone: "done" | "problem" | "pending"; children: React.ReactNode }) {
  return <div className={`gift-send-panel gift-send-panel--${tone}`}>{children}</div>;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    // No site header or footer: the recipient is here for one thing, and every way out of it is a
    // way to lose the moment. What they need to leave (portfolio, the thesis) is in the page.
    <div className="gift-site gift-recipient-site gift-recipient-site--bare">
      <main className="gift-recipient-main" id="main">
        {children}
      </main>
    </div>
  );
}

type AcceptOutcome =
  | { status: "accepted" }
  | { status: "wrong_x_account"; signedInAs: string | null; intended: string }
  | { status: "no_x_account" | "identity_rejected" | "unavailable" | "not_found" | "conflict" };

/**
 * A gift waiting to be accepted. The sender couldn't be told which X account the handle is, so the
 * recipient shows it: signing in with X proves the account, makes their wallet, and lets the sender
 * send. Nothing about the contents or the amount is shown — that is still the surprise.
 */
function AcceptInvitation({ token, view, pack, claimConfigured }: { token: string; view: View; pack: Pack | null; claimConfigured: boolean }) {
  const signer = usePrivySigner();
  const [phase, setPhase] = useState<"idle" | "working" | "cancelled" | "done" | "error">(view.state === "awaiting_recipient" ? "idle" : "done");
  const [outcome, setOutcome] = useState<AcceptOutcome | null>(null);
  const key = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (phase !== "idle") heading.current?.focus(); }, [phase]);

  async function accept(freshLogin = false) {
    if (!signer?.loginWithX) return;
    setPhase("working");
    const signedIn = signer.twitterHandle && !freshLogin ? "ok" : await signer.loginWithX();
    if (signedIn === "cancelled") return setPhase("cancelled");
    if (signedIn === "failed") return setPhase("error");
    const identityToken = await signer.getIdentityToken?.().catch(() => null);
    if (!identityToken) return setPhase("error");
    key.current ??= crypto.randomUUID();
    const res = await fetch(`/api/gifts/invite/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key.current },
      body: JSON.stringify({ identityToken }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as AcceptOutcome | null;
    if (!body?.status) return setPhase("error");
    setOutcome(body);
    setPhase(body.status === "accepted" ? "done" : "error");
  }

  const note = view.note !== null ? <blockquote className="gift-inv-note">&ldquo;{view.note || "A little something for your next chapter."}&rdquo;<cite>{view.senderName}</cite></blockquote> : null;

  if (phase === "done") {
    return (
      <section className="gift-unopened gift-inv">
        <div className="gift-recipient-intro">
          <p className="gift-eyebrow">A GIFT FROM {view.senderName.toUpperCase()}</p>
          <h1 ref={heading} tabIndex={-1}>You&rsquo;re in, @{view.intendedHandle}.<br /><em>{view.senderName} can send it now.</em></h1>
          {note}
        </div>
        {pack && <div className="gift-unopened-pack"><GiftPack pack={pack} image={view.centerImageUrl} /></div>}
        <p className="gift-send-quiet gift-accept-next">Open this same link again once it&rsquo;s sent. The gift goes to a wallet only your X account can open.</p>
      </section>
    );
  }

  return (
    <section className="gift-unopened gift-inv">
      <div className="gift-recipient-intro">
        <p className="gift-eyebrow">A GIFT FROM {view.senderName.toUpperCase()}</p>
        <h1>Hey @{view.intendedHandle},<br /><em>{view.senderName} wants to send you something.</em></h1>
        {note}
      </div>
      {pack && <div className="gift-unopened-pack"><GiftPack pack={pack} image={view.centerImageUrl} /></div>}
      <div className="gift-open-actions" aria-live="polite">
        {phase === "error" && outcome?.status === "wrong_x_account" ? (
          <>
            <h2 className="gift-inv-title" ref={heading} tabIndex={-1}>This gift is for @{outcome.intended}. You&rsquo;re signed in as @{outcome.signedInAs ?? "someone else"}.</h2>
            <button type="button" className="gift-text-link" onClick={() => void (async () => { await signer?.logout?.(); key.current = null; await accept(true); })()}>Use a different X account</button>
          </>
        ) : phase === "error" ? (
          <h2 className="gift-inv-title" ref={heading} tabIndex={-1}>That didn&rsquo;t work. Try again in a moment.</h2>
        ) : phase === "cancelled" ? (
          <h2 className="gift-inv-title" ref={heading} tabIndex={-1}>No problem — accept whenever you&rsquo;re ready.</h2>
        ) : null}
        <p className="gift-accept-why">Accept it with your X account. That proves it&rsquo;s really you, and then {view.senderName} sends it. Nothing is charged to you.</p>
        {claimConfigured ? (
          <button type="button" className="gift-button" onClick={() => void accept()} disabled={!signer?.loginWithX || phase === "working"}>
            <span className="gift-x-mark" aria-hidden="true">𝕏</span> {phase === "working" ? "Accepting…" : signer?.loginWithX ? "Accept with X" : "Loading sign-in…"}
          </button>
        ) : (
          <p className="gift-inv-gated">Accepting gifts isn&rsquo;t switched on here yet.</p>
        )}
      </div>
    </section>
  );
}

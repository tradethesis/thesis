"use client";

import { ArrowRight, Check, Copy, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useWallet } from "@/components/buy/useWallet";
import { readPhoto, uploadPhoto } from "@/lib/gift-image";
import { type GiftDraft, type GiftPack } from "@/lib/gifts";
import { estimateBasketCost, formatUsdc } from "@/lib/money/cost";
import { getPhantom } from "@/lib/wallet/phantom";

/**
 * Sending a gift for real.
 *
 * Every step is a server state, and the screen shows the one the server reports — never one the
 * browser inferred. The order is the order the money requires:
 *
 *   sign in → start → look the handle up → the sender confirms who that is → the recipient's wallet
 *   is created → the sender reads the terms → their wallet signs and sends → the chain is read.
 *
 * Nothing here can fund a gift twice. The start request and every write carry an idempotency key
 * that survives a reload, and once a transfer has been submitted the only action offered is to
 * check it again. "Try again" after an uncertain transfer is how people pay twice.
 *
 * When this deployment cannot do all of that, the section does not appear at all and the unfunded
 * preview is the whole experience.
 */

type Readiness = { live: boolean; missing: string[] };
type Account = { subject: string; username: string; name: string; profileImageUrl: string | null };

type Step =
  | { at: "checking" }
  | { at: "unavailable"; missing: string[] }
  | { at: "sign_in" }
  | { at: "working"; label: string }
  | { at: "confirm"; account: Account }
  | { at: "accept_first" }
  | { at: "awaiting" }
  | { at: "not_found" }
  | { at: "changed" }
  | { at: "terms" }
  | { at: "insufficient"; needUsdc: string; haveUsdc: string; needSol: string; haveSol: string }
  | { at: "cancelled_in_wallet" }
  | { at: "needs_phantom" }
  | { at: "confirming"; signature: string }
  | { at: "reconciling" }
  | { at: "failed"; reason: string }
  | { at: "sent" }
  | { at: "problem"; message: string; retry?: () => void };

/** How long to keep checking quietly before saying it is taking longer than usual. */
const CONFIRM_PATIENCE_MS = 60_000;

const FAILED: Record<string, string> = {
  wrong_amount: "The transfer on chain was for a different amount than this gift.",
  wrong_destination: "The transfer went somewhere other than this gift's wallet.",
  wrong_sender: "The transfer came from a different wallet than the one you're signed in with.",
  not_usdc: "That transaction didn't move USDC.",
  failed_on_chain: "The transaction failed on chain, so nothing was sent.",
  not_a_signature: "That doesn't look like a transaction signature.",
};

type Stored = { giftId: string; inviteToken: string | null; key: string };
const storeKey = (d: GiftDraft) => `thesis:gift-send:${d.packId}:${d.versionId}:${d.recipient}:${d.amount}`;

function readStored(d: GiftDraft): Stored | null {
  try {
    const raw = sessionStorage.getItem(storeKey(d));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
function writeStored(d: GiftDraft, s: Stored) {
  try {
    sessionStorage.setItem(storeKey(d), JSON.stringify(s));
  } catch {
    /* Private mode: the flow still works, it just won't survive a reload. */
  }
}

async function call<T>(path: string, init?: RequestInit & { key?: string }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.key ? { "idempotency-key": init.key } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? "Something went wrong. Try again.");
  return body as T;
}

/** `resumeGiftId`: continue a gift started earlier (from /gift/send/[id]) instead of starting one. */
/**
 * `inline`: render the steps in place (the resume page). Otherwise a "Send it for real" button opens
 * them in a dialog — a centred modal on desktop, a bottom sheet on phones — and closing it keeps the
 * progress; reopening resumes.
 */
export function GiftSend({ draft, pack, resumeGiftId, inline = false }: { draft: GiftDraft; pack: GiftPack; resumeGiftId?: string; inline?: boolean }) {
  const w = useWallet();
  const [step, setStep] = useState<Step>({ at: "checking" });
  const [stored, setStored] = useState<Stored | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const cost = estimateBasketCost(BigInt(draft.amount) * 1_000_000n, pack.holdings.length);

  useEffect(() => {
    let live = true;
    call<Readiness>("/api/gifts/readiness")
      .then((r) => {
        if (!live) return;
        setStored(resumeGiftId ? { giftId: resumeGiftId, inviteToken: null, key: crypto.randomUUID() } : readStored(draft));
        setStep(r.live ? { at: "sign_in" } : { at: "unavailable", missing: r.missing });
      })
      .catch(() => live && setStep({ at: "unavailable", missing: [] }));
    return () => {
      live = false;
    };
  }, [draft, resumeGiftId]);

  /*
   * Move focus to the new step's heading, so a screen reader hears what changed. Not the first step:
   * that one arrives on its own when the readiness check returns, and taking focus then would pull
   * the page past the review the sender is still reading (on a phone, a whole screen down).
   */
  const settled = useRef(false);
  useEffect(() => {
    if (step.at === "checking") return;
    if (!settled.current) {
      settled.current = true;
      return;
    }
    heading.current?.focus();
  }, [step.at]);

  const ensureGift = useCallback(async (): Promise<Stored> => {
    const existing = stored ?? readStored(draft);
    if (existing) return existing;
    const key = crypto.randomUUID();
    // The photo is uploaded now that the sender is signed in; before that it only lived in this tab.
    const photo = readPhoto();
    const centerImageId = photo ? await uploadPhoto(photo) : null;
    const created = await call<{ status: string; giftId: string; inviteToken: string | null }>("/api/gifts", {
      method: "POST",
      key,
      body: JSON.stringify({ ...draft, centerImageId }),
    });
    if (created.status === "image_unavailable") throw new Error("That photo can't be used. Remove it or choose another, then try again.");
    if (created.status === "allocation_changed") throw new Error("This pack's allocation was updated. Review the pack again before sending.");
    if (created.status === "rate_limited") throw new Error("You've started a lot of gifts in the last hour. Wait a little, then try again. Nothing has been sent.");
    if (created.status !== "created") throw new Error("This gift couldn't be started. Check the details and try again.");
    const next = { giftId: created.giftId, inviteToken: created.inviteToken, key };
    writeStored(draft, next);
    setStored(next);
    return next;
  }, [draft, stored]);

  const lookUp = useCallback(async () => {
    setStep({ at: "working", label: `Looking up @${draft.recipient} on X…` });
    try {
      const g = await ensureGift();
      const r = await call<{ status: string; account?: Account; missing?: string[] }>(`/api/gifts/${g.giftId}/lookup`, { method: "POST" });
      if (r.status === "resolved" && r.account) setStep({ at: "confirm", account: r.account });
      else if (r.status === "not_found") setStep({ at: "not_found" });
      else if (r.status === "unavailable") setStep({ at: "problem", message: "Sending isn't available right now. Nothing has been sent, and the preview still works." });
      else if (r.status === "needs_acceptance") setStep({ at: "accept_first" });
      // Already past lookup: resume where it stands.
      else if (r.status === "conflict") setStep((r as { state?: string }).state === "awaiting_recipient" ? { at: "awaiting" } : { at: "terms" });
      else if (r.status === "rate_limited") setStep({ at: "problem", message: "That's a lot of lookups in a short time. Wait a few minutes, then check the handle again. Nothing has been sent.", retry: () => void lookUp() });
      else setStep({ at: "problem", message: "X didn't answer. Nothing has been sent.", retry: () => void lookUp() });
    } catch (e) {
      setStep({ at: "problem", message: (e as Error).message, retry: () => void lookUp() });
    }
  }, [draft.recipient, ensureGift]);

  // Accept-then-fund: the link goes out first; the gift is paid for once they have accepted.
  const askToAccept = useCallback(async () => {
    setStep({ at: "working", label: "Getting their link ready…" });
    try {
      const g = await ensureGift();
      const r = await call<{ status: string }>(`/api/gifts/${g.giftId}/await`, { method: "POST", key: `${g.key}:await` });
      if (r.status === "awaiting") setStep({ at: "awaiting" });
      else setStep({ at: "problem", message: "The link couldn't be prepared. Nothing has been sent." });
    } catch (e) {
      setStep({ at: "problem", message: (e as Error).message });
    }
  }, [ensureGift]);

  const newLink = useCallback(async () => {
    if (!stored) return;
    const r = await call<{ status: string; inviteToken?: string }>(`/api/gifts/${stored.giftId}/invite`, { method: "POST" }).catch(() => null);
    if (r?.status === "reissued" && r.inviteToken) {
      const next = { ...stored, inviteToken: r.inviteToken };
      setStored(next);
      if (!resumeGiftId) writeStored(draft, next);
    }
  }, [stored, draft, resumeGiftId]);

  // While waiting, look every few seconds; the moment they accept, move on to paying.
  useEffect(() => {
    if (step.at !== "awaiting" || !stored) return;
    const t = setInterval(() => {
      void call<{ status: string; gift?: { state: string } }>(`/api/gifts/${stored.giftId}`)
        .then((r) => { if (r.gift?.state === "wallet_provisioned") setStep({ at: "terms" }); })
        .catch(() => {});
    }, 6000);
    return () => clearInterval(t);
  }, [step.at, stored]);

  const confirm = useCallback(async (account: Account) => {
    setStep({ at: "working", label: `Setting up @${account.username}'s wallet…` });
    try {
      const g = await ensureGift();
      const r = await call<{ status: string; missing?: string[] }>(`/api/gifts/${g.giftId}/confirm`, {
        method: "POST",
        key: `${g.key}:confirm`,
        body: JSON.stringify({ subject: account.subject }),
      });
      if (r.status === "provisioned") setStep({ at: "terms" });
      else if (r.status === "changed") setStep({ at: "changed" });
      else if (r.status === "not_found_on_x") setStep({ at: "not_found" });
      else if (r.status === "unavailable") setStep({ at: "problem", message: "Sending isn't available right now. Nothing has been sent, and the preview still works." });
      else setStep({ at: "problem", message: "The wallet couldn't be set up. Nothing has been sent.", retry: () => void confirm(account) });
    } catch (e) {
      setStep({ at: "problem", message: (e as Error).message, retry: () => void confirm(account) });
    }
  }, [ensureGift]);

  const confirmStarted = useRef<number | null>(null);
  const checkFunding = useCallback(async (signature: string) => {
    confirmStarted.current ??= Date.now();
    const g = stored ?? readStored(draft);
    if (!g) return;
    const r = await call<{ status: string; reason?: string }>(`/api/gifts/${g.giftId}/funding`, {
      method: "POST",
      key: `${g.key}:fund:${signature}`,
      body: JSON.stringify({ signature }),
    });
    if (r.status === "funded") setStep({ at: "sent" });
    // A transfer usually needs a few seconds before its details can be read. Keep checking quietly
    // (the effect below) rather than telling the sender we "can't confirm" something still landing.
    else if (r.status === "reconciling") setStep(confirmStarted.current && Date.now() - confirmStarted.current > CONFIRM_PATIENCE_MS ? { at: "reconciling" } : { at: "confirming", signature });
    else if (r.status === "failed") setStep({ at: "failed", reason: FAILED[r.reason ?? ""] ?? "The transfer didn't match this gift." });
    else if (r.status === "signature_in_use") setStep({ at: "failed", reason: "That transaction already funds another gift." });
    else setStep({ at: "reconciling" });
  }, [draft, stored]);

  const send = useCallback(async () => {
    const phantom = getPhantom();
    // The funding transfer is signed and broadcast by the sender's own wallet. Phantom is the only
    // wallet wired for that here; an email wallet has no path to send it yet, and pretending it did
    // would strand a signed transaction nobody broadcasts.
    if (!phantom?.signAndSendTransaction || phantom.publicKey?.toBase58() !== w.wallet) {
      setStep({ at: "needs_phantom" });
      return;
    }
    setStep({ at: "working", label: "Preparing the transfer…" });
    try {
      const g = await ensureGift();
      const r = await call<{ status: string; transaction?: string; needUsdcRaw?: string; haveUsdcRaw?: string; needLamports?: string; haveLamports?: string }>(
        `/api/gifts/${g.giftId}/funding-transaction`,
      );
      if (r.status === "insufficient_funds") {
        setStep({
          at: "insufficient",
          needUsdc: formatUsdc(BigInt(r.needUsdcRaw!)),
          haveUsdc: formatUsdc(BigInt(r.haveUsdcRaw!)),
          needSol: (Number(r.needLamports) / 1e9).toFixed(3),
          haveSol: (Number(r.haveLamports) / 1e9).toFixed(3),
        });
        return;
      }
      if (r.status !== "ready" || !r.transaction) {
        setStep({ at: "problem", message: "This gift isn't ready to send. Refresh and try again." });
        return;
      }

      setStep({ at: "working", label: "Approve the transfer in your wallet…" });
      const { Transaction } = await import("@solana/web3.js");
      const tx = Transaction.from(Uint8Array.from(atob(r.transaction), (c) => c.charCodeAt(0)));
      let signature: string;
      try {
        ({ signature } = await phantom.signAndSendTransaction(tx));
      } catch {
        setStep({ at: "cancelled_in_wallet" });
        return;
      }
      setStep({ at: "working", label: "Confirming on Solana…" });
      await checkFunding(signature);
    } catch (e) {
      setStep({ at: "problem", message: (e as Error).message });
    }
  }, [ensureGift, checkFunding, w.wallet]);

  // While confirming, look again every few seconds. The funding check is idempotent by signature.
  useEffect(() => {
    if (step.at !== "confirming") return;
    const t = setTimeout(() => { void checkFunding(step.signature).catch(() => setStep({ at: "reconciling" })); }, 3000);
    return () => clearTimeout(t);
  }, [step, checkFunding]);

  const recheck = useCallback(async () => {
    setStep({ at: "working", label: "Checking the transfer again…" });
    const g = stored ?? readStored(draft);
    if (!g) return;
    try {
      const r = await call<{ status: string; gift?: { state: string; fundingSignature: string | null; failureReason: string | null } }>(`/api/gifts/${g.giftId}`);
      const sig = r.gift?.fundingSignature;
      if (r.gift?.state === "funded" || r.gift?.state?.startsWith("claim")) setStep({ at: "sent" });
      else if (sig) await checkFunding(sig);
      else setStep({ at: "terms" });
    } catch (e) {
      setStep({ at: "problem", message: (e as Error).message });
    }
  }, [draft, stored, checkFunding]);

  const invite = stored?.inviteToken ? `${typeof window === "undefined" ? "" : window.location.origin}/gift/${stored.inviteToken}` : null;

  async function copyInvite() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
    } catch {
      /* The link is on screen to copy by hand. */
    }
  }

  const H = (text: string) => (
    <h3 className="gift-send-title" ref={heading} tabIndex={-1}>
      {text}
    </h3>
  );

  // Where real sending isn't switched on, the preview is the whole experience: no panel explaining
  // what is missing, which only ever read as a broken promise.
  if (step.at === "checking" || step.at === "unavailable") return null;

  // Switching wallets is offered only while nothing is out in the world: no link shared, no money moving.
  const canSwitch = Boolean(w.wallet) && ["sign_in", "confirm", "not_found", "changed", "terms", "insufficient", "needs_phantom", "cancelled_in_wallet", "problem", "accept_first"].includes(step.at);
  async function switchWallet() {
    const g = stored;
    // The unpaid draft belongs to the old wallet: withdraw it while that wallet is still signed in.
    if (g) await call(`/api/gifts/${g.giftId}/cancel`, { method: "POST", key: `${g.key}:switch` }).catch(() => {});
    try { sessionStorage.removeItem(storeKey(draft)); } catch { /* nothing stored */ }
    setStored(null);
    await w.signOut();
    setStep({ at: "sign_in" });
  }

  const body = (
    <section className="gift-send" aria-labelledby="gift-send-heading" aria-live="polite">
      {w.wallet && (
        <p className="gift-send-wallet">
          <span>Sending from <code>{w.wallet.slice(0, 4)}…{w.wallet.slice(-4)}</code></span>
          {canSwitch && <button type="button" className="gift-text-link" onClick={() => void switchWallet()}>Switch wallet</button>}
        </p>
      )}
      <p className="gift-eyebrow" id="gift-send-heading">SEND IT FOR REAL</p>

      {step.at === "sign_in" && (
        <div className="gift-send-panel">
          {H(w.wallet ? "Ready when you are." : "Sign in to send.")}
          <p>{w.wallet ? `Sending from ${w.wallet.slice(0, 4)}…${w.wallet.slice(-4)}.` : "The gift is paid from your own wallet. Sign in with it first — signing proves the wallet is yours and spends nothing."}</p>
          {w.wallet ? (
            <button type="button" className="gift-button gift-button--wide" onClick={() => void lookUp()}>Find @{draft.recipient} on X <ArrowRight size={17} /></button>
          ) : (
            <button type="button" className="gift-button gift-button--wide" onClick={() => void w.connect()} disabled={w.connecting || w.signingIn}>{w.signingIn ? "Waiting for your signature…" : "Sign in with your wallet"} <ArrowRight size={17} /></button>
          )}
          {w.error && <p className="gift-error" role="alert">{w.error}</p>}
        </div>
      )}

      {step.at === "working" && <p className="gift-send-quiet" role="status"><Loader2 size={14} className="gift-spin" aria-hidden="true" /> {step.label}</p>}

      {step.at === "confirm" && (
        <div className="gift-send-panel">
          {H("Is this who you mean?")}
          <div className="gift-account">
            {/* An X avatar from X's CDN, shown once at 48px. next/image would proxy it through the
                optimizer for no gain and needs the host allow-listed; a plain img is the honest tool. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {step.account.profileImageUrl ? <img src={step.account.profileImageUrl} alt="" width={48} height={48} /> : <span className="gift-account-initial" aria-hidden="true">{step.account.name.slice(0, 1)}</span>}
            <div><strong>{step.account.name}</strong><span>@{step.account.username}</span></div>
          </div>
          <p className="gift-send-quiet">The gift is tied to this X account itself, not the handle — if they rename it, it still reaches them.</p>
          <div className="gift-send-actions">
            <button type="button" className="gift-button" onClick={() => void confirm(step.account)}>Yes, that&rsquo;s them <ArrowRight size={17} /></button>
            <a href="#compose-title" className="gift-text-link">Not them — change the handle</a>
          </div>
        </div>
      )}

      {step.at === "accept_first" && (
        <div className="gift-send-panel">
          {H(`@${draft.recipient} isn’t on Thesis yet.`)}
          <p>Send them the link first. They open it and sign in with X to accept — that proves it’s really them — and then you send the gift. Nothing is charged until they’ve accepted.</p>
          <button type="button" className="gift-button gift-button--wide" onClick={() => void askToAccept()}>Get their link <ArrowRight size={17} /></button>
        </div>
      )}

      {step.at === "awaiting" && (
        <div className="gift-send-panel">
          {H(`Now send @${draft.recipient} the link.`)}
          <p>When they accept with X, this page moves on to sending. You can close it and come back — nothing is charged until then.</p>
          {invite ? (
            <>
              <p className="gift-invite-link"><code>{invite}</code></p>
              <div className="gift-send-actions">
                <button type="button" className="gift-button" onClick={() => void copyInvite()}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Link copied" : "Copy link"}</button>
                {/* Opens X's composer with the text filled in. Posting is theirs to do; nothing is sent on their behalf. */}
                <a className="gift-text-link" target="_blank" rel="noopener noreferrer" href={`https://x.com/intent/post?text=${encodeURIComponent(`@${draft.recipient} I’ve got a little something for you. Accept it here: ${invite}`)}`}>Write a post on X <ArrowRight size={14} /></a>
              </div>
            </>
          ) : (
            <button type="button" className="gift-button" onClick={() => void newLink()}>Get a new link</button>
          )}
          {stored && <p className="gift-send-quiet"><Loader2 size={13} className="gift-spin" aria-hidden="true" /> Waiting for @{draft.recipient} to accept. Come back any time: <a className="gift-text-link" href={`/gift/send/${stored.giftId}`}>this gift’s page</a>.</p>}
        </div>
      )}

      {step.at === "not_found" && (
        <div className="gift-send-panel gift-send-panel--problem">
          {H(`We couldn’t find @${draft.recipient} on X.`)}
          <p>Check the spelling, or ask them for their handle. A gift can only go to an account that exists. Nothing has been sent.</p>
          <a href="#compose-title" className="gift-text-link"><RotateCcw size={14} /> Change the handle</a>
        </div>
      )}

      {step.at === "changed" && (
        <div className="gift-send-panel gift-send-panel--problem">
          {H("That handle now belongs to someone else.")}
          <p>It changed hands between looking it up and confirming. We didn&rsquo;t send anything. Look it up again and check who it is now.</p>
          <button type="button" className="gift-text-link" onClick={() => void lookUp()}><RotateCcw size={14} /> Look it up again</button>
        </div>
      )}

      {step.at === "terms" && (
        <div className="gift-send-panel gift-send-terms">
          {H(`Send @${draft.recipient} a gift`)}
          <dl className="gift-terms">
            <div><dt>The gift</dt><dd>{formatUsdc(BigInt(draft.amount) * 1_000_000n)} USDC</dd></div>
            <div><dt>Their network fees</dt><dd>0.01 SOL</dd></div>
            <div className="gift-terms-total"><dt>You pay</dt><dd>{formatUsdc(BigInt(draft.amount) * 1_000_000n)} + 0.01 SOL</dd></div>
          </dl>
          <p className="gift-terms-fine">
            Only @{draft.recipient} can open it, and <strong>it can&rsquo;t be recalled</strong> — unopened, it stays theirs as USDC.
            About {formatUsdc(cost.estimatedCostRaw)} goes to swap fees when they open it. Tokenized stocks can lose value.
          </p>
          <label className="gift-check"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> I understand it can&rsquo;t be undone</label>
          <button type="button" className="gift-button gift-button--wide" disabled={!agreed} onClick={() => void send()}>Sign and send {formatUsdc(BigInt(draft.amount) * 1_000_000n, 0)} <ArrowRight size={17} /></button>
        </div>
      )}

      {step.at === "insufficient" && (
        <div className="gift-send-panel gift-send-panel--problem">
          {H("Your wallet is a little short.")}
          <p>This gift needs {step.needUsdc} USDC and {step.needSol} SOL. Your wallet has {step.haveUsdc} USDC and {step.haveSol} SOL. Top up and try again — nothing has been sent.</p>
          {w.wallet && <FundAddress address={w.wallet} />}
          <button type="button" className="gift-text-link" onClick={() => void send()}><RotateCcw size={14} /> Check again</button>
        </div>
      )}

      {step.at === "needs_phantom" && (
        <div className="gift-send-panel gift-send-panel--problem">
          {H("Sending needs Phantom for now.")}
          <p>The transfer is signed and sent by your own wallet. Sign in with the Phantom wallet that holds the USDC, then send. Nothing has been sent.</p>
        </div>
      )}

      {step.at === "cancelled_in_wallet" && (
        <div className="gift-send-panel gift-send-panel--problem">
          {H("You cancelled in your wallet.")}
          <p>Nothing was sent. Your gift is still ready when you are.</p>
          <button type="button" className="gift-button" onClick={() => void send()}>Try again <ArrowRight size={17} /></button>
        </div>
      )}

      {step.at === "confirming" && (
        <div className="gift-send-panel">
          {H("Confirming on Solana…")}
          <p className="gift-send-quiet"><Loader2 size={14} className="gift-spin" aria-hidden="true" /> Your wallet sent it. This usually takes a few seconds.</p>
        </div>
      )}

      {step.at === "reconciling" && (
        <div className="gift-send-panel gift-send-panel--pending">
          {H("Still confirming.")}
          <p>Solana is taking longer than usual. Your transfer is recorded, so <strong>don&rsquo;t send it again</strong> — we keep checking, and you can close this and come back.</p>
          <button type="button" className="gift-text-link" onClick={() => void recheck()}><RotateCcw size={14} /> Check again</button>
        </div>
      )}

      {step.at === "failed" && (
        <div className="gift-send-panel gift-send-panel--problem">
          {H("This gift didn’t go through.")}
          <p>{step.reason}</p>
        </div>
      )}

      {step.at === "problem" && (
        <div className="gift-send-panel gift-send-panel--problem">
          {H("Something went wrong.")}
          <p>{step.message}</p>
          {step.retry && <button type="button" className="gift-text-link" onClick={step.retry}><RotateCcw size={14} /> Try again</button>}
        </div>
      )}

      {step.at === "sent" && (
        <div className="gift-send-panel gift-send-panel--done">
          {H(`Sent. It’s in @${draft.recipient}’s wallet.`)}
          <p><ShieldCheck size={15} aria-hidden="true" /> Confirmed on Solana. Now let them know — the invitation is how they find it.</p>
          {invite ? (
            <>
              <p className="gift-invite-link"><code>{invite}</code></p>
              <div className="gift-send-actions">
                <button type="button" className="gift-button" onClick={() => void copyInvite()}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Invitation copied" : "Copy invitation"}</button>
                {/* Opens X's composer with the text filled in. Posting is theirs to do; nothing is sent on their behalf. */}
                <a className="gift-text-link" target="_blank" rel="noopener noreferrer" href={`https://x.com/intent/post?text=${encodeURIComponent(`@${draft.recipient} a little something for you ${invite}`)}`}>Write a post on X <ArrowRight size={14} /></a>
              </div>
              <p className="gift-send-quiet">Anyone with this link can read your note. Only @{draft.recipient} can open the gift.</p>
            </>
          ) : (
            <p className="gift-send-quiet">The invitation link was shown when the gift was created and isn&rsquo;t stored in a readable form. Check your earlier tab, or contact support with the gift&rsquo;s transaction.</p>
          )}
        </div>
      )}
    </section>
  );

  if (inline) return body;
  return <SendDialog label={step.at === "sent" ? "Show the invitation" : "Send it for real"}>{body}</SendDialog>;
}

/** The send steps in a native dialog: focus stays inside, Esc and the backdrop close it, state survives. */
function SendDialog({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="gift-button gift-button--wide gift-send-open" onClick={() => ref.current?.showModal()}>
        {label} <ArrowRight size={17} />
      </button>
      <dialog
        ref={ref}
        className="gift-send-dialog"
        aria-labelledby="gift-send-heading"
        onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}
      >
        <div className="gift-send-dialog-body">
          <button type="button" className="gift-send-dialog-close" onClick={() => ref.current?.close()} aria-label="Close"><X size={18} /></button>
          {children}
        </div>
      </dialog>
    </>
  );
}

/** Where to top up: the signed-in wallet's address, copyable. */
function FundAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="gift-fund-address">
      <span>Send USDC and a little SOL on Solana to</span>
      <code>{address}</code>
      <button type="button" className="gift-text-link" onClick={() => void navigator.clipboard.writeText(address).then(() => setCopied(true), () => {})}>
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Address copied" : "Copy address"}
      </button>
    </div>
  );
}


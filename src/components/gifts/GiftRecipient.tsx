"use client";

import Link from "next/link";
import { ArrowRight, Check, Copy, Gift, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TokenLogo } from "@/components/calls/TokenLogo";
import { allocateGiftCents, readGiftPreview, type GiftDraft, type GiftPack as Pack } from "@/lib/gifts";
import { usePrivySigner } from "@/lib/wallet/privy-signer";
import { readPhoto } from "@/lib/gift-image";
import { GiftNext } from "./GiftNext";
import { GiftPack } from "./GiftPack";
import { PackStage } from "./PackStage";
import { GiftFooter, GiftHeader } from "./GiftShell";

export function GiftRecipient({ packs }: { packs: Pack[] }) {
  const [draft, setDraft] = useState<GiftDraft | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [opened, setOpened] = useState(false);
  const [staging, setStaging] = useState(false);
  // The sender's photo lives only in their own tab until the gift is sent, so a shared preview link
  // shows the pack's own art instead.
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => setPhoto(readPhoto()?.dataUrl ?? null), []);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const revealTitle = useRef<HTMLHeadingElement>(null);
  const revealButton = useRef<HTMLButtonElement>(null);
  const signer = usePrivySigner();

  useEffect(() => {
    const read = () => {
      setDraft(readGiftPreview(window.location.hash)); setLoaded(true); setOpened(false); setError(""); setCopied(false);
    };
    read(); window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => { if (opened) revealTitle.current?.focus(); }, [opened]);
  // A pack somebody built isn't in the curated list the page was rendered with; fetch it by id.
  const [custom, setCustom] = useState<Pack | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  useEffect(() => {
    const id = draft?.packId;
    if (!id || packs.some((p) => p.id === id)) return;
    let live = true;
    setCustomLoading(true);
    fetch(`/api/gifts/packs/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { pack?: Pack } | null) => live && setCustom(b?.pack ?? null))
      .catch(() => {})
      .finally(() => live && setCustomLoading(false));
    return () => { live = false; };
  }, [draft?.packId, packs]);
  const pack = packs.find((p) => p.id === draft?.packId) ?? (custom?.id === draft?.packId ? custom : undefined);
  const valid = draft && pack && pack.versionId === draft.versionId;

  async function signIn() {
    setError("");
    try { await signer?.loginWithX?.(); }
    catch { setError("X sign-in couldn’t start. You can still try the preview below."); }
  }

  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); }
    catch { setError("Copy the address from your browser to share this preview."); }
  }

  return <div className="gift-site gift-recipient-site"><GiftHeader recipient />
    <main className="gift-recipient-main" id="main">
      <div className="gift-preview-banner"><span className="gift-preview-dot" /> Unfunded gift preview <span>No assets to claim</span></div>
      {!loaded || customLoading ? <p className="gift-loading" role="status">Unwrapping the details…</p> : !valid ? <section className="gift-invalid"><Gift size={40} /><h1>{draft && pack ? "This pack has changed." : "This preview isn’t available."}</h1><p>{draft && pack ? "The allocation was updated. Make a new preview to see its current holdings." : "This link needs a valid gift preview and an available pack. No money is attached to this link."}</p><Link href="/#packs" className="gift-button">Explore the packs <ArrowRight size={17} /></Link></section> : <>
        {!opened ? <section className="gift-unopened">
          <div className="gift-recipient-intro"><p className="gift-eyebrow">A LITTLE BELIEF, FROM {draft.sender.toUpperCase()}</p><h1>Hey @{draft.recipient},<br /><em>this future has your name on it.</em></h1><p>{draft.message || "A little something for your next chapter."}</p></div>
          {/* Sealed: the wrapping shows, the contents and the amount don't. Tearing reveals the disclosed allocation — nothing is decided by the tear. */}
          <button type="button" className="gift-sealed" onClick={() => setStaging(true)} aria-label={`Open the ${pack.name} pack`}><GiftPack pack={pack} image={photo} /></button>
          <button ref={revealButton} type="button" className="gift-button gift-open-cta" onClick={() => setStaging(true)}>Open it</button>
          <div className="gift-open-actions"><p>What&rsquo;s inside stays a surprise until you tear it open.</p>
            <details className="gift-x-signin"><summary><span className="gift-x-mark">𝕏</span> Try X sign-in</summary><p>Live gifts will be claimed by their intended X account. Signing in here does not verify this preview’s recipient or deliver any assets.</p>
              {signer?.twitterHandle ? <p className="gift-auth-state"><Check size={16} /> Signed in as @{signer.twitterHandle}</p> : <button className="gift-button gift-button--outline" disabled={!signer?.loginWithX} onClick={() => void signIn()}><span className="gift-x-mark">𝕏</span>{signer?.authenticated ? "Link your X account" : "Continue with X"}</button>}
              {!signer?.loginWithX && <p>X sign-in is not available in this environment yet.</p>}
            </details>
          </div>
        </section> : <section className="gift-revealed">
          <div className="gift-reveal-heading"><p className="gift-eyebrow">THE FUTURE INSIDE</p><h1 ref={revealTitle} tabIndex={-1}>{pack.name}.</h1><p>{pack.holdings.length === 3 ? "Three picks" : `${pack.holdings.length} picks`}. One shared belief.<br />${draft.amount} of it, from {draft.sender} to @{draft.recipient}.</p></div>
          <div className="gift-reveal-cards">{pack.holdings.map((h, i) => <article className={`gift-holding-card gift-holding-card--${pack.color}`} key={h.symbol} style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}>
            <div className="gift-holding-number">0{i + 1}<span>{h.weightBps / 100}% OF PACK</span></div><TokenLogo symbol={h.symbol} company={h.company} tone={i} size={60} /><h2>{h.company}</h2><span className="gift-holding-ticker">{h.symbol}</span><p>{h.why || `Tokenized price exposure to ${h.company}.`}</p><div className="gift-holding-value"><strong>{(allocateGiftCents(draft.amount, pack.holdings.map((v) => v.weightBps))[i] / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong><span>illustrative allocation</span></div>
          </article>)}</div>
          <div className="gift-reveal-note"><p>“{draft.message || "Here’s to your next chapter."}”</p><span>From {draft.sender}</span></div>
          <GiftNext pack={pack} from={draft.sender} />
          <div className="gift-reveal-bottom"><p><strong>A preview of a first investment.</strong><br />These are illustrative allocations before fees. No tokens were bought, sent, or claimed.</p><div><button className="gift-text-link" onClick={() => void share()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Preview link copied" : "Share this preview"}</button><button className="gift-text-link" onClick={() => { setOpened(false); requestAnimationFrame(() => revealButton.current?.focus()); }}><RotateCcw size={14} /> Replay reveal</button></div></div>
        </section>}
        {error && <p className="gift-error" role="alert">{error}</p>}
        {staging && valid && <PackStage pack={pack} image={photo} from={draft.sender} cards={pack.holdings.length} onOpened={() => setOpened(true)} onClosed={() => setStaging(false)} />}
      </>}
    </main><GiftFooter />
  </div>;
}

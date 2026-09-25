"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, Check, Copy, Gift, Heart, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TokenLogo } from "@/components/calls/TokenLogo";
import { allocateGiftCents, GIFT_MAX_USD, GIFT_MIN_USD, giftDraftSchema, giftPreviewPath, type GiftDraft, type GiftPack as Pack } from "@/lib/gifts";
import { estimateBasketCost, formatUsdc } from "@/lib/money/cost";
import { preparePhoto, readPhoto, savePhoto, type PreparedPhoto } from "@/lib/gift-image";
import { GiftPack } from "./GiftPack";
import { GiftPackBuilder } from "./GiftPackBuilder";
import { GiftSend } from "./GiftSend";
import { LinkPending } from "./LinkPending";
import { GiftFooter, GiftHeader } from "./GiftShell";

const DRAFT_KEY = "thesis:gift-draft:v1";
const dollars = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** `live`: this deployment can send and open real gifts (see readiness() in server/gifts/providers.ts). */
export function GiftHome({ packs, unavailable, live = false }: { packs: Pack[]; unavailable: boolean; live?: boolean }) {
  const [selectedId, setSelectedId] = useState(packs[0]?.id ?? "");
  const [amount, setAmount] = useState("5");
  const [recipient, setRecipient] = useState("");
  const [sender, setSender] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<GiftDraft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [restored, setRestored] = useState(false);
  const [copied, setCopied] = useState(false);
  const reviewTitle = useRef<HTMLHeadingElement>(null);
  const formTitle = useRef<HTMLHeadingElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Packs built this session join the curated ones in the picker.
  const [built, setBuilt] = useState<Pack[]>([]);
  const [building, setBuilding] = useState(false);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  useEffect(() => setPhoto(readPhoto()), []);
  const allPacks = [...packs, ...built];
  const pack = allPacks.find((p) => p.id === selectedId) ?? packs[0];

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true); setPhotoError("");
    try { const next = await preparePhoto(file); setPhoto(next); savePhoto(next); }
    catch (e) { setPhotoError((e as Error).message); }
    finally { setPhotoBusy(false); if (photoInput.current) photoInput.current.value = ""; }
  }
  function removePhoto() { setPhoto(null); savePhoto(null); }
  const hero = packs[0];

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const result = giftDraftSchema.safeParse(JSON.parse(raw));
      if (!result.success || !packs.some((p) => p.id === result.data.packId && p.versionId === result.data.versionId)) return;
      const d = result.data;
      setSelectedId(d.packId); setAmount(String(d.amount)); setRecipient(d.recipient); setSender(d.sender); setMessage(d.message); setRestored(true);
    } catch { /* Private mode can disable browser storage; composing still works. */ }
  }, [packs]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  useEffect(() => { if (draft) reviewTitle.current?.focus(); }, [draft]);

  function select(p: Pack) {
    setSelectedId(p.id); setDraft(null); setError(""); setCopied(false);
    document.getElementById("make-a-gift")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  function review(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pack) return;
    const result = giftDraftSchema.safeParse({ packId: pack.id, versionId: pack.versionId, amount: Number(amount), recipient, sender, message });
    if (!result.success) { setError(result.error.issues[0]?.message ?? "Check your gift details."); return; }
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(result.data)); } catch { /* Optional convenience only. */ }
    setError(""); setNotice(""); setDraft(result.data); setCopied(false);
  }

  function reset() {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* Optional browser storage. */ }
    setDraft(null); setRecipient(""); setSender(""); setMessage(""); setAmount("25"); setRestored(false); setError(""); setNotice("");
  }

  async function copyPreview() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${giftPreviewPath(draft)}`);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 3000);
    } catch { setNotice("Copy isn't available in this browser. Open the preview and copy its address instead."); }
  }

  return <div className="gift-site">
    <a className="gift-skip" href="#main">Skip to content</a>
    <GiftHeader />
    <main id="main">
      <section className="gift-hero">
        <div className="gift-hero-copy">
          <p className="gift-eyebrow"><span /> THE COOLEST GIFT ON THE INTERNET</p>
          <h1>Give a friend<br />a pack of<br /><em>stocks.</em></h1>
          <p className="gift-hero-description">Pick a few companies they believe in, add a note, and send it to their X handle.<br className="gift-desktop-break" /> They rip it open like a card pack.</p>
          <div className="gift-hero-actions"><a href="#packs" className="gift-button">Pick a pack <ArrowRight size={18} /></a><a href="#how-it-works" className="gift-text-link">How it works <ArrowDown size={15} /></a></div>
          <p className={`gift-preview-label${live ? " gift-preview-label--live" : ""}`}><span className="gift-preview-dot" /> {live ? "From $1 · Tokenized stocks that track the real share price · No crypto wallet needed" : "Preview · Sending opens soon"}</p>
        </div>
        <div className="gift-hero-stage" aria-label="Themed stock gift packs">
          <div className="gift-orbit-label">A BIG IDEA.<br />A SMALL BEGINNING.</div>
          {hero ? <>
            {packs[1] && <div className="gift-stage-back"><GiftPack pack={packs[1]} /></div>}
            <div className="gift-stage-main"><GiftPack pack={hero} /></div>
            <div className="gift-sticker"><Heart size={17} fill="currentColor" /><span>Picked for you.<br /><strong>Held by you.</strong></span></div>
          </> : <div className="gift-catalogue-empty"><Gift size={40} /><p>{unavailable ? "The pack collection is taking a moment to load." : "The first collection is being prepared."}</p><button className="gift-text-link" onClick={() => window.location.reload()}>Refresh collection</button></div>}
        </div>
      </section>

      <div className="gift-strip"><span><Gift size={17} /> From $1</span><span><span className="gift-x-mark">𝕏</span> Sent to their X handle</span><span>Opened like a card pack</span></div>

      <section className="gift-collection" id="packs" aria-labelledby="packs-title">
        <div className="gift-section-head"><div><p className="gift-eyebrow">THE PACKS</p><h2 id="packs-title">Pick a pack.</h2></div><p>Each pack is a few companies with one idea behind them.<br /> Here’s how each has done so far.</p></div>
        {packs.length > 0 ? <div className="gift-pack-grid">{packs.map((p) => <article className={`gift-choice gift-choice--${p.color}`} key={p.id}>
          <button className="gift-choice-art gift-choice-art--perf" onClick={() => select(p)} aria-label={`Choose ${p.name}`}><PackPerformance pack={p} /><div className="gift-choice-mini" aria-hidden="true"><GiftPack pack={p} /></div><span className="gift-choice-arrow"><ArrowRight size={20} /></span></button>
          <div className="gift-choice-info"><h3>{p.name}</h3><p>{p.forWhom}</p><div className="gift-logo-row">{p.holdings.map((h, i) => <TokenLogo key={h.symbol} symbol={h.symbol} company={h.company} tone={i} size={25} />)}<span>{p.holdings.map((h) => h.symbol.replace(/x$/, "")).join(" · ")}</span></div>{p.preIpo && <p className="gift-preipo"><b>Pre-IPO</b> Private companies through PreStocks&rsquo; tokens: no public share price, and the issuer can freeze or buy back holdings.</p>}<button className="gift-text-link" onClick={() => select(p)}>Make this gift <ArrowRight size={15} /></button></div>
        </article>)}</div> : <p className="gift-empty">No reviewed packs are available right now. <Link href="/discover">Explore Thesis</Link></p>}
        {packs.some((x) => x.history || x.performance) && <p className="gift-perf-note">{(() => { const hist = packs.find((x) => x.history && !x.history.label)?.history; return hist ? <>12-month returns: each pack&rsquo;s current holdings at its current weights, held from {new Date(hist.from).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} to {new Date(hist.asOf).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}, from daily closing prices, before fees. The S&amp;P 500 returned {(Math.round(hist.benchmarkPct * 10) / 10).toFixed(1)}% over the same days. </> : null; })()}{packs.some((x) => x.history?.label) && <>Pre-IPO packs: token prices on Solana exchanges since the tokens began trading, not share prices, which don&rsquo;t exist for private companies. </>}&ldquo;Live&rdquo; is each thesis&rsquo;s public record since its call opened. {packs.some((x) => x.attention) && <>&ldquo;Interest&rdquo; is human page views of each company&rsquo;s English Wikipedia article, the last 7 days against the 7 before; it measures attention, not returns. </>}Past performance isn&rsquo;t a promise; tokenized stocks can lose value.</p>}
      </section>

      {pack && <section id="make-a-gift" className="gift-compose" aria-labelledby="compose-title">
        <div className="gift-compose-visual">
          <p className="gift-eyebrow">A LITTLE SOMETHING, JUST FOR THEM</p>
          <div className="gift-compose-pack"><GiftPack pack={pack} image={photo?.dataUrl} /></div>
          <div className="gift-note-preview"><span>To {recipient ? `@${recipient.replace(/^@/, "")}` : "someone you believe in"}</span><p>{message || "Here’s to the future you keep talking about."}</p><span>With belief, {sender || "you"}</span></div>
          <PackInside pack={pack} amount={Number(amount)} />
        </div>
        <div className="gift-compose-form">
          <div className="gift-step"><span>01 THE PACK</span><span className={!draft ? "active" : ""}>02 MAKE IT PERSONAL</span><span className={draft ? "active" : ""}>03 PREVIEW</span></div>
          {!draft ? <>
            <h2 id="compose-title" ref={formTitle} tabIndex={-1}>Who&rsquo;s it for?</h2>
            <p className="gift-form-intro">Add their X handle and a note. You&rsquo;ll see what they see before you pay.</p>
            {restored && <p className="gift-restored">Your preview draft is restored. <button type="button" onClick={reset}>Start fresh</button></p>}
            <form onSubmit={review}>
              <fieldset className="gift-field gift-pick"><legend>The pack</legend><div className="gift-pick-grid">{allPacks.map((p) => <label key={p.id} className={`gift-pick-option gift-pack--${p.color}`}><input type="radio" name="gift-pack" value={p.id} checked={pack.id === p.id} onChange={() => setSelectedId(p.id)} /><span className="gift-pick-swatch" aria-hidden="true" /><span className="gift-pick-name">{p.name}</span></label>)}<button type="button" className="gift-pick-option gift-pick-build" aria-expanded={building} onClick={() => setBuilding((b) => !b)}><span className="gift-pick-plus" aria-hidden="true">+</span><span className="gift-pick-name">Build your own</span></button></div></fieldset>
              {building && <GiftPackBuilder onBuilt={(p) => { setBuilt((b) => [...b.filter((x) => x.id !== p.id), p]); setSelectedId(p.id); setBuilding(false); }} onClose={() => setBuilding(false)} />}
              <div className="gift-art-row">
                <span className="gift-art-label">Pack art</span>
                <span className="gift-art-thumb" aria-hidden="true">{photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local data URL
                  <img src={photo.dataUrl} alt="" />
                ) : <span className={`gift-pick-swatch gift-pack--${pack.color}`} />}</span>
                <span className="gift-art-desc">{photo ? "Your photo, in the middle of the pack." : "The pack’s own art. Or put a photo in the middle."}</span>
                <input ref={photoInput} type="file" accept="image/*" className="gift-sr-only" aria-label="Choose a photo for the pack" onChange={(e) => void choosePhoto(e.target.files?.[0])} />
                <button type="button" className="gift-text-link" onClick={() => photoInput.current?.click()} disabled={photoBusy}>{photoBusy ? "Preparing…" : photo ? "Change" : "Use a photo"}</button>
                {photo && <button type="button" className="gift-text-link" onClick={removePhoto}>Remove</button>}
              </div>
              {photoError && <p className="gift-error" role="alert">{photoError}</p>}
              <fieldset className="gift-amounts"><legend>Gift budget <span>in USDC · from ${GIFT_MIN_USD}</span></legend><div>{[1, 5, 10, 25].map((value) => <button type="button" key={value} aria-pressed={Number(amount) === value} onClick={() => setAmount(String(value))}>${value}</button>)}<label className="gift-custom-amount"><span className="gift-sr-only">Custom gift budget in dollars</span><span>$</span><input aria-label="Custom gift budget in dollars" type="text" inputMode="numeric" pattern="[0-9]*" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, "").slice(0, String(GIFT_MAX_USD).length))} required /></label></div></fieldset><FeeNote amount={Number(amount)} legs={pack.holdings.length} />
              <div className="gift-fields-two"><label className="gift-field">Their X handle<div className="gift-handle-input"><span>@</span><input aria-label="Their X handle" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="theirhandle" value={recipient.replace(/^@/, "")} onChange={(e) => setRecipient(e.target.value.replace(/^@/, ""))} maxLength={15} pattern="[A-Za-z0-9_]{1,15}" required aria-describedby="gift-recipient-help" /></div></label><label className="gift-field">Your name<input placeholder="First name" value={sender} onChange={(e) => setSender(e.target.value)} maxLength={40} autoComplete="given-name" required /></label></div>
              <p id="gift-recipient-help" className="gift-field-help">We’ll use this handle for the preview. It isn’t verified yet.</p>
              <label className="gift-field gift-message">A personal note <span>Optional</span><textarea placeholder="Saw this and thought of you…" rows={3} maxLength={240} value={message} onChange={(e) => setMessage(e.target.value)} /><small>{message.length}/240</small></label>
              {error && <p className="gift-error" role="alert">{error}</p>}
              <button className="gift-button gift-button--wide" type="submit">Preview your gift <ArrowRight size={17} /></button>
              <p className="gift-field-help gift-form-foot">Preview only. No payment, stock purchase, or X message is sent.</p>
            </form>
          </> : <>
            <h2 id="compose-title" ref={reviewTitle} tabIndex={-1}>Made for<br />@{draft.recipient}.</h2><p className="gift-form-intro">A personal note. A future to believe in. Here’s exactly what this gift would contain.</p>
            <div className="gift-review-heading"><span>{pack.name}</span><strong>${draft.amount}<small>gift budget</small></strong></div>
            <ul className="gift-allocation">{pack.holdings.map((h, i) => <li key={h.symbol}><TokenLogo symbol={h.symbol} company={h.company} tone={i} size={34} /><div><strong>{h.company}</strong><span>{h.symbol} · {h.weightBps / 100}%</span></div><b>{dollars(allocateGiftCents(draft.amount, pack.holdings.map((v) => v.weightBps))[i])}</b></li>)}</ul>
            <p className="gift-field-help">Illustrative budget split before fees, not a quote or funded balance. Market prices can change.</p>
            {/* Where sending is live, sending leads and the preview is the second look. */}
            <GiftSend draft={draft} pack={pack} />
            <Link className={`gift-button gift-button--wide${live ? " gift-button--outline" : ""}`} href={giftPreviewPath(draft)}><LinkPending pendingText="Opening the preview…">Open recipient preview</LinkPending></Link>
            <div className="gift-review-actions"><button className="gift-text-link" onClick={() => { setDraft(null); requestAnimationFrame(() => formTitle.current?.focus()); }}><RotateCcw size={14} /> Edit gift</button><button className="gift-text-link" onClick={() => void copyPreview()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Preview link copied" : "Copy preview link"}</button></div>
            <p className="gift-field-help">The preview link shares an unfunded preview, including your note. It cannot be used to claim anything.</p>
            {notice && <p role="status" className="gift-field-help">{notice}</p>}
          </>}
        </div>
      </section>}

      <section className="gift-how" id="how-it-works"><div className="gift-section-head"><div><p className="gift-eyebrow">HOW IT WORKS</p><h2>Three steps. About a minute.</h2></div><span className="gift-pill">{live ? "Live on Solana" : "Preview edition"}</span></div><ol><li><HowVisual step={1} packs={packs} /><span>01</span><h3>Pick a pack.</h3><p>A few companies with one idea behind them.</p></li><li><HowVisual step={2} packs={packs} /><span>02</span><h3>Add their @ and a note.</h3><p>Any amount from $1.</p></li><li><HowVisual step={3} packs={packs} /><span>03</span><h3>They open it.</h3><p>They sign in with X and rip it open. No crypto wallet needed.</p></li></ol></section>
      <section className="gift-questions"><h2>A few things worth knowing.</h2><div>
        <details><summary>Are these real stocks?</summary><p>They&rsquo;re tokenized stocks: tokens issued by xStocks that follow the real share price of companies like Nvidia, Apple and Amazon. They go up and down with the stock. They aren&rsquo;t the shares themselves — no voting rights — and they can lose value.</p></details>
        <details><summary>Is there a random prize inside?</summary><p>No. Each pack has a disclosed allocation. The reveal is a presentation of the gift, not a gamble on its value. Stock prices can rise or fall.</p></details>
        <details><summary>Can I send or claim a real gift today?</summary><p>{live ? <>Yes. Pick a pack, make it personal, confirm who it&rsquo;s for, and send USDC from your own Solana wallet. They open it by signing in with that X account. Gifts run from $10 to $1,000.</> : <>Once X account lookup is connected, yes: pick a pack, make it personal, confirm who it&rsquo;s for, and send it from your own wallet. Until then you can share an unfunded preview.</>}</p></details>
        <details><summary>Will they need a crypto wallet?</summary><p>No browser extension. They sign in with X and the wallet is already there, made for their X account. They can add an email or passkey so losing X never locks them out, and export the wallet to take it anywhere.</p></details>
        <details><summary>What happens if they can’t claim it?</summary><p>It stays theirs. A gift arrives as USDC in their own wallet and can’t be recalled. If they never open the pack, they keep the USDC. That’s why you confirm exactly who you’re sending to first.</p></details>
      </div></section>
      <PoweredBy />
    </main><GiftFooter />
  </div>;
}

/**
 * One small picture per step of "How it works", so the section can be understood without reading it:
 * packs to choose from, a note being written, a pack coming open. Drawn from the real packs and their
 * real holdings. The loops are slow and decorative, and stop under reduced motion.
 */
function HowVisual({ step, packs }: { step: 1 | 2 | 3; packs: Pack[] }) {
  const [first] = packs;
  if (!first) return null;
  if (step === 1) {
    return <div className="how-v how-v--packs" aria-hidden="true">{packs.slice(0, 3).map((p, i) => <div className={`how-mini how-mini--${i}`} key={p.id}><GiftPack pack={p} /></div>)}</div>;
  }
  if (step === 2) {
    return <div className="how-v how-v--note" aria-hidden="true"><div className="how-note"><span className="how-note-to">To @kayle_build</span><p>Saw this and thought of you<span className="how-caret" /></p><span className="how-note-chip">{first.name} · $25</span></div></div>;
  }
  return <div className="how-v how-v--open" aria-hidden="true">
    <div className="how-rise">{first.holdings.map((h, i) => <span key={h.symbol} style={{ "--i": i } as React.CSSProperties}><TokenLogo symbol={h.symbol} company={h.company} tone={i} size={30} /></span>)}</div>
    <div className="how-mini how-mini--open"><GiftPack pack={first} /><span className={`how-strip gift-pack--${first.color}`} /></div>
  </div>;
}

/**
 * What a small gift loses to swap fees, said in dollars while the amount is being chosen. Each
 * holding carries a flat ~$0.16 (src/lib/money/cost.ts), so the share climbs fast below $10. Only the
 * sender sees this; the recipient still sees no amount before opening.
 */
function FeeNote({ amount, legs }: { amount: number; legs: number }) {
  if (!Number.isInteger(amount) || amount < GIFT_MIN_USD || amount > GIFT_MAX_USD) return null;
  const { estimatedCostRaw, estimatedCostBps } = estimateBasketCost(BigInt(amount) * 1_000_000n, legs);
  if (estimatedCostBps < 600) return null;
  return <p className="gift-fee-note" role="status">About {formatUsdc(estimatedCostRaw)} of a ${amount} gift goes to swap fees (~{Math.round(estimatedCostBps / 100)}%). Fine for trying it out; larger gifts lose much less.</p>;
}

/** A pack leads with how its thesis is doing: the call's return since it opened, against the S&P 500. */
function PackPerformance({ pack }: { pack: Pack }) {
  const h = pack.history;
  const live = pack.performance;
  // Rounded before the sign is chosen, so a move too small to show reads 0.0%, never "−0.0%".
  const pct = (n: number) => {
    const r = Math.round(n * 10) / 10;
    return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)}%`;
  };
  const tone = (n: number) => (Math.round(n * 10) > 0 ? "gift-perf-up" : Math.round(n * 10) < 0 ? "gift-perf-down" : "");
  if (!h && !live) return <div className="gift-perf gift-perf--new"><span className="gift-perf-label">NEW THESIS</span><strong>Tracking starts soon</strong></div>;
  if (!h && live) {
    const since = new Date(live.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
    return <div className="gift-perf"><span className="gift-perf-label">SINCE {since}</span><strong className={tone(live.basketPct)}>{pct(live.basketPct)}</strong><PackAttention pack={pack} /><Spark points={live.points} /></div>;
  }
  const since = live ? new Date(live.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;
  return (
    <div className="gift-perf">
      <span className="gift-perf-label">{(h!.label ?? "Past 12 months").toUpperCase()}</span>
      <strong className={tone(h!.returnPct)}>{pct(h!.returnPct)}</strong>
      {live && since && <span className="gift-perf-bench">Live since {since}: {pct(live.basketPct)}</span>}
      <PackAttention pack={pack} />
      <Spark points={h!.points} showBenchmark={false} />
    </div>
  );
}

/**
 * Interest, not returns: how many more (or fewer) people read about these companies on Wikipedia
 * this week than last. Said about the companies, because that is what it measures.
 */
function PackAttention({ pack }: { pack: Pack }) {
  const a = pack.attention;
  if (!a) return null;
  const r = Math.round(a.changePct);
  const k = a.weekViews >= 1_000_000 ? `${(a.weekViews / 1_000_000).toFixed(1)}M` : `${Math.round(a.weekViews / 1000)}k`;
  return (
    <p className={`gift-attn${r > 0 ? " gift-attn--up" : r < 0 ? " gift-attn--down" : ""}`}>
      <span className="gift-attn-dot" aria-hidden="true" />
      <span>{r === 0 ? "Interest steady this week" : `Interest ${r > 0 ? "up" : "down"} ${Math.abs(r)}% this week`}</span>
      <small>{k} Wikipedia reads about these companies</small>
    </p>
  );
}

/** The basket against its benchmark, as two lines. Decorative: the numbers above say it in text. */
function Spark({ points, showBenchmark = true }: { points: { basketPct: number; benchmarkPct: number }[]; showBenchmark?: boolean }) {
  if (points.length < 2) return null;
  const all = points.flatMap((x) => (showBenchmark ? [x.basketPct, x.benchmarkPct] : [x.basketPct]));
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 0);
  const span = max - min || 1;
  const line = (key: "basketPct" | "benchmarkPct") =>
    points.map((x, i) => `${((i / (points.length - 1)) * 100).toFixed(2)},${(36 - ((x[key] - min) / span) * 32).toFixed(2)}`).join(" ");
  return (
    <svg className="gift-spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      {showBenchmark && <polyline className="gift-spark-bench" points={line("benchmarkPct")} />}
      <polyline className="gift-spark-basket" points={line("basketPct")} />
    </svg>
  );
}

/**
 * The infrastructure a gift actually runs on — only what this code uses. Meteora and Pyth are not
 * here on purpose: the thesis-token feature that used Meteora was removed, and Pyth was rejected.
 */
const POWERED_BY = [
  { name: "Solana", logo: "/brands/solana.webp", href: "https://solana.com" },
  { name: "xStocks", logo: "/brands/xstocks.svg", href: "https://xstocks.fi" },
  { name: "Jupiter", logo: "/brands/jupiter.webp", href: "https://jup.ag" },
  { name: "Privy", logo: "/brands/privy.png", href: "https://privy.io" },
  { name: "Phantom", logo: "/brands/phantom.svg", href: "https://phantom.com" },
  { name: "Helius", logo: "/brands/helius.svg", href: "https://helius.dev" },
  { name: "PreStocks", logo: "/brands/prestocks.svg", href: "https://prestocks.com" },
];

function PoweredBy() {
  // Rendered twice so the strip can slide forever without a seam; the copy is hidden from readers.
  const row = (copy: boolean) => (
    <ul className="gift-powered-row" aria-hidden={copy || undefined}>
      {/* Six sets per half: each half is wider than any screen, so the loop never shows a gap. */}
      {[0, 1, 2, 3, 4, 5].flatMap((k) => POWERED_BY.map((x) => ({ ...x, k }))).map((x) => (
        <li key={`${x.name}-${x.k}`}>
          <a href={x.href} target="_blank" rel="noopener noreferrer" tabIndex={copy || x.k > 0 ? -1 : undefined} aria-hidden={copy || x.k > 0 ? true : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static marks, already sized */}
            <img src={x.logo} alt={copy || x.k > 0 ? "" : x.name} width={52} height={52} />
          </a>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="gift-powered" aria-labelledby="powered-title">
      <p className="gift-eyebrow" id="powered-title">POWERED BY</p>
      <div className="gift-powered-track">{row(false)}{row(true)}</div>
    </section>
  );
}

/** What the sender is choosing, next to the card: each holding, its share, and what it gets of the budget. */
function PackInside({ pack, amount }: { pack: Pack; amount: number }) {
  const valid = Number.isInteger(amount) && amount >= GIFT_MIN_USD && amount <= GIFT_MAX_USD;
  const cents = valid ? allocateGiftCents(amount, pack.holdings.map((h) => h.weightBps)) : null;
  return (
    <div className="gift-compose-inside">
      <p className="gift-eyebrow">INSIDE THIS PACK</p>
      <ul>
        {pack.holdings.map((h, i) => (
          <li key={h.symbol}>
            <TokenLogo symbol={h.symbol} company={h.company} tone={i} size={26} />
            <span><strong>{h.company}</strong><small>{h.symbol.replace(/x$/, "")} · {h.weightBps / 100}%</small></span>
            {cents && <b>{(cents[i] / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</b>}
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { Check, Minus, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SignIn } from "@/components/buy/SignIn";
import { useWallet } from "@/components/buy/useWallet";
import { TokenLogo } from "@/components/calls/TokenLogo";
import type { GiftPack as Pack } from "@/lib/gifts";
import { weightBoundsBps } from "@/lib/money/allocate";
import { CATEGORIES } from "@/lib/thesis-draft";

/**
 * Build your own pack.
 *
 * One to three stock tokens, how much of each, and the belief behind them — which is a thesis, so it is
 * published as one, under the builder's wallet, exactly as /app/create would publish it. The form
 * asks for one line of belief; the case for, the case against and the per-holding detail are drafted
 * from it (src/server/content/expand.ts, draftCase), because two paragraphs is too much to ask of
 * somebody choosing a present. Nothing is bought here: the pack is only chosen.
 */

type Asset = { symbol: string; company: string };
type Color = Pack["color"];

/** A sensible starting split for however many holdings are picked; the builder adjusts from there. */
const DEFAULT_WEIGHTS: Record<number, number[]> = { 1: [100], 2: [50, 50], 3: [40, 35, 25] };
const STEP = 5;
const COLORS: Color[] = ["blue", "green", "red", "gold"];
const LIMITS = { claim: [12, 70] } as const;

export function GiftPackBuilder({ onBuilt, onClose }: { onBuilt: (pack: Pack) => void; onClose: () => void }) {
  const w = useWallet();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [weights, setWeights] = useState<number[]>([]);
  // Picking or dropping a holding resets the split to the default for the new count.
  useEffect(() => setWeights(DEFAULT_WEIGHTS[picked.length] ?? []), [picked.length]);
  const bounds = weightBoundsBps(Math.max(1, picked.length));
  const MIN_W = bounds.min / 100;
  const MAX_W = bounds.max / 100;
  const [claim, setClaim] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Technology");
  const [color, setColor] = useState<Color>("blue");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/gifts/assets")
      .then((r) => r.json())
      .then((b: { assets?: Asset[] }) => setAssets(b.assets ?? []))
      .catch(() => setError("The list of stocks couldn't load. Try again in a moment."));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? assets.filter((a) => a.symbol.toLowerCase().includes(q) || a.company.toLowerCase().includes(q)) : assets;
  }, [assets, query]);

  const total = weights.reduce((s, x) => s + x, 0);
  const lengthOk = (v: string, [min, max]: readonly [number, number]) => v.trim().length >= min && v.trim().length <= max;
  const ready = picked.length >= 1 && weights.length === picked.length && total === 100 && lengthOk(claim, LIMITS.claim);

  function toggle(symbol: string) {
    setPicked((p) => (p.includes(symbol) ? p.filter((s) => s !== symbol) : p.length < 3 ? [...p, symbol] : p));
  }

  function nudge(i: number, delta: number) {
    setWeights((ws) => ws.map((x, j) => (j === i ? Math.min(MAX_W, Math.max(MIN_W, x + delta)) : x)));
  }

  async function publish() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/gifts/packs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: (name || claim).trim(),
          color,
          thesis: { claim, category, holdings: picked.map((symbol, i) => ({ symbol, weightPercent: weights[i] })) },
        }),
      });
      const body = (await res.json().catch(() => null)) as { status?: string; pack?: Pack; error?: { message?: string } } | null;
      if (!res.ok) throw new Error(body?.error?.message ?? "The pack couldn't be published. Try again.");
      if (body?.status === "created" && body.pack) onBuilt(body.pack);
      else if (body?.status === "unavailable") setError("Building packs isn't switched on here yet. Pick one of the packs above for now.");
      else if (body?.status === "rate_limited") setError("You've built a few packs in the last hour. Wait a little, then try again.");
      else if (body?.status === "not_giftable") setError("Your thesis is published, but one of its holdings can't be bought right now, so it can't be a gift yet.");
      else throw new Error("The pack couldn't be published. Try again.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const counter = (v: string, [min, max]: readonly [number, number]) => {
    const n = v.trim().length;
    return n < min ? `${min - n} more characters` : n > max ? `${n - max} too many` : <><Check size={12} aria-hidden="true" /> Good</>;
  };

  return (
    <section className="gift-builder" aria-labelledby="gift-builder-title">
      <div className="gift-builder-head">
        <h3 id="gift-builder-title">Build your own pack</h3>
        <button type="button" className="gift-builder-close" onClick={onClose} aria-label="Close the pack builder"><X size={18} /></button>
      </div>

      <fieldset className="gift-builder-step">
        <legend>1 · Pick one to three stocks <span>{picked.length}/3</span></legend>
        <label className="gift-builder-search"><Search size={15} aria-hidden="true" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Apple, TSLA…" aria-label="Search stock tokens" /></label>
        <div className="gift-builder-assets" role="group" aria-label="Stocks">
          {shown.map((a, i) => {
            const on = picked.includes(a.symbol);
            return (
              <button type="button" key={a.symbol} className="gift-builder-asset" aria-pressed={on} disabled={!on && picked.length >= 3} onClick={() => toggle(a.symbol)}>
                <TokenLogo symbol={a.symbol} company={a.company} tone={i % 3} size={24} />
                <span><strong>{a.symbol}</strong><small>{a.company}</small></span>
                {on && <Check size={14} aria-hidden="true" className="gift-builder-tick" />}
              </button>
            );
          })}
        </div>
      </fieldset>

      {picked.length === 1 && (
        <fieldset className="gift-builder-step">
          <legend>2 · How much of each <span>100%</span></legend>
          <p className="gift-builder-one">One holding is the whole pack: all of the gift goes into {picked[0]}.</p>
        </fieldset>
      )}
      {picked.length >= 2 && (
        <fieldset className="gift-builder-step">
          <legend>2 · How much of each <span className={total === 100 ? "" : "gift-builder-warn"}>{total}%</span></legend>
          <ul className="gift-builder-weights">
            {picked.map((symbol, i) => (
              <li key={symbol}>
                <span>{symbol}</span>
                <button type="button" onClick={() => nudge(i, -STEP)} disabled={weights[i] <= MIN_W} aria-label={`Less ${symbol}`}><Minus size={14} /></button>
                <strong aria-live="polite">{weights[i]}%</strong>
                <button type="button" onClick={() => nudge(i, STEP)} disabled={weights[i] >= MAX_W} aria-label={`More ${symbol}`}><Plus size={14} /></button>
              </li>
            ))}
          </ul>
          {total !== 100 && <p className="gift-builder-warn">Make them add up to 100%.</p>}
        </fieldset>
      )}

      <fieldset className="gift-builder-step">
        <legend>3 · The belief behind it</legend>
        <label className="gift-field">In one line, what do you believe?<input value={claim} onChange={(e) => setClaim(e.target.value)} maxLength={80} placeholder="Everyone will own a little of the AI buildout" /><span className="gift-builder-count">{counter(claim, LIMITS.claim)}</span></label>
        <div className="gift-fields-two">
          <label className="gift-field">Pack name <span>optional</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={70} placeholder={claim || "Defaults to your line"} /></label>
          <label className="gift-field">Category<select value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
        <p className="gift-builder-note">We&rsquo;ll write up why these, and the honest case against, from your line — every thesis on Thesis says both.</p>
        <div className="gift-builder-colors" role="radiogroup" aria-label="Pack colour">
          {COLORS.map((c) => <button type="button" key={c} role="radio" aria-checked={color === c} aria-label={c} className={`gift-builder-color gift-pack--${c}`} onClick={() => setColor(c)} />)}
        </div>
      </fieldset>

      <div className="gift-builder-foot">
        <p>This publishes your pack as a public thesis on Thesis, under your wallet. Nothing is bought.</p>
        {w.wallet ? (
          <button type="button" className="gift-button gift-button--wide" onClick={() => void publish()} disabled={!ready || busy}>{busy ? "Publishing… this takes a few seconds" : "Publish and use this pack"}</button>
        ) : (
          <SignIn wallet={w} variant="inline" />
        )}
        {error && <p className="gift-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}

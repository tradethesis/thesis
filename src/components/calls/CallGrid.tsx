"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Search, Bookmark } from "lucide-react";
import { ThesisArtwork } from "../landing/ThesisArtwork";
import { CallStatus } from "./CallStatus";
import { SourcePost } from "./SourcePost";
import type { ThesisCard } from "@/server/content/queries";
import type { CallRecord } from "@/lib/calls";

type Filter = "all" | "open" | "resolved" | "saved";
export function CallGrid({ theses, calls, featured = false }: { theses: ThesisCard[]; calls: CallRecord[]; featured?: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => {
    try { const value = JSON.parse(localStorage.getItem("thesis.saved.v1") ?? "[]"); if (Array.isArray(value)) setSaved(value.filter(v => typeof v === "string")); } catch {}
  }, []);
  const filtered = theses.filter(t => {
    const call = calls.find(c => c.versionId === t.versionId);
    const matches = filter === "all" || filter === "saved" && saved.includes(t.slug) ||
      filter === "open" && call?.status === "open" || filter === "resolved" && call && call.status !== "open";
    const haystack = [t.claim, t.summary, t.authorName, t.sourcePost?.author, t.sourcePost?.handle, t.sourcePost?.text, ...t.holdings.map(h => h.symbol), ...t.holdings.map(h => h.company)];
    return matches && haystack.filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase().trim());
  });
  return <>
    {!featured && <div className="cg-toolbar"><div className="cg-filters" role="group" aria-label="Filter calls">
      {([["all", "All calls"], ["open", "Open"], ["resolved", "Resolved"], ["saved", "Saved"]] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{id === "saved" && <Bookmark size={13} aria-hidden="true" />}{label}</button>)}
    </div><label className="cg-search"><Search size={16} aria-hidden="true" /><span className="ln-sr-only">Search ideas, authors, or tokens</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="An idea, an author, or a token…" /></label></div>}
    <p className="ln-sr-only" role="status">{filtered.length} {filtered.length === 1 ? "thesis" : "theses"} shown</p>
    {filtered.length ? <div className="cg-grid">{filtered.map(t => {
      const call = calls.find(c => c.versionId === t.versionId) ?? null;
      return <article className="cg-card" key={t.slug}>
        <div className="cg-art-wrap"><ThesisArtwork category={t.category} className="cg-art" /><span className="cg-category">{t.category}</span></div>
        <div className="cg-body">
          {t.sourcePost ? <SourcePost post={t.sourcePost} compact /> : null}
          <div className="cg-creator"><span className="cg-avatar" aria-hidden="true">{t.authorName.split(" ").map(s => s[0]).slice(0, 2).join("")}</span><div><span>{t.sourcePost ? "Our reading of it" : t.authorName}</span><small>{t.sourcePost ? `${t.authorName} · v${t.versionNumber}` : `${t.authorHandle ?? "Editorial creator"} · v${t.versionNumber}`}</small></div></div>
          <h2><Link href={`/t/${t.slug}`}>{t.claim}</Link></h2>
          <p className="cg-summary">{t.summary}</p>
          <p className="cg-prediction">{call ? `The call: beat ${call.benchmark} in ${call.durationDays} days.` : "Read the argument. Choose your exposure."}</p>
          <div className="cg-holdings" aria-label="Basket allocation">{t.holdings.map((h, i) => <div key={h.symbol}><span className={`ln-stock-initial ln-asset-tone-${i % 3}`} aria-hidden="true">{h.company[0]}</span><span><strong>{h.symbol}</strong><small>{h.role}</small></span><b>{h.weightBps / 100}%</b></div>)}</div>
          <CallStatus call={call} compact />
          <div className="cg-evidence"><span>{t.supportingCount} sources for · {t.againstCount} against</span><span title="Nobody's wallet position is attached to this thesis. Thesis holds none of it, and the author of the original post has not endorsed it.">No one&rsquo;s position</span></div>
          <div className="cg-actions"><Link href={`/buy/${t.slug}?version=${t.versionId}`} className="ln-btn ln-btn--ink">Buy basket <ArrowRight size={16} aria-hidden="true" /><span className="ln-sr-only">: {t.claim}</span></Link><Link href={`/t/${t.slug}`} className="ln-text-link">Read thesis<span className="ln-sr-only">: {t.claim}</span></Link></div>
        </div>
      </article>;
    })}</div> : <div className="cg-empty"><h2>{filter === "saved" ? "Keep a call on your radar." : filter === "resolved" ? "The first calls are still playing out." : "No calls match yet."}</h2><p>{filter === "saved" ? "Open a thesis and save it. Your saved calls stay in this browser." : "Browse all calls or try a different search."}</p><button type="button" className="ln-btn ln-btn--secondary" onClick={() => { setFilter("all"); setSearch(""); }}>See all calls</button></div>}
  </>;
}

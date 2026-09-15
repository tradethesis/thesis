"use client";
import { useState } from "react";
import { Share2 } from "lucide-react";

export function ShareThesis({ slug, title }: { slug: string; title: string }) {
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState<string | null>(null);
  async function share() {
    const url = new URL(`/t/${slug}`, window.location.origin).href;
    setFallback(null); setMessage("");
    if (navigator.share) {
      try { await navigator.share({ title: `${title} · Thesis`, text: title, url }); return; }
      catch (error) { if (error instanceof Error && error.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); setMessage("Link copied"); }
    catch { setFallback(url); setMessage("Copy this link to share the thesis."); }
  }
  return <div className="share-control">
    <button type="button" className="feed-action" onClick={share}><Share2 size={16} aria-hidden="true" />Share<span className="ln-sr-only">: {title}</span></button>
    <span className="share-status" role="status">{message}</span>
    {fallback && <input className="share-fallback" aria-label="Thesis link to copy" readOnly value={fallback} onFocus={e => e.target.select()} />}
  </div>;
}

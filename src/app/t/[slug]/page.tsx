import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BookOpen, CalendarDays } from "lucide-react";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { AllocationPreview } from "@/components/landing/AllocationPreview";
import { MobileBasketBar } from "@/components/landing/MobileBasketBar";
import { SaveThesis } from "@/components/landing/SaveThesis";
import { ThesisArtwork } from "@/components/landing/ThesisArtwork";
import { getPublishedThesis, getUpdates, getVersionHistory } from "@/server/content/detail";
import { bpsToPercentLabel } from "@/lib/money/allocate";
import "../../landing.css";
import "./thesis.css";

export const revalidate = 60;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getPublishedThesis((await params).slug);
  return t ? { title: t.claim + " · Thesis", description: t.summary } : { title: "Thesis not found" };
}

export default async function ThesisPage({ params }: Props) {
  const slug = (await params).slug;
  const t = await getPublishedThesis(slug);
  if (!t) notFound();
  const [versions, updates] = await Promise.all([getVersionHistory(slug), getUpdates(slug)]);
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const previewHoldings = t.holdings.map(h => ({
    symbol: h.symbol, company: h.company, underlying: h.underlying,
    role: h.role, weight: h.weightBps / 100, why: h.why, limitation: h.limitation,
  }));
  const weightRationale = t.holdings.find(h => h.weightRationale)?.weightRationale;
  return (
    <div className="landing">
      <a className="ln-skip" href="#main">Skip to content</a>
      <SiteHeader active="thesis" />
      <main className="ln-container td-main" id="main">
        <Link href="/explore" className="ln-text-link td-back"><ArrowLeft size={15} aria-hidden="true" /> All theses</Link>
        <div className="td-layout">
          <article className="td-research">
            <header className="td-heading">
              <div className="td-meta"><span>{t.category}</span><span>Version {t.versionNumber}</span></div>
              <h1>{/[.!?]$/.test(t.claim) ? t.claim : t.claim + "."}</h1>
              <p className="td-summary">{t.summary}</p>
              <div className="td-byline"><span>By {t.authorName}</span><span><CalendarDays size={14} aria-hidden="true" />{t.horizonLabel}</span><a href="#evidence"><BookOpen size={14} aria-hidden="true" />{t.evidence.length} sources</a><a href="#history">Version {t.versionNumber} history</a></div>
            </header>
            <div className="td-actions">
              <a href="#thesis-allocation" className="ln-btn ln-btn--secondary td-allocation-jump">Try this allocation ↓</a>
              <SaveThesis slug={t.slug} title={t.claim} />
            </div>
            <ThesisArtwork category={t.category} className="td-art" />
            <section className="td-section" aria-labelledby="argument-heading"><p className="ln-eyebrow">The argument</p><h2 id="argument-heading">Why this idea. Why these businesses.</h2><p>{t.rationale}</p></section>
            <section className="td-section" aria-labelledby="holdings-heading">
              <h2 id="holdings-heading">Inside the basket</h2>
              <ul className="td-holdings">
                {t.holdings.map((h, i) => <li key={h.symbol}>
                  <div className="td-holding-head"><span className={"ln-stock-initial ln-asset-tone-" + (i % 3)} aria-hidden="true">{h.company[0]}</span><div><h3>{h.company}</h3><span className="ln-meta">{h.symbol} · {h.role}</span></div><span className="td-weight">{bpsToPercentLabel(h.weightBps)}</span></div>
                  <p className="td-why">{h.why}</p>
                  <p className="td-limitation"><strong>The tradeoff.</strong> {h.limitation}</p>
                  <details className="td-issuer"><summary>About this tokenized stock</summary><p>Underlying: {h.underlying}. Issuer: {h.issuer}. {h.issuerPowers}</p>{h.termsUrl && /^https?:\/\//.test(h.termsUrl) && <a href={h.termsUrl} target="_blank" rel="noopener noreferrer">Issuer terms <span className="ln-sr-only">(opens in a new tab)</span><ArrowUpRight size={13} aria-hidden="true" /></a>}</details>
                </li>)}
              </ul>
              {weightRationale && <p className="td-weight-rationale"><strong>Why these weights.</strong> {weightRationale}</p>}
            </section>
            <section className="td-counterargument" aria-labelledby="counter-heading"><span className="td-counter-icon" aria-hidden="true">↔</span><div><h2 id="counter-heading">The strongest case against</h2><p>{t.counterargument}</p></div></section>
            <section className="td-section" aria-labelledby="review-heading"><h2 id="review-heading">What would change the thesis?</h2><p>{t.changeMyMind}</p>{t.reviewDate && <p className="ln-meta">Next review: <time dateTime={t.reviewDate}>{new Date(t.reviewDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>. A review date does not trigger a sale.</p>}</section>
            <section className="td-section" id="evidence" aria-labelledby="evidence-heading"><h2 id="evidence-heading">Read the evidence. Make up your mind.</h2><p>Sources supporting the idea, including the ones that challenge it.</p>
              <ol className="td-sources">{t.evidence.map((e, i) => <li key={e.url}><span className="td-source-number" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><div><div className="td-source-meta"><span>{e.supportsCounterargument ? "Counterargument" : "Supporting evidence"}</span>{e.publishedAt && <time dateTime={e.publishedAt}>{e.publishedAt}</time>}</div><a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}<ArrowUpRight size={15} aria-hidden="true" /><span className="ln-sr-only"> (opens in a new tab)</span></a><p className="td-source-publisher">{e.source}</p><p>{e.relevance}</p></div></li>)}</ol>
              {t.evidence.length === 0 && <p className="td-availability">Sources are not available for this published version yet.</p>}
            </section>
            <section className="td-section" id="history" aria-labelledby="history-heading">
              <h2 id="history-heading">Updates and version history</h2>
              <p>
                An update appends dated evidence to this argument. A new version changes the argument or the
                allocation itself. Neither one touches a position you already hold.
              </p>

              {updates.length > 0 ? (
                <ol className="td-updates">
                  {updates.map((u) => (
                    <li key={`${u.authoredAt.toISOString()}-${u.title}`}>
                      <div className="td-source-meta">
                        <span>{u.kind === "correction" ? "Correction" : u.kind === "new_version" ? "New version" : "New evidence"}</span>
                        <time dateTime={u.authoredAt.toISOString()}>{fmtDate(u.authoredAt)}</time>
                      </div>
                      <h3>{u.title}</h3>
                      <p>{u.body}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="td-availability">
                  No updates since publication. When the author adds one, it appears here with its date and its
                  sources — it never changes what is written above.
                </p>
              )}

              <ol className="td-versions">
                {versions.map((v) => (
                  <li key={v.versionNumber} className={v.isCurrent ? "td-version td-version--current" : "td-version"}>
                    <span className="td-version-n">Version {v.versionNumber}</span>
                    <span className="td-version-meta">
                      {v.publishedAt ? fmtDate(v.publishedAt) : "unpublished"} · {v.evidenceCount}{" "}
                      {v.evidenceCount === 1 ? "source" : "sources"}
                    </span>
                    <code className="td-version-hash" title="Content fingerprint">{v.contentHash}</code>
                    {v.isCurrent && <span className="td-version-badge">Current</span>}
                  </li>
                ))}
              </ol>
              <p className="ln-meta">
                Every version above is kept. A published version cannot be edited, so the one you bought stays
                readable exactly as it was.
              </p>
            </section>
            <div className="td-disclosure"><p>{t.authorDisclosure}</p><p>Tracking begins at publication. This thesis has no established performance history. Tokenized stocks carry issuer and market risk.</p></div>
          </article>
          <aside className="td-sidebar" id="thesis-allocation" aria-label="Basket allocation preview">
            <div className="td-basket"><div className="td-basket-head"><span className="ln-eyebrow">Make it yours</span><h2>Your take on the thesis.</h2><p>Adjust the weights to reflect your conviction.</p></div><AllocationPreview holdings={previewHoldings} version={t.versionNumber} /><div className="td-availability"><strong>Buying opens soon.</strong><p>You can explore this allocation now. This preview does not connect to a wallet or place orders.</p></div></div>
            <p className="td-sidebar-note">You choose the allocation. A new author version never changes your holdings automatically.</p>
          </aside>
        </div>
      </main>
      <SiteFooter />
      <MobileBasketBar />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { BuyFlow } from "@/components/buy/BuyFlow";
import { getPublishedThesis } from "@/server/content/detail";
import { parseWeightQuery } from "@/lib/buy-input";
import { getCalls } from "@/server/calls/service";
import "../../landing.css";
import "./buy.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await getPublishedThesis((await params).slug);
  return { title: t ? `Buy · ${t.claim}` : "Thesis", robots: { index: false } };
}

export default async function BuyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ weights?: string; version?: string }> }) {
  const slug = (await params).slug;
  const t = await getPublishedThesis(slug);
  if (!t) notFound();
  const query = await searchParams;
  const changedVersion = Boolean(query.version && query.version !== t.versionId);
  const initialWeights = changedVersion ? null : parseWeightQuery(query.weights, t.holdings.map(h => h.symbol));
  const calls = await getCalls();
  const call = calls.find(c => c.versionId === t.versionId);

  return (
    <div className="landing">
      <a className="ln-skip" href="#main">Skip to content</a>
      <SiteHeader />
      <main className="ln-container by-main" id="main">
        <Link href={`/t/${slug}`} className="by-back">
          <ArrowLeft size={14} aria-hidden="true" /> Back to the thesis
        </Link>
        <BuyFlow
          key={t.versionId}
          slug={slug}
          versionId={t.versionId}
          initialWeights={initialWeights ?? undefined}
          callStatement={call?.statement}
          initialNotice={changedVersion ? "This thesis has a new version. Review the current holdings and weights below." : query.weights && !initialWeights ? "That allocation link was invalid. The creator’s weights are shown below." : undefined}
          claim={t.claim}
          holdings={t.holdings.map((h) => ({
            symbol: h.symbol,
            company: h.company,
            role: h.role,
            weightBps: h.weightBps,
          }))}
        />
      </main>
      <SiteFooter />
    </div>
  );
}

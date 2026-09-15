import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { BuyFlow } from "@/components/buy/BuyFlow";
import { getPublishedThesis } from "@/server/content/detail";
import "../../landing.css";
import "./buy.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await getPublishedThesis((await params).slug);
  return { title: t ? `Buy · ${t.claim}` : "Thesis", robots: { index: false } };
}

export default async function BuyPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const t = await getPublishedThesis(slug);
  if (!t) notFound();

  return (
    <div className="landing">
      <a className="ln-skip" href="#main">Skip to content</a>
      <SiteHeader />
      <main className="ln-container by-main" id="main">
        <Link href={`/t/${slug}`} className="by-back">
          <ArrowLeft size={14} aria-hidden="true" /> Back to the thesis
        </Link>
        <BuyFlow
          slug={slug}
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

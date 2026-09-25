import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { GiftPack as Pack } from "@/lib/gifts";

/**
 * After the pack is open: where Thesis comes in.
 *
 * The recipient has just met three companies through a friend. The natural next question is "why
 * these three?", and the answer is the thesis the pack was built from — so that is the first thing
 * offered, framed as the story behind the gift rather than as a product pitch. The case against sits
 * next to it, as it does everywhere on Thesis. Passing a pack on comes second, and quietly.
 */
export function GiftNext({ pack, from }: { pack: Pack; from: string }) {
  return (
    <section className="gift-next" aria-labelledby="gift-next-title">
      <div className="gift-next-card">
        <p className="gift-eyebrow">WHY THESE</p>
        <h2 id="gift-next-title">{pack.claim}</h2>
        <p className="gift-next-lede">
          {from} didn&rsquo;t pick these at random. Every Thesis pack starts as a thesis: a claim about where the world is
          going, what gets paid if it&rsquo;s right, and the honest case against it.
        </p>
        <div className="gift-next-against">
          <p className="gift-eyebrow">THE OTHER SIDE</p>
          <p>{pack.counterargument}</p>
        </div>
        <div className="gift-next-actions">
          <Link href={`/t/${pack.thesisSlug}`} className="gift-button">
            Read the full thesis <ArrowRight size={17} />
          </Link>
          <Link href="/discover" className="gift-text-link">
            Explore other theses <ArrowRight size={14} />
          </Link>
        </div>
      </div>
      <div className="gift-next-pass">
        <p className="gift-eyebrow">PASS IT ON</p>
        <h3>Know someone who&rsquo;d open one of these?</h3>
        <Link href="/#packs" className="gift-button gift-button--outline">
          Send a pack <ArrowRight size={17} />
        </Link>
      </div>
    </section>
  );
}

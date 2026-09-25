"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";

import type { ThesisCard } from "@/server/content/queries";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";

/**
 * The layer under the card: why this basket, what each holding is for, and the best argument
 * that it is wrong.
 *
 * A sheet rather than an expanding card. Expanding in place pushes every card below it down
 * the page, so reading one belief loses your place among the others — and on a phone the
 * expanded card is taller than the screen anyway.
 *
 * <dialog> supplies focus containment, Escape, inertness behind, and focus returning to the
 * button that opened it. Scroll position is preserved because the feed never moves.
 */
export function WhySheet({
  thesis,
  className,
  label,
}: {
  thesis: ThesisCard;
  className?: string;
  /** "See why" reads as a button; inside a menu it has to name the thing it opens. */
  label?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // Whether this instance currently holds the scroll lock. The lock is refcounted
  // globally, so unmounting while somebody else's dialog is open must not release it.
  const locked = useRef(false);

  const close = useCallback(() => ref.current?.close(), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClose = () => {
      setOpen(false);
      if (locked.current) {
        locked.current = false;
        unlockScroll();
      }
    };
    el.addEventListener("close", onClose);
    return () => {
      el.removeEventListener("close", onClose);
      if (locked.current) {
        locked.current = false;
        unlockScroll();
      }
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className={className ?? "fc-why"}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          locked.current = true;
          lockScroll();
          ref.current?.showModal();
        }}
      >
        {label ?? "See why"}
      </button>

      <dialog
        ref={ref}
        className="sheet"
        aria-label={`Why this basket: ${thesis.claim}`}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="sheet-panel">
          <div className="sheet-head">
            <p className="sheet-eyebrow">Why this basket</p>
            <button type="button" className="sheet-close" onClick={close}>
              <X size={17} aria-hidden="true" />
              <span className="ln-sr-only">Close</span>
            </button>
          </div>

          {open && (
            <div className="sheet-body">
              <h2>{thesis.claim}</h2>

              <section>
                <h3>The case</h3>
                <p>{thesis.rationale}</p>
              </section>

              <section className="sheet-objection">
                <h3>The strongest objection</h3>
                <p>{thesis.counterargument}</p>
              </section>

              <section>
                <h3>What each holding is for</h3>
                <dl className="sheet-holdings">
                  {thesis.holdings.map((h) => (
                    <div key={h.symbol}>
                      <dt>
                        {h.company} <span>{h.symbol} · {h.weightBps / 100}%</span>
                      </dt>
                      <dd>{h.why}</dd>
                      <dd className="sheet-limit">
                        <strong>The tradeoff.</strong> {h.limitation}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <p className="sheet-sources">
                {thesis.supportingCount} supporting {thesis.supportingCount === 1 ? "source" : "sources"} ·{" "}
                {thesis.againstCount} against
              </p>

              <Link href={`/t/${thesis.slug}`} className="sheet-full">
                Full thesis, sources and history
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

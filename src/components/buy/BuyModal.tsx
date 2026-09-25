"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";

import { BuyFlow } from "./BuyFlow";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";

type Holding = { symbol: string; company: string; role: string; weightBps: number };

/**
 * Buying, over the page it was started from.
 *
 * A basket is a decision about a thesis, and sending someone to a separate URL to make it
 * meant leaving the thing they were deciding about. Coming back afterwards landed them at
 * the top of a list with no memory of which row they had been reading.
 *
 * The trigger stays a real link to /buy/<slug>. That route still exists and still works,
 * so the button can be middle-clicked, copied, or followed with JavaScript disabled; the
 * click handler intercepts it only once there is something to intercept with. A button
 * that does nothing without JavaScript would have been the easier thing to write.
 *
 * <dialog> rather than a div: focus containment, Escape, inertness of the page behind and
 * the top layer all come from the element, and every hand-rolled version of those is worse.
 */
export function BuyModal({
  slug,
  claim,
  versionId,
  holdings,
  callStatement,
  authorName,
  className,
  children,
}: {
  slug: string;
  claim: string;
  versionId: string;
  holdings: Holding[];
  callStatement?: string;
  authorName: string;
  /** Overrides the trigger's look. The feed makes the whole basket tile the trigger. */
  className?: string;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // Whether this instance currently holds the scroll lock. The lock is refcounted
  // globally, so unmounting while somebody else's dialog is open must not release it.
  const locked = useRef(false);

  const close = useCallback(() => {
    ref.current?.close();
  }, []);

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
      <a
        href={`/buy/${slug}?version=${versionId}`}
        className={className ?? "ln-btn ln-btn--ink"}
        onClick={(e) => {
          // Let the browser do its normal thing for anything that is not a plain left
          // click — new tab, new window, download — rather than swallowing it.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          if (!ref.current?.showModal) return;
          e.preventDefault();
          setOpen(true);
          locked.current = true;
          lockScroll();
          ref.current.showModal();
        }}
      >
        {children ?? (
          <>
            Buy basket
            <ArrowRight size={15} aria-hidden="true" />
          </>
        )}
        <span className="ln-sr-only">{children ? `Buy this basket: ${claim}` : `: ${claim}`}</span>
      </a>

      <dialog
        ref={ref}
        className="bm"
        aria-label={`Buy the basket for: ${claim}`}
        onClick={(e) => {
          // The backdrop is the dialog element itself; clicks on the panel inside it stop
          // here, so comparing the target is enough to tell "outside" from "inside".
          if (e.target === ref.current) close();
        }}
      >
        <div className="bm-panel">
          <button type="button" className="bm-close" onClick={close}>
            <X size={17} aria-hidden="true" />
            <span className="ln-sr-only">Close</span>
          </button>

          {/* Mounted only while open so the flow starts clean each time, rather than
              resuming a half-built basket from a previous visit to a different thesis. */}
          {open && (
            <BuyFlow
              slug={slug}
              claim={claim}
              versionId={versionId}
              holdings={holdings}
              callStatement={callStatement}
              authorName={authorName}
            />
          )}
        </div>
      </dialog>
    </>
  );
}

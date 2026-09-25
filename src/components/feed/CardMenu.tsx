"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

/**
 * The card's secondary actions, behind one button.
 *
 * A collapsed card earns its place by being scannable, so everything that is not the post,
 * the basket or a side goes here: the full argument, sharing, following. None of them is
 * the reason somebody is scrolling, and all of them were previously taking a row each.
 *
 * Deliberately not the popover API. A popover lives in the top layer, which ignores the
 * card as a containing block, and positioning it back over the button needs CSS anchor
 * positioning that Firefox does not have yet. A plain absolutely-positioned list inside a
 * relatively-positioned wrapper works everywhere; the dismiss behaviour a popover would
 * have given for free is the twenty lines below.
 */
export function CardMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      if (returnFocus) button.current?.focus();
    },
    [],
  );

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    // Focus leaving the menu entirely closes it, so tabbing past it does not strand an
    // open list behind the next card.
    const onFocusIn = (e: FocusEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open, close]);

  return (
    <div className="fc-menu" ref={wrap}>
      <button
        type="button"
        ref={button}
        className="fc-menu-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
        <span className="ln-sr-only">More for: {label}</span>
      </button>

      {open && (
        /* Choosing anything closes the list. Several of these open a dialog on top, and a
           menu still sitting underneath it is the kind of thing nobody notices until they
           close the dialog. */
        <div className="fc-menu-list" onClick={() => close(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

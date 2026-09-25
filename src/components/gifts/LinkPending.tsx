"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useLinkStatus } from "next/link";

/**
 * A link's label that admits it is working.
 *
 * Must render inside a <Link>. Without it, a navigation that takes a while — a slow phone
 * connection, a cold route — leaves a button that looks pressed-and-ignored, and people press it
 * again or give up. It was reported exactly that way: "can't click this button". The press had
 * landed; nothing said so.
 */
export function LinkPending({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span aria-live="polite">{pending ? pendingText : children}</span>
      {pending ? <Loader2 size={17} className="gift-spin" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Keep the editor reachable during long research, without covering it once reached. */
export function MobileBasketBar({ slug }: { slug: string }) {
  const [editorVisible, setEditorVisible] = useState(false);
  useEffect(() => {
    const editor = document.getElementById("thesis-allocation");
    if (!editor || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setEditorVisible(entry.isIntersecting));
    observer.observe(editor);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="td-mobile-dock" hidden={editorVisible}>
      <span>Make it yours<small>Set your weights, then review</small></span>
      <Link href={`/buy/${slug}`} className="ln-btn ln-btn--ink">Build this basket <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  );
}

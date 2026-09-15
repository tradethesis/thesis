"use client";

import { useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";

/** Keep the editor reachable during long research, without covering it once reached. */
export function MobileBasketBar() {
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
      <span>Make it yours<small>Allocation preview</small></span>
      <a href="#thesis-allocation" className="ln-btn ln-btn--primary">Try this basket <ArrowDown size={16} aria-hidden="true" /></a>
    </div>
  );
}

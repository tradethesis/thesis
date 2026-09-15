import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { BrandMark } from "../landing/BrandMark";

/**
 * The product's own header, deliberately not the marketing one.
 *
 * The site header carries a tab bar — Overview, Calls, How it works, Join — which is a
 * map of the marketing site. Inside the app that map is noise: someone reading calls is
 * not choosing between a call and the "how it works" section, and the big Explore button
 * in the corner points at the page they are already on.
 *
 * So this is a mark, a way back out, and nothing else. What belongs in the app's chrome
 * is the app's own controls, and those live with the grid that owns them.
 */
export function AppHeader() {
  return (
    <header className="ap-header">
      <div className="ap-header-inner">
        <Link href="/app" className="ap-mark" aria-label="Thesis calls">
          <BrandMark />
          <span>thesis</span>
        </Link>
        <Link href="/" className="ap-back">
          <ArrowLeft size={14} aria-hidden="true" />
          About Thesis
        </Link>
      </div>
    </header>
  );
}

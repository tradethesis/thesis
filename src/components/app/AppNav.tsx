"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, PenLine, Wallet } from "lucide-react";

import { useWallet } from "../buy/useWallet";
import { BrandMark } from "../landing/BrandMark";

/**
 * Where the workspace can go, and who is signed in.
 *
 * Three destinations now rather than four: the terminal absorbed Discover and the old call
 * leaderboard, which were two ways of looking at the same catalogue. Each is a real route with
 * its own URL — tabs that swap client state cannot be linked, shared or reopened, and the back
 * button does the wrong thing.
 *
 * Rendered twice from one list: a header above 720px and a bottom bar below it, where a thumb
 * is. `aria-hidden` is deliberately absent from the phone copy, because it is the only
 * navigation a phone user has and the desktop copy is the one hidden at that width.
 */

const DESTINATIONS = [
  { href: "/app", label: "Terminal", Icon: LayoutGrid },
  { href: "/app/my-theses", label: "Portfolio", Icon: Wallet },
  { href: "/app/create", label: "Create", Icon: PenLine },
] as const;

export function AppNav({ wallet }: { wallet: string }) {
  const pathname = usePathname() ?? "/app";
  const { signOut } = useWallet();

  // Longest match wins, so /app/create does not also light up the terminal.
  const current = DESTINATIONS.reduce((best, d) => {
    const hit = pathname === d.href || pathname.startsWith(`${d.href}/`);
    return hit && d.href.length > best.length ? d.href : best;
  }, "");

  const short = `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;

  return (
    <>
      <header className="tm-nav">
        <div className="tm-nav-inner">
          <Link href="/app" className="tm-mark" aria-label="Thesis, go to the terminal">
            <BrandMark />
            <span>thesis</span>
          </Link>

          <nav className="tm-nav-links" aria-label="Sections">
            {DESTINATIONS.map(({ href, label, Icon }) => (
              <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>
                <Icon size={14} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>

          <details className="tm-wallet">
            <summary aria-label={`Signed in as ${short}`}>
              <span className="tm-wallet-dot" aria-hidden="true" />
              <span className="ln-num">{short}</span>
            </summary>
            <div className="tm-wallet-menu">
              <Link href="/app/my-theses">Your purchases</Link>
              {/* Completed calls, kept as their own surface. The terminal ranks what is running;
                  a track record is a different question and mixing the two would present
                  unfinished bets as history. */}
              <Link href="/app/leaderboard">Completed calls</Link>
              <Link href="/about">About Thesis</Link>
              <button type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </details>
        </div>
      </header>

      <nav className="tm-nav-bottom" aria-label="Sections">
        {DESTINATIONS.map(({ href, label, Icon }) => (
          <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>
            <Icon size={17} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}

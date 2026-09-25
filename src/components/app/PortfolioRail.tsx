"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { useFollowing } from "@/lib/following";
import { usePurchases } from "@/lib/use-purchases";

import { SignIn } from "../buy/SignIn";
import { useWallet } from "../buy/useWallet";

/**
 * What you own and what you are watching, kept on screen while you browse.
 *
 * Desktop only, and not because a phone could not fit it — because on a phone this is a
 * destination in the bottom bar, and a panel that duplicates a tab is a panel that has to
 * be kept in step with it forever. Here there is room beside the feed, and the point of the
 * rail is that deciding what to buy is easier when what you already hold is visible.
 *
 * It is hidden on My theses, where it would sit next to a fuller version of itself.
 *
 * Two kinds of fact, never mixed: purchases come from the server for the signed-in wallet
 * and describe what this app bought, while following is a list in this browser. Neither is
 * a statement about what the wallet holds now.
 */
export function PortfolioRail() {
  const pathname = usePathname() ?? "";
  const wallet = useWallet();
  const { purchases, needsSession } = usePurchases(wallet.wallet);
  const { slugs, ready } = useFollowing();

  if (pathname.startsWith("/app/my-theses")) return null;

  const recent = (purchases ?? []).slice(0, 3);

  return (
    <aside className="rail" aria-label="Your theses">
      <div className="rail-inner">
        <div className="rail-head">
          <h2>Your theses</h2>
          <Link href="/app/my-theses">
            All <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </div>

        <section className="rail-block">
          <p className="rail-label">Purchases</p>

          {purchases === null ? (
            <p className="rail-quiet" role="status">Loading…</p>
          ) : needsSession ? (
            <>
              <p className="rail-quiet">Sign in to see what you bought.</p>
              <SignIn wallet={wallet} variant="inline" />
            </>
          ) : recent.length === 0 ? (
            <p className="rail-quiet">Nothing bought yet.</p>
          ) : (
            <ul className="rail-list">
              {recent.map((p) => (
                <li key={p.intentId}>
                  <Link href={`/t/${p.slug}`}>{p.claim}</Link>
                  <span className={`rail-mode rail-mode--${p.executionMode}`}>
                    {p.executionMode === "live" ? "Real" : "Simulated"}
                  </span>
                  <small>
                    {p.settling
                      ? "Still being checked"
                      : `${p.confirmedLegs} of ${p.totalLegs} legs filled`}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rail-block">
          <p className="rail-label">Following{ready && slugs.length ? ` · ${slugs.length}` : ""}</p>
          {!ready ? (
            <p className="rail-quiet">…</p>
          ) : slugs.length === 0 ? (
            <p className="rail-quiet">Follow a belief to keep it here.</p>
          ) : (
            <p className="rail-quiet">
              {slugs.length} saved in this browser. <Link href="/app/my-theses">Open</Link>
            </p>
          )}
        </section>

        <p className="rail-note">
          Purchase history, not holdings. Tokens can be sold or moved without this record changing.
        </p>
      </div>
    </aside>
  );
}

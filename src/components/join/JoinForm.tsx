"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { MAX_NOTE, parseWaitlist } from "@/lib/waitlist";

/**
 * The form.
 *
 * It validates with exactly the same function the server does, so a message a visitor sees
 * here is the message the server would have given. Client validation is a courtesy; the
 * server's is the one that counts, and neither is allowed to have its own opinion.
 *
 * There is no counter, no "join 4,000 others", no position in a queue. None of that is
 * true yet, and a fabricated number is the fastest way to lose someone who checks.
 */
export function JoinForm({ source = "join" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [wallet, setWallet] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);

      const local = parseWaitlist({ email, wallet, note, source });
      if (!local.ok) {
        setError({ field: local.field, message: local.message });
        document.getElementById(`jn-${local.field}`)?.focus();
        return;
      }

      setBusy(true);
      try {
        const res = await fetch("/api/waitlist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(local.value),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setError(body?.error ?? { field: "email", message: "Something went wrong. Try again." });
          return;
        }
        setDone(true);
      } catch {
        setError({ field: "email", message: "We could not reach the server. Check your connection." });
      } finally {
        setBusy(false);
      }
    },
    [email, wallet, note, source],
  );

  if (done) {
    return (
      <div className="jn-card jn-done" role="status">
        <h2>
          <Check size={18} aria-hidden="true" /> You&rsquo;re on the list.
        </h2>
        <p>
          We&rsquo;ll email you when buying opens to more wallets. One email, from a person, when there is something
          real to say.
        </p>
        <p>
          Nothing is waiting on you. Every thesis is readable right now, and you can set an allocation without
          connecting anything.
        </p>
        <div className="jn-done-actions">
          <Link href="/explore" className="ln-btn ln-btn--ink">
            Read the theses
          </Link>
          <Link href="/" className="ln-btn ln-btn--secondary">
            Back to the homepage
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="jn-card" onSubmit={submit} noValidate>
      <div className={`jn-field${error?.field === "email" ? " jn-field--error" : ""}`}>
        <label htmlFor="jn-email">Email</label>
        <input
          id="jn-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error?.field === "email" || undefined}
          aria-describedby={error?.field === "email" ? "jn-email-error" : undefined}
          placeholder="you@example.com"
        />
        {error?.field === "email" && (
          <span className="jn-error" id="jn-email-error">
            <CircleAlert size={13} aria-hidden="true" /> {error.message}
          </span>
        )}
      </div>

      <div className={`jn-field${error?.field === "wallet" ? " jn-field--error" : ""}`}>
        <label htmlFor="jn-wallet">Solana wallet — optional</label>
        <small>If you already have one, we can open buying for it first.</small>
        <input
          id="jn-wallet"
          name="wallet"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          aria-invalid={error?.field === "wallet" || undefined}
          aria-describedby={error?.field === "wallet" ? "jn-wallet-error" : undefined}
          placeholder="Leave blank if you are not sure"
        />
        {error?.field === "wallet" && (
          <span className="jn-error" id="jn-wallet-error">
            <CircleAlert size={13} aria-hidden="true" /> {error.message}
          </span>
        )}
      </div>

      <div className={`jn-field${error?.field === "note" ? " jn-field--error" : ""}`}>
        <label htmlFor="jn-note">What would you want a thesis about? — optional</label>
        <textarea
          id="jn-note"
          name="note"
          maxLength={MAX_NOTE}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-invalid={error?.field === "note" || undefined}
          placeholder="An idea you keep arguing about."
        />
        {error?.field === "note" && (
          <span className="jn-error">
            <CircleAlert size={13} aria-hidden="true" /> {error.message}
          </span>
        )}
      </div>

      <button type="submit" className="ln-btn ln-btn--ink jn-submit" disabled={busy}>
        {busy ? <Loader2 size={16} className="jn-spin" aria-hidden="true" /> : null}
        {busy ? "Adding you…" : "Join the waitlist"}
      </button>

      <p className="jn-fine">
        We store your email so we can tell you when buying opens, and nothing else — no IP address, no tracking, no
        third-party analytics. We will never ask for a seed phrase or a private key. Reply to any email and we will
        delete your address.
      </p>
    </form>
  );
}

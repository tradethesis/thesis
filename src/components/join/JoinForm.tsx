"use client";

import { useCallback, useState } from "react";
import { ArrowRight, Check, CircleAlert, Loader2 } from "lucide-react";
import { parseWaitlist } from "@/lib/waitlist";

/**
 * Email and a button. Nothing else.
 *
 * Every extra field is another reason to close the tab, and none of them were needed: an
 * address is enough to tell someone the doors are open. The API still accepts a wallet and
 * a note for later, it just does not ask for them here.
 *
 * Validated with the same parseWaitlist the server uses, so a message shown here is the
 * message the server would have given.
 *
 * No counter, no queue position, no "join N others". None of it is true.
 */
export function JoinForm({ source = "join" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);

      const local = parseWaitlist({ email, source });
      if (!local.ok) {
        setError(local.message);
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
          setError(body?.error?.message ?? "Something went wrong. Try again.");
          return;
        }
        setDone(true);
      } catch {
        setError("We could not reach the server. Check your connection.");
      } finally {
        setBusy(false);
      }
    },
    [email, source],
  );

  if (done) {
    return (
      <p className="jn-done" role="status">
        <Check size={17} aria-hidden="true" />
        You&rsquo;re on the list. We&rsquo;ll email you when buying opens.
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="jn-row">
        <label className="ln-sr-only" htmlFor="jn-email">
          Email address
        </label>
        <input
          id="jn-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "jn-error" : undefined}
          placeholder="you@example.com"
        />
        <button type="submit" className="jn-go" disabled={busy}>
          {busy ? <Loader2 size={17} className="jn-spin" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
          <span>{busy ? "Adding" : "Join"}</span>
        </button>
      </div>
      {error && (
        <p className="jn-error" id="jn-error">
          <CircleAlert size={13} aria-hidden="true" /> {error}
        </p>
      )}
    </form>
  );
}

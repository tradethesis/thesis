/**
 * What a waitlist signup has to satisfy before it reaches the database.
 *
 * Pure and dependency-free so the rules can be tested directly. The rules are deliberately
 * forgiving about shape and strict about size: rejecting a valid address because it has a
 * plus sign or a long TLD costs a real person a place in the queue, while an unbounded
 * string costs us a database.
 */

export const MAX_EMAIL = 254; // RFC 5321 maximum path length
export const MAX_NOTE = 500;

export type WaitlistInput = { email?: unknown; wallet?: unknown; note?: unknown; source?: unknown };

export type WaitlistParsed = {
  email: string;
  wallet: string | null;
  note: string | null;
  source: string;
};

export type WaitlistResult = { ok: true; value: WaitlistParsed } | { ok: false; field: string; message: string };

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * One @, something either side, a dot in the domain, no whitespace. Anything stricter
 * starts rejecting addresses that work.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function parseWaitlist(input: WaitlistInput): WaitlistResult {
  const rawEmail = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!rawEmail) return { ok: false, field: "email", message: "Enter an email address." };
  if (rawEmail.length > MAX_EMAIL) return { ok: false, field: "email", message: "That email address is too long." };
  if (!EMAIL.test(rawEmail)) return { ok: false, field: "email", message: "That does not look like an email address." };

  let wallet: string | null = null;
  if (typeof input.wallet === "string" && input.wallet.trim()) {
    const candidate = input.wallet.trim();
    if (!BASE58.test(candidate)) {
      return { ok: false, field: "wallet", message: "That is not a Solana address. Leave it blank if you are not sure." };
    }
    wallet = candidate;
  }

  let note: string | null = null;
  if (typeof input.note === "string" && input.note.trim()) {
    const candidate = input.note.trim();
    if (candidate.length > MAX_NOTE) {
      return { ok: false, field: "note", message: `Keep it under ${MAX_NOTE} characters.` };
    }
    note = candidate;
  }

  // A page name, never a tracking identifier.
  const source = typeof input.source === "string" && /^[a-z0-9-]{1,32}$/.test(input.source) ? input.source : "join";

  return { ok: true, value: { email: rawEmail, wallet, note, source } };
}

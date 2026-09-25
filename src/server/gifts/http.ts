import { err } from "../api";

/**
 * Every gift write carries a client-generated idempotency key, so a retried request — a flaky
 * network, a double tap, a reload mid-submit — replays its first outcome instead of acting twice.
 */
export function idempotencyKey(request: Request): string | Response {
  const key = request.headers.get("idempotency-key") ?? "";
  // Colons and length for derived keys: the send flow scopes one base key per step, e.g.
  // "<uuid>:confirm" and "<uuid>:fund:<88-char signature>". The old 80-character, no-colon rule
  // refused both, so a real send could not get past confirming the recipient.
  if (!/^[A-Za-z0-9_:-]{16,200}$/.test(key)) return err("idempotency_key_required", "Send an Idempotency-Key header.", 400);
  return key;
}

export async function body<T = Record<string, unknown>>(request: Request): Promise<T | null> {
  try {
    const text = await request.text();
    if (text.length > 8_000) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

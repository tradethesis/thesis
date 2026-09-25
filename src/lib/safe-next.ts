/**
 * Where to go after signing in.
 *
 * Only a path inside the terminal. An open redirect on a wallet sign-in screen is worth more to
 * an attacker than on an ordinary login: the link looks like ours, it takes a real signature, and
 * it lands somebody somewhere else entirely. So a scheme, a protocol-relative `//host`, or
 * anything outside /app is dropped in favour of the default.
 */
export function safeNext(raw: string | null): string {
  if (!raw) return "/app";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/app";
  // "/appointments" starts with "/app" and is not the app.
  if (raw !== "/app" && !raw.startsWith("/app/") && !raw.startsWith("/app?")) return "/app";
  return raw;
}

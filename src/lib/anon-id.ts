const KEY = "thesis.anon.v1";

/**
 * A random id the browser keeps, so that one person reloading a page is not counted as
 * several people.
 *
 * That is the whole purpose. It is not a login, it is never sent to the server alongside a
 * wallet address or an email, and it is generated locally rather than issued — nothing on
 * the server can tie it to a person, which is what makes counting acceptable at all.
 *
 * Returns null when storage is unavailable, which happens in private windows and whenever
 * site data is blocked. A view with no id still counts; it just cannot be de-duplicated.
 * Refusing to count is the right failure, not inventing a fresh id on every page load.
 */
export function anonId(): string | null {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const value = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    localStorage.setItem(KEY, value);
    return value;
  } catch {
    return null;
  }
}

/**
 * BigInt does not survive JSON.stringify, and every amount in this codebase is a BigInt.
 * Rather than remember to call .toString() at each of a few dozen call sites, convert once
 * on the way out. Amounts cross the wire as decimal strings and are parsed back with
 * BigInt() — never through Number(), which silently rounds above 2^53.
 */
export function jsonSafe<T>(value: T): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, jsonSafe(v)]));
  }
  return value;
}

import { describe, expect, it } from "vitest";

import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps a path inside the app", () => {
    expect(safeNext("/app?basket=solana-toll-booths")).toBe("/app?basket=solana-toll-booths");
    expect(safeNext("/app/my-theses")).toBe("/app/my-theses");
  });

  it("falls back when there is nothing to return to", () => {
    expect(safeNext(null)).toBe("/app");
    expect(safeNext("")).toBe("/app");
  });

  it("refuses an absolute url", () => {
    // The attack this exists for: a link that looks like ours, takes a real signature, and
    // lands somebody somewhere else.
    expect(safeNext("https://evil.example/app")).toBe("/app");
    expect(safeNext("http://evil.example")).toBe("/app");
  });

  it("refuses a protocol-relative host", () => {
    expect(safeNext("//evil.example/app")).toBe("/app");
    expect(safeNext("//evil.example")).toBe("/app");
  });

  it("refuses a scheme that is not http", () => {
    expect(safeNext("javascript:alert(1)")).toBe("/app");
    expect(safeNext("data:text/html,x")).toBe("/app");
  });

  it("refuses a path outside the app", () => {
    expect(safeNext("/join")).toBe("/app");
    expect(safeNext("/t/some-thesis")).toBe("/app");
  });

  it("is not fooled by a prefix that only looks like the app", () => {
    expect(safeNext("/appointments/evil")).toBe("/app");
  });
});

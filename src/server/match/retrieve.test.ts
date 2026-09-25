import { describe, expect, it } from "vitest";

import { isPrivateAddress, looksLikeUrl, parseStatusUrl } from "./retrieve";

describe("post retrieval", () => {
  it("recognises an X status URL on every host it is served from", () => {
    for (const u of [
      "https://x.com/limonisme/status/1234567890",
      "https://twitter.com/limonisme/status/1234567890",
      "https://www.x.com/limonisme/status/1234567890?s=20",
      "https://mobile.twitter.com/limonisme/status/1234567890",
    ]) {
      expect(parseStatusUrl(u)).toEqual({ handle: "limonisme", id: "1234567890" });
    }
  });

  it("refuses anything that is not a status URL", () => {
    for (const u of [
      "https://x.com/limonisme",
      "https://example.com/limonisme/status/1",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "http://169.254.169.254/latest/meta-data/",
      "not a url at all",
    ]) {
      expect(parseStatusUrl(u)).toBeNull();
    }
  });

  it("tells a pasted link from pasted prose", () => {
    expect(looksLikeUrl("https://x.com/a/status/1")).toBe(true);
    expect(looksLikeUrl("  https://x.com/a/status/1 ")).toBe(true);
    expect(looksLikeUrl("look at https://x.com/a/status/1")).toBe(false);
    expect(looksLikeUrl("AI capex is unsustainable")).toBe(false);
  });

  /* The address check is the one that matters: a hostname is a promise DNS is free to break. */
  it("blocks every private and link-local destination", () => {
    for (const a of [
      "127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "172.31.255.255",
      "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
      "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(a), a).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const a of ["1.1.1.1", "104.244.42.1", "2606:4700::1111"]) {
      expect(isPrivateAddress(a), a).toBe(false);
    }
  });

  it("treats an unparseable address as private rather than public", () => {
    expect(isPrivateAddress("not-an-address")).toBe(true);
  });
});

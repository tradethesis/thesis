"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The logo of a token on the allowlist.
 *
 * The file is produced by scripts/fetch-token-logos.ts, which looks the asset up by mint,
 * refuses to write anything if Jupiter's symbol for that mint disagrees with our own, and
 * commits the result. So the symbol here is only a filename — nothing resolves an asset by
 * ticker at runtime, and the image beside a holding is the logo the issuer publishes for
 * the exact mint that gets bought.
 *
 * When a logo is missing, the tile falls back to the ticker's first letters rather than a
 * broken-image glyph. That case is not hypothetical: the fetch script deliberately refuses
 * to write a logo it cannot verify, and the issuer CDNs rate-limit, so an asset can sit on
 * the allowlist with no file for a while. A missing logo should look like an asset we have
 * not got a picture of, not like a page that failed to load.
 */
export function TokenLogo({
  symbol,
  company,
  tone,
  size = 26,
}: {
  symbol: string;
  company: string;
  tone: number;
  /** The tile ships at 26px; anything larger is the same file scaled up by the browser. */
  size?: number;
}) {
  const img = useRef<HTMLImageElement>(null);
  const [missing, setMissing] = useState(false);

  // onError alone is not enough. These images are served with the HTML and usually finish
  // — or fail — before React attaches anything, and a load error that happened before
  // hydration is never replayed. So the first thing the client does is ask the element
  // whether it already failed.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setMissing(true);
  }, []);

  return (
    <span className={`tl ln-asset-tone-${tone % 3}`} style={size === 26 ? undefined : { width: size, height: size }}>
      {missing ? (
        <span className="tl-letters" aria-hidden="true">
          {symbol.replace(/x$/, "").slice(0, 3)}
        </span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element --
           A 26px webp that ships with the build. next/image would add an optimizer
           round trip per tile to resize something already at its final size. */
        <img
          ref={img}
          src={`/tokens/${symbol}.webp`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setMissing(true)}
        />
      )}
      <span className="ln-sr-only">{company}</span>
    </span>
  );
}

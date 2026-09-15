/**
 * The logo of a token on the allowlist.
 *
 * The file is produced by scripts/fetch-token-logos.ts, which looks the asset up by mint,
 * refuses to write anything if Jupiter's symbol for that mint disagrees with our own, and
 * commits the result. So the symbol here is only a filename — nothing resolves an asset by
 * ticker at runtime, and the image beside a holding is the logo the issuer publishes for
 * the exact mint that gets bought.
 *
 * The tinted tile behind the image is not decoration. If a logo is ever missing — a new
 * asset added to the allowlist before the script is re-run — the alt text lands on a
 * legible background instead of a broken-image glyph on white.
 */
export function TokenLogo({ symbol, company, tone }: { symbol: string; company: string; tone: number }) {
  return (
    <span className={`tl ln-asset-tone-${tone % 3}`}>
      {/* eslint-disable-next-line @next/next/no-img-element --
          A 26px webp that ships with the build. next/image would add an optimizer
          round trip per tile to resize something already at its final size. */}
      <img src={`/tokens/${symbol}.webp`} alt="" width={26} height={26} loading="lazy" decoding="async" />
      <span className="ln-sr-only">{company}</span>
    </span>
  );
}

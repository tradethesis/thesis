import { BrandMark } from "@/components/landing/BrandMark";
import type { GiftPack as Pack } from "@/lib/gifts";

export function PackArtwork({ motif }: { motif: Pack["motif"] }) {
  return <svg className="gift-art" viewBox="0 0 240 240" fill="none" aria-hidden="true">
    {motif === "orbit" && <g stroke="currentColor" strokeWidth="1.5"><circle cx="120" cy="120" r="70" /><ellipse cx="120" cy="120" rx="98" ry="36" transform="rotate(-38 120 120)" /><ellipse cx="120" cy="120" rx="98" ry="36" transform="rotate(38 120 120)" /><ellipse cx="120" cy="120" rx="36" ry="98" /><circle cx="120" cy="120" r="15" fill="currentColor" /><circle cx="190" cy="64" r="7" fill="currentColor" /></g>}
    {motif === "bloom" && <g stroke="currentColor" strokeWidth="1.3">{Array.from({ length: 12 }, (_, i) => <ellipse key={i} cx="120" cy="86" rx="24" ry="58" transform={`rotate(${i * 30} 120 120)`} />)}<circle cx="120" cy="120" r="16" fill="currentColor" /></g>}
    {motif === "rings" && <g stroke="currentColor" strokeWidth="1.5">{[22, 44, 66, 88].map((r) => <circle key={r} cx="120" cy="120" r={r} />)}<circle cx="120" cy="120" r="8" fill="currentColor" /></g>}
    {motif === "spark" && <g stroke="currentColor" strokeWidth="1.5">{Array.from({ length: 16 }, (_, i) => <path key={i} d="M120 30L131 99L120 120L109 99Z" transform={`rotate(${i * 22.5} 120 120)`} />)}<circle cx="120" cy="120" r="94" strokeDasharray="2 8" /></g>}
  </svg>;
}

/** `image`: the sender's photo, shown in a window where the motif would be. */
export function GiftPack({ pack, className = "", image }: { pack: Pack; className?: string; image?: string | null }) {
  return <div className={`gift-pack gift-pack--${pack.color} ${className}`} aria-label={`${pack.name} gift pack`}>
    <div className="gift-pack-seal" />
    <div className="gift-pack-body">
      <div className="gift-pack-top"><span><BrandMark /> thesis</span><span>NO. {pack.edition}</span></div>
      <div className="gift-pack-title">{pack.name}<span>{pack.subtitle}</span></div>
      {image ? (
        <div className="gift-photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL or an already-resized upload; nothing for next/image to optimise */}
          <img src={image} alt="" draggable={false} />
        </div>
      ) : <PackArtwork motif={pack.motif} />}
      <div className="gift-pack-bottom"><span>A FUTURE WORTH SHARING</span>{/* The wrapping says nothing about what is inside, not even how many: that is the surprise. */}<span>A GIFT · OPEN BY HAND</span></div>
    </div>
    <div className="gift-pack-seal gift-pack-seal--bottom" />
  </div>;
}

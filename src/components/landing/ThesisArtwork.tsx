/** Decorative category art, not measured market data. */
export function ThesisArtwork({ category, className = "" }: { category: string; className?: string }) {
  const kind = category.toLowerCase().includes("financ") ? "finance" : category.toLowerCase().includes("consumer") ? "consumer" : "technology";
  return (
    <div className={`ln-art ln-art--${kind} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" fill="none">
        {kind === "finance" ? (
          <g stroke="currentColor" strokeWidth="29">
            <ellipse cx="120" cy="120" rx="73" ry="98" transform="rotate(-35 120 120)" />
            <ellipse cx="210" cy="120" rx="73" ry="98" transform="rotate(-35 210 120)" />
            <ellipse cx="300" cy="120" rx="73" ry="98" transform="rotate(-35 300 120)" />
          </g>
        ) : kind === "consumer" ? (
          <g fill="currentColor"><path d="M30 240 115 0h55L85 240H30ZM145 240 230 0h55l-85 240h-55ZM260 240 345 0h55l-85 240h-55Z" /></g>
        ) : (
          <g stroke="currentColor" strokeWidth="23">
            <rect x="78" y="-20" width="235" height="235" rx="65" transform="rotate(20 195 98)" />
            <rect x="130" y="32" width="131" height="131" rx="27" transform="rotate(20 195 98)" />
          </g>
        )}
      </svg>
    </div>
  );
}

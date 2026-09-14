/** Code-native version of the approved three-piece T. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`ln-brand-mark ${className}`} viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
      <path d="M5 7h14l.5.6v7.8l-.5.6H2L5 7Zm16 0h14l3 9H21l-.5-.6V7.6L21 7ZM16 17h8l1 1v15l-1 1h-8l-1-1V18l1-1Z" />
    </svg>
  );
}

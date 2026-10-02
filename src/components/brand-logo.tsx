export function BrandLogo({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`rota-brand ${compact ? 'rota-brand-compact' : ''} ${className}`}
    >
      <svg
        className="rota-symbol"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M6 34V23L22 7H34V15H25L14 26V34H6Z M20 34V26L28 18H34V26H31L28 29V34H20Z"
          fill="currentColor"
        />
      </svg>
      {!compact && (
        <span className="rota-wordmark">
          Rota<span>Financeira</span>
        </span>
      )}
      <span className="sr-only">{compact ? 'Rota Financeira' : ''}</span>
    </span>
  );
}

/**
 * Guesteria Stay mark: a location pin (a place to stay) with the AI-concierge spark inside,
 * on the brand teal. The same drawing is used for the favicon (src/app/icon.svg).
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id="gs-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f766e" />
          <stop offset="1" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#gs-mark)" />
      <path d="M32 11c-9.6 0-17.4 7.6-17.4 17C14.6 41.2 32 54 32 54s17.4-12.8 17.4-26C49.4 18.6 41.6 11 32 11z" fill="#fff" />
      <path d="M32 19.5l2.7 5.8 5.8 2.7-5.8 2.7L32 36.5l-2.7-5.8-5.8-2.7 5.8-2.7z" fill="#0f766e" />
    </svg>
  );
}

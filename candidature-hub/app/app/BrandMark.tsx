export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`app-brand-mark ${small ? "app-brand-mark-small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 72 72" fill="none">
        <rect x="10" y="15" width="38" height="46" rx="12" fill="#dfe8ee" opacity=".78" />
        <rect x="21" y="9" width="41" height="48" rx="13" fill="#fffefa" />
        <circle cx="41.5" cy="26" r="7" fill="#61758a" />
        <path d="M30 43.5c2.8-5.2 7-7.8 11.5-7.8s8.7 2.6 11.5 7.8" stroke="#61758a" strokeWidth="5" strokeLinecap="round" />
        <circle cx="55" cy="53" r="11" fill="#c9795e" />
        <path d="m50.5 53 3 3 6-7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

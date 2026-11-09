export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="brand__mark"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="24" height="24" rx="7" fill="#533afd" />
      <circle cx="11.3" cy="12.4" r="4.9" fill="none" stroke="#ffffff" strokeWidth="2.1" />
      <circle cx="18.5" cy="5.7" r="2.3" fill="#ea2261" stroke="#ffffff" strokeWidth="1.4" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="brand">
      <LogoMark />
      <span>Oya</span>
    </span>
  );
}

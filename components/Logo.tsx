import Link from "next/link";

export function LogoMark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="var(--pink)" stroke="var(--critter-ink)" strokeWidth="2.5" />
      <circle cx="29" cy="11" r="7" fill="var(--pink)" stroke="var(--critter-ink)" strokeWidth="2.5" />
      <ellipse cx="20" cy="23" rx="16" ry="14" fill="var(--pink)" stroke="var(--critter-ink)" strokeWidth="2.5" />
      <circle cx="14.5" cy="22" r="2" fill="var(--critter-ink)" />
      <circle cx="25.5" cy="22" r="2" fill="var(--critter-ink)" />
    </svg>
  );
}

export function Logo({ className = "logo" }: { className?: string }) {
  return (
    <Link className={className} href="/" aria-label="tsayvish home">
      <LogoMark />
      tsayvish
    </Link>
  );
}

import Link from "next/link";

const POLICIES = [
  { label: "PRIVACY", href: "/privacy" },
  { label: "TERMS", href: "/terms" },
  { label: "REFUND", href: "/refund" },
  { label: "SHIPPING", href: "/shipping" },
  { label: "CONTACT", href: "/contact" },
];

export function SiteFooter() {
  return (
    <footer
      className="mt-auto border-t border-border"
      // Keep the last row clear of the fixed bottom-right badge slot.
      style={{ paddingBottom: "var(--badge-safe)" }}
    >
      <div className="mx-auto flex max-w-[1800px] flex-col gap-5 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-8">
        <nav
          aria-label="Policies"
          className="meta flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-text-secondary"
        >
          {POLICIES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] hover:text-text"
            >
              {p.label}
            </Link>
          ))}
        </nav>

        <p className="meta text-[11px] text-text-secondary">© 2026 CICO</p>
      </div>
    </footer>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <main
      className="page-reveal flex min-h-screen flex-col items-center justify-center gap-6 px-5"
      style={{ paddingTop: "var(--header-h)" }}
    >
      <h1 className="text-[26vw] leading-none md:text-[14vw]">404</h1>
      <p className="meta text-[12px] tracking-[0.2em] text-text-secondary">
        THIS PAGE DOES NOT EXIST.
      </p>
      <Link
        href="/"
        className="meta border border-border px-5 py-3 text-[11px] hover:border-text"
      >
        BACK TO THE FEED
      </Link>
    </main>
  );
}

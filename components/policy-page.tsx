/**
 * Shared shell for the policy stubs. All copy is PLACEHOLDER text for the
 * demo — swap in real legal copy before anything ships.
 */
export function PolicyPage({
  title,
  sections,
}: {
  title: string;
  sections: { heading: string; body: string }[];
}) {
  return (
    <article className="mx-auto max-w-[720px] px-5 py-12 md:px-0">
      <h1 className="text-[28px] md:text-[36px]">{title}</h1>
      <p className="meta mt-2 text-[10px] text-text-secondary">
        PLACEHOLDER COPY — NOT LEGAL TEXT. LAST UPDATED 2026.
      </p>

      <div className="mt-10 space-y-8">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-[14px]">{s.heading}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
              {s.body}
            </p>
          </section>
        ))}
      </div>
    </article>
  );
}

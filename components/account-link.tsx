"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The header's account slot. Text only — this header has no nav menu and is
 * not getting one.
 *
 * Renders nothing until the session resolves, rather than flashing LOGIN and
 * swapping to an email a moment later. An empty slot settling into a label is
 * quieter than a label that changes its mind, and the grid track it sits in
 * is sized by its siblings so nothing shifts.
 */
export function AccountLink() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "out" } | { status: "in"; label: string }
  >({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/session", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { customer: null }))
      .then((data: { customer: { email: string; name: string | null } | null }) => {
        if (!data.customer) {
          setState({ status: "out" });
          return;
        }
        // A name if they have one, otherwise the address. The local part
        // alone would be ambiguous between two people at the same domain.
        setState({
          status: "in",
          label: data.customer.name?.trim() || data.customer.email,
        });
      })
      .catch(() => {
        // An aborted or failed probe is not an error worth showing. Falling
        // back to the signed-out label keeps the header usable either way.
        if (!controller.signal.aborted) setState({ status: "out" });
      });

    return () => controller.abort();
  }, []);

  if (state.status === "loading") {
    return <span aria-hidden="true" className="meta text-[11px] opacity-0" />;
  }

  if (state.status === "out") {
    return (
      <Link
        href="/login"
        className="meta text-[11px] tracking-wide text-text transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] hover:opacity-60"
      >
        LOGIN
      </Link>
    );
  }

  return (
    <Link
      href="/account"
      title={state.label}
      className="meta max-w-[9rem] truncate text-[11px] tracking-wide text-text transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] hover:opacity-60"
    >
      {state.label.toUpperCase()}
    </Link>
  );
}

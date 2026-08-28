"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { logout, logoutEverywhere } from "@/app/(pages)/actions";

/**
 * Sign out of this device, or all of them.
 *
 * "Everywhere" is the one that matters after a lost phone, so it is present
 * and plainly labelled rather than buried — but it is the secondary control,
 * because it is the more destructive of the two.
 */
export function SignOutControls() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setMessage(null);
    start(async () => {
      const res = await action();
      if (res.ok) {
        // The header reads its state from a route handler, and Server
        // Components above this one cached a signed-in render. Refresh before
        // navigating or the storefront still looks signed in.
        router.refresh();
        router.push("/");
        return;
      }
      setMessage(res.message ?? "That did not work. Try again.");
    });
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
      <button
        type="button"
        onClick={() => run(logout)}
        disabled={pending}
        className="btn-press meta border border-text px-5 py-2.5 text-[11px] tracking-[0.14em] hover:bg-text hover:text-bg disabled:opacity-50"
      >
        {pending ? "SIGNING OUT…" : "SIGN OUT"}
      </button>

      <button
        type="button"
        onClick={() => run(logoutEverywhere)}
        disabled={pending}
        className="meta border border-border px-5 py-2.5 text-[11px] tracking-[0.14em] text-text-secondary transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] hover:border-text hover:text-text disabled:opacity-50"
      >
        SIGN OUT EVERYWHERE
      </button>

      {message && (
        <p role="status" className="meta text-[10px] text-text">
          {message.toUpperCase()}
        </p>
      )}
    </div>
  );
}

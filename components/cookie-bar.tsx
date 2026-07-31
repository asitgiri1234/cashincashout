"use client";

import { useEffect, useState } from "react";

/**
 * Cookie consent bar — bottom-left, dismissible, choice persisted to
 * localStorage. Once a choice exists the bar never shows again.
 */

const STORAGE_KEY = "cico.cookie-consent.v1";

type Consent = "accepted" | "declined";

export function CookieBar() {
  // null = not yet checked; false = no stored choice, show the bar.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== "accepted" && stored !== "declined") setVisible(true);
    } catch {
      // Storage unavailable — show it, but the choice won't stick.
      setVisible(true);
    }
  }, []);

  function choose(consent: Consent) {
    try {
      window.localStorage.setItem(STORAGE_KEY, consent);
    } catch {
      // Ignore — dismissal still applies for this session.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="cico-rise fixed bottom-5 left-5 z-40 max-w-[min(380px,calc(100vw-2.5rem))] border border-border bg-surface p-4"
      // On narrow screens the bar can reach the badge corner — keep clear.
      style={{ marginRight: "var(--badge-safe)" }}
    >
      <p className="meta text-[11px] leading-relaxed text-text-secondary">
        WE USE COOKIES TO MEASURE TRAFFIC AND REMEMBER YOUR CART. NO THIRD-PARTY
        AD TRACKING.
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => choose("accepted")}
          className="meta flex-1 border border-text bg-text px-4 py-2 text-[11px] text-bg transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] hover:opacity-70"
        >
          ACCEPT
        </button>
        <button
          type="button"
          onClick={() => choose("declined")}
          className="meta flex-1 border border-border px-4 py-2 text-[11px] text-text-secondary transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] hover:border-text hover:text-text"
        >
          DECLINE
        </button>
      </div>
    </aside>
  );
}

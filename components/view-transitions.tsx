"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ComponentProps,
  type MouseEvent,
} from "react";

/**
 * View Transitions for App Router navigation.
 *
 * `document.startViewTransition(cb)` snapshots the current DOM, runs `cb`,
 * then snapshots again once the promise `cb` returns resolves — and morphs
 * between elements that share a `view-transition-name`. The hard part in the
 * App Router is knowing *when* the new route has actually committed, since
 * `router.push()` returns immediately.
 *
 * So the pending resolver is parked here, in a provider that lives in the root
 * layout and therefore survives the navigation. A `usePathname()` effect fires
 * once the new route commits and releases it. Doing this inside the link
 * itself would not work — the link unmounts with the old page, and its effect
 * would never run.
 *
 * GRACEFUL FALLBACK: browsers without the API, and anyone with
 * prefers-reduced-motion, simply get an ordinary Next <Link> navigation.
 */

type NavigateFn = (href: string) => void;

const ViewTransitionContext = createContext<NavigateFn | null>(null);

/** Never leave the document frozen if a route somehow never commits. */
const COMMIT_TIMEOUT_MS = 1200;

function canTransition(): boolean {
  if (typeof document === "undefined") return false;
  if (typeof document.startViewTransition !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ViewTransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const pending = useRef<{ resolve: () => void; timer: number } | null>(null);

  // The new route has committed — let the transition capture the new state.
  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    window.clearTimeout(p.timer);
    // Resolve synchronously. Do NOT defer through requestAnimationFrame:
    // the browser suppresses rendering during a transition's DOM-update
    // phase, so rAF callbacks never fire and the transition deadlocks until
    // the engine aborts it ("Transition was aborted because of timeout in
    // DOM update"). useEffect already runs after the DOM is committed, which
    // is what the second snapshot needs.
    p.resolve();
  }, [pathname]);

  const navigate = useCallback<NavigateFn>(
    (href) => {
      if (!canTransition()) {
        router.push(href);
        return;
      }

      document.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            const timer = window.setTimeout(() => {
              pending.current = null;
              resolve();
            }, COMMIT_TIMEOUT_MS);

            pending.current = { resolve, timer };
            router.push(href);
          }),
      );
    },
    [router],
  );

  return (
    <ViewTransitionContext.Provider value={navigate}>
      {children}
    </ViewTransitionContext.Provider>
  );
}

/**
 * Drop-in replacement for next/link that routes through a view transition.
 * Falls back to plain <Link> behaviour whenever a transition isn't possible
 * or the click wasn't a plain left-click.
 */
export function TransitionLink({
  href,
  onClick,
  ...rest
}: ComponentProps<typeof Link>) {
  const navigate = useContext(ViewTransitionContext);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (!navigate || typeof href !== "string") return;

    // Let the browser own modified clicks: new tab, new window, download.
    if (
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      (rest.target && rest.target !== "_self")
    ) {
      return;
    }

    if (!canTransition()) return; // unsupported or reduced motion -> plain nav

    e.preventDefault();
    navigate(href);
  }

  return <Link href={href} onClick={handleClick} {...rest} />;
}

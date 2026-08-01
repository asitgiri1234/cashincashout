"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Registry of blocking overlays that are currently open.
 *
 * Anything that takes over the screen — the size sheet today, a cart drawer
 * or search overlay later — registers itself here while it is open. The
 * rotating brand badge watches this and hides itself, so it never spins in
 * the corner on top of a modal.
 *
 * Usage from an overlay component:
 *
 *   useOverlayLock("cart-drawer", isOpen);
 */

interface OverlayValue {
  openIds: ReadonlySet<string>;
  setOpen: (id: string, open: boolean) => void;
}

const OverlayContext = createContext<OverlayValue | null>(null);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const setOpen = useCallback((id: string, open: boolean) => {
    setOpenIds((prev) => {
      if (open === prev.has(id)) return prev; // no-op, keeps referential identity
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo<OverlayValue>(
    () => ({ openIds, setOpen }),
    [openIds, setOpen],
  );

  return (
    <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
  );
}

/** Register an overlay as open/closed for as long as the component is mounted. */
export function useOverlayLock(id: string, open: boolean) {
  const ctx = useContext(OverlayContext);
  const setOpen = ctx?.setOpen;

  useEffect(() => {
    if (!setOpen) return;
    setOpen(id, open);
    // Always release on unmount, otherwise an overlay that unmounts while
    // open would leave the badge hidden forever.
    return () => setOpen(id, false);
  }, [id, open, setOpen]);
}

/** True while any blocking overlay is open. */
export function useAnyOverlayOpen(): boolean {
  const ctx = useContext(OverlayContext);
  return (ctx?.openIds.size ?? 0) > 0;
}

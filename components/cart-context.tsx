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
 * Demo cart. Frontend-only — there is no backend and no real checkout.
 * State lives in memory and is mirrored to localStorage so a refresh keeps it.
 */

const STORAGE_KEY = "cico.cart.v1";

export interface CartLine {
  slug: string;
  size: string;
  qty: number;
}

interface CartValue {
  lines: CartLine[];
  /** Total units across all lines — this is what the header counter shows. */
  count: number;
  add: (slug: string, size: string, qty?: number) => void;
  remove: (slug: string, size: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartValue | null>(null);

function readStored(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is CartLine =>
        !!l &&
        typeof l === "object" &&
        typeof (l as CartLine).slug === "string" &&
        typeof (l as CartLine).size === "string" &&
        typeof (l as CartLine).qty === "number",
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate after mount so server and client markup match on first paint.
  useEffect(() => {
    setLines(readStored());
    setHydrated(true);
  }, []);

  useEffect(() => {
    // Don't write until the stored cart has been read back in. Otherwise the
    // empty initial state gets flushed to storage on mount and wipes a cart
    // that another tab may be relying on.
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Storage disabled (private mode / blocked) — cart stays in-memory.
    }
  }, [lines, hydrated]);

  const add = useCallback((slug: string, size: string, qty = 1) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.slug === slug && l.size === size);
      if (i === -1) return [...prev, { slug, size, qty }];
      const next = [...prev];
      next[i] = { ...next[i], qty: next[i].qty + qty };
      return next;
    });
  }, []);

  const remove = useCallback((slug: string, size: string) => {
    setLines((prev) =>
      prev.filter((l) => !(l.slug === slug && l.size === size)),
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartValue>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      add,
      remove,
      clear,
    }),
    [lines, add, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getProductBySlug } from "./products";

/**
 * Cart state — Zustand, persisted to localStorage.
 *
 * DEMO ONLY: there is no backend and no checkout. The cart is purely local.
 *
 * `drawerOpen` deliberately lives in the same store but is NOT persisted
 * (see `partialize`) — reopening the tab with the drawer already open would
 * be disorienting.
 */

export interface CartLine {
  slug: string;
  size: string;
  qty: number;
}

interface CartState {
  lines: CartLine[];
  drawerOpen: boolean;
  add: (slug: string, size: string, qty?: number) => void;
  remove: (slug: string, size: string) => void;
  setQty: (slug: string, size: string, qty: number) => void;
  clear: () => void;
  setDrawerOpen: (open: boolean) => void;
}

const sameLine = (l: CartLine, slug: string, size: string) =>
  l.slug === slug && l.size === size;

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      drawerOpen: false,

      add: (slug, size, qty = 1) =>
        set((s) => {
          const i = s.lines.findIndex((l) => sameLine(l, slug, size));
          if (i === -1) return { lines: [...s.lines, { slug, size, qty }] };
          const lines = [...s.lines];
          lines[i] = { ...lines[i], qty: Math.min(9, lines[i].qty + qty) };
          return { lines };
        }),

      remove: (slug, size) =>
        set((s) => ({ lines: s.lines.filter((l) => !sameLine(l, slug, size)) })),

      setQty: (slug, size, qty) =>
        set((s) => ({
          lines:
            qty < 1
              ? s.lines.filter((l) => !sameLine(l, slug, size))
              : s.lines.map((l) =>
                  sameLine(l, slug, size) ? { ...l, qty: Math.min(9, qty) } : l,
                ),
        })),

      clear: () => set({ lines: [] }),
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
    }),
    {
      // v2: v1 (cico.cart.v1) stored a bare array from the old context-based
      // cart; zustand-persist wraps state in {state,version}, so the shape is
      // incompatible and a fresh key is cleaner than a migration for a demo.
      name: "cico.cart.v2",
      partialize: (s) => ({ lines: s.lines }),
    },
  ),
);

/* Selectors — keep component subscriptions narrow. */

export const selectCount = (s: CartState) =>
  s.lines.reduce((n, l) => n + l.qty, 0);

export const selectSubtotal = (s: CartState) =>
  s.lines.reduce(
    (sum, l) => sum + (getProductBySlug(l.slug)?.price ?? 0) * l.qty,
    0,
  );

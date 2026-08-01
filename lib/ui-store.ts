"use client";

import { create } from "zustand";

/** Ephemeral UI state — never persisted. */
interface UiState {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
}));

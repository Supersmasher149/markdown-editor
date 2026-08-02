import { create } from "zustand";
import type { DiscardChoice, LayoutMode } from "../types";

/**
 * Transient interface state: which panes are visible, whether the settings
 * sheet is open, and any pending unsaved-changes prompt.
 *
 * Kept separate from the document and settings stores so that opening a panel
 * cannot accidentally touch the user's content or preferences.
 */

/** An in-flight unsaved-changes prompt awaiting the user's answer. */
type ConfirmRequest = {
  fileName: string;
  resolve: (choice: DiscardChoice) => void;
};

type UiState = {
  layout: LayoutMode;
  isSettingsOpen: boolean;
  confirmRequest: ConfirmRequest | null;

  setLayout: (layout: LayoutMode) => void;
  setSettingsOpen: (open: boolean) => void;

  /**
   * Ask the user what to do about unsaved changes.
   *
   * Resolves once they answer. A prompt raised while another is already open
   * resolves immediately to "cancel" rather than stacking dialogs.
   */
  requestDiscardChoice: (fileName: string) => Promise<DiscardChoice>;
  resolveDiscardChoice: (choice: DiscardChoice) => void;
};

export const useUiStore = create<UiState>((set, get) => ({
  layout: "split",
  isSettingsOpen: false,
  confirmRequest: null,

  setLayout: (layout) => set({ layout }),
  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),

  requestDiscardChoice: (fileName) => {
    if (get().confirmRequest !== null) return Promise.resolve("cancel");

    return new Promise<DiscardChoice>((resolve) => {
      set({ confirmRequest: { fileName, resolve } });
    });
  },

  resolveDiscardChoice: (choice) => {
    const pending = get().confirmRequest;
    if (!pending) return;
    set({ confirmRequest: null });
    pending.resolve(choice);
  },
}));

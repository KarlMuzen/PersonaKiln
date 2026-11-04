import type { StateCreator } from 'zustand';
import { db } from '../../db';
import { useToastStore } from '../useToastStore';
import type { CardStore, UISlice } from './types';

export const createUISlice: StateCreator<CardStore, [], [], UISlice> = (set) => ({
  activeTab: 'gallery',
  setActiveTab: (tab) => set({ activeTab: tab }),
  theme: 'dark',
  loadThemeFromDb: async () => {
    try {
      const rec = await db.settings.get('app_theme');
      const theme = rec?.value === 'light' ? 'light' : 'dark';
      set({ theme });
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      try {
        window.localStorage.setItem('personakiln-theme', theme);
      } catch {
        // The IndexedDB preference remains authoritative when storage is unavailable.
      }
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
        ?.setAttribute('content', theme === 'dark' ? '#191816' : '#f7f4ee');
    } catch (e) {
      console.error('Failed to load theme:', e);
    }
  },
  setTheme: async (theme) => {
    set({ theme });
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('personakiln-theme', theme);
    } catch {
      // Theme still applies in-session; IndexedDB remains the persistent source.
    }
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#191816' : '#f7f4ee');
    try {
      await db.settings.put({ key: 'app_theme', value: theme });
    } catch (e) {
      console.error('Failed to save theme:', e);
      useToastStore.getState().showToast({
        title: 'Failed to save theme',
        message: e instanceof Error ? e.message : 'Database write error',
        type: 'error',
      });
    }
  },

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  selectedTag: null,
  setSelectedTag: (tag) => set({ selectedTag: tag }),
  selectedCardUuids: [],
  toggleSelectCardUuid: (uuid) =>
    set((state) => ({
      selectedCardUuids: state.selectedCardUuids.includes(uuid)
        ? state.selectedCardUuids.filter((id) => id !== uuid)
        : [...state.selectedCardUuids, uuid],
    })),
  clearCardSelections: () => set({ selectedCardUuids: [] }),
  selectAllCards: () => set((state) => ({ selectedCardUuids: state.cards.map((c) => c.uuid) })),

  isChatPreviewOpen: false,
  setChatPreviewOpen: (open) => set({ isChatPreviewOpen: open }),
  chatPreviewGreetingIndex: 0,
  setChatPreviewGreetingIndex: (idx) => set({ chatPreviewGreetingIndex: idx }),
  isOnboardingOpen: false,
  setIsOnboardingOpen: (open) => set({ isOnboardingOpen: open }),
  isPreFlightAuditOpen: false,
  setPreFlightAuditOpen: (open) => set({ isPreFlightAuditOpen: open }),
});

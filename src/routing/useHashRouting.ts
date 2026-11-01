import { useEffect } from 'react';
import { db } from '../db';
import { useCardStore } from '../store/useCardStore';
import { useToastStore } from '../store/useToastStore';
import { parseHash, serializeRoute, sectionOf, type Route } from './hashRoute';

/**
 * Keeps the URL hash and the store's (activeTab, activeCardUuid) in sync:
 * - Back/Forward and typed hashes drive the store.
 * - Store changes write the hash (push when the screen or card changes,
 *   replace when only a sub-tab inside the same section changes).
 * The store stays the source of truth, so existing views are untouched.
 */
export function useHashRouting(): void {
  useEffect(() => {
    let ready = false;
    let applying = false;
    let seq = 0;

    const currentRoute = (): Route => {
      const s = useCardStore.getState();
      return { tab: s.activeTab, cardUuid: s.activeCardUuid };
    };

    const writeUrl = (mode: 'push' | 'replace') => {
      const next = serializeRoute(currentRoute());
      if (next === window.location.hash) return;
      if (mode === 'push') window.history.pushState(null, '', next);
      else window.history.replaceState(null, '', next);
    };

    const goLibrary = (message?: string) => {
      useCardStore.getState().setActiveTab('gallery');
      if (message) {
        useToastStore.getState().showToast({ title: message, message: '', type: 'info' });
      }
    };

    const apply = async (route: Route | null, rawHash: string) => {
      const mine = ++seq;
      applying = true;
      try {
        if (!route) {
          goLibrary(rawHash && rawHash !== '#/' ? 'Unknown link — opened Library' : undefined);
          return;
        }
        const s = useCardStore.getState();
        if (route.cardUuid && route.cardUuid !== s.activeCardUuid) {
          const exists = await db.cards.where('uuid').equals(route.cardUuid).first();
          if (mine !== seq) return;
          if (!exists) {
            goLibrary('That card no longer exists');
            return;
          }
          await s.selectCardForEditing(route.cardUuid);
          if (mine !== seq) return;
        }
        useCardStore.getState().setActiveTab(route.tab);
      } finally {
        if (mine === seq) {
          applying = false;
          writeUrl('replace');
        }
      }
    };

    const unsubscribe = useCardStore.subscribe((state, prev) => {
      if (!ready) return;
      if (state.activeTab === prev.activeTab && state.activeCardUuid === prev.activeCardUuid) return;
      const samePlace =
        sectionOf(state.activeTab) === sectionOf(prev.activeTab) &&
        state.activeCardUuid === prev.activeCardUuid;
      writeUrl(applying || samePlace ? 'replace' : 'push');
    });

    const onPop = () => {
      void apply(parseHash(window.location.hash), window.location.hash);
    };
    window.addEventListener('popstate', onPop);

    void apply(parseHash(window.location.hash), window.location.hash).then(() => {
      ready = true;
    });

    return () => {
      unsubscribe();
      window.removeEventListener('popstate', onPop);
    };
  }, []);
}

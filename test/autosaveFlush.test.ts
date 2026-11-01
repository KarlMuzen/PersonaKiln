// @vitest-environment jsdom
import '../test/setup';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { db } from '../src/db';
import { useCardStore } from '../src/store/useCardStore';
import { useHashRouting } from '../src/routing/useHashRouting';

async function makeCard(name: string): Promise<string> {
  return useCardStore.getState().createNewCard(name);
}

function renameActiveCard(name: string) {
  useCardStore.getState().updateActiveCardData((card) => ({
    ...card,
    data: { ...card.data, name },
  }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  const { saveTimeoutId } = useCardStore.getState();
  if (saveTimeoutId) clearTimeout(saveTimeoutId);
  await db.cards.clear();
  await db.settings.clear();
  useCardStore.setState({
    activeTab: 'gallery',
    activeCardUuid: null,
    activeCard: null,
    activeCardRecord: null,
    cards: [],
    saveTimeoutId: null,
    saveState: 'idle',
  });
  window.history.replaceState(null, '', '/');
});

describe('autosave flush on card switch', () => {
  it('edit then switch: the pending autosave lands before the switch', async () => {
    const a = await makeCard('First');
    const b = await makeCard('Second');
    await useCardStore.getState().selectCardForEditing(a);
    renameActiveCard('First Renamed');
    // Straight away, inside the 800 ms autosave window.
    await useCardStore.getState().selectCardForEditing(b);
    const record = await db.cards.where('uuid').equals(a).first();
    expect(record?.name).toBe('First Renamed');
    expect(useCardStore.getState().saveTimeoutId).toBeNull();
    expect(useCardStore.getState().activeCardUuid).toBe(b);
  });

  it('no pending save, no re-save: a fired autosave is not repeated on switch', async () => {
    const a = await makeCard('First');
    const b = await makeCard('Second');
    await useCardStore.getState().selectCardForEditing(a);
    window.history.replaceState(null, '', `#/forge/${a}/details`);
    renderHook(() => useHashRouting());
    await act(async () => { await sleep(20); });

    renameActiveCard('First Renamed');
    // Wait until the autosave has fired (800 ms timer plus save time).
    await sleep(1100);

    const save = vi.fn(async () => {});
    useCardStore.setState({ saveActiveCardMetadata: save });

    window.history.replaceState(null, '', `#/forge/${b}/details`);
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
      await sleep(50);
    });

    expect(save).not.toHaveBeenCalled();
    expect(useCardStore.getState().activeCardUuid).toBe(b);
  });

  it('switch during a running save: the switch waits for the save to finish', async () => {
    const a = await makeCard('First');
    const b = await makeCard('Second');
    await useCardStore.getState().selectCardForEditing(a);

    let started = false;
    let finished = false;
    const slowSave = async () => {
      started = true;
      await sleep(200);
      finished = true;
    };
    useCardStore.setState({ saveActiveCardMetadata: slowSave });

    useCardStore.getState().triggerAutosave();
    // Wait until the timer has fired and the save is running.
    await waitFor(() => expect(started).toBe(true), { timeout: 3000 });
    expect(finished).toBe(false);

    await useCardStore.getState().selectCardForEditing(b);
    expect(finished).toBe(true);
    expect(useCardStore.getState().activeCardUuid).toBe(b);
    expect(useCardStore.getState().activeCard?.data?.name).toBe('Second');
  });

  it('failed save keeps the error and the switch still happens', async () => {
    const a = await makeCard('First');
    const b = await makeCard('Second');
    await useCardStore.getState().selectCardForEditing(a);

    const failingSave = async () => {
      useCardStore.setState({ saveState: 'error' });
    };
    useCardStore.setState({
      saveActiveCardMetadata: failingSave,
      saveTimeoutId: setTimeout(() => {}, 10_000),
    });

    await useCardStore.getState().selectCardForEditing(b);
    expect(useCardStore.getState().saveState).toBe('error');
    expect(useCardStore.getState().activeCardUuid).toBe(b);
  });
});

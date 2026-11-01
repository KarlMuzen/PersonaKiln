// @vitest-environment jsdom
import '../test/setup';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../src/db';
import type { StoredCard } from '../src/db';
import { useCardStore } from '../src/store/useCardStore';
import { useDialogStore } from '../src/store/useDialogStore';
import { BackupRestoreSection } from '../src/components/settings/BackupRestoreSection';
import { createNewDefaultCard } from '../src/utils/cardDefaults';

const originalShowAlert = useDialogStore.getState().showAlert;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  const { saveTimeoutId } = useCardStore.getState();
  if (saveTimeoutId) clearTimeout(saveTimeoutId);
  await db.cards.clear();
  await db.lorebooks.clear();
  await db.settings.clear();
  useCardStore.setState({
    activeTab: 'gallery',
    activeCardUuid: null,
    activeCard: null,
    activeCardRecord: null,
    activeCardEmbeddedAssets: {},
    cards: [],
    undoStack: [],
    redoStack: [],
    saveTimeoutId: null,
    saveState: 'idle',
  });
  useDialogStore.setState({ showAlert: originalShowAlert });
});

function storedCard(uuid: string, name: string, modification_date: number): StoredCard {
  const cardData = createNewDefaultCard(name);
  cardData.data.modification_date = modification_date;
  return {
    uuid,
    name,
    tags: [],
    creator: '',
    creation_date: 1000,
    modification_date,
    cardData,
    embeddedAssets: {},
  } as StoredCard;
}

function makeBackup(cards: StoredCard[]): string {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    cards,
    lorebooks: [],
    connectionProfiles: [],
    settings: [],
  });
}

function renderRestoreSection() {
  const props = {
    profiles: [],
    loadCardsFromDb: useCardStore.getState().loadCardsFromDb,
    loadProfilesFromDb: useCardStore.getState().loadProfilesFromDb,
  };
  return render(React.createElement(BackupRestoreSection, props));
}

async function restoreThroughInput(backup: string) {
  const { container } = renderRestoreSection();
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([backup], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => backup });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('stale open card', () => {
  it('import then edit: the store shows the imported card and later edits keep it', async () => {
    const uuid = await useCardStore.getState().createNewCard('Original');
    const imported = createNewDefaultCard('Imported');
    imported.data.description = 'Base description';
    await useCardStore.getState().importCardRecord(
      imported,
      { 'embeded://icon/main.png': new Uint8Array([1, 2, 3]) },
      uuid,
    );
    const state = useCardStore.getState();
    expect(state.activeCard?.data.name).toBe('Imported');
    expect(state.activeCardRecord?.name).toBe('Imported');
    expect(state.activeCardEmbeddedAssets['embeded://icon/main.png']).toBeDefined();
    expect(state.isAssetsDirty).toBe(false);

    useCardStore.getState().updateActiveCardData((card) => ({
      ...card,
      data: { ...card.data, description: `${card.data.description} plus edit` },
    }));
    await sleep(1100);
    const record = await db.cards.where('uuid').equals(uuid).first();
    expect(record?.name).toBe('Imported');
    expect(record?.cardData.data.description).toBe('Base description plus edit');
    expect(record?.embeddedAssets?.['embeded://icon/main.png']).toBeDefined();
  });

  it('typing inside the autosave window is saved first, then replaced, and undo brings it back', async () => {
    const uuid = await useCardStore.getState().createNewCard('Base');
    useCardStore.getState().updateActiveCardData((card) => ({
      ...card,
      data: { ...card.data, name: 'Typed' },
    }));
    const imported = createNewDefaultCard('Imported');
    await useCardStore.getState().importCardRecord(imported, {}, uuid);
    await sleep(1100);

    const record = await db.cards.where('uuid').equals(uuid).first();
    expect(record?.cardData.data.name).toBe('Imported');
    const state = useCardStore.getState();
    expect(state.undoStack.length).toBeGreaterThan(0);
    expect(state.undoStack[state.undoStack.length - 1].cardData.data.name).toBe('Typed');
    expect(state.redoStack).toHaveLength(0);
    const setting = await db.settings.get(`editor_history_${uuid}`);
    expect(setting?.value).toEqual({ undoStack: state.undoStack, redoStack: [] });
    expect(state.saveTimeoutId).toBeNull();
    expect(state.saveState).toBe('idle');

    state.undo();
    expect(useCardStore.getState().activeCard?.data.name).toBe('Typed');
  });

  it('another card: overwrite-importing B leaves open card A untouched', async () => {
    const a = await useCardStore.getState().createNewCard('A');
    const b = await useCardStore.getState().createNewCard('B');
    await useCardStore.getState().selectCardForEditing(a);
    const before = useCardStore.getState().activeCard;
    const undoLen = useCardStore.getState().undoStack.length;
    const importedB = createNewDefaultCard('B Imported');
    await useCardStore.getState().importCardRecord(importedB, {}, b);
    expect(useCardStore.getState().activeCard).toBe(before);
    expect(useCardStore.getState().undoStack).toHaveLength(undoLen);
    const bRecord = await db.cards.where('uuid').equals(b).first();
    expect(bRecord?.name).toBe('B Imported');
  });

  it('runDbCardWrite with no change returns the value and pushes nothing; with no open card it just returns', async () => {
    await useCardStore.getState().createNewCard('Open');
    const before = useCardStore.getState().activeCard;
    const undoLen = useCardStore.getState().undoStack.length;
    const value = await useCardStore.getState().runDbCardWrite(async () => 'kept');
    expect(value).toBe('kept');
    expect(useCardStore.getState().activeCard).toBe(before);
    expect(useCardStore.getState().undoStack).toHaveLength(undoLen);

    useCardStore.setState({ activeCardUuid: null, activeCard: null, activeCardRecord: null });
    const value2 = await useCardStore.getState().runDbCardWrite(async () => 'also kept');
    expect(value2).toBe('also kept');
  });

  it('a write that updates the open card and then throws still shows the updated card', async () => {
    const uuid = await useCardStore.getState().createNewCard('Before');
    const record = await db.cards.where('uuid').equals(uuid).first();
    const active = useCardStore.getState().activeCard!;
    const updated = { ...active, data: { ...active.data, name: 'Updated' } };
    await expect(
      useCardStore.getState().runDbCardWrite(async () => {
        await db.cards.update(record!.id!, { name: 'Updated', cardData: updated });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(useCardStore.getState().activeCard?.data.name).toBe('Updated');
  });

  it('restore through the component: a newer backup replaces the open card', async () => {
    const showAlert = vi.fn().mockResolvedValue(undefined);
    useDialogStore.setState({ showAlert });
    const uuid = 'c1';
    await db.cards.add(storedCard(uuid, 'Local Name', 1000));
    await useCardStore.getState().selectCardForEditing(uuid);
    await restoreThroughInput(makeBackup([storedCard(uuid, 'Incoming Name', 2000)]));
    await waitFor(() => expect(showAlert).toHaveBeenCalled());
    const [msg, title] = showAlert.mock.calls[0];
    expect(msg.startsWith('Database restored!')).toBe(true);
    expect(title).toBe('Restore Successful');
    expect(useCardStore.getState().activeCard?.data.name).toBe('Incoming Name');

    useCardStore.getState().updateActiveCardData((card) => ({
      ...card,
      data: { ...card.data, description: 'edited' },
    }));
    await sleep(1100);
    const record = await db.cards.where('uuid').equals(uuid).first();
    expect(record?.name).toBe('Incoming Name');
    expect(record?.cardData.data.description).toBe('edited');
  });

  it('restore through the component: an older backup copy is kept and the open card is untouched', async () => {
    const showAlert = vi.fn().mockResolvedValue(undefined);
    useDialogStore.setState({ showAlert });
    const uuid = 'c1';
    await db.cards.add(storedCard(uuid, 'Local Name', 2000));
    await useCardStore.getState().selectCardForEditing(uuid);
    const before = useCardStore.getState().activeCard;
    const undoLen = useCardStore.getState().undoStack.length;
    await restoreThroughInput(makeBackup([storedCard(uuid, 'Older Name', 1000)]));
    await waitFor(() => expect(showAlert).toHaveBeenCalled());
    expect(useCardStore.getState().activeCard).toBe(before);
    expect(useCardStore.getState().undoStack).toHaveLength(undoLen);
  });
});

// @vitest-environment jsdom
import '../test/setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, CURRENT_SCHEMA_VERSION } from '../src/db';
import { SETTINGS_COST_TRACKER_KEY, useTokenTracker } from '../src/store/useTokenTracker';
import { useCardStore } from '../src/store/useCardStore';
import { encryptText, decryptText } from '../src/utils/crypto';
import { createNewDefaultCard } from '../src/utils/cardDefaults';

beforeEach(async () => {
  const timeout = useCardStore.getState().saveTimeoutId;
  if (timeout) clearTimeout(timeout);
  await db.settings.clear();
  localStorage.clear();
  useCardStore.setState({
    theme: 'dark',
    activeCardUuid: null,
    activeCard: null,
    undoStack: [],
    redoStack: [],
    saveTimeoutId: null,
  });
  useTokenTracker.setState({ stats: {}, loaded: true });
});

afterEach(async () => {
  const timeout = useCardStore.getState().saveTimeoutId;
  if (timeout) clearTimeout(timeout);
  await db.settings.clear();
  localStorage.clear();
  useTokenTracker.setState({ stats: {}, loaded: false });
});

describe('persisted format invariants', () => {
  it('keeps the database name, version, tables, and indexes stable', () => {
    expect(db.name).toBe('RoleplayForgeDB');
    expect(CURRENT_SCHEMA_VERSION).toBe(5);
    // Version 6 only scrubs removed profile fields; cards and lorebooks are untouched.
    expect(db.verno).toBe(6);
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'cards',
      'connectionProfiles',
      'lorebooks',
      'settings',
    ]);

    expect(db.cards.schema.primKey.src).toBe('++id');
    expect(db.cards.schema.indexes.map((index) => index.src).sort()).toEqual([
      '*tags',
      'creation_date',
      'creator',
      'modification_date',
      'name',
      'order',
      'uuid',
      'variantOf',
    ]);
    expect(db.lorebooks.schema.primKey.src).toBe('++id');
    expect(db.lorebooks.schema.indexes.map((index) => index.src).sort()).toEqual([
      'name',
      'updatedAt',
      'uuid',
    ]);
    expect(db.connectionProfiles.schema.primKey.src).toBe('++id');
    expect(db.connectionProfiles.schema.indexes.map((index) => index.src).sort()).toEqual([
      'isDefault',
      'name',
      'provider',
      'uuid',
    ]);
    expect(db.settings.schema.primKey.src).toBe('key');
  });

  it('keeps undo records wrapped in exactly the cardData field', () => {
    const card = createNewDefaultCard('Undo invariant');
    useCardStore.setState({
      activeCardUuid: 'undo-invariant',
      activeCard: card,
      undoStack: [],
      redoStack: [],
    });

    useCardStore.getState().updateActiveCardData(
      (previous) => ({
        ...previous,
        data: { ...previous.data, description: 'Changed after the snapshot.' },
      }),
      { forceUndo: true },
    );

    const undoRecord = useCardStore.getState().undoStack[0];
    expect(Object.keys(undoRecord)).toEqual(['cardData']);
    expect(undoRecord.cardData.data.name).toBe('Undo invariant');
  });

  it('keeps theme, editor-history, assistant-chat, and cost-tracker identifiers stable', async () => {
    await useCardStore.getState().setTheme('light');
    expect(await db.settings.get('app_theme')).toEqual({ key: 'app_theme', value: 'light' });
    expect(localStorage.getItem('personakiln-theme')).toBe('light');

    const cardData = createNewDefaultCard('Invariant fixture');
    const historyKey = 'editor_history_invariant-fixture';
    await db.settings.put({
      key: historyKey,
      value: { undoStack: [{ cardData }], redoStack: [] },
    });
    await db.settings.put({ key: 'assistant_chats', value: { global: [] } });
    expect((await db.settings.get(historyKey))?.value.undoStack[0].cardData.data.name).toBe('Invariant fixture');
    expect(await db.settings.get('assistant_chats')).toEqual({
      key: 'assistant_chats',
      value: { global: [] },
    });

    expect(SETTINGS_COST_TRACKER_KEY).toBe('cost_tracker_usage');
    await useTokenTracker.getState().recordUsage('profile-1', 'Primary', 'model-x', 5, 7);
    const usage = await db.settings.get('cost_tracker_usage');
    expect(usage?.value).toEqual({
      'profile-1': {
        profileUuid: 'profile-1',
        profileName: 'Primary',
        model: 'model-x',
        promptTokens: 5,
        completionTokens: 7,
        totalTokens: 12,
      },
    });
    expect(Object.keys(usage!.value['profile-1']).sort()).toEqual([
      'completionTokens',
      'model',
      'profileName',
      'profileUuid',
      'promptTokens',
      'totalTokens',
    ]);
  });

  it('keeps the encrypted API key prefix and payload readable by the current format', async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const key = await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
    const encrypted = await encryptText('sensitive-test-value', key);

    expect(encrypted.startsWith('enc.v1.')).toBe(true);
    await expect(decryptText(encrypted, key)).resolves.toBe('sensitive-test-value');
  });
});

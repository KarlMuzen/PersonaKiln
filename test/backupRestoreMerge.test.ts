// @vitest-environment jsdom
import '../test/setup';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type StoredCard, type StoredLorebook } from '../src/db';
import { restoreFullBackup, type FullBackupData } from '../src/io/backup';
import { buildRestoreMessage } from '../src/components/settings/BackupRestoreSection';

function cardDataFor(name: string) {
  return {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name,
      description: `${name} description`,
      personality: '',
      scenario: '',
      first_mes: '',
      mes_example: '',
      creator_notes: '',
      system_prompt: '',
      post_history_instructions: '',
      tags: [],
      creator: 'Tester',
      character_version: '1.0',
      alternate_greetings: [],
      group_only_greetings: [],
      extensions: {},
    },
  };
}

function makeCard(uuid: string, name: string, modification_date: number, extra: Partial<StoredCard> = {}): StoredCard {
  return {
    uuid,
    name,
    tags: [],
    creator: 'Tester',
    creation_date: 1000,
    modification_date,
    cardData: cardDataFor(name) as never,
    ...extra,
  };
}

function makeLorebook(uuid: string, name: string, updatedAt: number): StoredLorebook {
  return {
    uuid,
    name,
    description: `${name} description`,
    updatedAt,
    lorebook: { entries: [], extensions: {} } as never,
  };
}

function cardDataName(card: StoredCard | undefined): string | undefined {
  return (card?.cardData as unknown as { data?: { name?: string } })?.data?.name;
}

function makeBackup(over: Partial<FullBackupData>): string {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: [],
    lorebooks: [],
    connectionProfiles: [],
    settings: [],
    ...over,
  });
}

describe('backup restore merge safety', () => {
  beforeEach(async () => {
    await db.cards.clear();
    await db.lorebooks.clear();
    await db.connectionProfiles.clear();
    await db.settings.clear();
  });

  it('keeps the local API key when the backup profile has apiKeyRedacted: true and no key', async () => {
    await db.connectionProfiles.add({
      uuid: 'prof-1',
      name: 'Local Profile',
      provider: 'openai',
      apiKey: 'LOCAL_KEY',
      model: 'gpt-test',
    });
    const summary = await restoreFullBackup(makeBackup({
      connectionProfiles: [{
        uuid: 'prof-1',
        name: 'Local Profile',
        provider: 'openai',
        model: 'gpt-test',
        apiKeyRedacted: true,
      } as never],
    }), 'merge');
    expect(summary.profilesCount).toBe(1);
    const prof = await db.connectionProfiles.where('uuid').equals('prof-1').first();
    expect(prof?.apiKey).toBe('LOCAL_KEY');
  });

  it('keeps the local API key when the backup key is enc.v1. text and cannot be decrypted', async () => {
    await db.connectionProfiles.add({
      uuid: 'prof-1',
      name: 'Local Profile',
      provider: 'openai',
      apiKey: 'LOCAL_KEY',
      model: 'gpt-test',
    });
    const summary = await restoreFullBackup(makeBackup({
      connectionProfiles: [{
        uuid: 'prof-1',
        name: 'Local Profile',
        provider: 'openai',
        apiKey: 'enc.v1.undecryptable',
        model: 'gpt-test',
      } as never],
    }), 'merge');
    const prof = await db.connectionProfiles.where('uuid').equals('prof-1').first();
    expect(prof?.apiKey).toBe('LOCAL_KEY');
    expect(summary.errors.filter((e) => e.includes('re-entered'))).toHaveLength(0);
  });

  it('a usable plaintext key in the backup still replaces the local key', async () => {
    await db.connectionProfiles.add({
      uuid: 'prof-1',
      name: 'Local Profile',
      provider: 'openai',
      apiKey: 'LOCAL_KEY',
      model: 'gpt-test',
    });
    await restoreFullBackup(makeBackup({
      connectionProfiles: [{
        uuid: 'prof-1',
        name: 'Local Profile',
        provider: 'openai',
        apiKey: 'NEW_KEY',
        model: 'gpt-test',
      } as never],
    }), 'merge');
    const prof = await db.connectionProfiles.where('uuid').equals('prof-1').first();
    expect(prof?.apiKey).toBe('NEW_KEY');
  });

  it('an older backup does not replace a newer local card', async () => {
    await db.cards.add(makeCard('c1', 'Local', 2000));
    const summary = await restoreFullBackup(makeBackup({
      cards: [makeCard('c1', 'Incoming', 1000)],
    }), 'merge');
    expect(summary.cardsKept).toBe(1);
    expect(summary.cardsCount).toBe(0);
    const stored = await db.cards.where('uuid').equals('c1').first();
    expect(stored?.modification_date).toBe(2000);
    expect(cardDataName(stored)).toBe('Local');
  });

  it('equal dates keep the local card', async () => {
    await db.cards.add(makeCard('c1', 'Local', 1500));
    const summary = await restoreFullBackup(makeBackup({
      cards: [makeCard('c1', 'Incoming', 1500)],
    }), 'merge');
    expect(summary.cardsKept).toBe(1);
    expect(summary.cardsCount).toBe(0);
    const stored = await db.cards.where('uuid').equals('c1').first();
    expect(cardDataName(stored)).toBe('Local');
  });

  it('a newer backup replaces the card and brings testSuites, scenarios, variantOf, variantLabel, avatarUrl', async () => {
    await db.cards.add(makeCard('c1', 'Local', 1000));
    await restoreFullBackup(makeBackup({
      cards: [makeCard('c1', 'Incoming', 2000, {
        avatarUrl: 'https://example.test/avatar.png',
        testSuites: [{ id: 'suite-1' }] as never,
        scenarios: [{ id: 'scenario-1' }] as never,
        variantOf: 'parent-uuid',
        variantLabel: 'Variant A',
      })],
    }), 'merge');
    const stored = await db.cards.where('uuid').equals('c1').first();
    expect(stored?.name).toBe('Incoming');
    expect(stored?.avatarUrl).toBe('https://example.test/avatar.png');
    expect(stored?.testSuites).toEqual([{ id: 'suite-1' }]);
    expect(stored?.scenarios).toEqual([{ id: 'scenario-1' }]);
    expect(stored?.variantOf).toBe('parent-uuid');
    expect(stored?.variantLabel).toBe('Variant A');
  });

  it('a newer backup without testSuites, scenarios or avatarUrl does not erase the local ones', async () => {
    await db.cards.add(makeCard('c1', 'Local', 1000, {
      avatarUrl: 'local-avatar',
      testSuites: [{ id: 'suite-local' }] as never,
      scenarios: [{ id: 'scenario-local' }] as never,
    }));
    await restoreFullBackup(makeBackup({
      cards: [makeCard('c1', 'Incoming', 2000)],
    }), 'merge');
    const stored = await db.cards.where('uuid').equals('c1').first();
    expect(stored?.name).toBe('Incoming');
    expect(stored?.avatarUrl).toBe('local-avatar');
    expect(stored?.testSuites).toEqual([{ id: 'suite-local' }]);
    expect(stored?.scenarios).toEqual([{ id: 'scenario-local' }]);
  });

  it('seconds against milliseconds: the newer instant wins either way', async () => {
    await db.cards.add(makeCard('c-old', 'Local Newer', 1_800_000_000));
    await db.cards.add(makeCard('c-new', 'Local Older', 1_700_000_000));
    const summary = await restoreFullBackup(makeBackup({
      cards: [
        makeCard('c-old', 'Incoming Older', 1_700_000_000_000),
        makeCard('c-new', 'Incoming Newer', 1_800_000_000_000),
      ],
    }), 'merge');
    expect(summary.cardsKept).toBe(1);
    expect(summary.cardsCount).toBe(1);
    expect((await db.cards.where('uuid').equals('c-old').first())?.name).toBe('Local Newer');
    expect((await db.cards.where('uuid').equals('c-new').first())?.name).toBe('Incoming Newer');
  });

  it('lorebook: an older backup is kept, a newer one replaces', async () => {
    await db.lorebooks.add(makeLorebook('lb-old', 'Local Old', 2000));
    await db.lorebooks.add(makeLorebook('lb-new', 'Local New', 1000));
    const summary = await restoreFullBackup(makeBackup({
      lorebooks: [
        makeLorebook('lb-old', 'Incoming Old', 1000),
        makeLorebook('lb-new', 'Incoming New', 2000),
      ],
    }), 'merge');
    expect(summary.lorebooksKept).toBe(1);
    expect(summary.lorebooksCount).toBe(1);
    expect((await db.lorebooks.where('uuid').equals('lb-old').first())?.name).toBe('Local Old');
    expect((await db.lorebooks.where('uuid').equals('lb-new').first())?.name).toBe('Incoming New');
  });

  it('a local setting is kept, a missing setting is added, assistant_chats merges per uuid', async () => {
    await db.settings.put({ key: 'app_theme', value: 'light' });
    await db.settings.put({ key: 'assistant_chats', value: { 'card-a': { local: true } } });
    const summary = await restoreFullBackup(makeBackup({
      settings: [
        { key: 'app_theme', value: 'dark' },
        { key: 'some_new_key', value: 'added' },
        { key: 'assistant_chats', value: { 'card-a': { incoming: true }, 'card-b': { incoming: true } } },
      ],
    }), 'merge');
    expect((await db.settings.get('app_theme'))?.value).toBe('light');
    expect((await db.settings.get('some_new_key'))?.value).toBe('added');
    expect((await db.settings.get('assistant_chats'))?.value).toEqual({
      'card-a': { local: true },
      'card-b': { incoming: true },
    });
    expect(summary.settingsKept).toBe(1);
  });

  it('a card and a lorebook without uuid are counted as skipped, each with a note in errors', async () => {
    const noIdCard = { ...makeCard('x', 'NoIdCard', 1000), uuid: undefined };
    const noIdLb = { ...makeLorebook('y', 'NoIdBook', 1000), uuid: undefined };
    const summary = await restoreFullBackup(makeBackup({
      cards: [noIdCard as never],
      lorebooks: [noIdLb as never],
    }), 'merge');
    expect(summary.cardsSkipped).toBe(1);
    expect(summary.lorebooksSkipped).toBe(1);
    expect(summary.errors.some((e) => e.includes("Card 'NoIdCard' has no ID and was skipped."))).toBe(true);
    expect(summary.errors.some((e) => e.includes("Lorebook 'NoIdBook' has no ID and was skipped."))).toBe(true);
  });

  it('buildRestoreMessage starts with Database restored! and shows Kept/Skipped only when above 0', () => {
    const base = {
      cardsCount: 0, lorebooksCount: 0, profilesCount: 0, cardsSkipped: 0,
      cardsKept: 0, lorebooksKept: 0, lorebooksSkipped: 0, settingsKept: 0, errors: [],
    };
    const allKept = buildRestoreMessage({ ...base, cardsKept: 2, lorebooksKept: 1, settingsKept: 1 });
    expect(allKept.startsWith('Database restored!')).toBe(true);
    expect(allKept).toContain('Kept on this device (same or newer): 2 cards, 1 lorebooks, 1 settings.');
    expect(allKept).not.toContain('Skipped:');
    const nothing = buildRestoreMessage(base);
    expect(nothing.startsWith('Database restored!')).toBe(true);
    expect(nothing).not.toContain('Kept on this device');
    expect(nothing).not.toContain('Skipped:');
    const skipped = buildRestoreMessage({ ...base, cardsSkipped: 1, lorebooksSkipped: 1 });
    expect(skipped).toContain('Skipped: 1 cards, 1 lorebooks (no ID, or could not be saved).');
    expect(skipped).not.toContain('Kept on this device');
    const withErrors = buildRestoreMessage({ ...base, errors: ['Something broke'] });
    expect(withErrors).toContain('Notes / Warnings:\nSomething broke');
  });
});

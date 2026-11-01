// @vitest-environment jsdom
import '../test/setup';
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { db, stripRemovedProfileFields, REMOVED_PROFILE_FIELDS } from '../src/db';
import { createFullBackupJson, restoreFullBackup } from '../src/io/backup';

// Version 1-5 store strings, copied from src/db/index.ts.
const LEGACY_STORES = {
  cards: '++id, uuid, name, order, *tags, creator, creation_date, modification_date, variantOf',
  lorebooks: '++id, uuid, name, updatedAt',
  connectionProfiles: '++id, uuid, name, provider, isDefault',
  settings: 'key',
};

describe('profile cleanup', () => {
  it('upgrade: a version 5 database loses the five fields when the app db opens it', async () => {
    const legacy = new Dexie('CardCrucibleDB');
    legacy.version(5).stores(LEGACY_STORES);
    await legacy.table('connectionProfiles').add({
      uuid: 'prof-upgrade',
      name: 'Upgrade Profile',
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'UPGRADE_KEY',
      baseUrl: 'https://example.test/v1',
      temperature: 0.7,
      topP: 0.95,
      frequencyPenalty: 0.5,
      systemOverride: 'old override',
      customHeaders: '{"X-Test": "1"}',
      contextLimit: 8192,
    });
    await legacy.close();

    const stored = await db.connectionProfiles.where('uuid').equals('prof-upgrade').first();
    expect(stored).toBeDefined();
    const rec = stored as unknown as Record<string, unknown>;
    for (const k of REMOVED_PROFILE_FIELDS) {
      expect(rec[k]).toBeUndefined();
    }
    expect(stored?.name).toBe('Upgrade Profile');
    expect(stored?.provider).toBe('openai');
    expect(stored?.model).toBe('gpt-test');
    expect(stored?.temperature).toBe(0.7);
    expect(stored?.apiKey).toBe('UPGRADE_KEY');
    expect(stored?.baseUrl).toBe('https://example.test/v1');
    await db.connectionProfiles.clear();
  });

  it('stripRemovedProfileFields removes the five keys, keeps the rest, and does not change its input', () => {
    const input = {
      uuid: 'p1',
      name: 'P',
      topP: 0.9,
      frequencyPenalty: 0.1,
      systemOverride: 'x',
      customHeaders: '{}',
      contextLimit: 1000,
      temperature: 0.5,
    };
    const out = stripRemovedProfileFields(input);
    expect(out).toEqual({ uuid: 'p1', name: 'P', temperature: 0.5 });
    expect(input).toEqual({
      uuid: 'p1',
      name: 'P',
      topP: 0.9,
      frequencyPenalty: 0.1,
      systemOverride: 'x',
      customHeaders: '{}',
      contextLimit: 1000,
      temperature: 0.5,
    });
  });

  it('export with keys: allowlist only, no id, no stray key, stored key intact', async () => {
    await db.connectionProfiles.clear();
    await db.connectionProfiles.add({
      id: 99,
      uuid: 'prof-export',
      name: 'Export Profile',
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'SECRET_KEY',
      baseUrl: 'https://example.test/v1',
      temperature: 0.6,
      maxTokens: 4096,
      customPromptPricePer1K: 0.001,
      customCompletionPricePer1K: 0.002,
      topP: 0.9,
      frequencyPenalty: 0.2,
      systemOverride: 'old',
      customHeaders: '{}',
      contextLimit: 4096,
      secretNote: 'stray',
    } as never);
    const json = await createFullBackupJson(true);
    const parsed = JSON.parse(json) as { connectionProfiles: Record<string, unknown>[] };
    expect(parsed.connectionProfiles).toHaveLength(1);
    const prof = parsed.connectionProfiles[0];
    for (const k of REMOVED_PROFILE_FIELDS) {
      expect(prof[k]).toBeUndefined();
    }
    expect(prof.secretNote).toBeUndefined();
    expect(prof.id).toBeUndefined();
    expect(prof.apiKey).toBe('SECRET_KEY');
    expect(prof.baseUrl).toBe('https://example.test/v1');
    expect(prof.model).toBe('gpt-test');
    expect(prof.temperature).toBe(0.6);
    expect(prof.maxTokens).toBe(4096);
    expect(prof.customPromptPricePer1K).toBe(0.001);
    expect(prof.customCompletionPricePer1K).toBe(0.002);
    await db.connectionProfiles.clear();
  });

  it('export without keys: redacted only when the profile had a key, no five fields, no stray key', async () => {
    await db.connectionProfiles.clear();
    await db.connectionProfiles.add({
      uuid: 'prof-keyed',
      name: 'Keyed',
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'SECRET_KEY',
      topP: 0.9,
      secretNote: 'stray',
    } as never);
    await db.connectionProfiles.add({
      uuid: 'prof-keyless',
      name: 'Keyless',
      provider: 'ollama',
      model: 'llama-test',
    });
    const json = await createFullBackupJson(false);
    const parsed = JSON.parse(json) as { connectionProfiles: Record<string, unknown>[] };
    expect(parsed.connectionProfiles).toHaveLength(2);
    const keyed = parsed.connectionProfiles.find((p) => p.uuid === 'prof-keyed')!;
    const keyless = parsed.connectionProfiles.find((p) => p.uuid === 'prof-keyless')!;
    expect(keyed.apiKey).toBeUndefined();
    expect(keyed.apiKeyRedacted).toBe(true);
    expect(keyed.topP).toBeUndefined();
    expect(keyed.secretNote).toBeUndefined();
    expect(keyless.apiKey).toBeUndefined();
    expect(keyless.apiKeyRedacted).toBeUndefined();
    await db.connectionProfiles.clear();
  });

  it('old backup: a profile carrying all five fields restores cleanly in merge and overwrite', async () => {
    const backup = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      cards: [],
      lorebooks: [],
      connectionProfiles: [{
        uuid: 'prof-old',
        name: 'Old Profile',
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'OLD_KEY',
        topP: 0.9,
        frequencyPenalty: 0.2,
        systemOverride: 'old',
        customHeaders: '{}',
        contextLimit: 4096,
      }],
      settings: [],
    });
    await db.connectionProfiles.clear();
    const merged = await restoreFullBackup(backup, 'merge');
    expect(merged.profilesCount).toBe(1);
    expect(merged.errors).toEqual([]);
    let stored = await db.connectionProfiles.where('uuid').equals('prof-old').first();
    expect(stored?.apiKey).toBe('OLD_KEY');
    for (const k of REMOVED_PROFILE_FIELDS) {
      expect((stored as unknown as Record<string, unknown>)[k]).toBeUndefined();
    }
    await db.connectionProfiles.clear();
    const overwritten = await restoreFullBackup(backup, 'overwrite');
    expect(overwritten.profilesCount).toBe(1);
    expect(overwritten.errors).toEqual([]);
    stored = await db.connectionProfiles.where('uuid').equals('prof-old').first();
    for (const k of REMOVED_PROFILE_FIELDS) {
      expect((stored as unknown as Record<string, unknown>)[k]).toBeUndefined();
    }
    await db.connectionProfiles.clear();
  });
});

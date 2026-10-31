// @vitest-environment jsdom
import '../test/setup';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type StoredCard, type StoredLorebook } from '../src/db';
import { createFullBackupJson, restoreFullBackup, type FullBackupData } from '../src/io/backup';

function createMockStoredCard(uuid: string, name: string, tags: string[] = []): StoredCard {
  return {
    uuid,
    name,
    tags,
    creator: 'Tester',
    creation_date: Date.now(),
    modification_date: Date.now(),
    cardData: {
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
        tags,
        creator: 'Tester',
        character_version: '1.0',
        alternate_greetings: [],
        group_only_greetings: [],
        extensions: {},
      },
    },
  };
}

function createMockStoredLorebook(uuid: string, name: string): StoredLorebook {
  return {
    uuid,
    name,
    description: `${name} description`,
    updatedAt: Date.now(),
    lorebook: {
      entries: [],
      extensions: {},
    },
  };
}

describe('backup - restoreFullBackup security and merge behavior', () => {
  beforeEach(async () => {
    await db.cards.clear();
    await db.lorebooks.clear();
    await db.connectionProfiles.clear();
    await db.settings.clear();
  });

  const mockIncomingBackup: FullBackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: [
      createMockStoredCard('card-111', 'Incoming Card 1', ['hero']),
      createMockStoredCard('card-222', 'Incoming Card 2 (New)', ['npc']),
    ],
    lorebooks: [
      createMockStoredLorebook('lb-111', 'Incoming Lorebook'),
    ],
    connectionProfiles: [],
    settings: [
      { key: 'crypto_salt', value: 'INCOMING_SALT_999' },
      { key: 'crypto_hash', value: 'INCOMING_HASH_999' },
      { key: 'passkey_credential_id', value: 'INCOMING_PASSKEY_CRED_999' },
      { key: 'passkey_wrapped_key', value: 'INCOMING_WRAPPED_KEY_999' },
      { key: 'passkey_prf_salt', value: 'INCOMING_PRF_SALT_999' },
      { key: 'crypto_mode', value: 'passkey-only-v1' },
      { key: 'crypto_recovery_salt', value: 'INCOMING_RECOVERY_SALT_999' },
      { key: 'crypto_recovery_wrapped_key', value: 'INCOMING_RECOVERY_WRAP_999' },
      { key: 'crypto_recovery_confirmed', value: true },
      { key: 'storage_version', value: '2' },
    ],
  };

  it('merge mode preserves local cryptographic & passkey credentials while merging cards and lorebooks', async () => {
    // Seed local database with existing receiver security settings
    await db.settings.put({ key: 'crypto_salt', value: 'LOCAL_DEVICE_SALT_123' });
    await db.settings.put({ key: 'crypto_hash', value: 'LOCAL_DEVICE_HASH_123' });
    await db.settings.put({ key: 'passkey_credential_id', value: 'LOCAL_PASSKEY_CRED_123' });
    await db.settings.put({ key: 'passkey_wrapped_key', value: 'LOCAL_WRAPPED_KEY_123' });
    await db.settings.put({ key: 'passkey_prf_salt', value: 'LOCAL_PRF_SALT_123' });
    await db.settings.put({ key: 'crypto_mode', value: 'passkey-only-v1' });
    await db.settings.put({ key: 'crypto_recovery_salt', value: 'LOCAL_RECOVERY_SALT_123' });
    await db.settings.put({ key: 'crypto_recovery_wrapped_key', value: 'LOCAL_RECOVERY_WRAP_123' });
    await db.settings.put({ key: 'crypto_recovery_confirmed', value: true });

    // Seed local database with an existing card that shares uuid 'card-111'.
    // Its date is older than the incoming card's, so the backup still
    // replaces it under the strictly-newer rule.
    await db.cards.add({ ...createMockStoredCard('card-111', 'Local Existing Card 1', ['local']), modification_date: 1000 });

    // Run restore in merge mode
    const payloadJson = JSON.stringify(mockIncomingBackup);
    const summary = await restoreFullBackup(payloadJson, 'merge');

    expect(summary.cardsCount).toBe(2);
    expect(summary.lorebooksCount).toBe(1);

    // 1. Security settings must remain completely untouched on receiver
    const salt = await db.settings.get('crypto_salt');
    const hash = await db.settings.get('crypto_hash');
    const credId = await db.settings.get('passkey_credential_id');
    const wrapKey = await db.settings.get('passkey_wrapped_key');
    const prfSalt = await db.settings.get('passkey_prf_salt');

    expect(salt?.value).toBe('LOCAL_DEVICE_SALT_123');
    expect(hash?.value).toBe('LOCAL_DEVICE_HASH_123');
    expect(credId?.value).toBe('LOCAL_PASSKEY_CRED_123');
    expect(wrapKey?.value).toBe('LOCAL_WRAPPED_KEY_123');
    expect(prfSalt?.value).toBe('LOCAL_PRF_SALT_123');
    expect((await db.settings.get('crypto_mode'))?.value).toBe('passkey-only-v1');
    expect((await db.settings.get('crypto_recovery_salt'))?.value).toBe('LOCAL_RECOVERY_SALT_123');
    expect((await db.settings.get('crypto_recovery_wrapped_key'))?.value).toBe('LOCAL_RECOVERY_WRAP_123');
    expect((await db.settings.get('crypto_recovery_confirmed'))?.value).toBe(true);

    // Non-security settings (like storage_version) are merged
    const storageVer = await db.settings.get('storage_version');
    expect(storageVer?.value).toBe('2');

    // 2. Cards must be merged / updated
    const allCards = await db.cards.toArray();
    expect(allCards.length).toBe(2);

    const updatedCard1 = await db.cards.where('uuid').equals('card-111').first();
    expect(updatedCard1?.name).toBe('Incoming Card 1');

    const newCard2 = await db.cards.where('uuid').equals('card-222').first();
    expect(newCard2?.name).toBe('Incoming Card 2 (New)');

    // 3. Lorebooks merged
    const allLorebooks = await db.lorebooks.toArray();
    expect(allLorebooks.length).toBe(1);
    expect(allLorebooks[0].name).toBe('Incoming Lorebook');
  });

  it('overwrite mode replaces all settings including security credentials, cards, and lorebooks', async () => {
    // Seed local database with existing receiver security settings
    await db.settings.put({ key: 'crypto_salt', value: 'LOCAL_DEVICE_SALT_123' });
    await db.settings.put({ key: 'crypto_hash', value: 'LOCAL_DEVICE_HASH_123' });
    await db.settings.put({ key: 'passkey_credential_id', value: 'LOCAL_PASSKEY_CRED_123' });

    // Seed local card that should be wiped
    await db.cards.add(createMockStoredCard('card-old-to-wipe', 'Old Card'));

    // Run restore in overwrite mode
    const payloadJson = JSON.stringify(mockIncomingBackup);
    const summary = await restoreFullBackup(payloadJson, 'overwrite');

    expect(summary.cardsCount).toBe(2);
    expect(summary.lorebooksCount).toBe(1);

    // In overwrite mode, incoming security settings overwrite everything
    const salt = await db.settings.get('crypto_salt');
    const hash = await db.settings.get('crypto_hash');
    const credId = await db.settings.get('passkey_credential_id');
    const wrapKey = await db.settings.get('passkey_wrapped_key');
    const prfSalt = await db.settings.get('passkey_prf_salt');

    expect(salt?.value).toBe('INCOMING_SALT_999');
    expect(hash?.value).toBe('INCOMING_HASH_999');
    expect(credId?.value).toBe('INCOMING_PASSKEY_CRED_999');
    expect(wrapKey?.value).toBe('INCOMING_WRAPPED_KEY_999');
    expect(prfSalt?.value).toBe('INCOMING_PRF_SALT_999');
    expect((await db.settings.get('crypto_mode'))?.value).toBe('passkey-only-v1');
    expect((await db.settings.get('crypto_recovery_salt'))?.value).toBe('INCOMING_RECOVERY_SALT_999');
    expect((await db.settings.get('crypto_recovery_wrapped_key'))?.value).toBe('INCOMING_RECOVERY_WRAP_999');
    expect((await db.settings.get('crypto_recovery_confirmed'))?.value).toBe(true);

    // Old card was cleared, only incoming cards remain
    const allCards = await db.cards.toArray();
    expect(allCards.length).toBe(2);
    expect(allCards.find((c) => c.uuid === 'card-old-to-wipe')).toBeUndefined();
  });
  it('omits device-bound vault credentials from default backups and includes them only by explicit opt-in', async () => {
    const sensitiveSettings = [
      { key: 'crypto_salt', value: 'salt' },
      { key: 'crypto_hash', value: 'hash' },
      { key: 'crypto_mode', value: 'passkey-only-v1' },
      { key: 'crypto_recovery_salt', value: 'recovery-salt' },
      { key: 'crypto_recovery_wrapped_key', value: 'wrapped-recovery-key' },
      { key: 'crypto_recovery_confirmed', value: true },
      { key: 'passkey_credential_id', value: 'credential-id' },
      { key: 'passkey_wrapped_key', value: 'wrapped-vault-key' },
      { key: 'passkey_prf_salt', value: 'prf-salt' },
    ];
    await db.settings.bulkPut([
      ...sensitiveSettings,
      { key: 'app_theme', value: 'dark' },
    ]);

    const ordinary = JSON.parse(await createFullBackupJson(false)) as FullBackupData;
    const ordinaryKeys = (ordinary.settings || []).map((setting) => setting.key);
    expect(ordinaryKeys).toContain('app_theme');
    for (const setting of sensitiveSettings) {
      expect(ordinaryKeys).not.toContain(setting.key);
      expect(JSON.stringify(ordinary)).not.toContain(String(setting.value));
    }

    const withKeys = JSON.parse(await createFullBackupJson(true)) as FullBackupData;
    const includedKeys = (withKeys.settings || []).map((setting) => setting.key);
    for (const setting of sensitiveSettings) {
      expect(includedKeys).toContain(setting.key);
    }
  });


});

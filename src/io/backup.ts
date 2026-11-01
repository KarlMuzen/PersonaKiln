import JSZip from 'jszip';
import { db, stripRemovedProfileFields, type StoredCard, type StoredLorebook, type ConnectionProfile, type AppSetting } from '../db';
import { decryptText } from '../utils/crypto';
import { useCardStore } from '../store/useCardStore';
import { buf2b64, b642buf } from '../utils/binaryEncoding';
import { validateBackupData } from '../schemas/backupSchema';

const DEVICE_SECURITY_SETTING_KEYS = new Set([
  'crypto_salt',
  'crypto_hash',
  'crypto_mode',
  'crypto_recovery_salt',
  'crypto_recovery_wrapped_key',
  'crypto_recovery_confirmed',
  'passkey_credential_id',
  'passkey_wrapped_key',
  'passkey_prf_salt',
]);

export interface FullBackupData {
  version: number;
  exportedAt: string;
  cards: StoredCard[];
  lorebooks: StoredLorebook[];
  connectionProfiles: ConnectionProfile[];
  settings?: AppSetting[];
}

function normalizeAssetToUint8Array(val: any): Uint8Array | null {
  if (!val) return null;
  if (val instanceof Uint8Array) return val;
  if (typeof val === 'string') {
    try {
      // Check if data URL or base64
      const clean = val.includes(',') ? val.split(',')[1] : val;
      return b642buf(clean);
    } catch {
      return null;
    }
  }
  if (typeof val === 'object') {
    // Check if plain object with numeric keys like {"0": 137, "1": 80}
    const keys = Object.keys(val);
    if (keys.length > 0 && keys.every((k) => !isNaN(Number(k)))) {
      const arr = new Uint8Array(keys.length);
      for (let i = 0; i < keys.length; i++) {
        arr[i] = Number(val[i]);
      }
      return arr;
    }
  }
  return null;
}

// Profiles are exported from an allowlist only: the five removed fields, the
// database id and any stray key never leave the device in a backup file.
const PROFILE_EXPORT_KEYS = [
  'uuid', 'name', 'provider', 'model', 'baseUrl', 'isDefault',
  'temperature', 'maxTokens', 'customPromptPricePer1K', 'customCompletionPricePer1K',
] as const;

export async function createFullBackupJson(includeApiKeys: boolean = false): Promise<string> {
  const cards = await db.cards.toArray();
  const lorebooks = await db.lorebooks.toArray();
  const connectionProfiles = await db.connectionProfiles.toArray();
  // Device-bound vault credentials travel only when the user explicitly includes API keys.
  const settings = (await db.settings.toArray()).filter(
    (setting) => includeApiKeys || !DEVICE_SECURITY_SETTING_KEYS.has(setting.key)
  );

  const serializableCards = cards.map((card) => {
    if (!card.embeddedAssets) return card;
    const assetsCopy: Record<string, any> = {};
    for (const [uri, binary] of Object.entries(card.embeddedAssets)) {
      if (binary instanceof Uint8Array) {
        assetsCopy[uri] = `raw.b64.${buf2b64(binary)}`;
      } else {
        const norm = normalizeAssetToUint8Array(binary);
        if (norm) {
          assetsCopy[uri] = `raw.b64.${buf2b64(norm)}`;
        }
      }
    }
    return { ...card, embeddedAssets: assetsCopy as any };
  });

  const processedProfiles = connectionProfiles.map((prof) => {
    const out: Record<string, unknown> = {};
    for (const k of PROFILE_EXPORT_KEYS) {
      const v = (prof as unknown as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = v;
    }
    if (includeApiKeys) {
      if (prof.apiKey !== undefined) out.apiKey = prof.apiKey;
    } else if (prof.apiKey) {
      out.apiKeyRedacted = true;
    }
    return out as unknown as ConnectionProfile;
  });

  const backup: FullBackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: serializableCards,
    lorebooks,
    connectionProfiles: processedProfiles,
    settings,
  };

  return JSON.stringify(backup, null, 2);
}

export async function createFullBackupZip(includeApiKeys: boolean = false): Promise<Uint8Array> {
  const zip = new JSZip();
  const jsonStr = await createFullBackupJson(includeApiKeys);
  zip.file('backup.json', jsonStr);

  const cards = await db.cards.toArray();
  const assetsFolder = zip.folder('assets');
  if (assetsFolder) {
    for (const card of cards) {
      if (card.embeddedAssets) {
        for (const [uri, binary] of Object.entries(card.embeddedAssets)) {
          const norm = normalizeAssetToUint8Array(binary);
          if (norm) {
            const cleanPath = `${card.uuid}/${uri.replace(/^embeded:\/\//, '')}`;
            assetsFolder.file(cleanPath, norm);
          }
        }
      }
    }
  }

  return await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

// Merge-mode date rule: only a strictly newer backup copy replaces the local
// one. Dates arrive in seconds (the app) or milliseconds (imports), so both
// are normalised to seconds first. Missing, zero, negative or non-numeric
// dates count as 0, which never beats a local date.
function toSeconds(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 0;
  if (v > 100_000_000_000) return Math.floor(v / 1000);
  return v;
}

function backupIsNewer(local: unknown, incoming: unknown): boolean {
  return toSeconds(incoming) > toSeconds(local);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const MAX_BACKUP_PAYLOAD_SIZE = 200 * 1024 * 1024; // 200 MB

export async function parseBackupPayload(input: string | Uint8Array): Promise<FullBackupData> {
  const inputByteLength = typeof input === 'string' ? new TextEncoder().encode(input).byteLength : input.byteLength;
  if (inputByteLength > MAX_BACKUP_PAYLOAD_SIZE) {
    throw new Error(`Payload size (${Math.round(inputByteLength / 1024 / 1024)}MB) exceeds maximum limit of 200MB.`);
  }

  if (typeof input === 'string') {
    return validateBackupData(JSON.parse(input)).data;
  }

  if (input.length >= 4 && input[0] === 0x50 && input[1] === 0x4b && input[2] === 0x03 && input[3] === 0x04) {
    const zip = await JSZip.loadAsync(input);
    const backupFile = zip.file('backup.json');
    if (backupFile) {
      const text = await backupFile.async('text');
      return validateBackupData(JSON.parse(text)).data;
    }
    throw new Error('Invalid backup ZIP: backup.json not found inside archive.');
  }

  const text = new TextDecoder('utf-8').decode(input);
  return validateBackupData(JSON.parse(text)).data;
}

export async function restoreFullBackup(
  input: string | Uint8Array,
  mode: 'overwrite' | 'merge' = 'merge'
): Promise<{
  cardsCount: number;
  lorebooksCount: number;
  profilesCount: number;
  cardsSkipped: number;
  cardsKept: number;
  lorebooksKept: number;
  lorebooksSkipped: number;
  settingsKept: number;
  errors: string[];
}> {
  let backupData: FullBackupData | null = null;
  const zipAssetsMap: Record<string, Record<string, Uint8Array>> = {}; // cardUuid -> { uri -> Uint8Array }
  const errors: string[] = [];

  const validateParsedBackup = (raw: unknown): FullBackupData => {
    const validation = validateBackupData(raw);
    errors.push(...validation.warnings);
    return validation.data;
  };

  // Check input payload length
  const inputByteLength = typeof input === 'string' ? new TextEncoder().encode(input).byteLength : input.byteLength;
  if (inputByteLength > MAX_BACKUP_PAYLOAD_SIZE) {
    throw new Error(`Restore failed: Backup payload size (${Math.round(inputByteLength / 1024 / 1024)}MB) exceeds maximum limit of 200MB.`);
  }

  if (typeof input === 'string') {
    backupData = validateParsedBackup(JSON.parse(input));
  } else {
    if (input.length >= 4 && input[0] === 0x50 && input[1] === 0x4b && input[2] === 0x03 && input[3] === 0x04) {
      const zip = await JSZip.loadAsync(input);
      const backupFile = zip.file('backup.json');
      if (backupFile) {
        const text = await backupFile.async('text');
        backupData = validateParsedBackup(JSON.parse(text));
      } else {
        throw new Error('Invalid backup ZIP: backup.json not found inside archive.');
      }

      // Read assets folder entries if present
      const assetsFolder = zip.folder('assets');
      if (assetsFolder) {
        for (const [relativePath, file] of Object.entries(assetsFolder.files)) {
          if (file.dir) continue;
          // Path format: assets/<cardUuid>/<assetPath>
          const cleanPath = relativePath.replace(/^assets\//, '');
          const slashIdx = cleanPath.indexOf('/');
          if (slashIdx > 0) {
            const cardUuid = cleanPath.substring(0, slashIdx);
            const assetPath = cleanPath.substring(slashIdx + 1);
            if (assetPath) {
              const binary = await file.async('uint8array');
              const uri = assetPath.startsWith('embeded://') ? assetPath : `embeded://${assetPath}`;
              if (!zipAssetsMap[cardUuid]) {
                zipAssetsMap[cardUuid] = {};
              }
              zipAssetsMap[cardUuid][uri] = binary;
            }
          }
        }
      }
    } else {
      const text = new TextDecoder('utf-8').decode(input);
      backupData = validateParsedBackup(JSON.parse(text));
    }
  }



  const incomingSettings = backupData.settings || [];
  const incomingSettingValue = (key: string) => incomingSettings.find((setting) => setting.key === key)?.value;
  const hasIncomingPassphraseVault =
    Boolean(incomingSettingValue('crypto_salt')) && Boolean(incomingSettingValue('crypto_hash'));
  const hasIncomingPasskeyVault =
    incomingSettingValue('crypto_mode') === 'passkey-only-v1' &&
    Boolean(incomingSettingValue('passkey_credential_id')) &&
    Boolean(incomingSettingValue('passkey_wrapped_key')) &&
    Boolean(incomingSettingValue('passkey_prf_salt'));
  const hasIncomingSecurityMetadata = incomingSettings.some((setting) =>
    DEVICE_SECURITY_SETTING_KEYS.has(setting.key)
  );

  if (mode === 'overwrite' && hasIncomingSecurityMetadata && !hasIncomingPassphraseVault && !hasIncomingPasskeyVault) {
    throw new Error('Backup contains incomplete API-key vault metadata. The restore was stopped to avoid mixing incompatible encryption settings.');
  }

  // Only a full overwrite backup that explicitly includes API-key protection metadata can
  // safely restore encrypted API keys. In this case, keep the encrypted key records and switch
  // the in-memory session to the imported vault after the database transaction completes.
  const restoringIncomingVault =
    mode === 'overwrite' && (hasIncomingPassphraseVault || hasIncomingPasskeyVault);

  let cardsCount = 0;
  let cardsSkipped = 0;
  let cardsKept = 0;
  let lorebooksCount = 0;
  let lorebooksKept = 0;
  let lorebooksSkipped = 0;
  let profilesCount = 0;
  let settingsKept = 0;

  await db.transaction('rw', [db.cards, db.lorebooks, db.connectionProfiles, db.settings], async () => {
    if (mode === 'overwrite') {
      await db.cards.clear();
      await db.lorebooks.clear();
      await db.connectionProfiles.clear();

      if (restoringIncomingVault) {
        // Do not combine a source vault with stale credentials from the receiving device.
        for (const key of DEVICE_SECURITY_SETTING_KEYS) {
          await db.settings.delete(key);
        }
      }
    }

    if (Array.isArray(backupData.cards)) {
      for (const card of backupData.cards) {
        if (!card.uuid) {
          cardsSkipped++;
          errors.push(`Card '${card.name || 'unnamed'}' has no ID and was skipped.`);
          continue;
        }
        try {
          // Restore / deserialize embedded assets
          const restoredAssets: Record<string, Uint8Array> = {};

          // First populate from JSON card.embeddedAssets
          if (card.embeddedAssets && typeof card.embeddedAssets === 'object') {
            for (const [uri, val] of Object.entries(card.embeddedAssets)) {
              let cleanVal: unknown = val;
              if (typeof val === 'string') {
                if ((val as string).startsWith('raw.b64.')) {
                  cleanVal = (val as string).substring(8);
                } else if ((val as string).startsWith('enc.b64.')) {
                  cleanVal = (val as string).substring(8);
                }
              }
              const norm = normalizeAssetToUint8Array(cleanVal);
              if (norm) {
                restoredAssets[uri] = norm;
              }
            }
          }

          // Merge zipAssetsMap if available for this card
          if (zipAssetsMap[card.uuid]) {
            for (const [uri, binary] of Object.entries(zipAssetsMap[card.uuid])) {
              restoredAssets[uri] = binary;
            }
          }

          card.embeddedAssets = restoredAssets;

          const existing = await db.cards.where('uuid').equals(card.uuid).first();
          if (existing && existing.id) {
            // An existing card is replaced only by a strictly newer backup
            // copy; an older, equal or undated copy leaves the local card
            // untouched. In overwrite mode the table was just cleared, so
            // only duplicates inside the file itself reach this branch.
            if (backupIsNewer(existing.modification_date, card.modification_date)) {
              const update: Partial<StoredCard> = {};
              if (card.name !== undefined) update.name = card.name;
              update.tags = card.tags || [];
              update.creator = card.creator || '';
              if (card.creation_date !== undefined) update.creation_date = card.creation_date;
              if (card.modification_date !== undefined) update.modification_date = card.modification_date;
              if (card.order !== undefined) update.order = card.order;
              if (card.cardData !== undefined) update.cardData = card.cardData;
              if (card.snapshots !== undefined) update.snapshots = card.snapshots;
              if (card.avatarUrl !== undefined) update.avatarUrl = card.avatarUrl;
              if (card.testSuites !== undefined) update.testSuites = card.testSuites;
              if (card.scenarios !== undefined) update.scenarios = card.scenarios;
              if (card.variantOf !== undefined) update.variantOf = card.variantOf;
              if (card.variantLabel !== undefined) update.variantLabel = card.variantLabel;
              if (Object.keys(restoredAssets).length > 0) update.embeddedAssets = restoredAssets;
              await db.cards.update(existing.id, update);
              cardsCount++;
            } else {
              cardsKept++;
            }
          } else {
            const rec = { ...card };
            delete rec.id;
            await db.cards.add(rec);
            cardsCount++;
          }
        } catch (err: any) {
          cardsSkipped++;
          errors.push(`Card '${card.name || card.uuid}' skipped: ${err.message}`);
        }
      }
    }

    if (Array.isArray(backupData.lorebooks)) {
      for (const lb of backupData.lorebooks) {
        if (!lb.uuid) {
          lorebooksSkipped++;
          errors.push(`Lorebook '${lb.name || 'unnamed'}' has no ID and was skipped.`);
          continue;
        }
        try {
          const existing = await db.lorebooks.where('uuid').equals(lb.uuid).first();
          if (existing && existing.id) {
            if (backupIsNewer(existing.updatedAt, lb.updatedAt)) {
              const update: Record<string, unknown> = {};
              if (lb.name !== undefined) update.name = lb.name;
              if (lb.description !== undefined) update.description = lb.description;
              if (lb.lorebook !== undefined) update.lorebook = lb.lorebook;
              if (lb.updatedAt !== undefined) update.updatedAt = lb.updatedAt;
              await db.lorebooks.update(existing.id, update);
              lorebooksCount++;
            } else {
              lorebooksKept++;
            }
          } else {
            const rec = { ...lb };
            delete rec.id;
            await db.lorebooks.add(rec);
            lorebooksCount++;
          }
        } catch (err: any) {
          lorebooksSkipped++;
          errors.push(`Lorebook '${lb.name || lb.uuid}' skipped: ${err.message}`);
        }
      }
    }

    if (Array.isArray(backupData.connectionProfiles)) {
      for (const prof of backupData.connectionProfiles) {
        if (!prof.uuid) continue;
        try {
          const rec: ConnectionProfile & { apiKeyRedacted?: boolean } = stripRemovedProfileFields({ ...prof });
          delete rec.id;

          const isRedacted = Boolean(rec.apiKeyRedacted);
          delete rec.apiKeyRedacted;

          let keyNeedsReentry = false;

          if (isRedacted) {
            rec.apiKey = undefined;
            keyNeedsReentry = true;
          } else if (rec.apiKey && rec.apiKey.startsWith('enc.v1.') && !restoringIncomingVault) {
            const cryptoKey = useCardStore.getState().cryptoKey;
            let canDecrypt = false;
            if (cryptoKey) {
              try {
                await decryptText(rec.apiKey, cryptoKey);
                canDecrypt = true;
              } catch {
                canDecrypt = false;
              }
            }
            if (!canDecrypt) {
              rec.apiKey = undefined;
              keyNeedsReentry = true;
            }
          }

          const existing = await db.connectionProfiles.where('uuid').equals(prof.uuid).first();
          if (existing && existing.id) {
            // Never put an undefined value in a profile update: Dexie treats
            // undefined in an update as a delete, which is how a keyless
            // backup used to erase a saved local API key. With the apiKey
            // key removed, the local key stays untouched.
            for (const key of Object.keys(rec)) {
              if ((rec as unknown as Record<string, unknown>)[key] === undefined) {
                delete (rec as unknown as Record<string, unknown>)[key];
              }
            }
            await db.connectionProfiles.update(existing.id, rec);
            if (keyNeedsReentry && !existing.apiKey) {
              errors.push(`Connection profile '${prof.name || prof.uuid}': API key needs to be re-entered.`);
            }
          } else {
            await db.connectionProfiles.add(rec);
            if (keyNeedsReentry) {
              errors.push(`Connection profile '${prof.name || prof.uuid}': API key needs to be re-entered.`);
            }
          }
          profilesCount++;
        } catch (err: any) {
          errors.push(`Profile '${prof.name || prof.uuid}' skipped: ${err.message}`);
        }
      }
    }

    if (Array.isArray(backupData.settings)) {
      for (const st of backupData.settings) {
        if (st.key) {
          // In merge mode, skip security/cryptographic credentials so that the receiving device's
          // own master passphrase, PBKDF2 salt, and passkey registration remain untouched. Overwriting
          // them would corrupt the local key derivation parameters and permanently render existing
          // encrypted API keys undecryptable.
          if (
            mode === 'merge' &&
            DEVICE_SECURITY_SETTING_KEYS.has(st.key)
          ) {
            continue;
          }
          if (mode === 'merge') {
            // Merge mode never overwrites a local setting. assistant_chats
            // merges per card uuid with the local chat winning; anything
            // else that already exists locally is kept and counted.
            const local = await db.settings.get(st.key);
            try {
              if (st.key === 'assistant_chats' && isPlainObject(st.value) && local && isPlainObject(local.value)) {
                const merged = { ...st.value, ...local.value };
                const addsUuid = Object.keys(merged).some((k) => !(k in (local.value as Record<string, unknown>)));
                if (addsUuid) {
                  await db.settings.put({ key: st.key, value: merged });
                } else {
                  settingsKept++;
                }
              } else if (local) {
                settingsKept++;
              } else {
                await db.settings.put(st);
              }
            } catch (err: any) {
              errors.push(`Setting '${st.key}' could not be saved: ${err.message}`);
            }
          } else {
            try {
              await db.settings.put(st);
            } catch (err: any) {
              // ignore
            }
          }
        }
      }
    }
  });

  if (restoringIncomingVault) {
    // The old in-memory key must not be used against the newly restored vault.
    const store = useCardStore.getState();
    store.lockSession();
    await store.checkPassphraseSetup();
    await store.loadProfilesFromDb();
  }

  return { cardsCount, lorebooksCount, profilesCount, cardsSkipped, cardsKept, lorebooksKept, lorebooksSkipped, settingsKept, errors };
}

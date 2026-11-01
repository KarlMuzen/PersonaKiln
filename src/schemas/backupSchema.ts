import type { ConnectionProfile } from '../db';
import type { FullBackupData } from '../io/backup';

const PROFILE_PROVIDERS = new Set<ConnectionProfile['provider']>([
  'gemini', 'openai', 'anthropic', 'openrouter', 'ollama', 'custom',
]);

const OPTIONAL_PROFILE_STRING_FIELDS = ['apiKey', 'baseUrl'] as const;
const OPTIONAL_PROFILE_BOOLEAN_FIELDS = ['apiKeyRedacted', 'isDefault'] as const;
const OPTIONAL_PROFILE_NUMBER_FIELDS = [
  'id', 'temperature', 'maxTokens',
  'customPromptPricePer1K', 'customCompletionPricePer1K',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isConnectionProfile(value: unknown): value is ConnectionProfile {
  if (!isRecord(value)) return false;
  if (typeof value.uuid !== 'string' || value.uuid.length === 0) return false;
  if (typeof value.name !== 'string') return false;
  if (typeof value.provider !== 'string' || !PROFILE_PROVIDERS.has(value.provider as ConnectionProfile['provider'])) return false;
  if (typeof value.model !== 'string') return false;
  for (const field of OPTIONAL_PROFILE_STRING_FIELDS) {
    if (field in value && typeof value[field] !== 'string') return false;
  }
  for (const field of OPTIONAL_PROFILE_BOOLEAN_FIELDS) {
    if (field in value && typeof value[field] !== 'boolean') return false;
  }
  for (const field of OPTIONAL_PROFILE_NUMBER_FIELDS) {
    if (field in value && (typeof value[field] !== 'number' || !Number.isFinite(value[field]))) return false;
  }
  return true;
}

function isSetting(value: unknown): value is { key: string; value: unknown } {
  if (!isRecord(value)) return false;
  if (typeof value.key !== 'string' || value.key.length === 0) return false;
  if (!Object.prototype.hasOwnProperty.call(value, 'value')) return false;
  if (value.key === 'crypto_mode' && typeof value.value !== 'string') return false;
  return true;
}

function warningLabel(value: unknown, field: 'name' | 'key'): string {
  if (isRecord(value) && typeof value[field] === 'string' && value[field].length > 0) {
    return value[field] as string;
  }
  return 'unknown';
}

function skippedWarning(count: number, singular: string, plural: string, labelPrefix: string, labels: string[]): string {
  const examples = labels.slice(0, 2).map((label) => JSON.stringify(label)).join(', ');
  return `Skipped ${count} ${count === 1 ? singular : plural} with invalid data (${labelPrefix}: ${examples}).`;
}

export function validateBackupData(raw: unknown): { data: FullBackupData; warnings: string[] } {
  if (!isRecord(raw) || !Array.isArray(raw.cards)) {
    throw new Error('Invalid backup file: Missing cards list.');
  }
  for (const field of ['lorebooks', 'connectionProfiles', 'settings'] as const) {
    if (field in raw && !Array.isArray(raw[field])) {
      throw new Error(`Invalid backup file: ${field} must be a list.`);
    }
  }

  const data = { ...raw } as unknown as FullBackupData;
  const warnings: string[] = [];

  if (Array.isArray(raw.connectionProfiles)) {
    const profiles = raw.connectionProfiles;
    const validProfiles = profiles.filter(isConnectionProfile);
    const invalidProfiles = profiles.filter((profile) => !isConnectionProfile(profile));
    data.connectionProfiles = validProfiles;
    if (invalidProfiles.length > 0) {
      warnings.push(skippedWarning(
        invalidProfiles.length, 'connection profile', 'connection profiles', 'first',
        invalidProfiles.map((profile) => warningLabel(profile, 'name')),
      ));
    }
  }

  if (Array.isArray(raw.settings)) {
    const settings = raw.settings;
    const validSettings = settings.filter(isSetting);
    const invalidSettings = settings.filter((setting) => !isSetting(setting));
    data.settings = validSettings as FullBackupData['settings'];
    if (invalidSettings.length > 0) {
      warnings.push(skippedWarning(
        invalidSettings.length, 'setting', 'settings', 'first key',
        invalidSettings.map((setting) => warningLabel(setting, 'key')),
      ));
    }
  }
  return { data, warnings };
}

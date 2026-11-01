import type { CharacterCardV3 } from '../schemas/cardSchema';

const DEFAULT_VAL_MAP: Record<string, string> = {
  // lorebook / entry fields
  use_regex: 'false',
  enabled: 'true',
  insertion_order: '100',
  case_sensitive: 'false',
  constant: 'false',
  selective: 'false',
  position: 'undefined',
  priority: 'undefined',
  keys: 'empty array',
  secondary_keys: 'empty array',
  content: 'empty string',
  comment: 'empty string',
  name: 'empty string',
  id: 'undefined',
  extensions: 'empty object',

  // asset fields
  type: "'image'",
  uri: "'ccdefault:'",
  ext: "'png'",

  // card fields
  assets: 'empty array',
  tags: 'empty array',
  alternate_greetings: 'empty array',
  group_only_greetings: 'empty array',
  source: 'empty array',
  creator_notes_multilingual: 'empty object',
  character_book: 'null',
  nickname: 'empty string',
  description: 'empty string',
  personality: 'empty string',
  scenario: 'empty string',
  first_mes: 'empty string',
  mes_example: 'empty string',
  creator_notes: 'empty string',
  system_prompt: 'empty string',
  post_history_instructions: 'empty string',
  creator: 'empty string',
  character_version: 'empty string',
};

export function summarizeDefaultedFields(fields: string[]): string[] {
  if (!fields || fields.length === 0) return [];

  const counts = new Map<string, number>();
  for (const rawPath of fields) {
    if (!rawPath) continue;
    const norm = rawPath.replace(/\[\d+\]/g, '[*]');
    counts.set(norm, (counts.get(norm) || 0) + 1);
  }

  const result: string[] = [];

  for (const [normPath, count] of counts.entries()) {
    if (normPath.includes('[*]')) {
      // Array-indexed path (e.g. character_book.entries[*].use_regex)
      const match = normPath.match(/^(.*?)(?:\[\*\])(?:\.(.+))?$/);
      if (match) {
        const prefix = match[1];
        const fieldName = match[2];

        let contextLabel = 'items';
        if (prefix === 'character_book.entries' || prefix.endsWith('.entries') || prefix === 'entries') {
          contextLabel = count === 1 ? 'lorebook entry' : 'lorebook entries';
        } else if (prefix === 'assets') {
          contextLabel = count === 1 ? 'asset' : 'assets';
        } else {
          const cleanPrefix = prefix.split('.').pop() || prefix;
          contextLabel = count === 1 ? `${cleanPrefix} item` : `${cleanPrefix} items`;
        }

        if (fieldName) {
          const defaultDesc = DEFAULT_VAL_MAP[fieldName] || 'default value';
          result.push(`${count} ${contextLabel} missing \`${fieldName}\` — defaulted to ${defaultDesc}`);
        } else {
          result.push(`${count} ${contextLabel} — defaulted`);
        }
      } else {
        result.push(`${count} array items defaulted in ${normPath}`);
      }
    } else {
      // Non-array-indexed path (e.g. "assets", "nickname")
      const fieldName = normPath.split('.').pop() || normPath;
      const defaultDesc = DEFAULT_VAL_MAP[normPath] || DEFAULT_VAL_MAP[fieldName] || 'default value';
      result.push(`${normPath} — defaulted to ${defaultDesc}`);
    }
  }

  return result;
}

export function getDefaultedFields(original: unknown, validated: unknown, path = ''): string[] {
  const defaulted: string[] = [];
  if (!original || typeof original !== 'object') return defaulted;
  if (!validated || typeof validated !== 'object') return defaulted;
  
  const origObj = original as Record<string, unknown>;
  const valObj = validated as Record<string, unknown>;

  for (const key in valObj) {
    const currentPath = path ? `${path}.${key}` : key;
    if (!(key in origObj) || origObj[key] === undefined) {
      defaulted.push(currentPath);
    } else if (Array.isArray(valObj[key])) {
      const origArray = Array.isArray(origObj[key]) ? (origObj[key] as unknown[]) : [];
      (valObj[key] as unknown[]).forEach((item: unknown, index: number) => {
        if (typeof item === 'object' && item !== null) {
          defaulted.push(...getDefaultedFields(origArray[index] || {}, item, `${currentPath}[${index}]`));
        }
      });
    } else if (typeof valObj[key] === 'object' && valObj[key] !== null) {
      defaulted.push(...getDefaultedFields(origObj[key], valObj[key], currentPath));
    }
  }
  return defaulted;
}

export function validateCardCompleteness(card: CharacterCardV3 | null): string[] {
  if (!card) return [];
  const warnings: string[] = [];
  const d = card.data;
  if (!d.name?.trim()) warnings.push('Character Name is missing.');
  if (!d.description?.trim()) warnings.push('Description is missing.');
  if (!d.first_mes?.trim()) warnings.push('First Greeting Message is missing.');
  return warnings;
}

export function getCardInfoNotes(card: CharacterCardV3 | null): string[] {
  if (!card) return [];
  const d = card.data;
  // Chub cards fold personality traits into Description by convention,
  // so the personality-empty note is suppressed when extensions.chub is present.
  const isChub = Boolean(d.extensions?.chub);
  if (!isChub && !d.personality?.trim()) {
    return ['Personality is empty. It is optional; many cards put it in Description.'];
  }
  return [];
}

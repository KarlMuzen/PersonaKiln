import { z } from 'zod';
import { LIMITS } from './limits';

// Bounded Extensions helper for Storage
const BoundedExtensionsSchema = z.record(z.string(), z.any()).default({}).superRefine((val, ctx) => {
  try {
    const size = JSON.stringify(val).length;
    if (size > LIMITS.EXTENSIONS_JSON_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Extensions payload (${size} bytes) exceeds maximum allowed limit of ${LIMITS.EXTENSIONS_JSON_BYTES} bytes.`,
      });
    }
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Extensions object is not valid JSON serializable.',
    });
  }
});

// ==========================================
// LOREBOOK ENTRY SCHEMA (CCv3)
// ==========================================
export const LorebookEntrySchema = z.object({
  keys: z.union([z.array(z.string()), z.string()]).transform((val) => {
    if (Array.isArray(val)) return val.map((k) => String(k).trim()).filter(Boolean);
    if (typeof val === 'string') return val.split(',').map((s) => s.trim()).filter(Boolean);
    return [];
  }).default([]),
  content: z.string().default(''),
  extensions: z.record(z.string(), z.any()).default({}),
  enabled: z.boolean().default(true),
  insertion_order: z.union([z.number(), z.string()]).transform((val) => {
    if (typeof val === 'number') return val;
    const parsed = parseInt(String(val), 10);
    return isNaN(parsed) ? 100 : parsed;
  }).default(100),
  case_sensitive: z.boolean().optional(),
  use_regex: z.boolean().default(false),
  constant: z.boolean().optional(),

  // Optional Fields
  name: z.string().optional(),
  priority: z.number().optional(),
  id: z.union([z.number(), z.string()]).optional(),
  comment: z.string().optional(),
  selective: z.boolean().optional(),
  secondary_keys: z.union([z.array(z.string()), z.string()]).transform((val) => {
    if (Array.isArray(val)) return val.map((k) => String(k).trim()).filter(Boolean);
    if (typeof val === 'string') return val.split(',').map((s) => s.trim()).filter(Boolean);
    return undefined;
  }).optional(),
  position: z.union([z.enum(['before_char', 'after_char']), z.string()]).transform((val) => {
    if (val === 'before_char' || val === 'after_char') return val;
    return undefined;
  }).optional(),
}).passthrough();

export type LorebookEntry = z.infer<typeof LorebookEntrySchema>;

// Storage schema for Lorebook Entry with limits
export const LorebookEntryStorageSchema = z.object({
  keys: z.array(z.string().max(200)).max(LIMITS.LOREBOOK_KEYS).default([]),
  content: z.string().max(LIMITS.LOREBOOK_ENTRY_CONTENT).default(''),
  extensions: BoundedExtensionsSchema,
  enabled: z.boolean().default(true),
  insertion_order: z.number().default(100),
  case_sensitive: z.boolean().optional(),
  use_regex: z.boolean().default(false),
  constant: z.boolean().optional(),
  name: z.string().max(LIMITS.NAME).optional(),
  priority: z.number().optional(),
  id: z.union([z.number(), z.string()]).optional(),
  comment: z.string().max(LIMITS.SHORT_TEXT).optional(),
  selective: z.boolean().optional(),
  secondary_keys: z.array(z.string().max(200)).max(LIMITS.LOREBOOK_KEYS).optional(),
  position: z.enum(['before_char', 'after_char']).optional(),
});

// ==========================================
// LOREBOOK SCHEMA (CCv3)
// ==========================================
export const LorebookSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  scan_depth: z.number().optional(),
  token_budget: z.number().optional(),
  recursive_scanning: z.boolean().optional(),
  extensions: z.record(z.string(), z.any()).default({}),
  entries: z.union([z.array(z.any()), z.record(z.string(), z.any())]).transform((val) => {
    if (Array.isArray(val)) return val;
    if (val && typeof val === 'object') return Object.values(val);
    return [];
  }).pipe(z.array(LorebookEntrySchema)).default([]),
}).passthrough();

export type Lorebook = z.infer<typeof LorebookSchema>;

// Storage schema for Lorebook with limits
export const LorebookStorageSchema = z.object({
  name: z.string().max(LIMITS.NAME).optional(),
  description: z.string().max(LIMITS.SHORT_TEXT).optional(),
  scan_depth: z.number().optional(),
  token_budget: z.number().optional(),
  recursive_scanning: z.boolean().optional(),
  extensions: BoundedExtensionsSchema,
  entries: z.array(LorebookEntryStorageSchema).max(LIMITS.LOREBOOK_ENTRIES).default([]),
});

// Standalone Lorebook File Schema
export const StandaloneLorebookSchema = z.object({
  spec: z.literal('lorebook_v3'),
  data: LorebookSchema,
});

export type StandaloneLorebook = z.infer<typeof StandaloneLorebookSchema>;

// ==========================================
// ASSET SCHEMA (CCv3)
// ==========================================
export const CharacterAssetSchema = z.object({
  type: z.string(),
  uri: z.string(),
  name: z.string(),
  ext: z.string(),
});

export type CharacterAsset = z.infer<typeof CharacterAssetSchema>;

// Storage schema for Assets
export const CharacterAssetStorageSchema = z.object({
  type: z.string().max(50),
  uri: z.string().max(2000),
  name: z.string().max(LIMITS.NAME),
  ext: z.string().max(20),
});

// ==========================================
// CHARACTER CARD V3 DATA SCHEMA
// ==========================================
export const CharacterCardV3DataSchema = z.object({
  avatar: z.string().optional(),
  // CCv2 fields
  name: z.string().default(''),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  creator: z.string().default(''),
  character_version: z.string().default(''),
  mes_example: z.string().default(''),
  extensions: z.record(z.string(), z.any()).default({}),
  system_prompt: z.string().default(''),
  post_history_instructions: z.string().default(''),
  first_mes: z.string().default(''),
  alternate_greetings: z.array(z.string()).default([]),
  personality: z.string().default(''),
  scenario: z.string().default(''),

  // CCv2 changes
  creator_notes: z.string().default(''),
  character_book: LorebookSchema.nullable().optional(),

  // CCv3 New Fields
  assets: z.array(CharacterAssetSchema).optional(),
  nickname: z.string().optional(),
  creator_notes_multilingual: z.record(z.string(), z.string()).optional(),
  source: z.array(z.string()).optional(),
  group_only_greetings: z.array(z.string()).default([]),
  creation_date: z.number().optional(),
  modification_date: z.number().optional(),
}).passthrough();

export type CharacterCardV3Data = z.infer<typeof CharacterCardV3DataSchema>;

// Storage schema for CharacterCardV3Data with field limits
export const CharacterCardV3DataStorageSchema = z.object({
  avatar: z.string().max(10_000_000).optional(), // max 10MB data URI if embedded
  name: z.string().max(LIMITS.NAME).default(''),
  description: z.string().max(LIMITS.LONG_TEXT).default(''),
  tags: z.array(z.string().max(LIMITS.TAG_LENGTH)).max(LIMITS.TAGS).default([]),
  creator: z.string().max(LIMITS.SHORT_TEXT).default(''),
  character_version: z.string().max(LIMITS.SHORT_TEXT).default(''),
  mes_example: z.string().max(LIMITS.MES_EXAMPLE).default(''),
  extensions: BoundedExtensionsSchema,
  system_prompt: z.string().max(LIMITS.LONG_TEXT).default(''),
  post_history_instructions: z.string().max(LIMITS.LONG_TEXT).default(''),
  first_mes: z.string().max(LIMITS.LONG_TEXT).default(''),
  alternate_greetings: z.array(z.string().max(LIMITS.LONG_TEXT)).max(LIMITS.ALT_GREETINGS).default([]),
  personality: z.string().max(LIMITS.LONG_TEXT).default(''),
  scenario: z.string().max(LIMITS.LONG_TEXT).default(''),
  creator_notes: z.string().max(LIMITS.LONG_TEXT).default(''),
  character_book: LorebookStorageSchema.nullable().optional(),
  assets: z.array(CharacterAssetStorageSchema).max(LIMITS.ASSETS).optional(),
  nickname: z.string().max(LIMITS.NAME).optional(),
  creator_notes_multilingual: z.record(z.string(), z.string().max(LIMITS.LONG_TEXT)).optional(),
  source: z.array(z.string().max(500)).max(20).optional(),
  group_only_greetings: z.array(z.string().max(LIMITS.LONG_TEXT)).max(LIMITS.GROUP_GREETINGS).default([]),
  creation_date: z.number().optional(),
  modification_date: z.number().optional(),
});

// Full Character Card V3 Container (Import/General)
export const CharacterCardV3Schema = z.object({
  spec: z.literal('chara_card_v3'),
  spec_version: z.string().default('3.0'),
  data: CharacterCardV3DataSchema,
}).passthrough();

export type CharacterCardV3 = z.infer<typeof CharacterCardV3Schema>;

// Full Character Card V3 Container for Storage (Strict validation on write)
export const CharacterCardV3StorageSchema = z.object({
  spec: z.literal('chara_card_v3'),
  spec_version: z.string().default('3.0'),
  data: CharacterCardV3DataStorageSchema,
});

// ==========================================
// CHARACTER CARD V2 DATA SCHEMA (FOR IMPORT/EXPORT)
// ==========================================
export const CharacterCardV2DataSchema = z.object({
  avatar: z.string().optional(),
  name: z.string().default(''),
  description: z.string().default(''),
  personality: z.string().default(''),
  scenario: z.string().default(''),
  first_mes: z.string().default(''),
  mes_example: z.string().default(''),
  creator_notes: z.string().default(''),
  system_prompt: z.string().default(''),
  post_history_instructions: z.string().default(''),
  alternate_greetings: z.array(z.string()).default([]),
  character_book: LorebookSchema.nullable().optional(),
  tags: z.array(z.string()).default([]),
  creator: z.string().default(''),
  character_version: z.string().default(''),
  extensions: z.record(z.string(), z.any()).default({}),
});

export type CharacterCardV2Data = z.infer<typeof CharacterCardV2DataSchema>;

export const CharacterCardV2Schema = z.object({
  spec: z.literal('chara_card_v2'),
  spec_version: z.string().default('2.0'),
  data: CharacterCardV2DataSchema,
});

export type CharacterCardV2 = z.infer<typeof CharacterCardV2Schema>;

// ==========================================
// DEFENSIVE MAPPER (Isolating Extensions)
// ==========================================
export function isolateExtensions<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  rawData: unknown,
  warnings: string[] = []
): Record<string, unknown> {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return (rawData || {}) as Record<string, unknown>;
  }

  const rawObj = rawData as Record<string, unknown>;
  const knownKeys = new Set(Object.keys(schema.shape));
  const isolatedExtensions: Record<string, unknown> =
    typeof rawObj.extensions === 'object' && rawObj.extensions !== null
      ? { ...(rawObj.extensions as Record<string, unknown>) }
      : {};
  let hasMovedFields = false;

  const cleanData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawObj)) {
    if (knownKeys.has(key)) {
      cleanData[key] = value;
    } else {
      isolatedExtensions[key] = value;
      hasMovedFields = true;
      warnings.push(`Isolated unrecognized field '${key}' into extensions.`);
    }
  }

  if (hasMovedFields) {
    cleanData.extensions = isolatedExtensions;
  } else if (rawObj.extensions !== undefined) {
    cleanData.extensions = rawObj.extensions;
  }

  return cleanData;
}

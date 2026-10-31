export const LIMITS = {
  NAME: 100,
  SHORT_TEXT: 2_000,        // creator, character_version, lorebook comment and description
  LONG_TEXT: 50_000,        // description, personality, scenario, first_mes, system_prompt, post_history_instructions
  MES_EXAMPLE: 100_000,
  TAGS: 50,
  TAG_LENGTH: 50,
  ALT_GREETINGS: 50,
  GROUP_GREETINGS: 50,
  ASSETS: 100,
  LOREBOOK_ENTRIES: 1_000,
  LOREBOOK_ENTRY_CONTENT: 20_000,
  LOREBOOK_KEYS: 50,
  EXTENSIONS_JSON_BYTES: 200_000, // serialized size budget
} as const;

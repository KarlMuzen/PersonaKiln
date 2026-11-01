import { describe, it, expect } from 'vitest';
import { summarizeDefaultedFields, validateCardCompleteness } from '../src/utils/validation';
import type { CharacterCardV3 } from '../src/schemas/cardSchema';

describe('summarizeDefaultedFields', () => {
  it('aggregates multiple array-indexed paths into a single summary line', () => {
    const fields = Array.from({ length: 22 }, (_, i) => `character_book.entries[${i}].use_regex`);
    const result = summarizeDefaultedFields(fields);
    expect(result).toEqual([
      '22 lorebook entries missing `use_regex` — defaulted to false'
    ]);
  });

  it('handles singular count for array items correctly', () => {
    const fields = ['character_book.entries[0].use_regex'];
    const result = summarizeDefaultedFields(fields);
    expect(result).toEqual([
      '1 lorebook entry missing `use_regex` — defaulted to false'
    ]);
  });

  it('leaves non-array paths as plain language lines', () => {
    const fields = ['assets', 'nickname', 'tags'];
    const result = summarizeDefaultedFields(fields);
    expect(result).toEqual([
      'assets — defaulted to empty array',
      'nickname — defaulted to empty string',
      'tags — defaulted to empty array'
    ]);
  });

  it('handles mixed array and non-array defaulted fields', () => {
    const fields = [
      'assets',
      'character_book.entries[0].use_regex',
      'character_book.entries[1].use_regex',
      'character_book.entries[0].enabled',
      'character_book.entries[1].enabled'
    ];
    const result = summarizeDefaultedFields(fields);
    expect(result).toEqual([
      'assets — defaulted to empty array',
      '2 lorebook entries missing `use_regex` — defaulted to false',
      '2 lorebook entries missing `enabled` — defaulted to true'
    ]);
  });

  it('returns empty array for empty inputs', () => {
    expect(summarizeDefaultedFields([])).toEqual([]);
  });
});

describe('validateCardCompleteness', () => {
  const baseCard: CharacterCardV3 = {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name: 'Alice',
      description: 'A helpful assistant.',
      personality: 'Kind and thoughtful.',
      first_mes: 'Hello!',
      mes_example: '',
      scenario: '',
      creator_notes: '',
      system_prompt: '',
      post_history_instructions: '',
      alternate_greetings: [],
      tags: [],
      creator: '',
      character_version: '',
      extensions: {},
      group_only_greetings: [],
    },
  };

  it('returns no warnings for a fully completed standard card', () => {
    expect(validateCardCompleteness(baseCard)).toEqual([]);
  });

  it('returns empty array if card is null', () => {
    expect(validateCardCompleteness(null)).toEqual([]);
  });

  it('warns when personality is missing on a non-Chub card', () => {
    const card: CharacterCardV3 = {
      ...baseCard,
      data: {
        ...baseCard.data,
        personality: '',
      },
    };
    expect(validateCardCompleteness(card)).toEqual([]);
  });

  it('suppresses personality-missing warning when extensions.chub is present', () => {
    const chubCard: CharacterCardV3 = {
      ...baseCard,
      data: {
        ...baseCard.data,
        personality: '',
        extensions: {
          chub: {
            fullPath: 'testuser/alice',
            id: 12345,
          },
        },
      },
    };
    expect(validateCardCompleteness(chubCard)).toEqual([]);
  });

  it('still warns for missing name, description, and first_mes on Chub cards', () => {
    const incompleteChubCard: CharacterCardV3 = {
      ...baseCard,
      data: {
        ...baseCard.data,
        name: '',
        description: '   ',
        personality: '',
        first_mes: '',
        extensions: {
          chub: {
            fullPath: 'testuser/alice',
          },
        },
      },
    };
    expect(validateCardCompleteness(incompleteChubCard)).toEqual([
      'Character Name is missing.',
      'Description is missing.',
      'First Greeting Message is missing.',
    ]);
  });
});

describe('getCardInfoNotes', () => {
  const NOTE = 'Personality is empty. It is optional; many cards put it in Description.';

  async function loadNotes() {
    const parts = ['../src/utils/', 'validation'];
    const mod = await import(parts.join(''));
    return mod.getCardInfoNotes as (card: unknown) => string[];
  }

  function cardWith(personality: string, chub: boolean) {
    return {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name: 'Alice',
        description: 'A helpful assistant.',
        personality,
        first_mes: 'Hello!',
        mes_example: '',
        scenario: '',
        creator_notes: '',
        system_prompt: '',
        post_history_instructions: '',
        alternate_greetings: [],
        tags: [],
        creator: '',
        character_version: '',
        extensions: chub ? { chub: { fullPath: 'testuser/alice' } } : {},
        group_only_greetings: [],
      },
    };
  }

  it('returns the note for a non-Chub card with empty personality', async () => {
    expect((await loadNotes())(cardWith('', false))).toEqual([NOTE]);
  });

  it('returns the note for whitespace-only personality', async () => {
    expect((await loadNotes())(cardWith('   ', false))).toEqual([NOTE]);
  });

  it('returns [] for a Chub card', async () => {
    expect((await loadNotes())(cardWith('', true))).toEqual([]);
  });

  it('returns [] for a filled personality', async () => {
    expect((await loadNotes())(cardWith('Kind and thoughtful.', false))).toEqual([]);
  });

  it('returns [] for null', async () => {
    expect((await loadNotes())(null)).toEqual([]);
  });
});

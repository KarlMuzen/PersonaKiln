import { describe, it, expect } from 'vitest';
import { CharacterCardV3StorageSchema } from '../src/schemas/cardSchema';

describe('cardSchema', () => {
  const validCard = {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name: 'Test',
      description: 'A test character',
      tags: [],
      creator: '',
      character_version: '',
      mes_example: '',
      extensions: {},
      system_prompt: '',
      post_history_instructions: '',
      first_mes: '',
      alternate_greetings: [],
      group_only_greetings: [],
      personality: '',
      scenario: '',
      creator_notes: '',
      character_book: null,
      assets: []
    }
  };

  it('validates a correct card', () => {
    const result = CharacterCardV3StorageSchema.safeParse(validCard);
    expect(result.success).toBe(true);
  });

  it('rejects field lengths exceeding bounds', () => {
    const longName = 'A'.repeat(200); // Max is 100
    const invalidCard = {
      ...validCard,
      data: {
        ...validCard.data,
        name: longName
      }
    };
    const result = CharacterCardV3StorageSchema.safeParse(invalidCard);
    expect(result.success).toBe(false);
  });

  it('allows personality and scenario up to 50,000 characters, and still caps creator at 2,000', () => {
    const atCap = CharacterCardV3StorageSchema.safeParse({
      ...validCard,
      data: { ...validCard.data, personality: 'A'.repeat(50000), scenario: 'B'.repeat(50000) },
    });
    expect(atCap.success).toBe(true);

    const overPersonality = CharacterCardV3StorageSchema.safeParse({
      ...validCard,
      data: { ...validCard.data, personality: 'A'.repeat(50001) },
    });
    expect(overPersonality.success).toBe(false);

    const overScenario = CharacterCardV3StorageSchema.safeParse({
      ...validCard,
      data: { ...validCard.data, scenario: 'B'.repeat(50001) },
    });
    expect(overScenario.success).toBe(false);

    const overCreator = CharacterCardV3StorageSchema.safeParse({
      ...validCard,
      data: { ...validCard.data, creator: 'C'.repeat(2001) },
    });
    expect(overCreator.success).toBe(false);
  });

  it('rejects extensions payload cap exceeded', () => {
    const hugeExtensions = { data: 'A'.repeat(250000) }; // Max is 200,000 bytes
    const invalidCard = {
      ...validCard,
      data: {
        ...validCard.data,
        extensions: hugeExtensions
      }
    };
    const result = CharacterCardV3StorageSchema.safeParse(invalidCard);
    expect(result.success).toBe(false);
  });
});

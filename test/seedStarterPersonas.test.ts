// @vitest-environment jsdom
import '../test/setup';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { seedStarterPersonas, STARTER_PERSONAS_SEEDED_KEY } from '../src/utils/seedStarterPersonas';
import { STARTER_PERSONAS } from '../src/constants/starterPersonas';

const PERSONA_NAMES = STARTER_PERSONAS.map((p) => p.name);

async function resetDb() {
  await db.cards.clear();
  await db.settings.clear();
}

describe('seedStarterPersonas', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('seeds three named cards and sets the flag on a fresh DB', async () => {
    expect(await seedStarterPersonas()).toBe(true);

    const cards = await db.cards.toArray();
    expect(cards.map((c) => c.name).sort()).toEqual([...PERSONA_NAMES].sort());
    expect(cards.map((c) => c.order).sort()).toEqual([0, 1, 2]);
    for (const card of cards) {
      expect(card.creator).toBe('PersonaKiln');
      expect(card.embeddedAssets).toEqual({});
      expect(card.testSuites?.length).toBeGreaterThan(0);
      expect(card.cardData.data.name).toBe(card.name);
      expect(card.cardData.data.creator).toBe('PersonaKiln');
    }
    const flag = await db.settings.get(STARTER_PERSONAS_SEEDED_KEY);
    expect(flag?.value).toBe(true);
  });

  it('a second call adds nothing', async () => {
    expect(await seedStarterPersonas()).toBe(true);
    expect(await seedStarterPersonas()).toBe(false);
    expect(await db.cards.count()).toBe(3);
  });

  it('delete-all then call adds nothing, because the flag stays', async () => {
    await seedStarterPersonas();
    await db.cards.clear();
    expect(await db.cards.count()).toBe(0);

    expect(await seedStarterPersonas()).toBe(false);
    expect(await db.cards.count()).toBe(0);
  });

  it('an existing card means no seed, and the flag is still set', async () => {
    await db.cards.add({
      uuid: 'existing-1',
      name: 'My Own Card',
      tags: [],
      creator: '',
      cardData: {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
          name: 'My Own Card',
          description: '',
          tags: [],
          creator: '',
          character_version: '1.0',
          mes_example: '',
          extensions: {},
          system_prompt: '',
          post_history_instructions: '',
          first_mes: '',
          personality: '',
          scenario: '',
          creator_notes: '',
          alternate_greetings: [],
          group_only_greetings: [],
          assets: [],
          character_book: null,
        },
      },
      embeddedAssets: {},
    } as never);

    expect(await seedStarterPersonas()).toBe(false);
    expect(await db.cards.count()).toBe(1);
    expect((await db.cards.toArray())[0].name).toBe('My Own Card');
    expect((await db.settings.get(STARTER_PERSONAS_SEEDED_KEY))?.value).toBe(true);
  });

  it('two simultaneous calls give exactly three cards', async () => {
    const [first, second] = await Promise.all([seedStarterPersonas(), seedStarterPersonas()]);
    expect(first).toBe(true);
    expect(second).toBe(true); // same in-flight run, shared promise
    expect(await db.cards.count()).toBe(3);
    expect((await db.cards.toArray()).map((c) => c.name).sort()).toEqual([...PERSONA_NAMES].sort());
  });

  it('starter persona fields respect the length limits', () => {
    for (const persona of STARTER_PERSONAS) {
      expect(persona.tags.length).toBeGreaterThanOrEqual(2);
      expect(persona.tags.length).toBeLessThanOrEqual(4);
      expect(persona.tags).toEqual(persona.tags.map((t) => t.toLowerCase()));
      expect(persona.creator).toBe('PersonaKiln');
      for (const field of [persona.description, persona.personality, persona.scenario, persona.mes_example, persona.system_prompt]) {
        expect(field.length).toBeLessThanOrEqual(1200);
      }
      expect(persona.first_mes.length).toBeLessThanOrEqual(400);
    }
  });
});

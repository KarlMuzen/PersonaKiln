import { db, DEFAULT_CRUCIBLE_VECTORS, type StoredCard } from '../db';
import { STARTER_PERSONAS } from '../constants/starterPersonas';
import { createNewDefaultCard } from './cardDefaults';

export const STARTER_PERSONAS_SEEDED_KEY = 'starter_personas_seeded';

// Serialises concurrent callers onto one seed run, so two simultaneous
// calls can never both see an empty database and both insert.
let seedPromise: Promise<boolean> | null = null;

async function seedOnce(): Promise<boolean> {
  return db.transaction('rw', db.cards, db.settings, async () => {
    const flag = await db.settings.get(STARTER_PERSONAS_SEEDED_KEY);
    if (flag) {
      return false;
    }

    const existingCount = await db.cards.count();
    if (existingCount > 0) {
      // Cards already exist (imported, restored, or created): record that
      // seeding was considered so it never runs later, e.g. after the
      // user deletes every card.
      await db.settings.put({ key: STARTER_PERSONAS_SEEDED_KEY, value: true });
      return false;
    }

    const records: StoredCard[] = STARTER_PERSONAS.map((persona, index) => {
      const cardData = createNewDefaultCard(persona.name);
      cardData.data.tags = [...persona.tags];
      cardData.data.creator = persona.creator;
      cardData.data.description = persona.description;
      cardData.data.personality = persona.personality;
      cardData.data.scenario = persona.scenario;
      cardData.data.first_mes = persona.first_mes;
      cardData.data.mes_example = persona.mes_example;
      cardData.data.system_prompt = persona.system_prompt;
      return {
        uuid: crypto.randomUUID(),
        name: persona.name,
        tags: [...persona.tags],
        creator: persona.creator,
        creation_date: cardData.data.creation_date,
        modification_date: cardData.data.modification_date,
        order: index,
        cardData,
        embeddedAssets: {},
        testSuites: DEFAULT_CRUCIBLE_VECTORS,
      };
    });

    await db.cards.bulkAdd(records);
    await db.settings.put({ key: STARTER_PERSONAS_SEEDED_KEY, value: true });
    return true;
  });
}

/**
 * Seeds the three starter personas into an empty database, once.
 * Returns true only when this call inserted them; false when the flag
 * was already set, when cards already existed, or on a repeat call.
 * Deleting all cards afterwards does not re-seed, because the flag stays.
 */
export async function seedStarterPersonas(): Promise<boolean> {
  if (!seedPromise) {
    seedPromise = seedOnce().finally(() => {
      seedPromise = null;
    });
  }
  return seedPromise;
}

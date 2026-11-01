// @vitest-environment jsdom
import '../test/setup';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../src/db';
import { CharacterCardV3StorageSchema } from '../src/schemas/cardSchema';
import { useCardStore } from '../src/store/useCardStore';
import { useToastStore } from '../src/store/useToastStore';
import { createNewDefaultCard } from '../src/utils/cardDefaults';
import { describeStorageError } from '../src/utils/storageErrors';

const originalShowToast = useToastStore.getState().showToast;

beforeEach(async () => {
  const { saveTimeoutId } = useCardStore.getState();
  if (saveTimeoutId) clearTimeout(saveTimeoutId);
  await db.cards.clear();
  await db.settings.clear();
  useCardStore.setState({
    activeTab: 'gallery',
    activeCardUuid: null,
    activeCard: null,
    activeCardRecord: null,
    cards: [],
    saveTimeoutId: null,
    saveState: 'idle',
  });
  useToastStore.setState({ showToast: originalShowToast });
});

function oversizedCard() {
  const card = createNewDefaultCard('Oversized');
  card.data.creator = 'x'.repeat(2001);
  return card;
}

/** A real ZodError for a 2,001-character creator, from the storage schema. */
function oversizedCreatorError(): unknown {
  const parsed = CharacterCardV3StorageSchema.safeParse(oversizedCard());
  if (parsed.success) throw new Error('test setup: expected a schema failure');
  return parsed.error;
}

describe('describeStorageError', () => {
  it('names a too-long creator and its limit', () => {
    const parsed = CharacterCardV3StorageSchema.safeParse(oversizedCard());
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const message = describeStorageError(parsed.error);
      expect(message).toContain('Creator');
      expect(message).toContain('2,000');
    }
  });

  it('names over-limit extensions', () => {
    const card = createNewDefaultCard('Big extensions');
    card.data.extensions = { big: 'x'.repeat(200001) };
    const parsed = CharacterCardV3StorageSchema.safeParse(card);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(describeStorageError(parsed.error)).toContain('Extensions');
    }
  });

  it('names a lorebook entry and its content field', () => {
    const card = createNewDefaultCard('Lorebook');
    card.data.character_book = {
      name: 'Book',
      entries: [{ keys: ['sword'], content: 'y'.repeat(20001) }],
    } as never;
    const parsed = CharacterCardV3StorageSchema.safeParse(card);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const message = describeStorageError(parsed.error);
      expect(message).toContain('Lorebook entry 1');
      expect(message).toContain('content');
    }
  });

  it('shows at most 3 issues, then "and N more"', () => {
    const card = createNewDefaultCard('Many problems');
    card.data.creator = 'x'.repeat(2001);
    card.data.character_version = 'x'.repeat(2001);
    card.data.description = 'x'.repeat(50001);
    card.data.personality = 'x'.repeat(50001);
    const parsed = CharacterCardV3StorageSchema.safeParse(card);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.length).toBeGreaterThan(3);
      expect(describeStorageError(parsed.error)).toMatch(/and 1 more$/);
    }
  });

  it('passes a plain error message through and defaults the rest', () => {
    expect(describeStorageError(new Error('x'))).toBe('x');
    expect(describeStorageError(null)).toBe('Database error');
    expect(describeStorageError(undefined)).toBe('Database error');
  });

  it('names the field for the error a real db.cards.add throws', async () => {
    const card = oversizedCard();
    let thrown: unknown;
    try {
      await db.cards.add({
        uuid: 'oversized-uuid',
        name: 'Oversized',
        tags: [],
        creator: 'x'.repeat(2001),
        creation_date: 1,
        modification_date: 1,
        cardData: card,
      } as never);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect(describeStorageError(thrown)).toContain('Creator');
  });
});

describe('store save and import failures', () => {
  it('saveActiveCardMetadata sets error and names the field in the toast', async () => {
    await useCardStore.getState().createNewCard('Normal');
    const showToast = vi.fn();
    useToastStore.setState({ showToast });
    const updateSpy = vi
      .spyOn(db.cards, 'update')
      .mockRejectedValueOnce(oversizedCreatorError() as Error);
    await useCardStore.getState().saveActiveCardMetadata();
    expect(useCardStore.getState().saveState).toBe('error');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0].message).toContain('Creator');
    updateSpy.mockRestore();
  });

  it('saveActiveCard resolves, sets error and shows the same toast', async () => {
    await useCardStore.getState().createNewCard('Normal');
    const showToast = vi.fn();
    useToastStore.setState({ showToast });
    const updateSpy = vi
      .spyOn(db.cards, 'update')
      .mockRejectedValueOnce(oversizedCreatorError() as Error);
    await expect(useCardStore.getState().saveActiveCard()).resolves.toBeUndefined();
    expect(useCardStore.getState().saveState).toBe('error');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0].message).toContain('Creator');
    updateSpy.mockRestore();
  });

  it('importCardRecord rejects with a message naming the field', async () => {
    await expect(
      useCardStore.getState().importCardRecord(oversizedCard()),
    ).rejects.toThrow('Creator');
  });
});

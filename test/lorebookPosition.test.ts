import { describe, expect, it } from 'vitest';
import { normalizeLorebook } from '../src/utils/normalizeLorebook';
import { exportStandaloneLorebook, importCardData } from '../src/io';
import { normalizeRawToV3Card } from '../src/io/converter';
import { createNewDefaultCard } from '../src/utils/cardDefaults';

function standaloneBook() {
  return {
    entries: {
      '0': {
        uid: 0,
        key: ['alpha'],
        keysecondary: [],
        comment: 'First',
        content: 'First entry',
        constant: false,
        selective: true,
        order: 100,
        disable: false,
        depth: 4,
        position: 0,
      },
      '1': {
        uid: 1,
        key: ['beta'],
        keysecondary: [],
        comment: 'Second',
        content: 'Second entry',
        constant: false,
        selective: true,
        order: 100,
        disable: false,
        depth: 4,
        position: 4,
      },
      '2': {
        uid: 2,
        key: ['gamma'],
        keysecondary: [],
        comment: 'Third',
        content: 'Third entry',
        constant: false,
        selective: true,
        order: 100,
        disable: false,
        depth: 4,
        position: 2,
      },
    },
  };
}

function singleEntryBook(entry: Record<string, unknown>) {
  return { entries: { '0': entry } };
}

describe('lorebook position kept', () => {
  it('keeps a numeric position in extensions.position, 0 included, with no V2 string', () => {
    const book = normalizeLorebook(standaloneBook());
    expect(book).toBeDefined();
    expect(book?.entries).toHaveLength(3);
    expect(book?.entries[0].extensions.position).toBe(0);
    expect(book?.entries[1].extensions.position).toBe(4);
    expect(book?.entries[2].extensions.position).toBe(2);
    for (const entry of book?.entries ?? []) {
      expect(entry.position).toBeUndefined();
    }
  });

  it("an entry's own extensions.position wins over its numeric position", () => {
    const book = normalizeLorebook(
      singleEntryBook({
        uid: 0,
        key: ['alpha'],
        content: 'Entry',
        position: 4,
        extensions: { position: 1 },
      }),
    );
    expect(book?.entries[0].extensions.position).toBe(1);
  });

  it('the usual embedded form is unchanged', () => {
    const book = normalizeLorebook(
      singleEntryBook({
        key: ['alpha'],
        content: 'Entry',
        position: 'before_char',
        extensions: { position: 0, depth: 4 },
      }),
    );
    expect(book?.entries[0].position).toBe('before_char');
    expect(book?.entries[0].extensions.position).toBe(0);
    expect(book?.entries[0].extensions.depth).toBe(4);
  });

  it('no position stays none', () => {
    const book = normalizeLorebook(
      singleEntryBook({ key: ['alpha'], content: 'Entry' }),
    );
    expect(book?.entries[0].position).toBeUndefined();
    expect(book?.entries[0].extensions.position).toBeUndefined();
  });

  it('a V2 string alone adds no extensions.position', () => {
    const book = normalizeLorebook(
      singleEntryBook({ key: ['alpha'], content: 'Entry', position: 'after_char' }),
    );
    expect(book?.entries[0].position).toBe('after_char');
    expect(book?.entries[0].extensions.position).toBeUndefined();
  });

  it('import and export keep the numeric positions', async () => {
    const result = await importCardData(JSON.stringify(standaloneBook()), 'world.json');
    expect(result.format).toBe('lorebook');
    expect(result.lorebook).toBeDefined();
    const exported = JSON.parse(exportStandaloneLorebook(result.lorebook!)) as {
      data: { entries: { extensions: { position?: unknown } }[] };
    };
    expect(exported.data.entries[0].extensions.position).toBe(0);
    expect(exported.data.entries[1].extensions.position).toBe(4);
    expect(exported.data.entries[2].extensions.position).toBe(2);
  });

  it('card import keeps a numeric position on an embedded entry', () => {
    const cardInput = createNewDefaultCard('Position Card');
    (cardInput.data as unknown as Record<string, unknown>).character_book = {
      name: 'Book',
      description: '',
      scan_depth: 5,
      token_budget: 1000,
      recursive_scanning: true,
      extensions: {},
      entries: [
        {
          keys: ['alpha'],
          content: 'Embedded entry',
          insertion_order: 100,
          enabled: true,
          use_regex: false,
          extensions: {},
          position: 4,
        },
      ],
    };
    const { card } = normalizeRawToV3Card(cardInput);
    const entries = card.data.character_book?.entries ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0].extensions.position).toBe(4);
  });
});

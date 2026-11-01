// Fixtures are built in this file with createDummyPng, png-chunks-extract,
// png-chunks-encode, png-chunk-text, createNewDefaultCard and utf8ToBase64,
// as test/pngExtraAssets.test.ts does; no vi.mock, no third-party card file,
// nothing rendered; read with readCardFromPng.
import extractChunks from 'png-chunks-extract';
import encodeChunks from 'png-chunks-encode';
import pngChunkText from 'png-chunk-text';
import { describe, expect, it } from 'vitest';
import { createDummyPng, utf8ToBase64 } from '../src/utils/encoding';
import { createNewDefaultCard } from '../src/utils/cardDefaults';
import { readCardFromPng, writeCardToPng } from '../src/io/png';

function chunkJson(
  description: string,
  opts: { v2?: boolean; book?: boolean } = {},
): Record<string, unknown> {
  const card = createNewDefaultCard('Chunk Choice Test');
  card.data.description = description;
  if (opts.v2) {
    // V2-style chunk: spec fields overwritten on the plain JSON object.
    const json = card as unknown as Record<string, unknown>;
    json.spec = 'chara_card_v2';
    json.spec_version = '2.0';
  }
  // createNewDefaultCard ships an empty book object; a fixture chunk with
  // "no book" needs an explicit null, or the book rule can never narrow.
  if (opts.book) {
    card.data.character_book = {
      name: 'Book',
      description: '',
      scan_depth: 5,
      token_budget: 1000,
      recursive_scanning: true,
      extensions: {},
      entries: [],
    };
  } else {
    card.data.character_book = null;
  }
  return card as unknown as Record<string, unknown>;
}

function textChunk(keyword: string, json: unknown): { name: string; data: Uint8Array } {
  return pngChunkText.encode(keyword, utf8ToBase64(JSON.stringify(json)));
}

function unreadableChunk(keyword: string): { name: string; data: Uint8Array } {
  return pngChunkText.encode(keyword, 'not a card');
}

function buildPng(textChunks: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks = extractChunks(createDummyPng());
  chunks.splice(1, 0, ...textChunks);
  return encodeChunks(chunks);
}

function cardChunkWarning(result: { warnings?: string[] }): string {
  return (result.warnings ?? []).find((w) => w.includes('card chunks')) ?? '';
}

describe('PNG chunk choice', () => {
  it("SillyTavern pair, chara then ccv3: reads ccv3 with the first example warning", () => {
    const png = buildPng([
      textChunk('chara', chunkJson('st-pair', { v2: true })),
      textChunk('ccv3', chunkJson('st-pair')),
    ]);
    const result = readCardFromPng(png);
    expect(result.sourceFormat).toBe('ccv3');
    expect(cardChunkWarning(result)).toContain(
      "Found 2 card chunks ('chara', 'ccv3'); used 'ccv3'. Order used: ccv3, then chara, then other names.",
    );
  });

  it('reverse order, ccv3 then chara: reads ccv3 and lists ccv3 first', () => {
    const png = buildPng([
      textChunk('ccv3', chunkJson('ccv3-first')),
      textChunk('chara', chunkJson('chara-second', { v2: true })),
    ]);
    const result = readCardFromPng(png);
    expect(result.sourceFormat).toBe('ccv3');
    expect(result.card.data.description).toBe('ccv3-first');
    expect(cardChunkWarning(result)).toContain(
      "Found 2 card chunks ('ccv3', 'chara'); used 'ccv3'. Order used: ccv3, then chara, then other names.",
    );
  });

  it('chara payload longer than ccv3: still reads ccv3', () => {
    const png = buildPng([
      textChunk('chara', chunkJson('x'.repeat(500), { v2: true })),
      textChunk('ccv3', chunkJson('short-ccv3')),
    ]);
    const result = readCardFromPng(png);
    expect(result.card.data.description).toBe('short-ccv3');
    expect(result.sourceFormat).toBe('ccv3');
  });

  it('chara has a book and ccv3 has none: reads the ccv3 card with no book', () => {
    const png = buildPng([
      textChunk('chara', chunkJson('book-chara', { v2: true, book: true })),
      textChunk('ccv3', chunkJson('no-book-ccv3')),
    ]);
    const result = readCardFromPng(png);
    expect(result.card.data.description).toBe('no-book-ccv3');
    expect(result.card.data.character_book).toBeFalsy();
  });

  it('ccv3 unreadable, chara fine: reads chara with the second example warning', () => {
    const png = buildPng([
      unreadableChunk('ccv3'),
      textChunk('chara', chunkJson('chara-fine', { v2: true })),
    ]);
    const result = readCardFromPng(png);
    expect(result.sourceFormat).toBe('chara_v2');
    expect(result.card.data.description).toBe('chara-fine');
    expect(cardChunkWarning(result)).toContain(
      "Found 2 card chunks ('ccv3', 'chara'); used 'chara'. Order used: ccv3, then chara, then other names. Could not read: 'ccv3'.",
    );
  });

  it('upper-case CCV3 (shorter) plus chara (longer): reads CCV3 and names it as stored', () => {
    const png = buildPng([
      textChunk('CCV3', chunkJson('upper-ccv3')),
      textChunk('chara', chunkJson('y'.repeat(500), { v2: true })),
    ]);
    const result = readCardFromPng(png);
    expect(result.card.data.description).toBe('upper-ccv3');
    expect(result.sourceFormat).toBe('ccv3');
    expect(cardChunkWarning(result)).toContain("used 'CCV3'");
  });

  it('character chunk (longer) plus chara: reads chara', () => {
    const png = buildPng([
      textChunk('character', chunkJson('z'.repeat(500))),
      textChunk('chara', chunkJson('chara-wins', { v2: true })),
    ]);
    const result = readCardFromPng(png);
    expect(result.card.data.description).toBe('chara-wins');
    expect(result.sourceFormat).toBe('chara_v2');
  });

  it('two ccv3, shorter one with a book: reads the book one with the third example warning', () => {
    const png = buildPng([
      textChunk('ccv3', chunkJson('with-book', { book: true })),
      textChunk('ccv3', chunkJson('w'.repeat(500))),
    ]);
    const result = readCardFromPng(png);
    expect(result.card.data.description).toBe('with-book');
    expect(cardChunkWarning(result)).toContain(
      "Found 2 card chunks ('ccv3', 'ccv3'); used 'ccv3'. Several chunks of the same rank were read; picked the one with a character_book.",
    );
  });

  it('two ccv3, no books: reads the longer one in either file order', () => {
    const shortFirst = buildPng([
      textChunk('ccv3', chunkJson('short-one')),
      textChunk('ccv3', chunkJson('v'.repeat(500))),
    ]);
    expect(readCardFromPng(shortFirst).card.data.description).toBe('v'.repeat(500));
    const longFirst = buildPng([
      textChunk('ccv3', chunkJson('v'.repeat(500))),
      textChunk('ccv3', chunkJson('short-one')),
    ]);
    expect(readCardFromPng(longFirst).card.data.description).toBe('v'.repeat(500));
    expect(cardChunkWarning(readCardFromPng(longFirst))).toContain(
      "Found 2 card chunks ('ccv3', 'ccv3'); used 'ccv3'. Several chunks of the same rank were read; picked the longest (the later one if equal).",
    );
  });

  it('two ccv3, no books, equal length: reads the later one', () => {
    const png = buildPng([
      textChunk('ccv3', chunkJson('aaa')),
      textChunk('ccv3', chunkJson('bbb')),
    ]);
    const result = readCardFromPng(png);
    expect(result.card.data.description).toBe('bbb');
    expect(cardChunkWarning(result)).toContain(
      'Several chunks of the same rank were read; picked the longest (the later one if equal).',
    );
  });

  it('one chunk only: reads it with no card-chunk warning, for ccv3 and chara', () => {
    const onlyCcv3 = readCardFromPng(buildPng([textChunk('ccv3', chunkJson('only-ccv3'))]));
    expect(onlyCcv3.card.data.description).toBe('only-ccv3');
    expect(onlyCcv3.sourceFormat).toBe('ccv3');
    expect(cardChunkWarning(onlyCcv3)).toBe('');
    const onlyChara = readCardFromPng(
      buildPng([textChunk('chara', chunkJson('only-chara', { v2: true }))]),
    );
    expect(onlyChara.card.data.description).toBe('only-chara');
    expect(onlyChara.sourceFormat).toBe('chara_v2');
    expect(cardChunkWarning(onlyChara)).toBe('');
  });

  it("the app's own export with backfillV2 reads back as ccv3", () => {
    const card = createNewDefaultCard('Chunk Choice Test');
    const png = writeCardToPng(card, { backfillV2: true });
    const result = readCardFromPng(png);
    expect(result.sourceFormat).toBe('ccv3');
    expect(result.card.data.name).toBe('Chunk Choice Test');
  });
});

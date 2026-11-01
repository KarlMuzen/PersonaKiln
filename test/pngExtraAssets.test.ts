// Fixtures are built in this file with createDummyPng, png-chunks-extract,
// png-chunks-encode and png-chunk-text; no third-party card file is used.
import extractChunks from 'png-chunks-extract';
import encodeChunks from 'png-chunks-encode';
import pngChunkText from 'png-chunk-text';
import { describe, expect, it } from 'vitest';
import { createDummyPng, utf8ToBase64 } from '../src/utils/encoding';
import { createNewDefaultCard } from '../src/utils/cardDefaults';
import { importCardData, exportCardData } from '../src/io/index';
import { readCardFromPng, writeCardToPng } from '../src/io/png';
import type { CharacterCardV3 } from '../src/schemas/cardSchema';

// Mirrors MAX_PAYLOAD_SIZE in src/io/png.ts (20 MB). Hardcoded here, rather
// than imported, so this file still runs against unmodified src/ and the
// per-test old-code results stay observable.
const MAX_BYTES = 20 * 1024 * 1024;

const PATH_A = 'assets/extra1.bin';
const PATH_B = 'assets/extra2.bin';
const BYTES_A = new Uint8Array([1, 2, 3, 4, 5, 250, 255]);
const BYTES_B = new Uint8Array([10, 20, 30, 40, 50, 60]);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function cardChunk(): { name: string; data: Uint8Array } {
  const card = createNewDefaultCard('Extra Asset Test');
  return pngChunkText.encode('ccv3', utf8ToBase64(JSON.stringify(card)));
}

function extraChunk(path: string, base64: string): { name: string; data: Uint8Array } {
  return pngChunkText.encode(`chara-ext-asset_:${path}`, base64);
}

function buildPng(textChunks: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks = extractChunks(createDummyPng());
  chunks.splice(1, 0, ...textChunks);
  return encodeChunks(chunks);
}

function fixturePng(): Uint8Array {
  return buildPng([
    cardChunk(),
    extraChunk(PATH_A, bytesToBase64(BYTES_A)),
    extraChunk(PATH_B, bytesToBase64(BYTES_B)),
  ]);
}

function textChunksOf(png: Uint8Array): { keyword: string; text: string }[] {
  return extractChunks(png)
    .filter((chunk) => chunk.name === 'tEXt')
    .map((chunk) => pngChunkText.decode(chunk.data));
}

function chunksNamed(png: Uint8Array, keyword: string): { keyword: string; text: string }[] {
  return textChunksOf(png).filter((chunk) => chunk.keyword === keyword);
}

describe('PNG extra assets', () => {
  it('import stores decoded bytes under the full keyword, not the bare path', async () => {
    const png = fixturePng();
    const result = await importCardData(png);
    expect(result.format).toBe('png');
    expect(result.embeddedAssets?.[`chara-ext-asset_:${PATH_A}`]).toEqual(BYTES_A);
    expect(result.embeddedAssets?.[`chara-ext-asset_:${PATH_B}`]).toEqual(BYTES_B);
    expect(result.embeddedAssets?.[PATH_A]).toBeUndefined();
    expect(result.embeddedAssets?.[PATH_B]).toBeUndefined();
    expect(result.embeddedAssets?.['embeded://icon/main.png']).toEqual(png);
  });

  it('import skips an invalid-base64 chunk with a warning naming its path', async () => {
    const png = buildPng([
      cardChunk(),
      extraChunk('assets/bad.bin', '!!!not base64!!!'),
      extraChunk(PATH_A, bytesToBase64(BYTES_A)),
    ]);
    const result = await importCardData(png);
    expect(result.embeddedAssets?.['chara-ext-asset_:assets/bad.bin']).toBeUndefined();
    expect(result.embeddedAssets?.[`chara-ext-asset_:${PATH_A}`]).toEqual(BYTES_A);
    expect(result.warnings).toContain(
      'Extra PNG asset "assets/bad.bin" is not valid base64 and was skipped.',
    );
  });

  it('export with a cover that is not the imported PNG writes both extras before IDAT', async () => {
    const imported = await importCardData(fixturePng());
    const card = imported.card as CharacterCardV3;
    const exported = await exportCardData(card, 'png', {
      basePng: createDummyPng(),
      embeddedAssets: {
        [`chara-ext-asset_:${PATH_A}`]: BYTES_A,
        [`chara-ext-asset_:${PATH_B}`]: BYTES_B,
      },
    });
    const readBack = readCardFromPng(exported);
    expect(readBack.card.data.name).toBe('Extra Asset Test');
    expect(readBack.extraAssets?.[PATH_A]).toBe(bytesToBase64(BYTES_A));
    expect(readBack.extraAssets?.[PATH_B]).toBe(bytesToBase64(BYTES_B));
    const chunks = extractChunks(exported);
    const idatIndex = chunks.findIndex((chunk) => chunk.name === 'IDAT');
    for (const path of [PATH_A, PATH_B]) {
      const index = chunks.findIndex(
        (chunk) =>
          chunk.name === 'tEXt' &&
          pngChunkText.decode(chunk.data).keyword === `chara-ext-asset_:${path}`,
      );
      expect(index).toBeGreaterThan(-1);
      expect(index).toBeLessThan(idatIndex);
    }
  });

  it('round trip: import, export, import again keeps the same bytes', async () => {
    const first = await importCardData(fixturePng());
    const exported = await exportCardData(first.card as CharacterCardV3, 'png', {
      embeddedAssets: first.embeddedAssets,
    });
    const second = await importCardData(exported);
    expect(second.embeddedAssets?.[`chara-ext-asset_:${PATH_A}`]).toEqual(BYTES_A);
    expect(second.embeddedAssets?.[`chara-ext-asset_:${PATH_B}`]).toEqual(BYTES_B);
  });

  it('passed extras replace a stale chunk: one chunk per path, no duplicates', async () => {
    const imported = await importCardData(fixturePng());
    const card = imported.card as CharacterCardV3;
    const staleBase = buildPng([
      cardChunk(),
      extraChunk(PATH_A, bytesToBase64(new Uint8Array([9, 9, 9]))),
    ]);
    const exported = writeCardToPng(card, {
      basePng: staleBase,
      extraAssets: { [PATH_A]: BYTES_A, [PATH_B]: BYTES_B },
    });
    expect(chunksNamed(exported, `chara-ext-asset_:${PATH_A}`).map((c) => c.text)).toEqual([
      bytesToBase64(BYTES_A),
    ]);
    expect(chunksNamed(exported, `chara-ext-asset_:${PATH_B}`).map((c) => c.text)).toEqual([
      bytesToBase64(BYTES_B),
    ]);
  });

  it('without the extraAssets option a base PNG keeps its extra chunks', async () => {
    const imported = await importCardData(fixturePng());
    const card = imported.card as CharacterCardV3;
    const exported = writeCardToPng(card, { basePng: fixturePng() });
    const readBack = readCardFromPng(exported);
    expect(readBack.extraAssets?.[PATH_A]).toBe(bytesToBase64(BYTES_A));
    expect(readBack.extraAssets?.[PATH_B]).toBe(bytesToBase64(BYTES_B));
  });

  it('exportCardData with no prefixed key keeps the cover chunks', async () => {
    const imported = await importCardData(fixturePng());
    const card = imported.card as CharacterCardV3;
    const exported = await exportCardData(card, 'png', {
      embeddedAssets: { 'embeded://icon/main.png': fixturePng() },
    });
    const readBack = readCardFromPng(exported);
    expect(readBack.extraAssets?.[PATH_A]).toBe(bytesToBase64(BYTES_A));
    expect(readBack.extraAssets?.[PATH_B]).toBe(bytesToBase64(BYTES_B));
  });

  it('an asset above the limit throws with its path in the message', async () => {
    const card = createNewDefaultCard('Extra Asset Test');
    const big = new Uint8Array(MAX_BYTES + 1);
    expect(() =>
      writeCardToPng(card, { extraAssets: { 'assets/big.bin': big } }),
    ).toThrow('Extra asset "assets/big.bin" is too large to embed in a PNG.');
  });
});

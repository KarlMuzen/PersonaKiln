import extractChunks from 'png-chunks-extract';
import encodeChunks from 'png-chunks-encode';
import pngChunkText from 'png-chunk-text';

import {
  CharacterCardV3Schema,
  type CharacterCardV3,
} from '../schemas/cardSchema';
import { convertV3ToV2, normalizeRawToV3Card, sanitizeObject } from './converter';
import { base64ToUtf8, createDummyPng, utf8ToBase64 } from '../utils/encoding';

const MAX_PAYLOAD_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * Encodes bytes as base64 in slices so a large asset cannot overflow the
 * call stack through a single String.fromCharCode call. Not utf8ToBase64:
 * that helper is for text, and these bytes are a file.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export interface ReadPngResult {
  card: CharacterCardV3;
  sourceFormat: 'ccv3' | 'chara_v2';
  extraAssets?: Record<string, string>; // path -> base64
  pngImageBytes?: Uint8Array;
  warnings?: string[];
}

/**
 * Safely decodes text from a tEXt chunk that might be base64, URL-encoded, or raw JSON.
 */
function decodeChunkToJSON(rawText: string): Record<string, unknown> | null {
  if (!rawText || typeof rawText !== 'string') return null;

  // 1. Try base64
  try {
    const jsonStr = base64ToUtf8(rawText.trim());
    if (jsonStr.length <= MAX_PAYLOAD_SIZE) {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object') return sanitizeObject(parsed);
    }
  } catch {
    // ignore
  }

  // 2. Try URL encoded
  try {
    const decoded = decodeURIComponent(rawText.trim());
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === 'object') return sanitizeObject(parsed);
  } catch {
    // ignore
  }

  // 3. Try raw JSON
  try {
    const parsed = JSON.parse(rawText.trim());
    if (parsed && typeof parsed === 'object') return sanitizeObject(parsed);
  } catch {
    // ignore
  }

  return null;
}

/**
 * Rank of a card-chunk keyword, lower-cased: ccv3 first, then chara, then
 * every other accepted name. SillyTavern and RisuAI read ccv3 first.
 */
function rankOfKeyword(keyword: string): number {
  const lower = keyword.toLowerCase();
  if (lower === 'ccv3') return 1;
  if (lower === 'chara') return 2;
  return 3;
}

/**
 * Given several candidate tEXt values that decode to card JSONs, pick one.
 * The best rank that has at least one chunk decoding to a JSON object wins;
 * only that rank's chunks compete. Inside the rank the old rule applies: if
 * some chunks have a character_book and some do not, only those with one
 * compete; the longest JSON.stringify wins; on equal length the later chunk
 * in the file wins. A chunk that does not decode never competes, and a
 * better rank whose chunks all failed to decode is skipped.
 */
function pickBestDuplicateCandidate(
  candidates: { text: string; keyword: string }[]
): { json: Record<string, unknown>; keyword: string; warning?: string } | null {
  if (candidates.length === 0) return null;

  const decoded = candidates.map((c) => {
    const json = decodeChunkToJSON(c.text);
    return { text: c.text, keyword: c.keyword, json };
  });
  const decodedPool = decoded.filter(
    (d): d is { text: string; keyword: string; json: Record<string, unknown> } =>
      d.json !== null,
  );

  if (decodedPool.length === 0) return null;

  const bestRank = Math.min(...decodedPool.map((d) => rankOfKeyword(d.keyword)));
  const rankPool = decodedPool.filter((d) => rankOfKeyword(d.keyword) === bestRank);

  const withBook = rankPool.filter((d) => {
    const data = d.json?.data as Record<string, unknown> | undefined;
    return Boolean(data?.character_book || d.json?.character_book);
  });
  const bookNarrowed = withBook.length > 0 && withBook.length < rankPool.length;
  const pool = withBook.length > 0 ? withBook : rankPool;

  const best = pool.reduce((a, b) => {
    const aLen = JSON.stringify(a.json).length;
    const bLen = JSON.stringify(b.json).length;
    return bLen >= aLen ? b : a;
  });

  let warning: string | undefined = undefined;
  if (candidates.length > 1) {
    const list = candidates.map((c) => `'${c.keyword}'`).join(', ');
    warning = `Found ${candidates.length} card chunks (${list}); used '${best.keyword}'.`;
    if (candidates.some((c) => rankOfKeyword(c.keyword) !== bestRank)) {
      warning += ' Order used: ccv3, then chara, then other names.';
    }
    const unreadable = candidates
      .filter((_, i) => decoded[i].json === null)
      .map((c) => `'${c.keyword}'`);
    if (unreadable.length > 0) {
      warning += ` Could not read: ${unreadable.join(', ')}.`;
    }
    if (rankPool.length > 1) {
      warning += ` Several chunks of the same rank were read; picked ${
        bookNarrowed
          ? 'the one with a character_book'
          : 'the longest (the later one if equal)'
      }.`;
    }
  }

  return { json: best.json, keyword: best.keyword, warning };
}

/**
 * Reads a Character Card V3 or V2 object from a PNG image buffer.
 */
export function readCardFromPng(pngBuffer: Uint8Array): ReadPngResult {
  if (pngBuffer.length > MAX_PAYLOAD_SIZE) {
    throw new Error(`Import failed: File size (${Math.round(pngBuffer.length / 1024 / 1024)}MB) exceeds maximum limit.`);
  }

  const chunks = extractChunks(pngBuffer);

  const textChunks = chunks
    .filter((chunk: { name: string }) => chunk.name === 'tEXt')
    .map((chunk: { data: Uint8Array }) => {
      if (chunk.data.length > MAX_PAYLOAD_SIZE) {
        throw new Error(`Import failed: tEXt chunk size (${Math.round(chunk.data.length / 1024 / 1024)}MB) exceeds maximum limit.`);
      }
      return pngChunkText.decode(chunk.data);
    });

  const warnings: string[] = [];

  const CARD_KEYWORDS = new Set([
    'ccv3',
    'chara',
    'chara_card_v3',
    'chara_card_v2',
    'character',
    'character_card',
    'tavern',
    'card',
  ]);

  const candidateChunks = textChunks.filter((c: { keyword: string }) =>
    CARD_KEYWORDS.has(c.keyword.toLowerCase())
  );

  const best = pickBestDuplicateCandidate(candidateChunks);

  if (best && best.json) {
    if (best.warning) warnings.push(best.warning);

    const { card, warnings: normWarnings } = normalizeRawToV3Card(best.json);
    if (normWarnings && normWarnings.length > 0) warnings.push(...normWarnings);

    // Read extra assets if present: chara-ext-asset_:{path}
    const extraAssets: Record<string, string> = {};
    for (const chunk of textChunks) {
      if (chunk.keyword.startsWith('chara-ext-asset_:')) {
        const path = chunk.keyword.replace('chara-ext-asset_:', '');
        extraAssets[path] = chunk.text;
      }
    }

    return {
      card,
      sourceFormat: best.keyword.toLowerCase() === 'chara' ? 'chara_v2' : 'ccv3',
      extraAssets: Object.keys(extraAssets).length > 0 ? extraAssets : undefined,
      pngImageBytes: pngBuffer,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // Fallback: If no metadata chunk found, create a new card using this PNG as avatar
  const now = Math.floor(Date.now() / 1000);
  const fallbackCard: CharacterCardV3 = {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name: 'Imported Character',
      description: 'Character imported from PNG image.',
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
      assets: [
        {
          type: 'icon',
          uri: 'embeded://icon/main.png',
          name: 'main',
          ext: 'png',
        },
      ],
      creation_date: now,
      modification_date: now,
    },
  };

  return {
    card: CharacterCardV3Schema.parse(fallbackCard),
    sourceFormat: 'ccv3',
    pngImageBytes: pngBuffer,
    warnings: ['No embedded card metadata chunk found in PNG. Created new card with uploaded image as avatar.'],
  };
}

export interface WritePngOptions {
  basePng?: Uint8Array;
  backfillV2?: boolean;
  /** Bare path -> bytes. When passed (even empty), replaces the base PNG's extra-asset chunks. */
  extraAssets?: Record<string, Uint8Array>;
}

/**
 * Writes a CharacterCardV3 object into a PNG image as tEXt chunks.
 */
export function writeCardToPng(
  card: CharacterCardV3,
  options: WritePngOptions = {}
): Uint8Array {
  const basePng = options.basePng || createDummyPng();
  const chunks = extractChunks(basePng);
  const extraAssets = options.extraAssets;

  // Filter out any existing 'ccv3' or 'chara' tEXt chunks, and, when extra
  // assets are passed, every existing 'chara-ext-asset_:' chunk as well, so
  // stale entries cannot survive alongside the new ones.
  const cleanChunks = chunks.filter((chunk: { name: string; data: Uint8Array }) => {
    if (chunk.name !== 'tEXt') return true;
    const decoded = pngChunkText.decode(chunk.data);
    if (decoded.keyword === 'ccv3' || decoded.keyword === 'chara') return false;
    if (extraAssets !== undefined && decoded.keyword.startsWith('chara-ext-asset_:')) return false;
    return true;
  });

  // Create CCv3 tEXt chunk
  const validatedCard = CharacterCardV3Schema.parse(card);
  const jsonStrStr = JSON.stringify(validatedCard);
  const base64V3 = utf8ToBase64(jsonStrStr);
  const ccv3Chunk = pngChunkText.encode('ccv3', base64V3);

  // Find insertion point right after IHDR (the first chunk). Placing metadata
  // here, rather than just before IEND, matches the convention most
  // third-party card readers expect: some only scan chunks up to the first
  // IDAT, or grab the first occurrence of a keyword rather than the last.
  // Writing here also means a plain PIL/Image.open() (without a forced
  // .load()) will see the chara/ccv3 chunk immediately.
  const ihdrIndex = cleanChunks.findIndex(
    (chunk: { name: string }) => chunk.name === 'IHDR'
  );
  const insertPos = ihdrIndex >= 0 ? ihdrIndex + 1 : 0;

  cleanChunks.splice(insertPos, 0, ccv3Chunk);

  // Optionally backfill CCv2 'chara' chunk (inserted right after ccv3, still
  // ahead of IDAT)
  if (options.backfillV2) {
    const v2Card = convertV3ToV2(validatedCard, true);
    const base64V2 = utf8ToBase64(JSON.stringify(v2Card));
    const charaChunk = pngChunkText.encode('chara', base64V2);
    cleanChunks.splice(insertPos + 1, 0, charaChunk);
  }

  // Optionally write extra-asset chunks right after ccv3 (and chara, with
  // backfillV2), still ahead of IDAT, one per asset in ascending key order.
  if (extraAssets !== undefined) {
    let extraInsertPos = insertPos + 1 + (options.backfillV2 ? 1 : 0);
    for (const path of Object.keys(extraAssets).sort()) {
      const base64 = bytesToBase64(extraAssets[path]);
      if (base64.length > MAX_PAYLOAD_SIZE) {
        throw new Error(`Extra asset "${path}" is too large to embed in a PNG.`);
      }
      cleanChunks.splice(
        extraInsertPos,
        0,
        pngChunkText.encode(`chara-ext-asset_:${path}`, base64),
      );
      extraInsertPos += 1;
    }
  }

  return encodeChunks(cleanChunks);
}

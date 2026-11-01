import {
  CharacterCardV3Schema,
  StandaloneLorebookSchema,
  type CharacterCardV3,
  type Lorebook,
} from '../schemas/cardSchema';
import { normalizeRawToV3Card } from './converter';
import { normalizeLorebook, looksLikeStandaloneLorebook } from '../utils/normalizeLorebook';
import { readCardFromPng, writeCardToPng } from './png';
import { isPng, pickCoverBytes } from '../core/coverAsset';
import { readCardFromCharx, writeCardToCharx } from './charx';
export { importChubCard, parseChubInput } from './chub';

export type CardImportFormat = 'png' | 'json' | 'charx' | 'lorebook';

export interface ImportResult {
  format: CardImportFormat;
  card?: CharacterCardV3;
  lorebook?: Lorebook;
  embeddedAssets?: Record<string, Uint8Array>;
  warnings?: string[];
}

function detectImageExt(bytes: Uint8Array): 'png' | 'jpg' | 'webp' | 'gif' | null {
  if (bytes.length < 4) return null;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png';
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg';
  }
  // WEBP: RIFF...WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'webp';
  }
  // GIF: GIF8
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'gif';
  }
  return null;
}

function base64ToBytes(base64Val: string): Uint8Array | null {
  const cleaned = base64Val.replace(/\s+/g, '');
  try {
    const binaryStr = atob(cleaned);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function tryExtractAvatarImage(avatarStr: string): { imgBin: Uint8Array; ext: string } | null {
  const trimmed = avatarStr.trim();
  if (!trimmed) return null;

  let base64Data = '';
  let hintExt: string | null = null;

  if (trimmed.startsWith('data:image/')) {
    const parts = trimmed.split(',');
    if (parts.length >= 2) {
      base64Data = parts[1].trim();
      const mime = parts[0].split(';')[0].split('/')[1];
      if (mime) hintExt = mime === 'jpeg' ? 'jpg' : mime;
    }
  } else if (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('embeded://') &&
    !trimmed.startsWith('ccdefault:') &&
    !trimmed.startsWith('chara-ext-asset_:')
  ) {
    // Bare base64 candidate
    base64Data = trimmed.replace(/\s+/g, '');
  } else {
    return null;
  }

  if (!base64Data || base64Data.length < 20) return null;

  try {
    const binaryStr = atob(base64Data);
    const imgBin = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      imgBin[i] = binaryStr.charCodeAt(i);
    }
    const detectedExt = detectImageExt(imgBin) || hintExt;
    if (detectedExt) {
      return { imgBin, ext: detectedExt };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Universal auto-detecting card/lorebook importer.
 * Accepts raw file binary (Uint8Array) or string.
 */
export async function importCardData(
  input: Uint8Array | string,
  fileName?: string
): Promise<ImportResult> {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input;

  // 1. Try PNG magic header: 137 80 78 71 (0x89 'P' 'N' 'G')
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const pngResult = readCardFromPng(bytes);
    const card = pngResult.card;

    const embeddedAssets: Record<string, Uint8Array> = {};
    if (pngResult.pngImageBytes) {
      embeddedAssets['embeded://icon/main.png'] = pngResult.pngImageBytes;
      // Ensure icon asset points to embedded image
      const iconAsset = card.data.assets?.find((a) => a.type === 'icon');
      if (!iconAsset || iconAsset.uri === 'ccdefault:') {
        card.data.assets = [
          {
            type: 'icon',
            uri: 'embeded://icon/main.png',
            name: 'main',
            ext: 'png',
          },
          ...(card.data.assets?.filter((a) => a.type !== 'icon') || []),
        ];
      }
    }

    let warnings = pngResult.warnings;
    if (pngResult.extraAssets) {
      const collected: string[] = [...(warnings ?? [])];
      for (const [path, base64Val] of Object.entries(pngResult.extraAssets)) {
        const bytes = base64ToBytes(base64Val);
        if (bytes === null) {
          collected.push(`Extra PNG asset "${path}" is not valid base64 and was skipped.`);
          continue;
        }
        embeddedAssets[`chara-ext-asset_:${path}`] = bytes;
      }
      warnings = collected.length > 0 ? collected : undefined;
    }

    return {
      format: 'png',
      card,
      embeddedAssets: Object.keys(embeddedAssets).length > 0 ? embeddedAssets : undefined,
      warnings,
    };
  }

  // 2. Try PK zip magic header: 80 75 3 4 (0x50 0x4B 0x03 0x04) -> CHARX
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    const charxResult = await readCardFromCharx(bytes);
    return {
      format: 'charx',
      card: charxResult.card,
      embeddedAssets: charxResult.embeddedAssets,
      warnings: charxResult.warnings,
    };
  }

  // 3. Try JSON / Text parsing
  let jsonStr = '';
  try {
    jsonStr = new TextDecoder('utf-8').decode(bytes);
  } catch {
    jsonStr = typeof input === 'string' ? input : '';
  }

  const trimmed = jsonStr.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);

      // Standalone Lorebook check
      if (parsed.spec === 'lorebook_v3') {
        const validatedLorebook = StandaloneLorebookSchema.parse(parsed);
        return {
          format: 'lorebook',
          lorebook: validatedLorebook.data,
        };
      }

      // SillyTavern standalone world-info uses an entries map and has no spec.
      if (looksLikeStandaloneLorebook(parsed)) {
        const lorebook = normalizeLorebook(parsed);
        if (lorebook) {
          if (typeof parsed.name === 'string' && parsed.name.trim()) {
            lorebook.name = parsed.name;
          } else if (fileName) {
            lorebook.name = fileName.replace(/\.[^/.]+$/, '');
          }
          return { format: 'lorebook', lorebook, warnings: [] };
        }
      }

      // Extract embedded avatar Data-URI or bare base64 if available
      const embeddedAssets: Record<string, Uint8Array> = {};
      const avatar =
        parsed.data?.avatar ||
        parsed.data?.extensions?.avatar ||
        parsed.avatar ||
        parsed.image ||
        parsed.icon;

      const avatarWarnings: string[] = [];

      if (typeof avatar === 'string' && avatar.trim()) {
        const trimmedAvatar = avatar.trim();
        if (
          trimmedAvatar.startsWith('http://') ||
          trimmedAvatar.startsWith('https://') ||
          trimmedAvatar.startsWith('embeded://') ||
          trimmedAvatar.startsWith('ccdefault:') ||
          trimmedAvatar.startsWith('chara-ext-asset_:')
        ) {
          if (!parsed.data) parsed.data = {};
          if (!parsed.data.assets) parsed.data.assets = [];
          if (!parsed.data.assets.some((a: { type?: string }) => a.type === 'icon')) {
            parsed.data.assets.unshift({
              type: 'icon',
              uri: trimmedAvatar,
              name: 'main',
              ext: 'png',
            });
          }
        } else {
          const extracted = tryExtractAvatarImage(trimmedAvatar);
          if (extracted) {
            const uri = `embeded://icon/main.${extracted.ext}`;
            embeddedAssets[uri] = extracted.imgBin;
            if (!parsed.data) parsed.data = {};
            if (!parsed.data.assets) parsed.data.assets = [];
            parsed.data.assets.unshift({
              type: 'icon',
              uri,
              name: 'main',
              ext: extracted.ext,
            });
          } else {
            avatarWarnings.push('Avatar field present but could not be extracted as an image');
          }
        }
      }

      const { card, warnings } = normalizeRawToV3Card(parsed, fileName);
      if (avatarWarnings.length > 0) {
        warnings.push(...avatarWarnings);
      }

      return {
        format: 'json',
        card,
        embeddedAssets: Object.keys(embeddedAssets).length > 0 ? embeddedAssets : undefined,
        warnings,
      };
    } catch {
      // proceed to fallback
    }
  }

  // Fallback for unstructured text files
  const fallbackCard = normalizeRawToV3Card(
    {
      name: fileName ? fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ') : 'Imported Character',
      description: jsonStr.slice(0, 5000),
      first_mes: jsonStr.length > 0 ? `*Imported notes*:\n\n${jsonStr.slice(0, 2000)}` : '',
    },
    fileName
  );

  return {
    format: 'json',
    card: fallbackCard.card,
    warnings: ['Imported file as character card.'],
  };
}

/**
 * Universal exporter helper
 */
export async function exportCardData(
  card: CharacterCardV3,
  format: 'png' | 'json' | 'charx',
  options: {
    basePng?: Uint8Array;
    backfillV2?: boolean;
    embeddedAssets?: Record<string, Uint8Array>;
  } = {}
): Promise<Uint8Array> {
  const validatedCard = CharacterCardV3Schema.parse(card);

  if (format === 'json') {
    const jsonStr = JSON.stringify(validatedCard, null, 2);
    return new TextEncoder().encode(jsonStr);
  }

  if (format === 'png') {
    const cover = pickCoverBytes(validatedCard, options.embeddedAssets);
    const basePng = options.basePng ?? (cover && isPng(cover) ? cover : undefined);
    const extraAssets: Record<string, Uint8Array> = {};
    if (options.embeddedAssets) {
      for (const [key, bytes] of Object.entries(options.embeddedAssets)) {
        if (key.startsWith('chara-ext-asset_:')) {
          extraAssets[key.replace('chara-ext-asset_:', '')] = bytes;
        }
      }
    }
    return writeCardToPng(validatedCard, {
      basePng,
      backfillV2: options.backfillV2,
      ...(Object.keys(extraAssets).length > 0 ? { extraAssets } : {}),
    });
  }

  if (format === 'charx') {
    return writeCardToCharx(validatedCard, options.embeddedAssets || {});
  }

  throw new Error(`Unsupported export format: ${format}`);
}

/**
 * Export standalone lorebook
 */
export function exportStandaloneLorebook(lorebook: Lorebook): string {
  return JSON.stringify(
    {
      spec: 'lorebook_v3',
      data: lorebook,
    },
    null,
    2
  );
}

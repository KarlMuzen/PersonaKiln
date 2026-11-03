import JSZip from 'jszip';
import {
  CharacterCardV3Schema,
  type CharacterCardV3,
} from '../schemas/cardSchema';
import { normalizeRawToV3Card } from './converter';
import { looksLikeStandaloneLorebook } from '../utils/normalizeLorebook';

const MAX_ENTRIES = 500;
const MAX_TOTAL_UNCOMPRESSED_SIZE = 250 * 1024 * 1024; // 250 MB
const MAX_SINGLE_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_COMPRESSION_RATIO = 100;

export interface ReadCharxResult {
  card: CharacterCardV3;
  embeddedAssets: Record<string, Uint8Array>; // URI (e.g., 'embeded://path') -> Uint8Array
  warnings?: string[];
}

function isCharacterCardJson(parsed: unknown): parsed is Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const obj = parsed as Record<string, unknown>;
  if (obj.spec === 'lorebook_v3' || looksLikeStandaloneLorebook(obj)) return false;
  const data =
    obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)
      ? (obj.data as Record<string, unknown>)
      : undefined;
  return Boolean(
    obj.spec === 'chara_card_v3' ||
      obj.spec === 'chara_card_v2' ||
      data?.name ||
      obj.name ||
      obj.char_name
  );
}

/**
 * Categorizes an asset file extension into the spec directory bucket.
 */
export function getAssetCategory(ext: string): string {
  const cleanExt = ext.toLowerCase().replace(/^\./, '');
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg'].includes(cleanExt)) {
    return 'images';
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(cleanExt)) {
    return 'audio';
  }
  if (['mp4', 'webm', 'ogv', 'avi', 'mov'].includes(cleanExt)) {
    return 'video';
  }
  if (['moc3', 'model3.json'].includes(cleanExt)) {
    return 'l2d';
  }
  if (['mmd', 'obj', 'fbx', 'gltf', 'glb', 'vrm'].includes(cleanExt)) {
    return '3d';
  }
  if (['safetensors', 'ckpt', 'onnx', 'bin', 'gguf'].includes(cleanExt)) {
    return 'ai';
  }
  if (['otf', 'ttf', 'woff', 'woff2'].includes(cleanExt)) {
    return 'fonts';
  }
  if (['lua', 'js', 'ts', 'py', 'json'].includes(cleanExt)) {
    return 'code';
  }
  return 'other';
}

/**
 * Reads a .charx zip file buffer and returns the validated CharacterCardV3 object and embedded assets.
 */
export async function readCardFromCharx(zipBuffer: Uint8Array): Promise<ReadCharxResult> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const entries = Object.entries(zip.files);

  if (entries.length > MAX_ENTRIES) {
    throw new Error(`Import failed: Archive exceeds max entry count (${MAX_ENTRIES}).`);
  }

  const warnings: string[] = [];
  const embeddedAssets: Record<string, Uint8Array> = {};

  let totalUncompressed = 0;
  const compressedArchiveSize = zipBuffer.byteLength || 1;

  // 1. Uncompress and safety check all files
  const fileDataMap: Record<string, Uint8Array> = {};

  for (const [relativePath, file] of entries) {
    if (file.dir) continue;

    if (relativePath.includes('../') || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
      throw new Error(`Import failed: Path traversal detected in zip entry "${relativePath}".`);
    }

    // Inspect declared uncompressed size before decompressing into memory
    const declaredUncompressed = (file as any)._data?.uncompressedSize ?? (file as any).uncompressedSize ?? 0;
    if (declaredUncompressed > MAX_SINGLE_FILE_SIZE) {
      throw new Error(`Import failed: File "${relativePath}" declared size (${Math.round(declaredUncompressed / 1024 / 1024)}MB) exceeds max single file limit of ${MAX_SINGLE_FILE_SIZE / 1024 / 1024}MB.`);
    }

    const data = await file.async('uint8array');

    if (data.byteLength > MAX_SINGLE_FILE_SIZE) {
      throw new Error(`Import failed: File "${relativePath}" exceeds max single file size of ${MAX_SINGLE_FILE_SIZE / 1024 / 1024}MB.`);
    }

    totalUncompressed += data.byteLength;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_SIZE) {
      throw new Error(`Import failed: Total uncompressed size exceeds limit of ${MAX_TOTAL_UNCOMPRESSED_SIZE / 1024 / 1024}MB.`);
    }

    if (totalUncompressed / compressedArchiveSize > MAX_COMPRESSION_RATIO && totalUncompressed > 1024 * 1024) {
      throw new Error(`Import failed: Suspicious compression ratio in archive. Possible zip bomb.`);
    }

    if (relativePath.startsWith('__MACOSX') || relativePath.includes('/.')) continue;

    fileDataMap[relativePath] = data;
  }

  if (Object.keys(fileDataMap).some((p) => p.toLowerCase().endsWith('.charx'))) {
    throw new Error('Import failed: Archive contains nested .charx files, not a single CHARX card.');
  }

  // 2. Find all character card JSON files inside the zip
  const POSS_CARD_JSON_NAMES = ['card.json', 'character.json', 'card.v3.json', 'card.v2.json', 'data.json'];
  const cardJsonCandidates: { path: string; parsed: Record<string, unknown>; isStandardName: boolean }[] = [];

  for (const [relPath, bytes] of Object.entries(fileDataMap)) {
    const lower = relPath.toLowerCase();
    if (!lower.endsWith('.json')) continue;
    try {
      const text = new TextDecoder('utf-8').decode(bytes);
      const parsed = JSON.parse(text);
      if (isCharacterCardJson(parsed)) {
        const isStandardName = POSS_CARD_JSON_NAMES.some(
          (candidate) => lower === candidate || lower.endsWith('/' + candidate)
        );
        cardJsonCandidates.push({ path: relPath, parsed, isStandardName });
      }
    } catch {
      // ignore non-JSON or malformed JSON assets
    }
  }

  if (cardJsonCandidates.length === 0) {
    throw new Error('Import failed: No character card JSON found in CHARX archive.');
  }

  if (cardJsonCandidates.length > 1) {
    throw new Error('Import failed: Archive contains multiple character cards.');
  }

  const chosen = cardJsonCandidates[0];
  if (!chosen.isStandardName && Object.keys(fileDataMap).length > 1) {
    throw new Error('Import failed: Archive contains multiple files without a standard CHARX descriptor.');
  }

  const cardFileEntryPath = chosen.path;
  const norm = normalizeRawToV3Card(chosen.parsed);
  const card: CharacterCardV3 = norm.card;
  if (norm.warnings) warnings.push(...norm.warnings);

  // 3. Collect embedded assets
  for (const [relativePath, data] of Object.entries(fileDataMap)) {
    if (relativePath === cardFileEntryPath) continue;

    const uriKey = relativePath.startsWith('embeded://')
      ? relativePath
      : `embeded://${relativePath}`;
    embeddedAssets[uriKey] = data;
  }

  // Auto-wire main image asset if available in zip and not already linked
  const imageAssetKey = Object.keys(embeddedAssets).find((uri) =>
    /\.(png|jpg|jpeg|webp|gif|avif)$/i.test(uri)
  );

  if (imageAssetKey) {
    const iconAsset = card.data.assets?.find((a) => a.type === 'icon');
    if (!iconAsset || iconAsset.uri === 'ccdefault:') {
      const ext = imageAssetKey.split('.').pop() || 'png';
      card.data.assets = [
        {
          type: 'icon',
          uri: imageAssetKey,
          name: 'main',
          ext,
        },
        ...(card.data.assets?.filter((a) => a.type !== 'icon') || []),
      ];
    }
  }

  return {
    card,
    embeddedAssets,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Writes a CharacterCardV3 object and its embedded assets into a .charx zip file binary.
 */
export async function writeCardToCharx(
  card: CharacterCardV3,
  embeddedAssets: Record<string, Uint8Array> = {}
): Promise<Uint8Array> {
  const zip = new JSZip();

  const validatedCard = CharacterCardV3Schema.parse(card);
  zip.file('card.json', JSON.stringify(validatedCard, null, 2));

  let totalSize = 0;
  const assetEntries = Object.entries(embeddedAssets);
  
  if (assetEntries.length > MAX_ENTRIES) {
    throw new Error(`Export failed: Exceeds max entry count (${MAX_ENTRIES}).`);
  }

  for (const [uriOrPath, binary] of assetEntries) {
    const zipPath = uriOrPath.replace(/^embeded:\/\//, '');
    if (zipPath.includes('../') || zipPath.startsWith('/')) {
      throw new Error(`Export failed: Invalid path "${zipPath}".`);
    }
    
    if (binary.byteLength > MAX_SINGLE_FILE_SIZE) {
      throw new Error(`Export failed: File "${zipPath}" exceeds max single file size.`);
    }
    
    totalSize += binary.byteLength;
    if (totalSize > MAX_TOTAL_UNCOMPRESSED_SIZE) {
      throw new Error(`Export failed: Total size exceeds limit.`);
    }
    
    zip.file(zipPath, binary);
  }

  const zipContent = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return zipContent;
}

import type { StoredCard } from '../../db';

export type DuplicateChoice = 'overwrite' | 'duplicate' | 'cancel';

export function getCardCoverUrl(cardRecord: StoredCard): string | null {
  const data = cardRecord.cardData?.data;
  if (!data) return null;

  const assets = data.assets || [];
  const iconAsset =
    assets.find((a) => a.type === 'icon' && a.name === 'main') ||
    assets.find((a) => a.type === 'icon');

  if (iconAsset && iconAsset.uri && iconAsset.uri !== 'ccdefault:') {
    const uri = iconAsset.uri;
    if (
      (uri.startsWith('embeded://') || uri.startsWith('chara-ext-asset_:')) &&
      cardRecord.embeddedAssets
    ) {
      const rawBin = cardRecord.embeddedAssets[uri] || cardRecord.embeddedAssets['embeded://icon/main.png'];
      if (rawBin && rawBin.length > 0) {
        const blob = new Blob([rawBin as unknown as BlobPart], { type: `image/${iconAsset.ext || 'png'}` });
        return URL.createObjectURL(blob);
      }
    }
    if (uri.startsWith('data:image/') || uri.startsWith('http://') || uri.startsWith('https://')) {
      return uri;
    }
  }

  // Fallback 1: check embeddedAssets map directly
  if (cardRecord.embeddedAssets) {
    for (const key of Object.keys(cardRecord.embeddedAssets)) {
      const rawBin = cardRecord.embeddedAssets[key];
      if (rawBin && rawBin.length > 0) {
        const blob = new Blob([rawBin as unknown as BlobPart], { type: 'image/png' });
        return URL.createObjectURL(blob);
      }
    }
  }

  // Fallback 2: check avatar / image fields
  const avatar =
    data.avatar ||
    (data.extensions?.avatar as string | undefined) ||
    ((data as Record<string, unknown>).image as string | undefined);
  if (typeof avatar === 'string' && avatar.trim().length > 0) {
    if (avatar.startsWith('data:image/') || avatar.startsWith('http://') || avatar.startsWith('https://')) {
      return avatar;
    }
    const trimmedAvatar = avatar.trim();
    const looksLikeBase64 =
      trimmedAvatar.length > 200 &&
      trimmedAvatar.length % 4 === 0 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(trimmedAvatar);
    if (looksLikeBase64) {
      return `data:image/png;base64,${trimmedAvatar}`;
    }
  }

  return null;
}

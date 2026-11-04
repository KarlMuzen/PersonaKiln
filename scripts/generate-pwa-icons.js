import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');
const sourceLogo = path.join(publicDir, 'forge-mark.svg'); // rounded tile (any / favicon / in-app)
const sourceMaskable = path.join(publicDir, 'forge-mark-maskable.svg'); // full-bleed, safe-zone artwork

for (const src of [sourceLogo, sourceMaskable]) {
  if (!fs.existsSync(src)) {
    console.error(`Source logo not found at: ${src}`);
    process.exit(1);
  }
}

/**
 * Two sources, one artwork. `forge-mark.svg` is a rounded tile used where the
 * icon is shown as-is. `forge-mark-maskable.svg` is full-bleed with the artwork
 * inside the safe zone, so Android launcher masks and the splash screen never
 * clip it or reveal a box. iOS adds its own rounding, so it gets the full-bleed one.
 */
async function generateIcon(size, filename, source = sourceLogo) {
  await sharp(source, { density: 384 })
    .resize(size, size, { fit: 'contain' })
    .png()
    .toFile(path.join(publicDir, filename));
  console.log(`✓ ${filename}`);
}

async function generateIcons() {
  console.log('Generating PersonaKiln icons from:', sourceLogo);
  await generateIcon(192, 'pwa-192x192.png');
  await generateIcon(512, 'pwa-512x512.png');
  await generateIcon(192, 'pwa-maskable-192x192.png', sourceMaskable);
  await generateIcon(512, 'pwa-maskable-512x512.png', sourceMaskable);
  await generateIcon(180, 'apple-touch-icon.png', sourceMaskable);
  await generateIcon(64, 'favicon.png');
  await generateIcon(512, 'brand_logo.png');
  console.log('All PersonaKiln icons generated successfully!');
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});

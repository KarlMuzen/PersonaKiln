import { type CharacterCardV3 } from '../schemas/cardSchema';
import { exportCardData } from '../io';
import { countTokens } from './tokenizer';

interface GenerateVisualCardOptions {
  card: CharacterCardV3;
  coverUrl?: string | null;
  provider?: string;
}

/**
 * Helper to wrap text into multiple lines for HTML5 Canvas 2D
 */
function sanitizeTextForCard(text: string): string {
  if (!text) return '';
  return text
    // Strip bold and italic markdown markers
    .replace(/\*{1,3}|_{1,3}/g, '')
    // Split lines to filter out horizontal divider lines
    .split(/\r?\n/)
    .filter((line) => !/^\s*(---|___|———|\*\*\*)\s*$/.test(line))
    .join(' ')
    // Collapse repeated whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

export function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  if (!text) return [];
  const cleanText = sanitizeTextForCard(text);
  if (!cleanText) return [];
  const words = cleanText.split(' ');
  const lines: string[] = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length === maxLines - 1) {
        break;
      }
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  if (words.length > 0 && lines.length === maxLines) {
    // Add ellipsis to last line if cut off
    const lastIdx = lines.length - 1;
    if (ctx.measureText(lines[lastIdx] + '...').width <= maxWidth) {
      lines[lastIdx] = lines[lastIdx] + '...';
    } else {
      lines[lastIdx] = lines[lastIdx].substring(0, Math.max(0, lines[lastIdx].length - 3)) + '...';
    }
  }

  return lines;
}

/**
 * Draw a rounded rectangle on a 2D Canvas context
 */
export function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * Renders a full high-resolution visual representation poster canvas of a character card.
 * Returns raw PNG Uint8Array bytes of the visual canvas image.
 */
export async function renderVisualCardCanvasBytes({
  card,
  coverUrl,
  provider,
}: GenerateVisualCardOptions): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  const width = 800;
  const height = 1200;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not supported');
  }

  const d = card.data;

  // 1. Background Gradient (Dark Luxury Atmosphere)
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#0f0c15');
  bgGrad.addColorStop(0.4, '#1b1224');
  bgGrad.addColorStop(1, '#0b0910');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Decorative ambient glow behind cover art
  const glowGrad = ctx.createRadialGradient(400, 320, 50, 400, 320, 380);
  glowGrad.addColorStop(0, 'rgba(136, 19, 55, 0.35)');
  glowGrad.addColorStop(1, 'rgba(15, 12, 21, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, width, height);

  // Card Outer Frame & Border
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.3)';
  ctx.lineWidth = 3;
  drawRoundRect(ctx, 16, 16, width - 32, height - 32, 24);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  drawRoundRect(ctx, 22, 22, width - 44, height - 44, 20);
  ctx.stroke();

  // 2. Top Header Bar
  ctx.fillStyle = '#f43f5e';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('ROLEPLAY FORGE', 48, 52);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '500 12px system-ui, sans-serif';
  ctx.fillText('• CCv3 SPECIFICATION STUDIO', 158, 52);

  // Token Badge Top Right
  const tokenCount =
    countTokens(d.description, true, provider) +
    countTokens(d.personality, true, provider) +
    countTokens(d.scenario, true, provider) +
    countTokens(d.first_mes, true, provider);

  const badgeText = `${tokenCount} TOKENS`;
  ctx.font = 'bold 11px monospace';
  const badgeWidth = ctx.measureText(badgeText).width + 20;

  ctx.fillStyle = 'rgba(136, 19, 55, 0.6)';
  drawRoundRect(ctx, width - 48 - badgeWidth, 38, badgeWidth, 22, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.5)';
  ctx.stroke();

  ctx.fillStyle = '#fecdd3';
  ctx.fillText(badgeText, width - 38 - badgeWidth + 2, 53);

  // 3. Main Cover Portrait (x: 48, y: 70, width: 704, height: 500)
  const portX = 48;
  const portY = 70;
  const portW = 704;
  const portH = 500;
  const portR = 18;

  let loadedCoverImg: HTMLImageElement | null = null;
  if (coverUrl) {
    try {
      loadedCoverImg = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = coverUrl;
      });
    } catch {
      loadedCoverImg = null;
    }
  }

  ctx.save();
  drawRoundRect(ctx, portX, portY, portW, portH, portR);
  ctx.clip();

  if (loadedCoverImg) {
    // Draw scaled cover image with object-fit: cover logic
    const imgRatio = loadedCoverImg.width / loadedCoverImg.height;
    const boxRatio = portW / portH;
    let renderW = portW;
    let renderH = portH;
    let offsetX = portX;
    let offsetY = portY;

    if (imgRatio > boxRatio) {
      renderW = portH * imgRatio;
      offsetX = portX - (renderW - portW) / 2;
    } else {
      renderH = portW / imgRatio;
      offsetY = portY - (renderH - portH) / 2;
    }

    ctx.drawImage(loadedCoverImg, offsetX, offsetY, renderW, renderH);
  } else {
    // Fallback: Styled Emblem Art Box
    const portBg = ctx.createLinearGradient(portX, portY, portX + portW, portY + portH);
    portBg.addColorStop(0, '#1f1329');
    portBg.addColorStop(1, '#0e0814');
    ctx.fillStyle = portBg;
    ctx.fillRect(portX, portY, portW, portH);

    // Center initials / icon
    ctx.fillStyle = 'rgba(244, 63, 94, 0.15)';
    ctx.beginPath();
    ctx.arc(portX + portW / 2, portY + portH / 2, 80, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f43f5e';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initial = (d.name || 'C').charAt(0).toUpperCase();
    ctx.fillText(initial, portX + portW / 2, portY + portH / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // Smooth gradient overlay at bottom of portrait fading image directly into dark background
  const portGrad = ctx.createLinearGradient(0, portY + portH - 160, 0, portY + portH);
  portGrad.addColorStop(0, 'rgba(15, 12, 21, 0)');
  portGrad.addColorStop(0.5, 'rgba(15, 12, 21, 0.6)');
  portGrad.addColorStop(1, 'rgba(15, 12, 21, 1.0)'); // Solid blend with background color
  ctx.fillStyle = portGrad;
  ctx.fillRect(portX, portY + portH - 160, portW, 160);

  ctx.restore();

  // Portrait Border Frame (gradient stroke fading out at bottom to prevent hard cut line)
  const borderGrad = ctx.createLinearGradient(0, portY, 0, portY + portH);
  borderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
  borderGrad.addColorStop(0.6, 'rgba(255, 255, 255, 0.1)');
  borderGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 1.5;
  drawRoundRect(ctx, portX, portY, portW, portH, portR);
  ctx.stroke();

  // 4. Character Name & Author Line
  let currentY = 612;

  // Name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  const nameText = d.name || 'Untitled Character';
  ctx.fillText(nameText, 48, currentY);

  // Author
  const creatorText = d.creator ? `by ${d.creator}` : 'by Anonymous Creator';
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '500 13px system-ui, sans-serif';
  ctx.fillText(creatorText, 48, currentY + 22);

  currentY += 48;

  // 5. Tag Pills
  const tags = d.tags || [];
  if (tags.length > 0) {
    let tagX = 48;
    ctx.font = '600 11px system-ui, sans-serif';

    for (let i = 0; i < Math.min(tags.length, 6); i++) {
      const tagLabel = `#${tags[i]}`;
      const tagW = ctx.measureText(tagLabel).width + 18;

      if (tagX + tagW > width - 48) break;

      const isNsfw = /nsfw|18\+|adult|explicit|uncensored|erotica|rating:nsfw/i.test(tags[i]);

      if (isNsfw) {
        // Distinct amber/red style for NSFW / content rating tags
        ctx.fillStyle = 'rgba(153, 27, 27, 0.75)';
        drawRoundRect(ctx, tagX, currentY - 14, tagW, 22, 11);
        ctx.fill();

        ctx.strokeStyle = '#f87171'; // Distinct red/amber outline
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#fca5a5';
        ctx.fillText(tagLabel, tagX + 9, currentY + 1);
      } else {
        ctx.fillStyle = 'rgba(88, 28, 62, 0.5)';
        drawRoundRect(ctx, tagX, currentY - 14, tagW, 22, 11);
        ctx.fill();

        ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#f472b6';
        ctx.fillText(tagLabel, tagX + 9, currentY + 1);
      }

      tagX += tagW + 8;
    }
    currentY += 28;
  }

  // 6. Character Overview / Description Panel
  const descBoxY = currentY + 6;
  const descBoxW = 704;
  const descBoxH = 220;

  ctx.fillStyle = 'rgba(21, 14, 28, 0.85)';
  drawRoundRect(ctx, 48, descBoxY, descBoxW, descBoxH, 16);
  ctx.fill();

  ctx.strokeStyle = 'rgba(244, 63, 94, 0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Section Header
  ctx.fillStyle = '#f43f5e';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('CHARACTER OVERVIEW & BACKSTORY', 68, descBoxY + 30);

  // Section Content Text
  ctx.fillStyle = '#e4e4e7';
  ctx.font = '14px system-ui, sans-serif';
  const descContent = d.description || d.personality || 'No description provided.';
  const descLines = wrapTextLines(ctx, descContent, descBoxW - 40, 7);

  let textY = descBoxY + 56;
  for (const line of descLines) {
    ctx.fillText(line, 68, textY);
    textY += 22;
  }

  currentY = descBoxY + descBoxH + 16;

  // 7. First Greeting Quote Panel
  const greetBoxW = 704;
  const greetBoxH = 150;

  ctx.fillStyle = 'rgba(16, 10, 22, 0.9)';
  drawRoundRect(ctx, 48, currentY, greetBoxW, greetBoxH, 16);
  ctx.fill();

  ctx.strokeStyle = 'rgba(251, 113, 133, 0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Section Header
  ctx.fillStyle = '#fb7185';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('FIRST GREETING MESSAGE', 68, currentY + 28);

  // Quote Text (upright font, no italic for enhanced legibility)
  ctx.fillStyle = '#fbcfe8';
  ctx.font = '500 13.5px system-ui, sans-serif';
  const greetContent = d.first_mes ? `"${d.first_mes}"` : '"..."';
  const greetLines = wrapTextLines(ctx, greetContent, greetBoxW - 40, 4);

  let greetY = currentY + 52;
  for (const line of greetLines) {
    ctx.fillText(line, 68, greetY);
    greetY += 21;
  }

  // 8. Footer Divider Line & Branding
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(48, 1148);
  ctx.lineTo(752, 1148);
  ctx.stroke();

  ctx.fillStyle = '#71717a';
  ctx.font = '500 11px system-ui, sans-serif';
  ctx.fillText('CHARACTER CARD V3 SPECIFICATION • EMBEDDED METADATA PNG', 48, 1168);

  ctx.fillStyle = '#f43f5e';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('EXPORTED WITH Roleplay Forge', 752, 1168);
  ctx.textAlign = 'left';

  // Convert canvas to PNG Blob -> Uint8Array
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('Failed to create PNG blob from canvas');
  }

  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Universal Visual Card PNG exporter that renders a visual poster representation
 * and embeds full spec-compliant CCv3 & CCv2 PNG tEXt chunks.
 */
export async function exportVisualCardPng(
  card: CharacterCardV3,
  options: {
    coverUrl?: string | null;
    provider?: string;
    embeddedAssets?: Record<string, Uint8Array>;
  } = {}
): Promise<Uint8Array> {
  const visualPngBytes = await renderVisualCardCanvasBytes({
    card,
    coverUrl: options.coverUrl,
    provider: options.provider,
  });

  return exportCardData(card, 'png', {
    basePng: visualPngBytes,
    backfillV2: true,
    embeddedAssets: options.embeddedAssets,
  });
}

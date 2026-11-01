import { drawRoundRect, wrapTextLines } from './visualCardExporter';
import { getResilienceTier } from './crucibleTiers';

export interface CrucibleTrustReportData {
  characterName: string;
  passRate: number | null;
  totalPassed: number;
  totalTested: number;
  driftString: string;
  modelString: string;
  totalCardTokens: number;
  targetBudget: number;
}

/**
 * Renders a shareable Crucible Trust Badge canvas and returns PNG bytes.
 */
export async function renderTrustBadgeCanvasBytes(
  report: CrucibleTrustReportData
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  const width = 740;
  const height = 420;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not supported');
  }

  // 1. Dark Atmosphere Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#0c0914');
  bgGrad.addColorStop(0.5, '#170f24');
  bgGrad.addColorStop(1, '#090710');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Ambient rose glow
  const glowGrad = ctx.createRadialGradient(width - 150, 100, 20, width - 150, 100, 320);
  glowGrad.addColorStop(0, 'rgba(244, 63, 94, 0.22)');
  glowGrad.addColorStop(1, 'rgba(12, 9, 20, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, width, height);

  // Outer Framed Borders
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
  ctx.lineWidth = 2.5;
  drawRoundRect(ctx, 16, 16, width - 32, height - 32, 20);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  drawRoundRect(ctx, 22, 22, width - 44, height - 44, 16);
  ctx.stroke();

  // 2. Header Bar
  // Badge Pill
  ctx.fillStyle = 'rgba(136, 19, 55, 0.45)';
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.5)';
  ctx.lineWidth = 1;
  drawRoundRect(ctx, 36, 36, 180, 28, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fda4af';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('🛡️ CRUCIBLE TRUST BADGE', 48, 54);

  // Watermark Top Right
  ctx.fillStyle = '#f43f5e';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('CARDCRUCIBLE', width - 40, 54);
  ctx.textAlign = 'left';

  // 3. Character Name Title
  const charName = (report.characterName || 'Untitled Character').trim();
  ctx.fillStyle = '#f4f4f5';
  ctx.font = 'bold 22px system-ui, sans-serif';
  const nameLines = wrapTextLines(ctx, charName, width - 80, 1);
  ctx.fillText(nameLines[0] || 'Untitled Character', 36, 96);

  // 4. Hero Score Section (Left Card)
  const heroX = 36;
  const heroY = 114;
  const heroW = 230;
  const heroH = 226;

  ctx.fillStyle = 'rgba(20, 14, 30, 0.8)';
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.25)';
  ctx.lineWidth = 1.5;
  drawRoundRect(ctx, heroX, heroY, heroW, heroH, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#a1a1aa';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillText('JAILBREAK RESILIENCE', heroX + 18, heroY + 30);

  const rate = report.passRate;
  const tier = getResilienceTier(rate);

  // Extra flourish for top achievement tiers
  if (tier.id === 'flawless') {
    const goldGlow = ctx.createRadialGradient(heroX + 80, heroY + 70, 5, heroX + 80, heroY + 70, 80);
    goldGlow.addColorStop(0, 'rgba(250, 204, 21, 0.25)');
    goldGlow.addColorStop(1, 'rgba(20, 14, 30, 0)');
    ctx.fillStyle = goldGlow;
    ctx.fillRect(heroX, heroY, heroW, 120);

    // Golden accent sparkle icon
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('★', heroX + heroW - 32, heroY + 40);
  } else if (tier.id === 'hardened') {
    const cyanGlow = ctx.createRadialGradient(heroX + 80, heroY + 70, 5, heroX + 80, heroY + 70, 80);
    cyanGlow.addColorStop(0, 'rgba(6, 182, 212, 0.2)');
    cyanGlow.addColorStop(1, 'rgba(20, 14, 30, 0)');
    ctx.fillStyle = cyanGlow;
    ctx.fillRect(heroX, heroY, heroW, 120);

    // Cyan accent mark
    ctx.fillStyle = '#06b6d4';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText('✦', heroX + heroW - 32, heroY + 40);
  }

  ctx.fillStyle = tier.colorHex;
  ctx.font = 'bold 44px system-ui, sans-serif';
  const scoreText = rate !== null ? `${rate}%` : 'N/A';
  ctx.fillText(scoreText, heroX + 18, heroY + 84);

  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText(tier.label, heroX + 18, heroY + 112);

  // Separator in hero card
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(heroX + 18, heroY + 132);
  ctx.lineTo(heroX + heroW - 18, heroY + 132);
  ctx.stroke();

  ctx.fillStyle = '#71717a';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillText('VECTORS SURVIVED', heroX + 18, heroY + 154);

  ctx.fillStyle = '#e4e4e7';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(`${report.totalPassed} of ${report.totalTested} test vectors`, heroX + 18, heroY + 176);

  ctx.fillStyle = '#71717a';
  ctx.font = '500 11px system-ui, sans-serif';
  ctx.fillText('Standard Adversarial Probes', heroX + 18, heroY + 198);

  // 5. Diagnostics Details (Right Column 3 Cards)
  const detailX = 280;
  const detailW = width - detailX - 36;
  const cardH = 68;

  // Card 1: AI-Disclaimer Scan
  let curY = heroY;
  ctx.fillStyle = 'rgba(20, 14, 30, 0.65)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  drawRoundRect(ctx, detailX, curY, detailW, cardH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#a1a1aa';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillText('AI-DISCLAIMER SCAN', detailX + 16, curY + 24);

  ctx.fillStyle = '#f4f4f5';
  ctx.font = '500 13px system-ui, sans-serif';
  const consistencyText = report.driftString || 'Not tested';
  const cLines = wrapTextLines(ctx, consistencyText, detailW - 32, 1);
  ctx.fillText(cLines[0] || consistencyText, detailX + 16, curY + 48);

  // Card 2: Tested Models
  curY += cardH + 11;
  ctx.fillStyle = 'rgba(20, 14, 30, 0.65)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  drawRoundRect(ctx, detailX, curY, detailW, cardH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#a1a1aa';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillText('TESTED CONNECTION PROFILES / MODELS', detailX + 16, curY + 24);

  ctx.fillStyle = '#f4f4f5';
  ctx.font = '500 13px system-ui, sans-serif';
  const modelText = report.modelString || 'None';
  const mLines = wrapTextLines(ctx, modelText, detailW - 32, 1);
  ctx.fillText(mLines[0] || modelText, detailX + 16, curY + 48);

  // Card 3: Token Efficiency
  curY += cardH + 11;
  ctx.fillStyle = 'rgba(20, 14, 30, 0.65)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  drawRoundRect(ctx, detailX, curY, detailW, cardH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#a1a1aa';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillText('TOKEN BUDGET EFFICIENCY', detailX + 16, curY + 24);

  ctx.fillStyle = '#f4f4f5';
  ctx.font = '500 13px system-ui, sans-serif';
  const tokenTarget = report.targetBudget || 4096;
  const tokenVal = `${report.totalCardTokens.toLocaleString()} / ${tokenTarget.toLocaleString()} tokens (${Math.min(Math.round((report.totalCardTokens / tokenTarget) * 100), 100)}% budget)`;
  ctx.fillText(tokenVal, detailX + 16, curY + 48);

  // 6. Bottom Footer Bar
  ctx.fillStyle = '#71717a';
  ctx.font = '500 10px system-ui, sans-serif';
  ctx.fillText('GENERATED VIA CARDCRUCIBLE • AUTOMATED BENCHMARK SUITE', 36, height - 32);

  ctx.fillStyle = '#f43f5e';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('EXPORTED WITH CardCrucible', width - 40, height - 32);
  ctx.textAlign = 'left';

  // Convert canvas to PNG Blob -> Uint8Array
  const blob = await new Promise<Blob | null>((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(resolve, 'image/png');
    } else {
      resolve(null);
    }
  });

  if (!blob) {
    if (typeof canvas.toDataURL === 'function') {
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1] || '';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    throw new Error('Failed to create PNG blob from canvas');
  }

  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/** Draws a Stats card (see cards.ts) as a picture to share. Same palette as the top-10 picture. */

import { CARD_HUES, type CardSpec } from './cards';
import { loadCovers } from './coverLoader';
import { ACCENT, BG, BODY, DISPLAY, INK, displayFont, drawSignature, LINE, MUTED, SHARE_WIDTH, SURFACE, coverBox, fixBlankCovers, round, wrapLines, type Box, type Cover } from './shareImage';

export interface CardArt {
  title: string;
  cover?: string;
  color?: string;
}

const W = SHARE_WIDTH;
const PAD = 72;
const INNER = W - PAD * 2;
/** Drawn on a tall canvas first, then cut to the height the content used. */
const SCRATCH_H = 3200;
const MIN_H = 1080;

/** Cover width for a strip of `count` covers: large for one or two, narrower as more share the row. */
export function stripWidth(count: number, gap = 24): number {
  return Math.min(360, Math.floor((INNER - gap * (count - 1)) / count));
}

export async function renderCard(spec: CardSpec, art: (id: string) => CardArt): Promise<{ blob: Blob; missing: number; details: string[] }> {
  try {
    await Promise.all([document.fonts.load(`600 40px ${DISPLAY}`), document.fonts.load(`24px ${BODY}`)]);
  } catch {
    // Fall back to the system fonts.
  }
  // Covers first (the strip), then the rows' covers.
  const pictured = [...spec.covers, ...(spec.rows ?? [])].map((c) => ({ ...c, ...art(c.id) }));
  const results = await loadCovers(pictured.map((p) => p.cover));
  const covers: Cover[] = results.map((r) => r.img);
  const details = pictured.map((p, i) => `${p.title}: ${results[i].how}`);
  const boxes: Box[] = [];

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = SCRATCH_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, SCRATCH_H);
  ctx.textBaseline = 'alphabetic';
  const measure = (s: string) => ctx.measureText(s).width;

  // Each kind of card has its own hue: a faint tint over the background and the kicker's colour.
  const hue = CARD_HUES[spec.id];
  if (hue !== undefined && !spec.hero) {
    ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.1)`;
    ctx.fillRect(0, 0, W, SCRATCH_H);
  }
  // The type card: a stronger tint at the top, fading over the first 1,300 px, then the usual faint tint.
  if (hue !== undefined && spec.hero) {
    const g = ctx.createLinearGradient(0, 0, W * 0.18, 1300);
    g.addColorStop(0, `hsla(${hue}, 70%, 60%, 0.3)`);
    g.addColorStop(1, `hsla(${hue}, 70%, 60%, 0.08)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, SCRATCH_H);
  }

  // One or two covers at the left, a third of the width, with the text beside them.
  const side = !!spec.side && spec.covers.length > 0 && spec.covers.length <= 2;
  const sideCount = spec.covers.length;
  const sideGap = 20;
  const sideW = side ? (sideCount === 1 ? Math.round(INNER / 3) : Math.round(INNER * 0.46)) : 0;
  const sideCw = side ? Math.floor((sideW - sideGap * (sideCount - 1)) / sideCount) : 0;
  const sideCh = Math.round(sideCw * 1.5);
  const colX = side ? PAD + sideW + 44 : PAD;
  const colW = side ? INNER - sideW - 44 : INNER;
  let sideBottom = 0;
  if (side) {
    const top = PAD + 8;
    let below = 0;
    spec.covers.forEach((c, i) => {
      const x = PAD + i * (sideCw + sideGap);
      coverBox(ctx, pictured[i], covers[i], x, top, sideCw, sideCh, 16, boxes, i);
      if (c.caption) {
        ctx.fillStyle = MUTED;
        ctx.font = `26px ${BODY}`;
        ctx.fillText(wrapLines(measure, c.caption, sideCw, 1)[0], x, top + sideCh + 38);
        below = 46;
      }
    });
    sideBottom = top + sideCh + below;
  }

  // Kicker
  let y = PAD + 30;
  ctx.fillStyle = hue !== undefined ? `hsl(${hue}, 80%, 76%)` : ACCENT;
  displayFont(ctx, `800 28px`);
  ctx.fillText(spec.kicker.toUpperCase(), colX, y);

  // Headline: as large as fits in three lines (four beside a cover).
  let size = 72;
  let lines: string[] = [];
  const most = side ? 4 : 3;
  for (const s of side ? [56, 48, 42] : spec.hero ? [96, 84, 72, 64] : [72, 64, 56, 48]) {
    size = s;
    displayFont(ctx, `800 ${size}px`);
    lines = wrapLines(measure, spec.headline, colW, most);
    if (!lines[lines.length - 1].endsWith('…') && lines.length <= (side ? 3 : size > 56 ? 2 : 3)) break;
  }
  ctx.fillStyle = INK;
  y += 28;
  for (const l of lines) {
    y += Math.round(size * (spec.hero ? 1.1 : 1.2));
    ctx.fillText(l, colX, y);
  }

  // The runner-up, in the card's colour, then the one-line description, larger than the finding.
  if (spec.subhead) {
    ctx.fillStyle = hue !== undefined ? `hsl(${hue}, 80%, 76%)` : ACCENT;
    ctx.font = `600 34px ${BODY}`;
    for (const l of wrapLines(measure, spec.subhead, colW, 2)) {
      y += 56;
      ctx.fillText(l, colX, y);
    }
  }
  if (spec.tagline) {
    y += 22;
    ctx.fillStyle = INK;
    displayFont(ctx, `600 46px`);
    for (const l of wrapLines(measure, spec.tagline, colW, 3)) {
      y += 62;
      ctx.fillText(l, colX, y);
    }
    y += 16;
  }

  // The finding, then its context in a quieter style.
  y += 24;
  spec.lines.forEach((text, k) => {
    const first = k === 0;
    ctx.font = first ? `500 38px ${BODY}` : `32px ${BODY}`;
    ctx.fillStyle = first ? INK : MUTED;
    for (const l of wrapLines(measure, text, colW, side ? 6 : 4)) {
      y += first ? 50 : 44;
      ctx.fillText(l, colX, y);
    }
    y += 10;
  });
  if (side) y = Math.max(y, sideBottom);

  /** A small heading over the covers or the rows. */
  const label = (text: string | undefined) => {
    if (!text) return;
    y += 24;
    ctx.fillStyle = MUTED;
    ctx.font = `600 26px ${BODY}`;
    for (const l of wrapLines(measure, text, INNER, 2)) {
      y += 36;
      ctx.fillText(l, PAD, y);
    }
    y -= 8;
  };

  // Cover strip, with titles and captions underneath when there are several.
  const count = spec.covers.length;
  if (count && !side) {
    label(spec.coversLabel);
    y += 30;
    const gap = 24;
    const cw = stripWidth(count, gap);
    const ch = Math.round(cw * 1.5);
    let below = 0;
    spec.covers.forEach((c, i) => {
      const x = PAD + i * (cw + gap);
      coverBox(ctx, pictured[i], covers[i], x, y, cw, ch, count > 3 ? 10 : 16, boxes, i);
      let ty = y + ch;
      if (count > 1) {
        ctx.fillStyle = INK;
        ctx.font = `600 ${count > 3 ? 24 : 28}px ${BODY}`;
        for (const l of wrapLines(measure, pictured[i].title, cw, 2)) {
          ty += count > 3 ? 32 : 36;
          ctx.fillText(l, x, ty);
        }
      }
      if (c.caption) {
        ctx.fillStyle = MUTED;
        ctx.font = `${count > 3 ? 22 : 26}px ${BODY}`;
        ty += count > 3 ? 30 : 34;
        ctx.fillText(wrapLines(measure, c.caption, cw, 1)[0], x, ty);
      }
      below = Math.max(below, ty - (y + ch));
    });
    y += ch + below;
  }

  // Rows: one compact line per title.
  if (spec.rows?.length) {
    label(spec.rowsLabel);
    y += 28;
    const rh = 124;
    spec.rows.forEach((r, k) => {
      const i = count + k;
      ctx.fillStyle = SURFACE;
      round(ctx, PAD, y, INNER, rh, 18);
      ctx.fill();
      const coverH = rh - 20;
      const coverW = Math.round((coverH * 2) / 3);
      coverBox(ctx, pictured[i], covers[i], PAD + 12, y + 10, coverW, coverH, 8, boxes, i);
      const tx = PAD + 12 + coverW + 24;
      const tw = PAD + INNER - 24 - tx;
      ctx.fillStyle = INK;
      ctx.font = `600 30px ${BODY}`;
      ctx.fillText(wrapLines(measure, pictured[i].title, tw, 1)[0], tx, y + 52);
      ctx.fillStyle = MUTED;
      ctx.font = `26px ${BODY}`;
      ctx.fillText(wrapLines(measure, r.line, tw, 1)[0], tx, y + 90);
      y += rh + 12;
    });
    y -= 12;
  }

  // Facts: label on the left, value on the right.
  if (spec.facts?.length) {
    y += 40;
    const labelW = 300;
    const vx = PAD + labelW + 24;
    const vw = PAD + INNER - vx;
    for (const f of spec.facts) {
      ctx.fillStyle = LINE;
      ctx.fillRect(PAD, y, INNER, 2);
      ctx.font = `600 28px ${BODY}`;
      const values = wrapLines(measure, f.value, vw, 2);
      ctx.fillStyle = INK;
      values.forEach((l, k) => ctx.fillText(l, vx, y + 48 + k * 38));
      ctx.fillStyle = MUTED;
      ctx.font = `26px ${BODY}`;
      wrapLines(measure, f.label, labelW, 2).forEach((l, k) => ctx.fillText(l, PAD, y + 48 + k * 36));
      y += 48 + Math.max(values.length - 1, 0) * 38 + 26;
    }
  }

  const missing = await fixBlankCovers(ctx, pictured, covers, boxes, details);

  const height = Math.max(MIN_H, Math.min(SCRATCH_H, y + 140));
  drawSignature(ctx, W - PAD, height - 56);

  const out = document.createElement('canvas');
  out.width = W;
  out.height = height;
  out.getContext('2d')!.drawImage(canvas, 0, 0);

  // As in the top-10 picture, covers are released only once the PNG exists.
  return new Promise((resolve, reject) =>
    out.toBlob((b) => {
      for (const c of covers) (c as ImageBitmap | null)?.close?.();
      if (b) resolve({ blob: b, missing, details });
      else reject(new Error('Could not draw the picture.'));
    }, 'image/png'),
  );
}

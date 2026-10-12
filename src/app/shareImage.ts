/** Draws the top of your list as a picture to send to someone. */

import { decodeAsImage, loadCovers, type Drawable } from './coverLoader';

export interface ShareRow {
  rank: number;
  title: string;
  /** Years and studio, or years and "manga". */
  meta: string;
  cover?: string;
  color?: string;
}

export const SHARE_WIDTH = 1080;

const BG = '#15142a';
const SURFACE = '#1f1e3a';
const INK = '#f2f1fb';
const MUTED = '#a3a1c2';
const ACCENT = '#8f93ff';

const DISPLAY = '"Unbounded", "Arial Black", system-ui, sans-serif';
const BODY = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const PAD = 64;

type Cover = Drawable | null;

/** Breaks text into at most `maxLines` lines that fit `width`, ending the last with an ellipsis if cut. */
export function wrapLines(measure: (s: string) => number, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const tryLine = line ? `${line} ${words[i]}` : words[i];
    if (measure(tryLine) <= width || !line) {
      line = tryLine;
      continue;
    }
    lines.push(line);
    line = words[i];
    if (lines.length === maxLines - 1) {
      line = words.slice(i).join(' ');
      break;
    }
  }
  if (line) lines.push(line);
  const last = lines.length - 1;
  if (last >= 0 && measure(lines[last]) > width) {
    let t = lines[last];
    while (t.length > 1 && measure(`${t}…`) > width) t = t.slice(0, -1);
    lines[last] = `${t.trimEnd()}…`;
  }
  return lines.slice(0, maxLines);
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draws `img` into the box, cropping the overflow instead of stretching. */
function drawCover(ctx: CanvasRenderingContext2D, img: Drawable, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

type Box = { x: number; y: number; w: number; h: number };

function coverBox(ctx: CanvasRenderingContext2D, row: ShareRow, img: Cover, x: number, y: number, w: number, h: number, r: number, boxes?: Box[], i?: number) {
  if (boxes && i !== undefined) boxes[i] = { x, y, w, h };
  ctx.save();
  round(ctx, x, y, w, h, r);
  ctx.clip();
  if (img) drawCover(ctx, img, x, y, w, h);
  else {
    ctx.fillStyle = row.color ?? '#353459';
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function badge(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, size: number, hot: boolean) {
  ctx.fillStyle = hot ? ACCENT : BG;
  ctx.globalAlpha = hot ? 1 : 0.85;
  round(ctx, x, y, size, size, size / 3);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = hot ? BG : INK;
  ctx.font = `600 ${Math.round(size * 0.52)}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillText(String(n), x + size / 2, y + size / 2 + size * 0.19);
  ctx.textAlign = 'left';
}

/** Height of the picture for a row count. */
export function shareHeight(count: number): number {
  const rest = Math.max(count - 3, 0);
  return rest ? GRID_TOP_END + 30 + rest * (ROW_H + ROW_GAP) + 86 : GRID_TOP_END + 96;
}

// "Covers" layout: the top three as large covers, then ranks 4 and below as compact rows.
const GRID_TOP = 168;
const TOP_W = Math.floor((SHARE_WIDTH - PAD * 2 - 48) / 3);
const TOP_H = Math.round((TOP_W * 3) / 2);
const GRID_TOP_END = GRID_TOP + TOP_H + 14 + 2 * 32 + 30 + 20;
const ROW_H = 84;
const ROW_GAP = 10;

function drawGrid(ctx: CanvasRenderingContext2D, rows: ShareRow[], covers: Cover[], boxes: Box[]) {
  const measure = (s: string) => ctx.measureText(s).width;
  rows.forEach((row, i) => {
    if (i < 3) {
      const x = PAD + i * (TOP_W + 24);
      const y = GRID_TOP;
      coverBox(ctx, row, covers[i], x, y, TOP_W, TOP_H, 14, boxes, i);
      badge(ctx, row.rank, x + 10, y + 10, 56, true);
      ctx.fillStyle = INK;
      ctx.font = `600 28px ${BODY}`;
      let ty = y + TOP_H + 14 + 28;
      for (const l of wrapLines(measure, row.title, TOP_W, 2)) {
        ctx.fillText(l, x, ty);
        ty += 32;
      }
      if (row.meta) {
        ctx.fillStyle = MUTED;
        ctx.font = `22px ${BODY}`;
        ctx.fillText(wrapLines(measure, row.meta, TOP_W, 1)[0], x, y + TOP_H + 20 + 2 * 32 + 22);
      }
      return;
    }

    const y = GRID_TOP_END + 30 + (i - 3) * (ROW_H + ROW_GAP);
    ctx.fillStyle = SURFACE;
    round(ctx, PAD, y, SHARE_WIDTH - PAD * 2, ROW_H, 18);
    ctx.fill();

    ctx.fillStyle = MUTED;
    ctx.font = `600 30px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(row.rank), PAD + 46, y + ROW_H / 2 + 11);
    ctx.textAlign = 'left';

    const ch = ROW_H - 16;
    const cw = Math.round((ch * 2) / 3);
    const cx = PAD + 92;
    coverBox(ctx, row, covers[i], cx, y + 8, cw, ch, 8, boxes, i);

    const tx = cx + cw + 24;
    const tw = SHARE_WIDTH - PAD - 24 - tx;
    ctx.fillStyle = INK;
    ctx.font = `600 27px ${BODY}`;
    const lines = wrapLines(measure, row.title, tw, 1);
    const hasMeta = !!row.meta;
    ctx.fillText(lines[0], tx, y + (hasMeta ? 38 : 50));
    if (hasMeta) {
      ctx.fillStyle = MUTED;
      ctx.font = `21px ${BODY}`;
      ctx.fillText(wrapLines(measure, row.meta, tw, 1)[0], tx, y + 66);
    }
  });
}

export interface ShareResult {
  blob: Blob;
  /** Rows that had a cover address but no cover ended up in the picture. */
  missing: number;
  /** One line per row saying how its cover went. */
  details: string[];
}

/** True when the box holds one flat colour, i.e. no picture was drawn into it. */
function isFlat(ctx: CanvasRenderingContext2D, b: Box): boolean {
  const first = ctx.getImageData(Math.round(b.x + b.w * 0.5), Math.round(b.y + b.h * 0.5), 1, 1).data;
  for (let fy = 1; fy <= 5; fy++) {
    for (let fx = 1; fx <= 5; fx++) {
      const d = ctx.getImageData(Math.round(b.x + (b.w * fx) / 6), Math.round(b.y + (b.h * fy) / 6), 1, 1).data;
      if (Math.abs(d[0] - first[0]) + Math.abs(d[1] - first[1]) + Math.abs(d[2] - first[2]) > 12) return false;
    }
  }
  return true;
}

export async function renderTop(rows: ShareRow[], heading: string): Promise<ShareResult> {
  try {
    await Promise.all([document.fonts.load(`600 40px ${DISPLAY}`), document.fonts.load(`24px ${BODY}`)]);
  } catch {
    // Fall back to the system fonts.
  }
  const results = await loadCovers(rows.map((r) => r.cover));
  const covers: Cover[] = results.map((r) => r.img);
  const details = rows.map((r, i) => `${r.rank}. ${r.title}: ${results[i].how}`);

  const height = shareHeight(rows.length);
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, SHARE_WIDTH, height);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `600 52px ${DISPLAY}`;
  ctx.fillText(heading, PAD, 112);

  const boxes: Box[] = [];
  drawGrid(ctx, rows, covers, boxes);

  // A cover can decode yet draw as nothing; check, and redraw through an <img> if so.
  let missing = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.cover) continue;
    const box = boxes[i];
    if (covers[i] && box && !isFlat(ctx, box)) continue;
    if (covers[i] && box) {
      details[i] += '; drew blank';
      const alt = await decodeAsImage(row.cover);
      if (alt) {
        coverBox(ctx, row, alt, box.x, box.y, box.w, box.h, 14);
        if (!isFlat(ctx, box)) {
          details[i] += '; fixed by redrawing from an image element';
          continue;
        }
        details[i] += '; still blank';
      }
    }
    missing++;
  }

  ctx.fillStyle = MUTED;
  ctx.font = `600 26px ${DISPLAY}`;
  ctx.textAlign = 'right';
  ctx.fillText('Shōbu', SHARE_WIDTH - PAD, height - 44);
  ctx.textAlign = 'left';

  // Safari can hold canvas drawing back until the picture is read, so the covers
  // are released only once the PNG exists; closing them earlier leaves blanks.
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => {
      for (const c of covers) (c as ImageBitmap | null)?.close?.();
      if (b) resolve({ blob: b, missing, details });
      else reject(new Error('Could not draw the picture.'));
    }, 'image/png'),
  );
}

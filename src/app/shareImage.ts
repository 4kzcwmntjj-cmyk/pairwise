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
export type ShareLayout = 'grid' | 'list';

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

/** Height of the picture for a layout and row count. */
export function shareHeight(layout: ShareLayout, count: number): number {
  if (layout === 'list') return 1350;
  const rest = Math.max(count - 3, 0);
  const rows = Math.ceil(rest / 4);
  return rows ? GRID_TOP_END + 30 + rows * (GRID_CELL_H + 16) + 96 : GRID_TOP_END + 96;
}

const GRID_TOP = 168;
const TOP_W = Math.floor((SHARE_WIDTH - PAD * 2 - 48) / 3);
const TOP_H = Math.round((TOP_W * 3) / 2);
const GRID_TOP_END = GRID_TOP + TOP_H + 14 + 2 * 32 + 30 + 20;
const CELL_W = Math.floor((SHARE_WIDTH - PAD * 2 - 3 * 20) / 4);
const CELL_COVER_H = Math.round((CELL_W * 3) / 2);
const GRID_CELL_H = CELL_COVER_H + 12 + 2 * 26;

function drawGrid(ctx: CanvasRenderingContext2D, rows: ShareRow[], covers: Cover[], boxes: Box[]) {
  const measure = (s: string) => ctx.measureText(s).width;
  rows.forEach((row, i) => {
    let x: number, y: number, w: number, h: number, titleSize: number, lineH: number, lines: number;
    if (i < 3) {
      x = PAD + i * (TOP_W + 24);
      y = GRID_TOP;
      w = TOP_W;
      h = TOP_H;
      titleSize = 28;
      lineH = 32;
      lines = 2;
    } else {
      const k = i - 3;
      x = PAD + (k % 4) * (CELL_W + 20);
      y = GRID_TOP_END + 30 + Math.floor(k / 4) * (GRID_CELL_H + 16);
      w = CELL_W;
      h = CELL_COVER_H;
      titleSize = 22;
      lineH = 26;
      lines = 2;
    }
    coverBox(ctx, row, covers[i], x, y, w, h, 14, boxes, i);
    badge(ctx, row.rank, x + 10, y + 10, i < 3 ? 56 : 44, i < 3);

    ctx.fillStyle = INK;
    ctx.font = `600 ${titleSize}px ${BODY}`;
    let ty = y + h + 12 + titleSize;
    for (const l of wrapLines(measure, row.title, w, lines)) {
      ctx.fillText(l, x, ty);
      ty += lineH;
    }
    if (i < 3 && row.meta) {
      ctx.fillStyle = MUTED;
      ctx.font = `22px ${BODY}`;
      ctx.fillText(wrapLines(measure, row.meta, w, 1)[0], x, y + h + 20 + 2 * lineH + 22);
    }
  });
}

function drawList(ctx: CanvasRenderingContext2D, rows: ShareRow[], covers: Cover[], height: number, boxes: Box[]) {
  const top = 168;
  const bottom = height - 96;
  const gap = 12;
  const rowH = Math.floor((bottom - top - gap * (rows.length - 1)) / Math.max(rows.length, 1));
  const capped = Math.min(rowH, 112);
  const coverH = capped - 12;
  const coverW = Math.round((coverH * 2) / 3);

  rows.forEach((row, i) => {
    const y = top + i * (capped + gap);
    ctx.fillStyle = SURFACE;
    round(ctx, PAD, y, SHARE_WIDTH - PAD * 2, capped, 20);
    ctx.fill();

    ctx.fillStyle = i < 3 ? ACCENT : MUTED;
    ctx.font = `600 ${i < 3 ? 40 : 34}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(row.rank), PAD + 56, y + capped / 2 + 14);
    ctx.textAlign = 'left';

    const cx = PAD + 112;
    coverBox(ctx, row, covers[i], cx, y + 6, coverW, coverH, 10, boxes, i);

    const tx = cx + coverW + 28;
    const tw = SHARE_WIDTH - PAD - 28 - tx;
    ctx.fillStyle = INK;
    ctx.font = `600 30px ${BODY}`;
    const lines = wrapLines((s) => ctx.measureText(s).width, row.title, tw, 2);
    const block = lines.length * 36 + (row.meta ? 34 : 0);
    let ty = y + (capped - block) / 2 + 28;
    for (const l of lines) {
      ctx.fillText(l, tx, ty);
      ty += 36;
    }
    if (row.meta) {
      ctx.fillStyle = MUTED;
      ctx.font = `24px ${BODY}`;
      ctx.fillText(wrapLines((s) => ctx.measureText(s).width, row.meta, tw, 1)[0], tx, ty - 2);
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

export async function renderTop(rows: ShareRow[], heading: string, layout: ShareLayout = 'grid'): Promise<ShareResult> {
  try {
    await Promise.all([document.fonts.load(`600 40px ${DISPLAY}`), document.fonts.load(`24px ${BODY}`)]);
  } catch {
    // Fall back to the system fonts.
  }
  const results = await loadCovers(rows.map((r) => r.cover));
  const covers: Cover[] = results.map((r) => r.img);
  const details = rows.map((r, i) => `${r.rank}. ${r.title}: ${results[i].how}`);

  const height = shareHeight(layout, rows.length);
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
  if (layout === 'grid') drawGrid(ctx, rows, covers, boxes);
  else drawList(ctx, rows, covers, height, boxes);

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
        coverBox(ctx, row, alt, box.x, box.y, box.w, box.h, layout === 'grid' ? 14 : 10);
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

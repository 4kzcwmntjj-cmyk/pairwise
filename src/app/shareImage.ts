/** Draws the top of your list as a picture to send to someone. */

export interface ShareRow {
  rank: number;
  title: string;
  /** Years and studio, or years and "manga". */
  meta: string;
  cover?: string;
  color?: string;
}

export const SHARE_WIDTH = 1080;
export const SHARE_HEIGHT = 1350;

const BG = '#15142a';
const SURFACE = '#1f1e3a';
const INK = '#f2f1fb';
const MUTED = '#a3a1c2';
const ACCENT = '#8f93ff';

function loadCover(src: string | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

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

export async function renderTop(rows: ShareRow[], heading: string): Promise<Blob> {
  const display = '"Unbounded", "Arial Black", system-ui, sans-serif';
  const body = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  try {
    await Promise.all([document.fonts.load(`600 40px ${display}`), document.fonts.load(`24px ${body}`)]);
  } catch {
    // Fall back to the system fonts.
  }
  const covers = await Promise.all(rows.map((r) => loadCover(r.cover)));

  const canvas = document.createElement('canvas');
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);

  const pad = 64;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `600 52px ${display}`;
  ctx.fillText(heading, pad, 112);

  const top = 168;
  const bottom = SHARE_HEIGHT - 96;
  const gap = 12;
  const rowH = Math.floor((bottom - top - gap * (rows.length - 1)) / Math.max(rows.length, 1));
  const capped = Math.min(rowH, 112);
  const coverH = capped - 12;
  const coverW = Math.round((coverH * 2) / 3);

  rows.forEach((row, i) => {
    const y = top + i * (capped + gap);
    ctx.fillStyle = SURFACE;
    round(ctx, pad, y, SHARE_WIDTH - pad * 2, capped, 20);
    ctx.fill();

    ctx.fillStyle = i < 3 ? ACCENT : MUTED;
    ctx.font = `600 ${i < 3 ? 40 : 34}px ${display}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(row.rank), pad + 56, y + capped / 2 + 14);
    ctx.textAlign = 'left';

    const cx = pad + 112;
    const cy = y + 6;
    ctx.save();
    round(ctx, cx, cy, coverW, coverH, 10);
    ctx.clip();
    const img = covers[i];
    if (img) ctx.drawImage(img, cx, cy, coverW, coverH);
    else {
      ctx.fillStyle = row.color ?? '#353459';
      ctx.fillRect(cx, cy, coverW, coverH);
    }
    ctx.restore();

    const tx = cx + coverW + 28;
    const tw = SHARE_WIDTH - pad - 28 - tx;
    ctx.fillStyle = INK;
    ctx.font = `600 30px ${body}`;
    const lines = wrapLines((s) => ctx.measureText(s).width, row.title, tw, 2);
    const block = lines.length * 36 + (row.meta ? 34 : 0);
    let ty = y + (capped - block) / 2 + 28;
    for (const l of lines) {
      ctx.fillText(l, tx, ty);
      ty += 36;
    }
    if (row.meta) {
      ctx.fillStyle = MUTED;
      ctx.font = `24px ${body}`;
      ctx.fillText(wrapLines((s) => ctx.measureText(s).width, row.meta, tw, 1)[0], tx, ty - 2);
    }
  });

  ctx.fillStyle = MUTED;
  ctx.font = `600 26px ${display}`;
  ctx.textAlign = 'right';
  ctx.fillText('Shōbu', SHARE_WIDTH - pad, SHARE_HEIGHT - 44);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the picture.'))), 'image/png'),
  );
}

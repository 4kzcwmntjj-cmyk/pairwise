/**
 * Hands the person a file. On phones the share sheet is the dependable route:
 * it can save to Files or iCloud Drive, or send the file to yourself. Where
 * sharing files isn't available (most desktop browsers), it downloads instead.
 */
export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

export const saveCopy = (name: string, json: string) => saveFile(new File([json], name, { type: 'application/json' }));

export async function saveFile(file: File): Promise<SaveResult> {
  const name = file.name;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      // Closing the sheet is not an error; anything else falls through to a download.
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

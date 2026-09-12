import { type Data } from '../model';
import { backup } from './storage';

export const DOWNLOAD_FALLBACK =
  'Não foi possível iniciar o download neste navegador. Use "Copiar backup" como alternativa.';

export function backupFilename(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `rota-financeira-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}.json`;
}

// Uses the existing serializer. No storage, reset or import side effects.
export function downloadBackup(data: Data, date = new Date()) {
  let url: string | undefined;
  let anchor: HTMLAnchorElement | undefined;
  const release = () => {
    if (url) {
      try { URL.revokeObjectURL(url); } catch { /* Cleanup must not crash the UI. */ }
      url = undefined;
    }
  };
  try {
    const text = backup(data);
    anchor = document.createElement('a');
    if (!('download' in anchor)) throw new Error('Downloads indisponíveis');
    url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    anchor.href = url;
    anchor.download = backupFilename(date);
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    // Give the browser time to consume the URL before releasing it.
    setTimeout(release, 30000);
    return {
      ok: true as const,
      filename: anchor.download,
      message: 'Download solicitado. Se o arquivo não aparecer, use "Copiar backup" como alternativa.',
    };
  } catch {
    release();
    return { ok: false as const, message: DOWNLOAD_FALLBACK };
  } finally {
    try { anchor?.remove(); } catch { /* A detached anchor is harmless. */ }
  }
}

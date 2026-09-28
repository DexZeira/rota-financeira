import type { Data } from '../model';
import { backup, parseBackup } from './storage';
async function checksum(payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function emergencyBackup(data: Data) {
  const payload: unknown = JSON.parse(backup(data));
  return JSON.stringify(
    {
      format: 'rota-emergency',
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      algorithm: 'SHA-256',
      checksum: await checksum(payload),
      payload,
    },
    null,
    2,
  );
}
export async function parseEmergencyBackup(text: string): Promise<Data> {
  if (text.length > 20_000_000) throw Error('Arquivo maior que 20 MB.');
  const raw = JSON.parse(text);
  if (raw?.format !== 'rota-emergency') return parseBackup(text);
  if (
    raw.formatVersion !== 1 ||
    raw.algorithm !== 'SHA-256' ||
    typeof raw.checksum !== 'string' ||
    raw.checksum !== (await checksum(raw.payload))
  )
    throw Error(
      'Backup corrompido ou formato incompatível. Nenhum dado foi alterado.',
    );
  return parseBackup(JSON.stringify(raw.payload));
}
export async function inspectBackup(text: string) {
  const data = await parseEmergencyBackup(text);
  const raw = JSON.parse(text);
  const source = raw.format === 'rota-emergency' ? raw.payload : raw;
  const stamp = raw.generatedAt ?? source.exportDate;
  return {
    data,
    sourceVersion: source.version ?? source.dataVersion,
    generatedAt:
      typeof stamp === 'string' && Number.isFinite(Date.parse(stamp))
        ? new Date(stamp).toISOString()
        : null,
  };
}

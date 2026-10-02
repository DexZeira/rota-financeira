import { MAX_FILE_BYTES, type Transaction } from './types';
import { dateOnly, normalizeDescription } from './statement-values';
export { dateOnly, parseAmount, directionFor, normalizeDescription } from './statement-values';

export function normalizedTransaction(t: Transaction): Transaction {
  if (!t.description.trim() || t.description.length > 1000)
    throw Error('Descrição ausente ou maior que 1.000 caracteres.');
  for (const value of [t.externalId, t.accountLabel, t.document])
    if (value.length > 200)
      throw Error('Identificador maior que 200 caracteres.');
  return {
    ...t,
    date: dateOnly(t.date),
    description: t.description.trim(),
    normalizedDescription: normalizeDescription(t.description),
  };
}
export function decodeStatement(
  bytes: Uint8Array,
  encoding: 'auto' | 'utf-8' | 'windows-1252' = 'auto',
) {
  if (bytes.byteLength > MAX_FILE_BYTES)
    throw Error('Arquivo maior que 10 MB.');
  if (encoding !== 'auto')
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  const prefix = new TextDecoder('windows-1252').decode(bytes.slice(0, 512));
  if (
    /CHARSET:\s*(1252|8859-1)|encoding=["'](?:windows-1252|iso-8859-1)["']/i.test(
      prefix,
    )
  )
    return new TextDecoder('windows-1252').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
export async function fileHash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(bytes).buffer,
  );
  return [...new Uint8Array(digest)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}

export function validDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
type Direction = 'credit' | 'debit';
// Unlike component aliases, bank normalization must retain words such as "troca" and all digits.
export const normalizeDescription = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
export function dateOnly(value: string) {
  const raw = value.trim();
  let date = raw;
  if (/^\d{8}(?:\d{6}(?:\.\d+)?(?:\[[^\]]+\])?)?$/.test(raw))
    date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  else if (/^\d{2}[/.-]\d{2}[/.-]\d{4}$/.test(raw))
    date = raw.slice(6) + '-' + raw.slice(3, 5) + '-' + raw.slice(0, 2);
  if (!validDate(date))
    throw Error('Data inválida; use AAAA-MM-DD ou DD/MM/AAAA.');
  return date;
}
export function parseAmount(
  value: string,
  locale: 'auto' | 'br' | 'en' = 'auto',
) {
  let text = value
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s/g, '');
  if (!text) throw Error('Valor ausente.');
  if (/^\(.*\)$/.test(text)) text = '-' + text.slice(1, -1);
  let chosen = locale;
  if (chosen === 'auto') {
    if (text.includes(',') && text.includes('.'))
      chosen = text.lastIndexOf(',') > text.lastIndexOf('.') ? 'br' : 'en';
    else {
      if (/^[+-]?\d{1,3}[.,]\d{3}$/.test(text))
        throw Error('Valor ambíguo; escolha o formato decimal.');
      chosen = text.includes(',') ? 'br' : 'en';
    }
  }
  const pattern =
    chosen === 'br'
      ? /^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/
      : /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
  if (!pattern.test(text))
    throw Error('Valor inválido ou com mais de duas casas decimais.');
  const canonical =
    chosen === 'br'
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  const [whole, fraction = ''] = canonical.replace(/^[+-]/, '').split('.');
  const cents =
    Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) *
    (canonical.startsWith('-') ? -1 : 1);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 100_000_000_000)
    throw Error('Valor fora do limite de segurança.');
  if (cents === 0) throw Error('Valor zero não representa movimentação.');
  return cents;
}
export function directionFor(
  cents: number,
  type: string,
  explicitSign: boolean,
): Direction {
  const normalized = normalizeDescription(type);
  const credit = [
    'c',
    'credito',
    'credit',
    'deposit',
    'dep',
    'directdep',
    'int',
    'div',
    'income',
  ].includes(normalized);
  const debit = [
    'd',
    'debito',
    'debit',
    'payment',
    'payment debit',
    'check',
    'atm',
    'pos',
    'fee',
    'directdebit',
  ].includes(normalized);
  if (
    type.trim() &&
    !credit &&
    !debit &&
    !['other', 'xfer', 'cash'].includes(normalized)
  )
    throw Error('Tipo de movimento não reconhecido.');
  if ((credit && cents < 0) || (debit && cents > 0 && explicitSign))
    throw Error('Conflito entre sinal e tipo; revise o arquivo/mapeamento.');
  return credit ? 'credit' : debit ? 'debit' : cents < 0 ? 'debit' : 'credit';
}


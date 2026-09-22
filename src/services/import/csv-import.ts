import {
  emptyMapping,
  MAX_ROWS,
  type CsvOptions,
  type ImportLine,
} from './types';
import {
  normalizeDescription,
  normalizedTransaction,
  parseAmount,
  directionFor,
} from './transaction-normalizer';

export function csvCells(text: string, delimiter: ';' | ',') {
  const rows: { line: number; cells: string[]; error: string }[] = [];
  let cells: string[] = [],
    cell = '',
    quoted = false,
    closed = false,
    line = 1,
    start = 1,
    error = '';
  const finish = () => {
    cells.push(cell);
    if (cells.some((v) => v.trim())) rows.push({ line: start, cells, error });
    cells = [];
    cell = '';
    closed = false;
    error = '';
    if (rows.length > MAX_ROWS + 1) throw Error('Limite de 50.000 transações.');
  };
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        closed = true;
      } else if (!cell && !closed) quoted = true;
      else {
        error = 'Aspas em posição inválida.';
        cell += c;
      }
    } else if (c === delimiter && !quoted) {
      cells.push(cell);
      cell = '';
      closed = false;
    } else if ((c === '\r' || c === '\n') && !quoted) {
      if (c === '\r' && input[i + 1] === '\n') i++;
      finish();
      line++;
      start = line;
    } else {
      if (closed && c.trim()) error = 'Texto depois de aspas de fechamento.';
      cell += c;
      if (c === '\n') line++;
    }
  }
  if (quoted) error = 'Aspas não fechadas.';
  finish();
  return rows;
}
export function detectCsv(text: string): CsvOptions {
  const first = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? '';
  const delimiter = csvCells(first, ';')[0]?.cells.length > 1 ? ';' : ',';
  const headers =
    csvCells(first, delimiter)[0]?.cells.map(normalizeDescription) ?? [];
  const mapping = emptyMapping();
  const names: Record<keyof typeof mapping, string[]> = {
    date: ['data', 'data mov', 'data movimento', 'date', 'dt'],
    description: [
      'descricao',
      'historico',
      'description',
      'memo',
      'lancamento',
    ],
    amount: ['valor', 'amount', 'valor r'],
    credit: ['credito', 'credit', 'entrada'],
    debit: ['debito', 'debit', 'saida'],
    type: ['tipo', 'type', 'd c', 'debito credito'],
    externalId: ['id', 'fitid', 'identificador'],
    account: ['conta', 'account'],
    document: ['documento', 'document'],
  };
  for (const key of Object.keys(mapping) as (keyof typeof mapping)[])
    mapping[key] = headers.findIndex((h) => names[key].includes(h));
  return {
    delimiter,
    header: Object.values(mapping).some((v) => v >= 0),
    locale: 'auto',
    account: '',
    mapping,
  };
}
export function parseCsv(text: string, options: CsvOptions): ImportLine[] {
  const rows = csvCells(text, options.delimiter);
  if (options.header) rows.shift();
  if (rows.length > MAX_ROWS) throw Error('Limite de 50.000 transações.');
  return rows.map(({ line, cells, error }) => {
    try {
      if (error) throw Error(error);
      const m = options.mapping;
      if (
        m.date < 0 ||
        m.description < 0 ||
        (m.amount < 0 && (m.credit < 0 || m.debit < 0))
      )
        throw Error('Mapeie Data, Descrição e Valor (ou Crédito/Débito).');
      const get = (key: keyof typeof m) => cells[m[key]]?.trim() ?? '';
      let raw = get('amount'),
        type = get('type');
      if (m.amount < 0) {
        const c = get('credit'),
          d = get('debit');
        const nonzero = (v: string) => v && !/^[0.,\s]+$/.test(v);
        if (nonzero(c) && nonzero(d))
          throw Error('Crédito e débito preenchidos na mesma linha.');
        raw = nonzero(c) ? c : d;
        type = nonzero(c) ? 'credit' : 'debit';
      }
      const amount = parseAmount(raw, options.locale);
      return {
        line,
        errors: [],
        transaction: normalizedTransaction({
          line,
          externalId: get('externalId'),
          date: get('date'),
          description: get('description'),
          normalizedDescription: '',
          amountCents: Math.abs(amount),
          direction: directionFor(amount, type, raw.startsWith('+')),
          accountLabel: get('account') || options.account,
          document: get('document'),
          source: 'csv',
        }),
      };
    } catch (e) {
      return {
        line,
        transaction: null,
        errors: [e instanceof Error ? e.message : 'Linha inválida.'],
      };
    }
  });
}

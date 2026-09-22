import { MAX_ROWS, type ImportLine } from './types';
import {
  normalizedTransaction,
  parseAmount,
  directionFor,
} from './transaction-normalizer';
const decodeEntities = (s: string) =>
  s.replace(
    /&(?:amp|lt|gt|quot|apos);/g,
    (x) =>
      ({
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'",
      })[x] ?? x,
  );
const tag = (block: string, name: string) =>
  decodeEntities(
    new RegExp(`<${name}\\s*>\\s*([^<\\r\\n]*)`, 'i').exec(block)?.[1].trim() ??
      '',
  );
export function parseOfx(text: string, accountOverride = ''): ImportLine[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw Error('OFX com entidades externas não é aceito.');
  if (!/<OFX[\s>]/i.test(text)) throw Error('Arquivo OFX inválido.');
  const result: ImportLine[] = [];
  // Statements are scanned once; FITID is scoped to the bank/account of each block.
  const statements = text.split(/(?=<STMTRS\s*>|<CCSTMTRS\s*>)/i);
  for (const statement of statements) {
    const account =
      [
        tag(statement, 'BANKID'),
        tag(statement, 'BRANCHID'),
        tag(statement, 'ACCTID'),
      ]
        .filter(Boolean)
        .join(':') || accountOverride;
    const matches = statement.matchAll(
      /<STMTTRN\s*>([\s\S]*?)(?:<\/STMTTRN\s*>|(?=<STMTTRN\s*>|<\/BANKTRANLIST\s*>|$))/gi,
    );
    for (const match of matches) {
      const line = result.length + 1;
      if (line > MAX_ROWS) throw Error('Limite de 50.000 transações.');
      try {
        const block = match[1],
          raw = tag(block, 'TRNAMT'),
          amount = parseAmount(raw, 'en');
        result.push({
          line,
          errors: [],
          transaction: normalizedTransaction({
            line,
            externalId: tag(block, 'FITID'),
            date: tag(block, 'DTPOSTED'),
            description: [tag(block, 'NAME'), tag(block, 'MEMO')]
              .filter(Boolean)
              .join(' — '),
            normalizedDescription: '',
            amountCents: Math.abs(amount),
            direction: directionFor(amount, tag(block, 'TRNTYPE'), true),
            accountLabel: account,
            document: tag(block, 'CHECKNUM'),
            source: 'ofx',
          }),
        });
      } catch (e) {
        result.push({
          line,
          transaction: null,
          errors: [e instanceof Error ? e.message : 'Transação inválida.'],
        });
      }
    }
  }
  if (!result.length) throw Error('Nenhuma transação encontrada no OFX.');
  return result;
}

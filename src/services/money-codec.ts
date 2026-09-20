import type { Data, Row } from '../model';

// Explicit inventory: rates, fuelPrice, distances and ratios are intentionally absent.
export const moneyFields = {
  settings: ['openingCash', 'essential', 'netDay', 'extra', 'extraPlans', 'extraInvestments', 'reserveMonth'],
  bike: ['purchaseValue', 'currentValue'],
  work: ['revenue', 'actualRevenue', 'cardUnitValue', 'expectedRevenue'],
  expenses: ['amount', 'workAmount'],
  debts: ['installmentAmount', 'installment', 'balance', 'original'],
  payments: ['amount'], maintenance: ['estimated', 'value'],
  services: ['amount', 'workAmount'], costs: ['amount'],
  investments: ['balance'], movements: ['amount'],
  plans: ['target', 'current', 'bikeValue'], planTransactions: ['amount'], fund: ['amount'],
  recurrences: ['amount'],
} as const;
export const MONEY_SCHEMA_VERSION = 6;

// Parse the decimal representation; ties round away from zero without IEEE-754 drift.
export function toCents(value: number): number {
  if (!Number.isFinite(value)) throw Error('Valor monetário não finito.');
  const [coefficient, exponent = '0'] = Math.abs(value).toString().toLowerCase().split('e');
  const [whole, fractional = ''] = coefficient.split('.');
  const digits = BigInt(whole + fractional);
  const shift = Number(exponent) - fractional.length + 2;
  const divisor = shift < 0 ? 10n ** BigInt(-shift) : 1n;
  const rounded = shift >= 0 ? digits * 10n ** BigInt(shift) : (digits + divisor / 2n) / divisor;
  const result = Number(rounded) * (value < 0 ? -1 : 1);
  if (!Number.isSafeInteger(result)) throw Error('Valor monetário excede o limite seguro de centavos.');
  return result === 0 ? 0 : result;
}
export function fromCents(value: number) {
  if (!Number.isSafeInteger(value)) throw Error('Centavos inválidos no backup.');
  return value / 100;
}
function convert(value: Record<string, unknown>, decode: boolean) {
  const result = { ...value };
  for (const [group, fields] of Object.entries(moneyFields)) {
    const map = (input: unknown) => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
      const row = { ...input } as Row;
      for (const field of fields) if (row[field] !== undefined && row[field] !== null) {
        if (typeof row[field] !== 'number') throw Error('Valor monetário inválido.');
        row[field] = decode ? fromCents(row[field]) : toCents(row[field]);
      }
      return row;
    };
    result[group] = Array.isArray(value[group]) ? value[group].map(map) : map(value[group]);
  }
  return result;
}
export function encodeMoney(data: Data): Record<string, unknown> & { dataVersion: number; moneyUnit: string } {
  // Preserve JSON serialization failures (cycles/custom serializers), rather than dropping them in a shallow copy.
  const source = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  return { ...convert(source, false), dataVersion: MONEY_SCHEMA_VERSION, moneyUnit: 'centavos' };
}
export function decodeMoney(raw: Record<string, unknown>) {
  if (raw.dataVersion !== MONEY_SCHEMA_VERSION && raw.dataVersion !== 5) return raw;
  if (raw.moneyUnit !== 'centavos') throw Error('Unidade monetária ausente ou incompatível.');
  const result = convert(raw, true);
  delete result.moneyUnit;
  return { ...result, dataVersion: 4 };
}
export function serializeData(data: Data) { return JSON.stringify(encodeMoney(data)); }

import type { Row } from '../model';
import { toCents } from './money-codec';

export const QUANTITY_SCALE = 100_000_000;
export const investmentOperations = [
  'padrão',
  'compra',
  'venda',
  'resgate',
  'dividendo',
  'JCP',
  'juros',
  'cupom',
  'distribuição',
  'amortização',
  'taxa',
  'imposto',
  'ajuste',
] as const;
export const incomeOperations: readonly string[] = [
  'dividendo',
  'JCP',
  'juros',
  'cupom',
  'distribuição',
];
const n = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;
function portion(value: number, part: number, total: number) {
  const product = BigInt(value) * BigInt(part),
    divisor = BigInt(total);
  return Number((product + divisor / 2n) / divisor);
}
export function quantityUnits(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw Error('Quantidade inválida.');
  const units = Math.round(value * QUANTITY_SCALE);
  if (!Number.isSafeInteger(units))
    throw Error('Quantidade excede a precisão segura.');
  if (Math.abs(units / QUANTITY_SCALE - value) > 1e-10)
    throw Error('Quantidade deve ter até oito casas decimais.');
  return units;
}
export function movementCosts(row: Row) {
  return n(row.feesCents) + n(row.taxCents);
}
export function paidIncome(row: Row) {
  return row.kind === 'rendimento' && row.paidOut === 'sim';
}
export function cashCharge(row: Row) {
  return (
    row.kind === 'perda' && ['taxa', 'imposto'].includes(String(row.operation))
  );
}
/** Explicit cash effect. Legacy rendimento remains reinvested, never guessed as cash. */
export function movementCashCents(row: Row) {
  const amount = toCents(n(row.amount));
  return (
    (row.kind === 'aporte' || cashCharge(row)
      ? -amount
      : row.kind === 'retirada' || paidIncome(row)
        ? amount
        : 0) - movementCosts(row)
  );
}
export type LedgerEntry = {
  row: Row;
  amountCents: number;
  cashCents: number;
  bookDeltaCents: number;
  costsCents: number;
  quantityUnits: number | null;
  basisCents: number | null;
  bookCents: number;
  realizedGainCents: number | null;
};
export function investmentLedger(
  asset: Row,
  movements: readonly Row[],
  at: string,
) {
  const active = String(asset.date) <= at;
  let bookCents = active ? toCents(n(asset.balance)) : 0;
  const quantityMode = ['Ação', 'ações', 'ETF', 'FII', 'Criptomoeda'].includes(
    String(asset.category),
  );
  let units: number | null = quantityMode
    ? n(asset.quantity) > 0
      ? quantityUnits(n(asset.quantity))
      : bookCents === 0
        ? 0
        : null
    : null;
  let basis: number | null = active
    ? typeof asset.openingCostCents === 'number'
      ? asset.openingCostCents
      : quantityMode && units !== null && units > 0 && n(asset.averagePrice) > 0
        ? toCents((units / QUANTITY_SCALE) * n(asset.averagePrice))
        : bookCents === 0
          ? 0
          : null
    : 0;
  if (!active) units = quantityMode ? 0 : null;
  const openingBasisCents = basis;
  const entries: LedgerEntry[] = [],
    issues: string[] = [];
  const valuationFx =
    asset.valuationCurrency === 'BRL' || !asset.valuationCurrency
      ? 1
      : n(asset.fxToBRL);
  const valuationRows: Row[] =
    active &&
    typeof asset.currentValue === 'number' &&
    asset.valuationDate &&
    valuationFx > 0
      ? [
          {
            id: `valuation:${asset.id}`,
            date: String(asset.valuationDate),
            kind: 'valuation',
            amount: asset.currentValue * valuationFx,
            feesCents: 0,
            taxCents: 0,
          },
        ]
      : [];
  // A dated valuation changes book value after that day's trades, never cash or cost.
  const rows = [...movements, ...valuationRows]
    .filter((r) => String(r.date) <= at)
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        String(a.row.date).localeCompare(String(b.row.date)) ||
        a.index - b.index,
    );
  for (const { row } of rows) {
    const amount = toCents(n(row.amount)),
      costs = movementCosts(row),
      before = bookCents;
    const q = typeof row.units === 'number' ? quantityUnits(row.units) : null;
    let realized: number | null = null;
    if (String(row.date) < String(asset.date))
      issues.push(`Movimentação ${row.id} anterior ao saldo inicial.`);
    if (row.kind === 'valuation') {
      bookCents = amount;
    } else if (row.kind === 'aporte') {
      if (quantityMode && row.operation === 'compra' && (q === null || q <= 0))
        issues.push('Informe a quantidade comprada.');
      bookCents += amount;
      if (basis !== null) basis += amount + costs;
      if (quantityMode) units = units === null || q === null ? null : units + q;
    } else if (row.kind === 'retirada') {
      if (quantityMode && row.operation === 'venda') {
        if (units === null || q === null || q <= 0 || units <= 0 || q > units) {
          issues.push(
            `Quantidade indisponível ou venda acima da posição: ${row.id}.`,
          );
          units = null;
          basis = null;
        } else {
          const removedBook = portion(bookCents, q, units),
            removedBasis = basis === null ? null : portion(basis, q, units);
          bookCents -= removedBook;
          units -= q;
          if (removedBasis !== null && basis !== null) {
            basis -= removedBasis;
            realized = amount - removedBasis - costs;
          }
        }
      } else {
        bookCents -= amount;
        if (basis !== null)
          basis = Math.max(
            0,
            basis -
              portion(
                basis,
                Math.min(amount, Math.max(0, before)),
                Math.max(1, before),
              ),
          );
        if (quantityMode) {
          units = null;
          basis = null;
        }
      }
    } else if (row.kind === 'rendimento') {
      if (!paidIncome(row)) bookCents += amount;
    } else if (row.kind === 'perda' && !cashCharge(row)) bookCents -= amount;
    if (bookCents < 0)
      issues.push(
        `Movimentação ${row.id} supera o saldo disponível e produz saldo negativo.`,
      );
    if (
      !Number.isSafeInteger(bookCents) ||
      (basis !== null && !Number.isSafeInteger(basis))
    )
      throw Error('Posição excede o limite seguro de centavos.');
    if (units !== null && !Number.isSafeInteger(units))
      issues.push('Quantidade acumulada excede a precisão segura.');
    entries.push({
      row,
      amountCents: amount,
      cashCents: movementCashCents(row),
      bookDeltaCents: bookCents - before,
      costsCents: costs,
      quantityUnits: units,
      basisCents: basis,
      bookCents,
      realizedGainCents: realized,
    });
  }
  return {
    openingBasisCents,
    bookCents,
    basisCents: basis,
    quantity: units === null ? null : units / QUANTITY_SCALE,
    quantityUnits: units,
    averagePrice:
      basis !== null && units !== null && units > 0
        ? basis / 100 / (units / QUANTITY_SCALE)
        : null,
    entries,
    issues,
    quantityMode,
  };
}

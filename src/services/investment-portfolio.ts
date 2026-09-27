import { type Data, type Row, num } from '../model';
import { investmentLedger, paidIncome, cashCharge } from './investment-ledger';
import { toCents } from './money-codec';

/** Quotes are observations, never historical valuations or persisted transactions. */
export type PositionQuote = { price: number; currency: string; date: string };
export function investmentPosition(
  asset: Row,
  movements: readonly Row[],
  at: string,
  quote?: PositionQuote,
) {
  const ledger = investmentLedger(asset, movements, at);
  const active = String(asset.date) <= at;
  const openingCents = active
    ? (ledger.openingBasisCents ?? toCents(num(asset.balance)))
    : 0;
  let valueCents: number | null = ledger.bookCents;
  let valuation: 'registrado' | 'avaliação' | 'cotação' | 'indisponível' =
    'registrado';
  let valuationDate = at;
  const fx = (currency: string) =>
    currency === 'BRL' ? 1 : num(asset.fxToBRL) > 0 ? num(asset.fxToBRL) : null;
  if (
    active &&
    typeof asset.currentValue === 'number' &&
    asset.valuationDate &&
    String(asset.valuationDate) <= at
  ) {
    const rate = fx(String(asset.valuationCurrency || 'BRL'));
    valueCents = rate === null ? null : ledger.bookCents;
    valuation = valueCents === null ? 'indisponível' : 'avaliação';
    valuationDate = String(asset.valuationDate);
  }
  if (
    active &&
    quote &&
    quote.date <= at &&
    Number.isFinite(quote.price) &&
    quote.price >= 0 &&
    ledger.quantity !== null
  ) {
    const rate = fx(quote.currency);
    valueCents =
      rate === null ? null : toCents(ledger.quantity * quote.price * rate);
    valuation = valueCents === null ? 'indisponível' : 'cotação';
    valuationDate = quote.date;
  }
  let contributionsCents = openingCents,
    withdrawalsCents = 0,
    incomeCents = 0,
    costsCents = 0;
  for (const entry of ledger.entries) {
    if (entry.row.kind === 'aporte') contributionsCents += entry.amountCents;
    if (entry.row.kind === 'retirada') withdrawalsCents += entry.amountCents;
    if (paidIncome(entry.row)) incomeCents += entry.amountCents;
    costsCents +=
      entry.costsCents + (cashCharge(entry.row) ? entry.amountCents : 0);
  }
  const grossResultCents =
    valueCents === null
      ? null
      : valueCents + withdrawalsCents + incomeCents - contributionsCents;
  const netResultCents =
    grossResultCents === null ? null : grossResultCents - costsCents;
  const netCapitalCents = contributionsCents - withdrawalsCents;
  return {
    asset,
    ...ledger,
    valueCents,
    valuation,
    valuationDate,
    contributionsCents,
    withdrawalsCents,
    incomeCents,
    costsCents,
    grossResultCents,
    netResultCents,
    netComplete:
      asset.costsKnown === 'sim' &&
      ledger.entries.every(
        (e) =>
          typeof e.row.feesCents === 'number' &&
          typeof e.row.taxCents === 'number',
      ),
    // Descriptive ratio, not an annualized or time-weighted return.
    simpleNetCapitalReturn:
      netResultCents !== null && netCapitalCents > 0
        ? netResultCents / netCapitalCents
        : null,
  };
}
export function investmentPortfolio(
  d: Data,
  at: string,
  quotes: ReadonlyMap<string, PositionQuote> = new Map(),
) {
  const movements = new Map<string, Row[]>();
  for (const row of d.movements) {
    const key = String(row.investmentId);
    if (!movements.has(key)) movements.set(key, []);
    movements.get(key)!.push(row);
  }
  const allocations = new Map(
    d.reserveAllocations.map((row) => [String(row.investmentId), row]),
  );
  const positions = d.investments
    .filter((row) => String(row.date) <= at)
    .map((row) => {
      const allocation = allocations.get(row.id);
      return {
        ...investmentPosition(
          row,
          movements.get(row.id) || [],
          at,
          quotes.get(row.id),
        ),
        reserve: allocation
          ? allocation.enabled === 'sim'
          : row.category === 'reserva de emergência',
        liquidity: String(
          allocation?.liquidity || row.liquidity || 'não informada',
        ),
      };
    });
  const knownValueCents = positions.reduce(
    (sum, p) => sum + (p.valueCents ?? 0),
    0,
  );
  const distribution = (
    dimension:
      | 'category'
      | 'indexer'
      | 'issuer'
      | 'institution'
      | 'currency'
      | 'liquidity'
      | 'reserve',
  ) => {
    const groups = new Map<string, number>();
    for (const p of positions) {
      const label =
        dimension === 'reserve'
          ? p.reserve
            ? 'Reserva'
            : 'Demais investimentos'
          : dimension === 'liquidity'
            ? p.liquidity
            : String(p.asset[dimension] || 'Não informado');
      if (p.valueCents !== null)
        groups.set(label, (groups.get(label) || 0) + p.valueCents);
    }
    return [...groups]
      .map(([label, valueCents]) => ({
        label,
        valueCents,
        share: knownValueCents > 0 ? valueCents / knownValueCents : null,
      }))
      .sort((a, b) => b.valueCents - a.valueCents);
  };
  return {
    positions,
    knownValueCents,
    partial: positions.some(
      (p) => p.valueCents === null || p.issues.length > 0,
    ),
    distribution,
  };
}

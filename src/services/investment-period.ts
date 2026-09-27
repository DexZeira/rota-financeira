import { type Data, num, validDate } from '../model';
import { investmentPortfolio } from './investment-portfolio';
import { cashCharge, movementCosts, paidIncome } from './investment-ledger';
import { toCents } from './money-codec';
import { compareInvestmentBenchmark } from './investment-benchmark';
import type { InflationMonth } from './inflation-indicators';
import type { Row } from '../model';

export function assetPeriodComparison(
  data: Data,
  asset: Row,
  start: string,
  end: string,
  inflation: InflationMonth[],
) {
  const result = investmentPeriod(
    {
      ...data,
      investments: [asset],
      movements: data.movements.filter((r) => r.investmentId === asset.id),
      netWorthSnapshots: [],
    },
    start,
    end,
  );
  return compareInvestmentBenchmark({
    name: String(asset.benchmark),
    annualPercent:
      typeof asset.benchmarkRate === 'number' ? asset.benchmarkRate : null,
    start,
    end,
    portfolioReturn: result.returnRate,
    inflation,
  });
}

/** A boundary snapshot is preserved evidence, never repriced with today's quote.
 * Without intermediate valuations, flows inside the period make its time-based
 * return unavailable. The monetary result can still be shown. */
export function investmentPeriod(d: Data, start: string, end: string) {
  if (!validDate(start) || !validDate(end) || start > end)
    throw Error('Período inválido.');
  const previous = new Date(start + 'T12:00:00Z');
  previous.setUTCDate(previous.getUTCDate() - 1);
  const before = previous.toISOString().slice(0, 10);
  const boundary = (date: string) => {
    const snapshot = d.netWorthSnapshots.find((row) => row.date === date);
    if (snapshot)
      return {
        valueCents: num(snapshot.investmentsCents),
        source: 'snapshot',
        partial: Boolean(snapshot.partial),
      };
    const portfolio = investmentPortfolio(d, date);
    return {
      valueCents: portfolio.knownValueCents,
      source: 'registros',
      partial: portfolio.partial,
    };
  };
  const opening = boundary(before),
    closing = boundary(end);
  const movements = d.movements.filter(
    (row) => String(row.date) >= start && String(row.date) <= end,
  );
  let invested = 0,
    withdrawn = 0,
    income = 0,
    costs = 0;
  for (const row of d.investments)
    if (String(row.date) >= start && String(row.date) <= end)
      invested += toCents(num(row.balance));
  for (const row of movements) {
    if (row.kind === 'aporte') invested += toCents(num(row.amount));
    if (row.kind === 'retirada') withdrawn += toCents(num(row.amount));
    if (paidIncome(row)) income += toCents(num(row.amount));
    costs +=
      movementCosts(row) + (cashCharge(row) ? toCents(num(row.amount)) : 0);
  }
  const partial = opening.partial || closing.partial;
  const nominalCents = partial
    ? null
    : closing.valueCents - opening.valueCents - invested + withdrawn + income;
  const netCents = nominalCents === null ? null : nominalCents - costs;
  return {
    opening,
    closing,
    investedCents: invested,
    withdrawnCents: withdrawn,
    incomeCents: income,
    nominalCents,
    netCents,
    returnRate:
      netCents !== null &&
      opening.valueCents > 0 &&
      invested === 0 &&
      withdrawn === 0
        ? netCents / opening.valueCents
        : null,
    partial,
    netComplete:
      d.investments.every((r) => r.costsKnown === 'sim') &&
      movements.every((r) => r.feesCents !== null && r.taxCents !== null),
  };
}

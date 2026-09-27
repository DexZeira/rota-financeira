import { validDate } from '../model';
import { daysBetween } from '../calculations';
import { realReturn } from './purchasing-power';
import {
  inflationBetweenMonths,
  type InflationMonth,
} from './inflation-indicators';

export type BenchmarkObservation = {
  name: 'CDI' | 'Selic';
  start: string;
  end: string;
  returnRate: number;
  complete: boolean;
};
/** Observed returns must have exactly the same boundaries. Latest annual rates
 * cannot stand in for realized historical CDI/Selic returns. */
export function compareInvestmentBenchmark(input: {
  name: string;
  start: string;
  end: string;
  portfolioReturn: number | null;
  annualPercent?: number | null;
  observations?: readonly BenchmarkObservation[];
  inflation?: InflationMonth[];
}) {
  const { name, start, end, portfolioReturn } = input;
  if (!validDate(start) || !validDate(end) || start > end)
    throw Error('Período inválido.');
  const endDate = new Date(end + 'T12:00:00Z');
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const wholeMonths = start.endsWith('-01') && endDate.getUTCDate() === 1;
  const inflation = wholeMonths
    ? inflationBetweenMonths(
        input.inflation || [],
        start.slice(0, 7),
        end.slice(0, 7),
      )
    : null;
  let benchmarkReturn: number | null = null,
    projected = false;
  if (name === 'CDI' || name === 'Selic') {
    const match = input.observations?.find(
      (r) =>
        r.name === name && r.start === start && r.end === end && r.complete,
    );
    if (match && Number.isFinite(match.returnRate) && match.returnRate >= -1)
      benchmarkReturn = match.returnRate;
  } else if (name === 'IPCA') benchmarkReturn = inflation;
  else if (
    ['IPCA + taxa', 'Personalizado'].includes(name) &&
    typeof input.annualPercent === 'number' &&
    Number.isFinite(input.annualPercent) &&
    input.annualPercent > -100
  ) {
    const factor = Math.pow(
      1 + input.annualPercent / 100,
      (daysBetween(start, end) + 1) / 365,
    );
    benchmarkReturn =
      name === 'Personalizado'
        ? factor - 1
        : inflation === null
          ? null
          : (1 + inflation) * factor - 1;
    projected = true;
  }
  if (benchmarkReturn !== null && !Number.isFinite(benchmarkReturn))
    benchmarkReturn = null;
  return {
    benchmarkReturn,
    projected,
    inflation,
    differencePp:
      portfolioReturn !== null && benchmarkReturn !== null
        ? (portfolioReturn - benchmarkReturn) * 100
        : null,
    portfolioReal: realReturn(portfolioReturn, inflation),
    benchmarkReal: realReturn(benchmarkReturn, inflation),
  };
}

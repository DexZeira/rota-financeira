import { estimateIncomeTax } from './investment-tax';
export type ComparisonInput = { type: string; rate: number; indexer?: 'CDI' | 'Selic'; percentIndexer?: number; initial: number; months: number; referenceRate?: number; };
export type ComparisonResult = { gross: number; profit: number; tax: number; net: number; netRate: number };
export function compareInvestment(input: ComparisonInput): ComparisonResult {
  const annual = input.indexer ? (input.referenceRate || 0) * (input.percentIndexer || 100) / 100 + input.rate : input.rate;
  const gross = input.initial * Math.pow(1 + annual / 100, input.months / 12);
  const profit = Math.max(0, gross - input.initial);
  const tax = estimateIncomeTax(profit, input.months * 30, input.type);
  const net = gross - tax;
  return { gross, profit, tax, net, netRate: input.initial ? (net / input.initial - 1) * 100 : 0 };
}

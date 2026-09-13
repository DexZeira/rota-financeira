import { estimateIncomeTax } from './investment-tax';
import { estimateSavingsYield } from './savings-yield';
import { annualizePercentOfCdi } from './market-rates';
export type ComparisonInput = { type: string; rate: number; indexer?: 'CDI' | 'Selic'; percentIndexer?: number; initial: number; months: number; referenceRate?: number; };
export type ComparisonResult = { gross: number; profit: number; tax: number; net: number; netRate: number; status?: 'estimated' | 'actual' | 'unavailable'; rule?: string; totalRatePercent?: number };
export function compareInvestment(input: ComparisonInput): ComparisonResult {
  if (input.type === 'Poupança') {
    const savings = estimateSavingsYield({ balance: input.initial, anniversaryDay: 1, trPercent: input.referenceRate, targetSelicAnnualPercent: input.rate });
    const monthly = savings.totalRatePercent || 0;
    const gross = input.initial * Math.pow(1 + monthly / 100, input.months);
    return { gross, profit: gross - input.initial, tax: 0, net: gross, netRate: input.initial ? (gross / input.initial - 1) * 100 : 0, status: savings.status, rule: savings.totalRatePercent === undefined ? undefined : 'TR + regra vigente da Meta Selic', totalRatePercent: savings.totalRatePercent };
  }
  const cdiAnnual = input.indexer === 'CDI' && input.referenceRate !== undefined ? annualizePercentOfCdi((Math.pow(1 + input.referenceRate / 100, 1 / 252) - 1) * 100, input.percentIndexer || 100) : undefined;
  const annual = cdiAnnual ?? (input.indexer ? (input.referenceRate || 0) * (input.percentIndexer || 100) / 100 + input.rate : input.rate);
  const gross = input.initial * Math.pow(1 + annual / 100, input.months / 12);
  const profit = Math.max(0, gross - input.initial);
  const tax = estimateIncomeTax(profit, input.months * 30, input.type);
  const net = gross - tax;
  return { gross, profit, tax, net, netRate: input.initial ? (net / input.initial - 1) * 100 : 0 };
}

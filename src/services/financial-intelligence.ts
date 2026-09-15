import { type Data, type Row, num, validDate } from '../model';
import { investmentBalance } from '../calculations';
import { toCents, fromCents } from './money-codec';
import { annualizePercentOfCdi, type MarketRates } from './market-rates';
import { type MarketExpectations } from './market-expectations';
import { inflationBetweenMonths, type InflationHistory } from './inflation-indicators';
import { inflationAdjustedTarget, realReturn, nominalToReal, netRealReturn } from './purchasing-power';
import { estimateIncomeTax } from './investment-tax';

const knownTax = ['CDB', 'LCI', 'LCA', 'Tesouro Selic', 'Tesouro Prefixado', 'Tesouro IPCA+', 'renda fixa', 'Conta remunerada', 'Poupança'];
export function investmentAnnualRate(r: Row, rates: MarketRates, expectedInflation: number | null): number | null {
  if (r.category === 'Poupança' || ['Ação', 'ações', 'ETF', 'FII', 'Criptomoeda', 'Fundo', 'fundos', 'outros'].includes(String(r.category))) return null;
  if (r.rateType === 'Pós-fixado' && ['CDB', 'LCI', 'LCA', 'Conta remunerada'].includes(String(r.category))) {
    if (r.indexer !== 'CDI' || !rates.cdi || typeof r.indexerPercent !== 'number') return null;
    return annualizePercentOfCdi(rates.cdi.rawValue, r.indexerPercent) === undefined ? null : annualizePercentOfCdi(rates.cdi.rawValue, r.indexerPercent)! / 100;
  }
  if (r.category === 'Tesouro Selic') return rates.selic ? rates.selic.value / 100 : null;
  if (typeof r.yield !== 'number') return null;
  if (r.rateType === 'IPCA +' || r.category === 'Tesouro IPCA+') return expectedInflation === null ? null : (1 + expectedInflation) * (1 + r.yield / 100) - 1;
  return r.yield / 100;
}
export function investmentProjection(r: Row, rates: MarketRates, inflation: number | null, principal: number) {
  const annual = investmentAnnualRate(r, rates, inflation);
  if (annual === null || principal <= 0) return null;
  const grossFinal = fromCents(toCents(principal * (1 + annual)));
  return netRealReturn({ principal, grossFinal, fees: typeof r.annualFeePercent === 'number' ? principal * r.annualFeePercent / 100 : null,
    incomeTax: knownTax.includes(String(r.category)) ? estimateIncomeTax(Math.max(0, grossFinal - principal), 365, String(r.category)) : null,
    iof: knownTax.includes(String(r.category)) ? 0 : null, inflationInPeriod: inflation });
}
export function investmentRecordedResult(d: Data, r: Row, history: InflationHistory | undefined, at: string) {
  const movements = d.movements.filter((m) => m.investmentId === r.id && String(m.date) <= at);
  const capital = fromCents(toCents(num(r.balance)) + movements.reduce((s, m) => s + (m.kind === 'aporte' ? toCents(num(m.amount)) : m.kind === 'retirada' ? -toCents(num(m.amount)) : 0), 0));
  const balance = investmentBalance(d, r, at);
  const profit = fromCents(toCents(balance) - toCents(capital));
  // Cash-flow timing needs a full index path; never divide all flows by an opening balance.
  const singleLot = !movements.some((m) => m.kind === 'aporte' || m.kind === 'retirada');
  const first = String(r.date).slice(0, 7), last = history?.months.at(-1)?.month;
  const referenceDate = last ? new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5)), 0)).toISOString().slice(0, 10) : null;
  const observed = singleLot && validDate(String(r.date)) && last && referenceDate && at >= referenceDate && first <= last
    ? inflationBetweenMonths(history!.months, first, last) : null;
  const alignedBalance = referenceDate ? investmentBalance(d, r, referenceDate) : null;
  return { capital, balance, profit, referenceDate, approximate: String(r.date).slice(-2) !== '01',
    realRate: observed !== null && alignedBalance !== null && num(r.balance) > 0 ? realReturn(alignedBalance / num(r.balance) - 1, observed) : null,
    realValue: observed !== null && alignedBalance !== null ? nominalToReal(alignedBalance, observed, 1) : null };
}
export function correctedPlan(r: Row, rates: MarketRates, focus: MarketExpectations) {
  const mode = r.inflationMode || 'Sem correção';
  const base = num(r.target);
  if (mode === 'Sem correção') return { base, adjusted: base, annual: null, years: 0, source: 'Sem correção' };
  const years = validDate(String(r.deadline)) && validDate(String(r.inflationBaseDate)) ? Math.max(0, (Date.parse(String(r.deadline)) - Date.parse(String(r.inflationBaseDate))) / (365.2425 * 86400000)) : null;
  const annual = mode === 'Taxa personalizada' ? typeof r.inflationRate === 'number' ? r.inflationRate / 100 : null
    : mode === 'IPCA esperado' ? focus.ipca === undefined ? null : focus.ipca / 100 : rates.ipca ? rates.ipca.value / 100 : null;
  const adjusted = years === null ? null : inflationAdjustedTarget(base, annual, years).targetInflationAdjusted;
  return { base, adjusted, annual, years, source: mode === 'IPCA observado' ? 'IPCA 12m repetido como hipótese anual' : mode === 'IPCA esperado' ? `Focus ${focus.year} repetido como hipótese anual` : 'Taxa personalizada' };
}
export function concentration(d: Data, field: 'category' | 'indexer' | 'institution' | 'issuer' | 'currency') {
  const buckets = new Map<string, number>();
  for (const row of d.investments) {
    const amount = toCents(Math.max(0, investmentBalance(d, row)));
    let label = row[field];
    if (field === 'indexer') {
      label = row.category === 'Tesouro IPCA+' || row.rateType === 'IPCA +' ? 'IPCA'
        : row.category === 'Tesouro Selic' ? 'Selic'
        : ['CDB', 'LCI', 'LCA', 'Conta remunerada', 'renda fixa', 'Tesouro Prefixado'].includes(String(row.category))
          ? row.rateType === 'Prefixado' || row.category === 'Tesouro Prefixado' ? 'Prefixado' : row.indexer
          : 'Não informado';
    }
    const name = String(label || 'Não informado').trim() || 'Não informado';
    buckets.set(name, (buckets.get(name) || 0) + amount);
  }
  const total = [...buckets.values()].reduce((a, b) => a + b, 0);
  return [...buckets].map(([name, cents]) => ({ name, amount: fromCents(cents), percent: total > 0 ? cents / total * 100 : null })).sort((a, b) => b.amount - a.amount);
}
export function debtOpportunity(debtAnnual: number | null, netInvestmentAnnual: number | null) {
  if (debtAnnual === null || netInvestmentAnnual === null) return null;
  if (![debtAnnual, netInvestmentAnnual].every(Number.isFinite)) throw Error('Taxa inválida.');
  return { differencePoints: (netInvestmentAnnual - debtAnnual) * 100, debtCostsMore: debtAnnual > netInvestmentAnnual };
}
export function currencyReturn(assetReturn: number | null, exchangeReturn: number | null) {
  if (assetReturn === null || exchangeReturn === null) return null;
  if (![assetReturn, exchangeReturn].every((v) => Number.isFinite(v) && v >= -1)) throw Error('Retorno inválido.');
  return { assetReturn, exchangeReturn, interaction: assetReturn * exchangeReturn, totalBrl: (1 + assetReturn) * (1 + exchangeReturn) - 1 };
}

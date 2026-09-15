import { type Data, type Row, money, dec, brDate, today } from '../model';
import { type EconomicIndicators } from '../hooks/use-economic-indicators';
import { investmentProjection, investmentRecordedResult, concentration } from '../services/financial-intelligence';
import { value } from '../pages/shared';

export const percentOrUnknown = (n: number | null | undefined) => n == null ? 'Indisponível' : dec(n * 100) + '%';
export const moneyOrUnknown = (n: number | null | undefined) => n == null ? 'Indisponível' : money(n);
export function InvestmentIntelligence({ data, row, economic }: { data: Data; row: Row; economic: EconomicIndicators }) {
  const recorded = investmentRecordedResult(data, row, economic.inflation, today());
  const inflation = economic.focus.ipca === undefined ? null : economic.focus.ipca / 100;
  let projected: ReturnType<typeof investmentProjection> = null;
  try { projected = investmentProjection(row, economic.rates, inflation, recorded.balance); } catch { /* invalid hypotheses are not a portfolio total */ }
  const fgcEligible = row.fgcStatus === 'sim' ? true : row.fgcStatus === 'não' ? false : null;
  return <details className="disclosure"><summary>Retorno, poder de compra e risco · {String(row.name)}</summary>
    <h3>Registrado</h3><div className="inline-stats">{value('Capital registrado, líquido de retiradas', money(recorded.capital))}{value('Saldo registrado', money(recorded.balance))}{value('Rendimentos menos perdas registrados', money(recorded.profit))}</div>
    <p className="inline-note">Saldos registrados não são valores de resgate nem incluem automaticamente impostos.</p>
    {recorded.realValue !== null ? <><div className="inline-stats">{value('Poder de compra na data-base', money(recorded.realValue))}{value('Retorno real bruto', percentOrUnknown(recorded.realRate))}</div><p className="inline-note">{recorded.approximate ? 'Estimado: inclui o mês completo de entrada.' : 'Meses completos.'} IPCA SGS 433 e saldo registrado até {brDate(recorded.referenceDate)}; reais da data-base {brDate(row.date)}. Sem IR e taxas de resgate. {recorded.realRate !== null && (recorded.realRate >= 0 ? 'Ganho real bruto no período.' : 'Perda real bruta no período.')}</p></> : <p className="inline-note">Retorno real histórico indisponível: exige IPCA de todo o período e lote sem aportes/retiradas intermediários. Não usamos o IPCA atual como inflação de períodos antigos.</p>}
    <h3>Hipótese para um novo lote de 1 ano</h3><div className="inline-stats">{value('Retorno nominal', percentOrUnknown(projected?.nominalRate))}{value('Retorno líquido', percentOrUnknown(projected?.netRate))}{value('Inflação esperada · Focus ' + (economic.focus.year || ''), percentOrUnknown(inflation))}{value('Retorno líquido real', percentOrUnknown(projected?.netRealRate))}{value('Saldo líquido projetado', moneyOrUnknown(projected?.netFinal))}{value('Saldo real projetado', moneyOrUnknown(projected?.realFinal))}{value('Ganho real projetado', moneyOrUnknown(projected?.realProfit))}</div>
    <p className="inline-note">Estimativa, não garantia de resultado. Novo lote, sem aportes, resgate em 365 dias, sem cupons. Reutiliza o IR regressivo; IOF zero para esse prazo. Taxa anual informada calculada sobre o capital inicial, sem dedução fiscal. Taxas não informadas mantêm o líquido indisponível. Focus anual repetido como hipótese para os próximos 12 meses; não representa a expectativa exata desse intervalo. Não calcula resgate antecipado do seu lote.</p>
    <div className="inline-stats">{value('Liquidez', String(row.liquidity || 'não informado'))}{value('Emissor', String(row.issuer || 'não informado'))}{value('Risco / rating informado', String(row.riskNotes || 'não informado'))}{value('FGC informado', fgcEligible === null ? 'Não informado' : fgcEligible ? 'Sim · confirme condições do produto' : 'Não')}{value('Taxa anual informada', row.annualFeePercent == null ? 'Não informado' : dec(Number(row.annualFeePercent)) + '%')}{value('Vencimento', brDate(row.maturity))}</div>
    <p className="inline-note">Cobertura informada pelo usuário; FGC não elimina riscos. {row.category === 'Criptomoeda' && 'Cripto: alta volatilidade, sem FGC; não equivale automaticamente a proteção contra inflação.'}{(String(row.category).startsWith('Tesouro') || row.liquidity === 'negociável com marcação a mercado') && ' O valor pode oscilar antes do vencimento.'} {row.maturity && 'A taxa disponível para reinvestimento no vencimento é desconhecida.'}</p>
  </details>;
}
export function Diversification({ data }: { data: Data }) {
  return <details className="disclosure"><summary>Concentração da carteira</summary><p className="inline-note">Base: saldos registrados positivos; não é avaliação de adequação ou recomendação.</p>{([['Classe', 'category'], ['Indexador informado', 'indexer'], ['Emissor', 'issuer'], ['Instituição', 'institution'], ['Moeda de exposição', 'currency']] as const).map(([label, field]) => <section key={field}><h3>{label}</h3>{concentration(data, field).map((r) => <p key={r.name}>{r.name}: {r.percent === null ? 'Indisponível' : dec(r.percent) + '%'} · {money(r.amount)}</p>)}</section>)}</details>;
}

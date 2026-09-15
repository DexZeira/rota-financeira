import { dec, brDate } from '../model';
import { type EconomicIndicators } from '../hooks/use-economic-indicators';
import { type FinancialIndicator } from '../services/indicator-cache';

export const indicatorStatus = { actual: 'Atual', estimated: 'Estimado', cached: 'Em cache', unavailable: 'Indisponível' };
function Indicator({ label, indicator }: { label: string; indicator: FinancialIndicator }) {
  return <div className="detail"><span>{label}</span><strong>{indicator.value === null ? 'Indisponível' : `${dec(indicator.value, 4)} ${indicator.unit}`}</strong><small>{indicatorStatus[indicator.status]} · {indicator.source}</small><small>Referência: {brDate(indicator.referenceDate)}{indicator.fetchedAt && ` · Consulta: ${brDate(indicator.fetchedAt.slice(0, 10))}`}</small></div>;
}
export function EconomicIndicatorsPanel({ economic }: { economic: EconomicIndicators }) {
  return <details className="disclosure"><summary>Indicadores · economia agora</summary>
    <h3>Indicadores atuais</h3><div className="market-strip">
      {([['CDI anual equivalente', 'cdi'], ['Selic efetiva', 'selic'], ['Meta Selic', 'selicTarget'], ['IPCA 12 meses', 'ipca'], ['TR', 'tr']] as const).map(([label, key]) => {
        const rate = economic.rates[key];
        return <Indicator key={key} label={label} indicator={{ value: rate?.value ?? null, unit: key === 'cdi' ? '% a.a.' : rate?.unit || '%', source: rate?.source || 'Banco Central · SGS', referenceDate: rate?.date ?? null, fetchedAt: rate?.fetchedAt ?? null, status: rate?.status ?? (rate ? 'actual' : 'unavailable') }} />;
      })}
      {economic.inflation && <Indicator label="IPCA mensal" indicator={economic.inflation.latest} />}
    </div>
    <p className="inline-note">CDI: taxa diária SGS 12 composta em 252 dias úteis. IPCA representa uma medida média da variação de preços no Brasil. Seus gastos pessoais podem variar de forma diferente.</p>
    <h3>Expectativas Focus</h3><div className="market-strip">{economic.focus.years?.map((y) => <section key={y.year} aria-label={`Focus ${y.year}`}><Indicator label={`Selic — fim de ${y.year}`} indicator={y.selic}/><Indicator label={`IPCA — ${y.year}`} indicator={y.ipca}/></section>) || <p>Indisponível</p>}</div>
    <p className="inline-note">Mediana das expectativas para o ano indicado; não é inflação realizada nem previsão garantida. Dados em cache conservam sua data original.</p>
  </details>;
}

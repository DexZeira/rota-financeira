import { useState } from 'react';
import { type Data, type Row, num, dec, brDate } from '../model';
import { investmentBalance } from '../calculations';
import { type EconomicIndicators } from '../hooks/use-economic-indicators';
import { projectPurchasingPower, requiredNominalReturn, realToNominal } from '../services/purchasing-power';
import { debtOpportunity, investmentProjection, currencyReturn } from '../services/financial-intelligence';
import { moneyOrUnknown, percentOrUnknown } from './investment-intelligence';
import { value } from '../pages/shared';

function NumberField({ name, label, initial, min, max, step = 'any', required = false }: { name: string; label: string; initial?: number; min?: number; max?: number; step?: string; required?: boolean }) {
  return <label><span>{label}</span><input name={name} type="number" inputMode="decimal" min={min} max={max} step={step} defaultValue={initial} required={required}/></label>;
}
function readNumber(data: FormData, name: string, optional = false) {
  const entry = data.get(name);
  const text = typeof entry === 'string' ? entry.trim() : '';
  if (!text && optional) return null;
  const value = Number(text);
  if (!text || !Number.isFinite(value)) throw Error('Preencha as hipóteses numéricas válidas.');
  return value;
}
type Projection = ReturnType<typeof projectPurchasingPower>;
export function PurchasingPowerTools({ economic, initialValue = 10000, motorcycle = false }: { economic: EconomicIndicators; initialValue?: number; motorcycle?: boolean }) {
  const [results, setResults] = useState<{ label: string; projection: Projection }[]>([]);
  const [required, setRequired] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [currency, setCurrency] = useState<ReturnType<typeof currencyReturn>>(null);
  const [error, setError] = useState('');
  const [debt, setDebt] = useState<ReturnType<typeof debtOpportunity>>(null);
  return <details className="disclosure"><summary>{motorcycle ? 'Poder de compra · próxima moto e custos futuros' : 'Simuladores · poder de compra, cenários e dívida'}</summary>
    <p className="inline-note">Estimativa, não garantia de resultado. Os cenários não alteram seus saldos. Base Focus disponível: {economic.focus.ipca === undefined ? 'Indisponível' : `${dec(economic.focus.ipca)}% para ${economic.focus.year}`}. Transfira essa hipótese ao campo de inflação se desejar repeti-la durante o prazo; a expectativa anual não prevê todos os anos.</p>
    {motorcycle && <p className="inline-note">Use o preço da próxima moto, peça, serviço, seguro, documentação ou combustível como valor-base. Não existe índice específico assumido: selecione uma hipótese de IPCA ou taxa personalizada.</p>}
    <form onSubmit={(event) => {
      event.preventDefault(); setError(''); setResults([]); setTarget(null); setRequired(null); setCurrency(null); setDebt(null);
      try {
        const fields = new FormData(event.currentTarget);
        const initial = readNumber(fields, 'initial')!, months = readNumber(fields, 'months')!, inflation = readNumber(fields, 'inflation')! / 100;
        const input = { initial, months, annualInflation: inflation, annualReturn: readNumber(fields, 'return')! / 100, monthlyContribution: readNumber(fields, 'contribution')!, adjustContributions: fields.get('adjust') === 'on', terminalFees: readNumber(fields, 'fees', true), terminalIncomeTax: readNumber(fields, 'tax', true), terminalIof: readNumber(fields, 'iof', true) };
        const scenario = (label: string, rateKey: string, inflationKey: string) => {
          const rate = readNumber(fields, rateKey, true), inf = readNumber(fields, inflationKey, true);
          return rate === null || inf === null ? [] : [{ label, projection: projectPurchasingPower({ ...input, annualReturn: rate / 100, annualInflation: inf / 100, terminalIncomeTax: readNumber(fields, rateKey + 'Tax', true) }) }];
        };
        const next = [...scenario('Conservador · hipótese pessoal', 'conservative', 'lowInflation'), { label: 'Base · hipótese pessoal', projection: projectPurchasingPower(input) }, ...scenario('Otimista · hipótese pessoal', 'optimistic', 'highInflation')];
        const desired = readNumber(fields, 'desired')! / 100;
        const required = requiredNominalReturn(inflation, desired), target = realToNominal(initial, inflation, months / 12);
        const asset = readNumber(fields, 'asset', true), fx = readNumber(fields, 'exchange', true);
        const currency = currencyReturn(asset === null ? null : asset / 100, fx === null ? null : fx / 100);
        const debtRate = readNumber(fields, 'debt', true), netRate = readNumber(fields, 'net', true);
        const debt = debtOpportunity(debtRate === null ? null : debtRate / 100, netRate === null ? null : netRate / 100);
        setResults(next); setRequired(required); setTarget(target); setCurrency(currency); setDebt(debt);
      } catch (e) { setError(e instanceof Error ? e.message : 'Revise as hipóteses.'); }
    }}>
      <div className="form-grid compact-form">
        <NumberField name="initial" label="Valor atual (R$)" initial={initialValue} min={0} max={1e12} required/>
        <NumberField name="months" label="Prazo simulado (meses)" initial={60} min={0} max={1200} step="1" required/>
        <NumberField name="inflation" label="Inflação anual da hipótese (%)" min={-99} max={100} required/>
        <NumberField name="return" label="Retorno nominal esperado (% a.a.)" min={-100} max={100} required/>
        <NumberField name="contribution" label="Aporte no fim de cada mês (R$)" initial={0} min={0} max={1e9} required/>
        <NumberField name="desired" label="Ganho real desejado (% a.a.)" initial={4} min={-100} max={100} required/>
      </div>
      <label><input name="adjust" type="checkbox"/> Corrigir aportes pela inflação a cada ano</label>
      <details className="disclosure"><summary>Impostos e custos totais do cenário</summary><p>Valores descontados no fim. Vazio = desconhecido; informe zero somente para simular ausência da cobrança. Não estimamos tributação por lote de aportes.</p><div className="form-grid compact-form"><NumberField name="fees" label="Custos e taxas totais (R$)" min={0}/><NumberField name="tax" label="IR total da hipótese Base (R$)" min={0}/><NumberField name="iof" label="IOF total (R$)" min={0}/></div></details>
      <details className="disclosure"><summary>Cenários alternativos</summary><p>Defina os pares abaixo. Custos e IOF seguem a hipótese comum; cada cenário tem seu próprio IR total. Taxas são hipóteses pessoais, sem classificação automática.</p><div className="form-grid compact-form">
        <NumberField name="conservative" label="Conservador · retorno (% a.a.)" min={-100} max={100}/><NumberField name="lowInflation" label="Conservador · inflação (% a.a.)" min={-99} max={100}/><NumberField name="conservativeTax" label="Conservador · IR total (R$)" min={0}/>
        <NumberField name="optimistic" label="Otimista · retorno (% a.a.)" min={-100} max={100}/><NumberField name="highInflation" label="Otimista · inflação (% a.a.)" min={-99} max={100}/><NumberField name="optimisticTax" label="Otimista · IR total (R$)" min={0}/>
      </div></details>
      <details className="disclosure"><summary>Dívida x investimento e câmbio</summary><p>Compare taxas efetivas anuais para o mesmo prazo e moeda. Juros contratuais sem encargos não equivalem ao CET.</p><div className="form-grid compact-form"><NumberField name="debt" label="Custo efetivo total da dívida (% a.a.)" min={0}/><NumberField name="net" label="Retorno líquido esperado do investimento (% a.a.)" min={-100}/><NumberField name="asset" label="Retorno do ativo na moeda original (%)" min={-100}/><NumberField name="exchange" label="Variação cambial no mesmo período (%)" min={-100}/></div></details>
      <button className="primary" type="submit">Calcular hipóteses</button>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
    {results.length > 0 && <section aria-label="Resultados da simulação"><p className="inline-note">Resultados da última execução. Após mudar hipóteses, clique em Calcular novamente.</p><div className="inline-stats">{value('Quanto preciso render · nominal anual', percentOrUnknown(required))}{value('Meta para preservar poder de compra', moneyOrUnknown(target))}</div>
      {results.map(({ label, projection }) => <section key={label}><h3>{label}</h3><div className="inline-stats">{value('Patrimônio nominal', moneyOrUnknown(projection?.nominalFinal))}{value('Patrimônio líquido', moneyOrUnknown(projection?.netFinal))}{value('Patrimônio real', moneyOrUnknown(projection?.realFinal))}{value('Ganho real sobre aportes corrigidos por suas datas', moneyOrUnknown(projection?.realGain))}{value('Diferença líquido menos real', moneyOrUnknown(projection?.inflationLoss))}</div></section>)}
      {results.length > 1 && <p>Custo de oportunidade estimado entre extremos: diferença líquida {moneyOrUnknown(results.at(-1)!.projection?.netFinal != null && results[0].projection?.netFinal != null ? results.at(-1)!.projection!.netFinal! - results[0].projection.netFinal : null)}. Compare também liquidez e risco; valor maior não indica adequação.</p>}
      {debt && <p>Diferença investimento menos dívida: {dec(debt.differencePoints)} p.p. {debt.debtCostsMore ? 'O custo efetivo informado da dívida supera o retorno líquido esperado informado.' : 'O retorno líquido esperado informado é igual ou superior ao custo informado da dívida; o retorno não é garantido.'}</p>}
      {currency && <p>Ativo: {percentOrUnknown(currency.assetReturn)} · câmbio: {percentOrUnknown(currency.exchangeReturn)} · interação composta: {percentOrUnknown(currency.interaction)} · retorno total em BRL: {percentOrUnknown(currency.totalBrl)}. Hipóteses informadas, sem consulta cambial automática.</p>}
    </section>}
  </details>;
}

export function PortfolioComparison({ data, economic }: { data: Data; economic: EconomicIndicators }) {
  const [selected, setSelected] = useState('');
  const rows = data.investments.filter((r) => !selected || r.id === selected);
  function result(row: Row) { try { return investmentProjection(row, economic.rates, economic.focus.ipca === undefined ? null : economic.focus.ipca / 100, investmentBalance(data, row)); } catch { return null; } }
  return <details className="disclosure"><summary>Comparar carteira · horizonte de 1 ano</summary>
    <label><span>Filtrar investimento</span><select value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Todos</option>{data.investments.map((r) => <option key={r.id} value={r.id}>{String(r.name)}</option>)}</select></label>
    <p className="inline-note">Novo lote de 365 dias, sem aportes nem cupons; valores brutos e IR estimados, taxas anuais informadas sobre o capital inicial. Não é resgate do lote atual. CDI e Selic são referências anuais atuais; IPCA Focus é hipótese repetida para o horizonte. Custos desconhecidos impedem o resultado líquido.</p>
    {rows.map((r) => { const x = result(r); return <details key={r.id} className="disclosure"><summary>{String(r.name)}</summary><div className="inline-stats">{value('Nominal', percentOrUnknown(x?.nominalRate))}{value('IR estimado', moneyOrUnknown(x?.incomeTax))}{value('Custos estimados', moneyOrUnknown(x?.fees))}{value('IOF no horizonte', moneyOrUnknown(x?.iof))}{value('Inflação da hipótese Focus', percentOrUnknown(economic.focus.ipca === undefined ? null : economic.focus.ipca / 100))}{value('Líquido', percentOrUnknown(x?.netRate))}{value('Real líquido', percentOrUnknown(x?.netRealRate))}{value('Líquido final', moneyOrUnknown(x?.netFinal))}{value('Real final', moneyOrUnknown(x?.realFinal))}{value('CDI anual equivalente', percentOrUnknown(economic.rates.cdi ? economic.rates.cdi.value / 100 : null))}{value('Selic efetiva anual', percentOrUnknown(economic.rates.selic ? economic.rates.selic.value / 100 : null))}{value('% CDI contratual informado', r.indexer === 'CDI' ? dec(num(r.indexerPercent)) + '%' : 'Não aplicável')}{value('Liquidez', String(r.liquidity || 'não informado'))}{value('FGC informado', String(r.fgcStatus || 'não informado'))}{value('Vencimento', brDate(r.maturity))}{value('Risco informado', String(r.riskNotes || 'não informado'))}{value('Taxa anual sobre capital', r.annualFeePercent == null ? 'Não informado' : dec(num(r.annualFeePercent)) + '%')}</div></details>; })}
  </details>;
}

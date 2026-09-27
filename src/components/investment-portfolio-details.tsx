import { useMemo, useState } from 'react';
import { type Data, today, money, dec, brDate } from '../model';
import { investmentPortfolio } from '../services/investment-portfolio';
import { passiveIncome, incomeYields } from '../services/passive-income';
import { investmentMaturities } from '../services/investment-maturities';
import { compareInvestmentBenchmark } from '../services/investment-benchmark';
import { type InflationMonth } from '../services/inflation-indicators';
import { addMonths } from '../calculations';
import {
  investmentPeriod,
  assetPeriodComparison,
} from '../services/investment-period';

const amount = (value: number | null) =>
  value === null ? 'Indisponível' : money(value / 100);
const percent = (value: number | null) =>
  value === null ? 'Indisponível' : `${dec(value * 100)}%`;
export function InvestmentPortfolioDetails({
  data,
  inflation,
  configure,
}: {
  data: Data;
  inflation: InflationMonth[];
  configure: () => void;
}) {
  const at = today();
  const portfolio = useMemo(() => investmentPortfolio(data, at), [data, at]);
  const income = useMemo(() => passiveIncome(data, at), [data, at]);
  const calendar = useMemo(() => investmentMaturities(data, at), [data, at]);
  const assetNames = useMemo(
    () => new Map(data.investments.map((row) => [row.id, String(row.name)])),
    [data.investments],
  );
  const [incomeVisible, setIncomeVisible] = useState(30),
    [eventsVisible, setEventsVisible] = useState(30);
  const [dimension, setDimension] = useState<
    | 'category'
    | 'indexer'
    | 'issuer'
    | 'institution'
    | 'currency'
    | 'liquidity'
    | 'reserve'
  >('category');
  const [period, setPeriod] = useState('Desde início');
  const first = data.investments.map((r) => String(r.date)).sort()[0] || at;
  const [customStart, setCustomStart] = useState(first),
    [customEnd, setCustomEnd] = useState(at);
  const start =
    period === 'Mês'
      ? at.slice(0, 7) + '-01'
      : period === 'Ano'
        ? at.slice(0, 4) + '-01-01'
        : period === '12 meses'
          ? addMonths(at, -12)
          : period === 'Personalizado'
            ? customStart
            : first;
  const end = period === 'Personalizado' ? customEnd : at;
  const datesValid = Boolean(start && end && start <= end && end <= at);
  const result = useMemo(
    () => (datesValid ? investmentPeriod(data, start, end) : null),
    [data, start, end, datesValid],
  );
  const benchmark = datesValid
    ? compareInvestmentBenchmark({
        name: String(data.settings.portfolioBenchmark),
        annualPercent:
          typeof data.settings.portfolioBenchmarkRate === 'number'
            ? data.settings.portfolioBenchmarkRate
            : null,
        start,
        end,
        portfolioReturn: result?.returnRate ?? null,
        inflation,
      })
    : null;
  const [visible, setVisible] = useState(30);
  return (
    <>
      <details className="disclosure">
        <summary>Posição, preço médio e resultado</summary>
        <p className="inline-note">
          Saldo inicial, compras e vendas compõem a posição. Avaliações manuais
          são datadas; cotações consultadas não reescrevem o histórico. Custos
          desconhecidos tornam o resultado líquido parcial.
        </p>
        {portfolio.positions.slice(0, visible).map((p) => {
          const comparison = datesValid
            ? assetPeriodComparison(data, p.asset, start, end, inflation)
            : null;
          const yields = incomeYields(
            income.byAsset.get(p.asset.id) || 0,
            p.basisCents,
            p.valueCents,
          );
          return (
            <details className="disclosure" key={p.asset.id}>
              <summary>
                {String(p.asset.name)} · {amount(p.valueCents)}
              </summary>
              <dl className="inline-stats">
                {Object.entries({
                  Quantidade:
                    p.quantity === null ? 'Não informada' : dec(p.quantity, 8),
                  'Custo da posição': amount(p.basisCents),
                  'Preço médio':
                    p.averagePrice === null
                      ? 'Indisponível'
                      : money(p.averagePrice),
                  'Aportes e saldo inicial': amount(p.contributionsCents),
                  'Retiradas / vendas': amount(p.withdrawalsCents),
                  'Renda recebida': amount(p.incomeCents),
                  'Resultado nominal': amount(p.grossResultCents),
                  [p.netComplete
                    ? 'Resultado líquido'
                    : 'Resultado líquido parcial']: amount(p.netResultCents),
                  'Retorno simples sobre capital líquido': percent(
                    p.simpleNetCapitalReturn,
                  ),
                  'Yield on Cost (renda 12m / custo da posição)': percent(
                    yields.yieldOnCost,
                  ),
                  'Current Yield (renda 12m / valor atual)': percent(
                    yields.currentYield,
                  ),
                  Reserva: p.reserve ? 'Sim' : 'Não',
                  Liquidez: p.liquidity,
                  'Retorno real no período selecionado': percent(
                    comparison?.portfolioReal ?? null,
                  ),
                  Avaliação: `${p.valuation} · ${brDate(p.valuationDate)}`,
                }).map(([label, value]) => (
                  <div className="detail" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="inline-note">
                O retorno simples não considera o tempo de cada aporte e não
                equivale a uma taxa anual.
              </p>
              {comparison && (
                <p className="inline-note">
                  Benchmark do ativo: {String(p.asset.benchmark)} ·{' '}
                  {brDate(start)} a {brDate(end)} ·{' '}
                  {comparison.projected ? 'Projetado' : 'Observado'}:{' '}
                  {percent(comparison.benchmarkReturn)} · Diferença:{' '}
                  {comparison.differencePp === null
                    ? 'Indisponível'
                    : `${dec(comparison.differencePp)} p.p.`}
                </p>
              )}
            </details>
          );
        })}
        {visible < portfolio.positions.length && (
          <button onClick={() => setVisible((n) => n + 30)}>
            Mostrar mais posições
          </button>
        )}
      </details>
      <details className="disclosure">
        <summary>Rentabilidade e benchmark</summary>
        <div className="form-grid">
          <label>
            <span>Período de comparação</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {['Mês', 'Ano', '12 meses', 'Desde início', 'Personalizado'].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </label>
          {period === 'Personalizado' && (
            <>
              <label>
                <span>Início</span>
                <input
                  type="date"
                  value={customStart}
                  max={customEnd}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </label>
              <label>
                <span>Fim</span>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  max={at}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </label>
            </>
          )}
        </div>
        <p>
          Benchmark da carteira:{' '}
          {String(data.settings.portfolioBenchmark || 'Nenhum')}. Configure a
          referência no cadastro de configurações.
        </p>
        <button onClick={configure}>Configurar benchmark da carteira</button>
        <p>
          {datesValid
            ? `${brDate(start)} a ${brDate(end)}`
            : 'Selecione um período válido.'}{' '}
          · {benchmark?.projected ? 'Projetado' : 'Observado'}:{' '}
          {percent(benchmark?.benchmarkReturn ?? null)}
        </p>
        <p>
          Resultado nominal: {amount(result?.nominalCents ?? null)} · Líquido{' '}
          {result?.netComplete ? '' : 'parcial'}:{' '}
          {amount(result?.netCents ?? null)}
        </p>
        <p>
          Retorno registrado: {percent(result?.returnRate ?? null)} · Retorno
          real: {percent(benchmark?.portfolioReal ?? null)} · Diferença:{' '}
          {benchmark?.differencePp == null
            ? 'Indisponível'
            : `${dec(benchmark.differencePp)} p.p.`}
        </p>
        <p className="inline-note">
          Base: snapshots existentes ou saldos registrados nas datas. Com
          aportes ou retiradas no período, a taxa permanece indisponível sem
          avaliações intermediárias. CDI e Selic atuais não substituem o retorno
          realizado do período. IPCA exige meses completos. Benchmarks
          personalizados são projeções.
        </p>
        {data.netWorthSnapshots.length > 0 && (
          <>
            <h3>Últimas posições registradas</h3>
            {[...data.netWorthSnapshots]
              .sort((a, b) => String(b.date).localeCompare(String(a.date)))
              .slice(0, 12)
              .map((row) => (
                <div className="detail" key={row.id}>
                  <span>
                    {brDate(row.date)}
                    {row.partial ? ' · Parcial' : ''}
                  </span>
                  <strong>{amount(Number(row.investmentsCents))}</strong>
                </div>
              ))}
            <p className="inline-note">
              Snapshots existentes; sem recalcular o passado com a cotação
              atual.
            </p>
          </>
        )}
      </details>
      <details className="disclosure">
        <summary>Renda passiva recebida</summary>
        <div className="inline-stats">
          {Object.entries({
            'Este mês': income.thisMonthCents,
            'Últimos 12 meses': income.totalCents,
            'Média mensal em 12 meses': income.average12Cents,
            'Maior mês': income.bestMonth.amountCents,
          }).map(([label, value]) => (
            <div className="detail" key={label}>
              <span>{label}</span>
              <strong>{amount(value)}</strong>
            </div>
          ))}
        </div>
        <p className="inline-note">
          Somente recebimentos registrados em caixa, após custos explícitos.
          Valorização e rendimentos reinvestidos não são renda recebida. Meses
          sem recebimento entram na média.
        </p>
        {income.months.map((row) => (
          <div className="detail" key={row.month}>
            <span>{row.month}</span>
            <strong>{amount(row.amountCents)}</strong>
          </div>
        ))}
        <h3>Por ativo · últimos 12 meses</h3>
        {[...income.byAsset].slice(0, incomeVisible).map(([id, value]) => (
          <div className="detail" key={id}>
            <span>{assetNames.get(id) || 'Investimento não identificado'}</span>
            <strong>{amount(value)}</strong>
          </div>
        ))}
        {incomeVisible < income.byAsset.size && (
          <button onClick={() => setIncomeVisible((n) => n + 30)}>
            Mostrar mais rendimentos por ativo
          </button>
        )}
        <h3>Por classe · últimos 12 meses</h3>
        {[...income.byClass].map(([label, value]) => (
          <div className="detail" key={label}>
            <span>{label}</span>
            <strong>{amount(value)}</strong>
          </div>
        ))}
      </details>
      <details className="disclosure">
        <summary>Calendário de investimentos</summary>
        <p>
          {calendar.days30.length} eventos em 30 dias · {calendar.days90.length}{' '}
          em 90 dias · {calendar.months6.length} em 6 meses ·{' '}
          {calendar.months12.length} em 12 meses.
        </p>
        {!calendar.events.length && (
          <p>
            Nenhuma data cadastrada. Informe vencimento, carência ou evento
            programado no investimento.
          </p>
        )}
        {calendar.events.slice(0, eventsVisible).map((event) => (
          <div className="detail" key={event.id}>
            <span>
              {event.name} · {event.label}
            </span>
            <strong>{brDate(event.date)}</strong>
            <small>
              {event.days < 0
                ? 'Data passada — confira o registro'
                : `Em ${event.days} dias`}
            </small>
          </div>
        ))}
        {eventsVisible < calendar.events.length && (
          <button onClick={() => setEventsVisible((n) => n + 30)}>
            Mostrar mais eventos
          </button>
        )}
      </details>
      <details className="disclosure">
        <summary>Distribuição e concentração</summary>
        <label>
          <span>Agrupar carteira por</span>
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value as typeof dimension)}
          >
            {Object.entries({
              category: 'Classe',
              indexer: 'Indexador',
              issuer: 'Emissor',
              institution: 'Instituição',
              currency: 'Moeda',
              liquidity: 'Liquidez',
              reserve: 'Reserva',
            }).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {portfolio.distribution(dimension).map((group) => (
          <div className="detail" key={group.label}>
            <span>{group.label}</span>
            <strong>
              {amount(group.valueCents)} · {percent(group.share)}
            </strong>
          </div>
        ))}
        <p className="inline-note">
          Participação sobre os valores conhecidos. Dados ausentes não são
          inferidos. A composição descreve a carteira e não recomenda
          rebalanceamento.
        </p>
      </details>
    </>
  );
}

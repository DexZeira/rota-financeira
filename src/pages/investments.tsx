import { PurchasingPowerTools, PortfolioComparison } from '../components/purchasing-power-tools';
import { PageHeader, HeroMetric, FinancialItem, EmptyState } from '../components/finance-ui';
import { Card, Metrics, Bar, Records } from '../components/common';
import { num, money, dec } from '../model';
import { financial, investmentBalance, sum, progress } from '../calculations';
import { type ViewProps, value, dateCol, amountCol } from './shared';
import { annualizePercentOfCdi } from '../services/market-rates';
import { useEconomicIndicators } from '../hooks/use-economic-indicators';
import { EconomicIndicatorsPanel } from '../components/economic-indicators';
import { InvestmentIntelligence, Diversification } from '../components/investment-intelligence';
import { loadQuote, type Quote } from '../services/market-quotes';
import { estimateSavingsYield, normalizeAnniversaryDay, reconstructSavingsMinimumBalance, savingsPeriod } from '../services/savings-yield';
import { useEffect, useState } from 'react';
export function Investments(p: ViewProps) {
  const d = p.data;
  const economic = useEconomicIndicators();
  const { rates } = economic;
  const [simValue, setSimValue] = useState(5000), [simMonths, setSimMonths] = useState(12), [simRate, setSimRate] = useState(10), [simType, setSimType] = useState('Prefixado');
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  useEffect(() => { let active = true; void Promise.all(d.investments.filter((r) => ['Ação', 'ETF', 'FII', 'Criptomoeda'].includes(String(r.category))).map(async (r) => { const crypto = String(r.category) === 'Criptomoeda'; const symbol = crypto ? String(r.coinGeckoId || '') : String(r.ticker || ''); if (!symbol) return; const quote = await loadQuote(symbol, crypto ? 'crypto' : 'b3'); if (quote && active) setQuotes((old) => ({ ...old, [r.id]: quote })); })); return () => { active = false; }; }, [d.investments]);
  const f = financial(d),
    emergency = d.investments
      .filter((r) => r.category === 'reserva de emergência')
      .reduce((s, r) => s + investmentBalance(d, r), 0),
    target = num(d.settings.essential) * num(d.settings.emergencyMonths),
    savings = d.investments.filter((r) => String(r.category) === 'Poupança'),
    savingsMonthlyRate = rates.tr && rates.selicTarget ? estimateSavingsYield({ balance: simValue, anniversaryDay: 1, trPercent: rates.tr.rawValue, targetSelicAnnualPercent: rates.selicTarget.value }).totalRatePercent : undefined;
  return (
    <>
      <PageHeader title="Investimentos" description="Construa o seu próximo capítulo." />
      <HeroMetric label="Patrimônio registrado" value={money(f.investments)} context={money(f.contributions) + ' em aportes registrados'} action={<button className="primary" onClick={() => p.edit('investments')}>+ Novo investimento</button>} />
      <details className="disclosure"><summary>Resultado e movimentações da carteira</summary>
      <Metrics
        items={[
          ['Total investido', money(f.investments)],
          ['Aportes', money(f.contributions)],
          [
            'Rendimentos registrados',
            money(
              sum(
                d.movements.filter((r) => r.kind === 'rendimento'),
                'amount',
              ) -
                sum(
                  d.movements.filter((r) => r.kind === 'perda'),
                  'amount',
                ),
            ),
          ],
          ['Aporte planejado mensal', money(num(d.settings.reserveMonth))],
          ['Retiradas', money(f.withdrawals)],
          ['Disponível após reserva da moto', money(f.available)],
        ]}
      />
      </details><EconomicIndicatorsPanel economic={economic} />
      <section className="content-section"><div className="section-heading"><h2>Sua carteira</h2><button onClick={() => p.edit('movements')}>Registrar movimentação</button></div>
      {!d.investments.length && <EmptyState title="Seu patrimônio começa aqui" description="Adicione um investimento para acompanhar seu saldo e suas movimentações." action={<button onClick={() => p.edit('investments')}>Adicionar investimento</button>} />}
      {['Renda fixa', 'Renda variável', 'Cripto', 'Outros'].map((group) => {
        const groupRows = d.investments.filter((r) => {
          const type = String(r.category);
          const bucket = type === 'Criptomoeda' ? 'Cripto' : ['Ação','ETF','FII'].includes(type) ? 'Renda variável' : ['CDB','LCI','LCA','Poupança','Conta remunerada','reserva de emergência'].includes(type) || type.startsWith('Tesouro') ? 'Renda fixa' : 'Outros';
          return bucket === group;
        });
        return groupRows.length > 0 && <section className="portfolio-group" key={group}><h2>{group}</h2>{groupRows.map((r) => <FinancialItem key={r.id} title={String(r.name)} description={String(r.indexer) === 'CDI' ? dec(num(r.indexerPercent)) + '% CDI' : String(r.ticker || r.category)} value={money(quotes[r.id] ? Number(r.quantity || 0) * quotes[r.id].price : investmentBalance(d, r))} context={quotes[r.id] ? 'Valor pela cotação disponível' : 'Saldo registrado'} action={<button aria-label={'Editar ' + r.name} onClick={() => p.edit('investments', r)}>Editar</button>}><InvestmentIntelligence data={d} row={r} economic={economic}/></FinancialItem>)}</section>;
      })}</section>
      <Diversification data={d}/><PortfolioComparison data={d} economic={economic}/><PurchasingPowerTools economic={economic}/><details className="disclosure"><summary>Poupança · rendimento e aniversário</summary>{savings.map((r) => { const day = num(r.anniversaryDay) || (r.date ? normalizeAnniversaryDay(Number(String(r.date).slice(-2))) : 0); const period = day ? savingsPeriod(day) : undefined; const linked = d.movements.filter((m) => m.investmentId === r.id); const startBalance = period ? linked.filter((m) => String(m.date) < period.start).reduce((balance, m) => balance + num(m.amount) * (['retirada', 'perda'].includes(String(m.kind)) ? -1 : 1), String(r.date) <= period.start ? num(r.balance) : 0) : undefined; const minimum = period && startBalance !== undefined && period.complete ? reconstructSavingsMinimumBalance(startBalance, linked.map((m) => ({ id: m.id, date: String(m.date), amount: num(m.amount), kind: String(m.kind) })), period.start, period.end) : undefined; const result = day && rates.tr && rates.selicTarget ? estimateSavingsYield({ balance: investmentBalance(d, r), anniversaryDay: day, trPercent: rates.tr.rawValue, targetSelicAnnualPercent: rates.selicTarget.value, actualMinimumBalance: minimum, periodComplete: period?.complete }) : undefined; return <Card key={r.id} title="Poupança"><div className="inline-stats"><div className="detail"><span>Regra atual</span><strong>{rates.selicTarget && rates.selicTarget.value > 8.5 ? 'TR + 0,5% a.m.' : 'TR + 70% da Meta Selic'}</strong></div><div className="detail"><span>Meta Selic atual</span><strong>{rates.selicTarget ? `${dec(rates.selicTarget.value)}% a.a.` : 'Indisponível'}</strong></div><div className="detail"><span>TR</span><strong>{rates.tr ? `${dec(rates.tr.rawValue, 4)}% a.m.` : 'Indisponível'}</strong></div><div className="detail"><span>Período do aniversário</span><strong>{period ? `${period.start} a ${period.end}` : 'Complete os dados'}</strong></div>{result?.minimumBalance !== undefined && <div className="detail"><span>Menor saldo do período</span><strong>{money(result.minimumBalance)}</strong><small>{result.status === 'actual' ? 'Atual' : 'Estimado'}</small></div>}</div>{result?.estimatedYieldCents !== undefined ? <p className="inline-note">Rendimento no aniversário: <strong>{money(result.estimatedYieldCents / 100)}</strong> · {result.status === 'actual' ? 'calculado pelo menor saldo realizado.' : 'estimativa baseada nos indicadores atuais.'}</p> : <p className="inline-note">Complete os dados para ativar o cálculo automático da poupança.</p>}</Card>; })}
      </details><details className="disclosure"><summary>Simular rendimento</summary><Card title="Quanto pode render?">
        <div className="form-grid compact-form">
          <label><span>Tipo</span><select value={simType} onChange={(e) => setSimType(e.target.value)}><option>Prefixado</option><option>Poupança</option></select></label><label><span>Valor (R$)</span><input type="number" min="0" value={simValue} onChange={(e) => setSimValue(Number(e.target.value) || 0)} /></label>
          <label><span>Prazo (meses)</span><input type="number" min="1" value={simMonths} onChange={(e) => setSimMonths(Number(e.target.value) || 1)} /></label>
          <label><span>Rentabilidade anual (%)</span><input type="number" min="0" step="0.01" value={simRate} onChange={(e) => setSimRate(Number(e.target.value) || 0)} /></label>
        </div>
        <div className="four-stats"><div className="detail"><span>Valor bruto estimado</span><strong>{money(simType === 'Poupança' && savingsMonthlyRate !== undefined ? simValue * Math.pow(1 + savingsMonthlyRate / 100, simMonths) : simValue * Math.pow(1 + simRate / 100, simMonths / 12))}</strong></div></div>
        <p className="inline-note">Simulação nominal, sem impostos ou taxas. Não altera seus investimentos. Para Poupança, é uma estimativa baseada nos indicadores atuais.</p>
      </Card>
      </details><details className="disclosure"><summary>Reserva de emergência</summary><Card
        title="Reserva de emergência"
        action={
          <button onClick={() => p.edit('settings', d.settings)}>
            Configurar meta
          </button>
        }
      >
        <div className="four-stats">
          {value('Valor atual', money(emergency))}
          {value('Meta', money(target))}
          {value('Restante', money(Math.max(0, target - emergency)))}
          {value('Concluído', dec(progress(emergency, target)) + '%')}
          {value(
            'Meses cobertos',
            num(d.settings.essential) > 0
              ? dec(emergency / num(d.settings.essential), 1)
              : 'Defina o custo essencial',
          )}
        </div>
        <Bar
          value={progress(emergency, target)}
          label="Reserva de emergência"
        />
        <p className="inline-note">
          Meta = custo essencial mensal × meses desejados. A rentabilidade
          cadastrada é informativa; registre os rendimentos efetivos nas
          movimentações.
        </p>
      </Card>
      </details><details className="disclosure"><summary>Todos os dados da carteira</summary><Records
        {...p}
        kind="investments"
        rows={d.investments}
        filterKey="category"
        sortKey="name"
        columns={[
          { label: 'Nome', render: (r) => String(r.name) },
          { label: 'Categoria', render: (r) => String(r.category) },
          {
            label: 'Saldo atual',
            render: (r) => money(quotes[r.id] ? Number(r.quantity || 0) * quotes[r.id].price : investmentBalance(d, r)),
          },
          {
            label: 'Rentabilidade informada',
            render: (r) => String(r.indexer) === 'CDI' && rates.cdi && annualizePercentOfCdi(rates.cdi.rawValue, num(r.indexerPercent)) !== undefined
              ? `${dec(num(r.indexerPercent))}% CDI · ≈ ${dec(annualizePercentOfCdi(rates.cdi.rawValue, num(r.indexerPercent)) || 0)}% a.a. hoje`
              : dec(num(r.yield)) + '% a.a.',
          },
          { label: 'Objetivo', render: (r) => String(r.objective) },
        ]}
      />
      </details><details className="disclosure"><summary>Histórico de movimentações</summary><Records
        {...p}
        kind="movements"
        rows={d.movements}
        filterKey="kind"
        columns={[
          dateCol,
          {
            label: 'Investimento',
            render: (r) =>
              String(
                d.investments.find((x) => x.id === r.investmentId)?.name || '',
              ),
          },
          { label: 'Tipo', render: (r) => String(r.kind) },
          amountCol,
        ]}
      />
    </details></>
  );
}

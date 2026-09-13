import { Card, Metrics, Bar, Records } from '../components/common';
import { num, money, dec } from '../model';
import { financial, investmentBalance, sum, progress } from '../calculations';
import { type ViewProps, value, dateCol, amountCol } from './shared';
import { loadMarketRates, type MarketRates } from '../services/market-rates';
import { loadQuote, type Quote } from '../services/market-quotes';
import { loadMarketExpectations, type MarketExpectations } from '../services/market-expectations';
import { useEffect, useState } from 'react';
export function Investments(p: ViewProps) {
  const d = p.data;
  const [rates, setRates] = useState<MarketRates>({});
  const [simValue, setSimValue] = useState(5000), [simMonths, setSimMonths] = useState(12), [simRate, setSimRate] = useState(10);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [focus, setFocus] = useState<MarketExpectations>({ source: 'Relatório Focus · Banco Central' });
  useEffect(() => { let active = true; void loadMarketRates().then((next) => { if (active) setRates(next); }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; void loadMarketExpectations().then((next) => { if (active) setFocus(next); }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; void Promise.all(d.investments.filter((r) => ['Ação', 'ETF', 'FII', 'Criptomoeda'].includes(String(r.category))).map(async (r) => { const crypto = String(r.category) === 'Criptomoeda'; const symbol = crypto ? String(r.coinGeckoId || '') : String(r.ticker || ''); if (!symbol) return; const quote = await loadQuote(symbol, crypto ? 'crypto' : 'b3'); if (quote && active) setQuotes((old) => ({ ...old, [r.id]: quote })); })); return () => { active = false; }; }, [d.investments]);
  const f = financial(d),
    emergency = d.investments
      .filter((r) => r.category === 'reserva de emergência')
      .reduce((s, r) => s + investmentBalance(d, r), 0),
    target = num(d.settings.essential) * num(d.settings.emergencyMonths);
  return (
    <>
      <header className="work-page-header"><div><p className="eyebrow">PATRIMÔNIO</p><h1>Investimentos</h1><p className="page-subtitle">Acompanhe patrimônio, aportes e rendimentos.</p></div></header>
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
      <Card title="Indicadores de mercado">
        <div className="inline-stats">
          {([['CDI', rates.cdi], ['Selic', rates.selic], ['IPCA 12 meses', rates.ipca]] as const).map(([label, rate]) => (
            <div className="detail" key={label}><span>{label}</span><strong>{rate ? `${dec(rate.value)}%${label === 'IPCA 12 meses' ? '' : ' a.a.'}` : 'Indisponível'}</strong>{rate && <small>Atualizado em {new Date(rate.date + 'T12:00:00').toLocaleDateString('pt-BR')}</small>}</div>
          ))}
        </div>
        <p className="inline-note">Taxas de referência para estimativas. A taxa contratada de cada investimento permanece inalterada.</p>
      </Card>
      <Card title="Expectativa Focus"><div className="inline-stats"><div className="detail"><span>Selic esperada</span><strong>{focus.selic ? `${dec(focus.selic)}%` : 'Indisponível'}</strong></div><div className="detail"><span>IPCA esperado</span><strong>{focus.ipca ? `${dec(focus.ipca)}%` : 'Indisponível'}</strong></div></div><p className="inline-note">Fonte: Relatório Focus / Banco Central · expectativa de mercado, sem uso nos cálculos históricos.</p></Card>
      <Card title="Quanto pode render?">
        <div className="form-grid compact-form">
          <label><span>Valor (R$)</span><input type="number" min="0" value={simValue} onChange={(e) => setSimValue(Number(e.target.value) || 0)} /></label>
          <label><span>Prazo (meses)</span><input type="number" min="1" value={simMonths} onChange={(e) => setSimMonths(Number(e.target.value) || 1)} /></label>
          <label><span>Rentabilidade anual (%)</span><input type="number" min="0" step="0.01" value={simRate} onChange={(e) => setSimRate(Number(e.target.value) || 0)} /></label>
        </div>
        <div className="four-stats"><div className="detail"><span>Valor bruto estimado</span><strong>{money(simValue * Math.pow(1 + simRate / 100, simMonths / 12))}</strong></div><div className="detail"><span>Rendimento estimado</span><strong>{money(simValue * (Math.pow(1 + simRate / 100, simMonths / 12) - 1))}</strong></div></div>
        <p className="inline-note">Simulação nominal, sem impostos ou taxas. Não altera seus investimentos.</p>
      </Card>
      <Card
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
      <Records
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
            render: (r) => dec(num(r.yield)) + '% a.a.',
          },
          { label: 'Objetivo', render: (r) => String(r.objective) },
        ]}
      />
      <Records
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
    </>
  );
}

import { PageHeader } from '../components/finance-ui';
import { Chart } from "../components/simple-chart";
import { TrendChart, MonthlySimulator } from '../components/overview';
import { useState } from 'react';
import { Card, NoData, Choice, Fields } from '../components/common';
import { type Row, num, money, dec, brDate, today } from '../model';
import { costs, financial, prioritized, investmentBalance, workResult, sum, simulate } from '../calculations';
import { type ViewProps, value } from './shared';
export function Analysis(p: ViewProps) {
  const d = p.data,
    [filter, setFilter] = useState('30 dias'),
    at = today(),
    start =
      filter === 'mês'
        ? at.slice(0, 7) + '-01'
        : filter === 'ano'
          ? at.slice(0, 4) + '-01-01'
          : new Date(
              Date.parse(at + 'T12:00:00Z') -
                (filter === '7 dias' ? 6 : 29) * 86400000,
            )
              .toISOString()
              .slice(0, 10);
  const inPeriod = (r: Row) => String(r.date) >= start && String(r.date) <= at,
    work = d.work.filter(inPeriod),
    c = costs(d),
    f = financial(d),
    [s, setS] = useState<Row>({
      id: 'sim',
      revenue: 0,
      hours: 0,
      km: 0,
      gas: num(d.bike.fuelPrice),
      expenses: 0,
      extra: 0,
      contribution: 0,
    }),
    sim = simulate(d, s);
  const buckets = [
    ...new Set(
      [
        ...work,
        ...d.expenses.filter(inPeriod),
        ...d.services.filter(inPeriod),
      ].map((r) =>
        filter === 'ano' ? String(r.date).slice(0, 7) : String(r.date),
      ),
    ),
  ].sort();
  const series = (metric: string) =>
    buckets.map((b) => {
      const w = work.filter((r) => String(r.date).startsWith(b));
      return {
        label: filter === 'ano' ? b.slice(5) : brDate(b).slice(0, 5),
        value:
          metric === 'Faturamento'
            ? sum(w, 'revenue')
            : metric === 'Lucro'
              ? sum(w, 'revenue') - sum(w, 'km') * c.economic
              : sum(
                  [...d.expenses, ...d.services].filter(
                    (r) => inPeriod(r) && String(r.date).startsWith(b),
                  ),
                  'amount',
                ),
      };
    });
  const activities = [...new Set(work.map((r) => String(r.activity)))];
  return (
    <>
      <PageHeader title="Seu dinheiro em perspectiva" description="Perguntas simples. Decisões mais claras." />
      <div className="section-heading">
        <p>
          Período: {brDate(start)} a {brDate(at)}
        </p>
        <Choice
          label="Período das análises"
          value={filter}
          onChange={setFilter}
          options={['7 dias', '30 dias', 'mês', 'ano']}
        />
      </div>
      <div className="analysis-questions">
        {([['Lucro', 'Seu lucro está melhorando?'], ['Gastos', 'Como seus gastos evoluem?'], ['Faturamento', 'Como seu faturamento evoluiu?']] as const).map(([m, question]) => (
          <section className="analysis-question" key={m}><div className="section-heading"><div><p className="eyebrow">{m === 'Lucro' ? '01 · RESULTADO ESTIMADO' : m === 'Gastos' ? '02 · DESPESAS' : '03 · RECEITAS'}</p><h2>{question}</h2></div></div><Chart title={m === 'Lucro' ? 'Lucro estimado (R$)' : `${m} (R$)`} items={series(m)} />{!series(m).length && <p className="empty-state">Ainda não há dados suficientes para esta análise.</p>}</section>
        ))}
      </div>
      <details className="disclosure"><summary>Seu patrimônio e os custos de hoje</summary><div className="two-grid">
        <Chart
          title="Composição atual do custo / km (R$)"
          items={[
            { label: 'Combustível', value: c.fuel },
            ...c.components.map((r) => ({
              label: String(r.name),
              value: r.perKm,
            })),
            { label: 'Depreciação', value: c.depKm },
          ]}
        />
        <Chart
          title="Dívidas atuais (R$)"
          items={prioritized(d).map((r) => ({
            label: String(r.name),
            value: r.balance,
          }))}
        />
        <Chart
          title="Investimentos atuais (R$)"
          items={d.investments.map((r) => ({
            label: String(r.name),
            value: investmentBalance(d, r),
          }))}
        />
        <Chart
          title="Patrimônio atual (R$)"
          items={[
            { label: 'Dinheiro', value: f.cash },
            { label: 'Investimentos', value: f.investments },
            { label: 'Moto', value: num(d.bike.currentValue) },
            { label: 'Dívidas', value: -f.debt },
            { label: 'Líquido', value: f.netWorth },
          ]}
        />
      </div>
      <p className="inline-note">
        O filtro altera os fluxos e a comparação de atividades. Custo/km,
        dívidas, investimentos e patrimônio mostram a posição atual; não há
        cotações históricas. Lucros estimados usam os custos atuais.
      </p>
      </details><Card title="Qual trabalho rende mais?">
        <div className="comparison">
          {activities.length ? (
            activities.map((a) => {
              const w = work.filter((r) => r.activity === a),
                r = workResult(
                  sum(w, 'revenue'),
                  sum(w, 'km'),
                  sum(w, 'hours'),
                  c.economic,
                );
              return (
                <div className="activity-card" key={a}>
                  <h3>{a}</h3>
                  {value('Faturamento', money(r.revenue))}
                  {value('KM', dec(r.km))}
                  {value('Horas', dec(r.hours))}
                  {value('Custo', money(r.cost))}
                  {value('Lucro', money(r.profit))}
                  {value('Lucro/h', money(r.profitHour))}
                  {value('Lucro/km', money(r.profitKm))}
                </div>
              );
            })
          ) : (
            <NoData />
          )}
        </div>
      </Card>
      <details className="disclosure"><summary>Simular próximos cenários</summary><MonthlySimulator data={d}/><Card
        title="Simulador “E se?”"
        action={<span className="badge">PROJETADO · 1 MÊS</span>}
      >
        <Fields
          data={d}
          value={s}
          setValue={setS}
          fields={[
            {
              key: 'revenue',
              label: 'Faturamento diário (R$)',
              type: 'number',
            },
            { key: 'hours', label: 'Horas por dia', type: 'number' },
            { key: 'km', label: 'KM por dia', type: 'number' },
            { key: 'gas', label: 'Gasolina (R$/L)', type: 'number' },
            { key: 'expenses', label: 'Gastos mensais (R$)', type: 'number' },
            {
              key: 'extra',
              label: 'Pagamento extra mensal (R$)',
              type: 'number',
            },
            {
              key: 'contribution',
              label: 'Aporte mensal para planos (R$)',
              type: 'number',
            },
          ]}
        />
        <p className="inline-note">
          Simulação com {d.settings.workDays} dias de trabalho por mês. Não
          modifica os registros. Dívidas não incluem juros futuros; aportes e
          pagamentos transferem patrimônio, sem gerar lucro.
        </p>
        <div className="six-stats">
          {value('Lucro diário', money(sim.profit))}
          {value('Sobra mensal', money(sim.free))}
          {value('Dívida após extra', money(sim.debt))}
          {value('Meta diária', money(sim.target))}
          {value('Aporte para planos', money(sim.plans))}
          {value('Patrimônio projetado', money(sim.netWorth))}
        </div>
      </Card>
    </details><details className="disclosure"><summary>Evolução dos últimos meses</summary><TrendChart data={d}/></details></>
  );
}

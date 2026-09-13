import { Chart } from "../components/simple-chart";
import { dateRange, monthComparison } from '../insights';
import { useState } from 'react';
import { Card, Metrics, Records, Choice } from '../components/common';
import { money, dec, today } from '../model';
import { financial, targets, sum, ratio, daysBetween } from '../calculations';
import { type ViewProps, dateCol, amountCol } from './shared';
export function Expenses(p: ViewProps) {
  const d = p.data;
  const [from, setFrom] = useState(today().slice(0, 7) + '-01'),
    [to, setTo] = useState(today()),
    [kind, setKind] = useState('todas');
  const rows = d.expenses.filter(
    (r) =>
      String(r.date) >= from &&
      String(r.date) <= to &&
      (kind === 'todas' || r.recurrence === kind),
  );
  const categories = [...new Set(rows.map((r) => String(r.category)))]
    .map((name) => ({
      label: name,
      value: sum(
        rows.filter((r) => r.category === name),
        'amount',
      ),
    }))
    .sort((a, b) => b.value - a.value);
  const total = sum(rows, 'amount'),
    comparison = monthComparison(d);

  return (
    <>
      <header className="work-page-header"><div><p className="eyebrow">MOVIMENTAÇÕES</p><h1>Gastos</h1><p className="page-subtitle">Entenda para onde seu dinheiro está indo.</p></div></header>
      <Card title="Gastos no período">
        <div className="period-tabs">
          {['Hoje', '7 dias', '30 dias', 'Este mês'].map((period) => (
            <button
              key={period}
              onClick={() => {
                const r = dateRange(period);
                setFrom(r.from);
                setTo(r.to);
              }}
            >
              {period}
            </button>
          ))}
        </div>
        <div className="list-tools">
          <label>
            De
            <input
              aria-label="Gastos de"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              aria-label="Gastos até"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Choice
            label="Recorrência de gastos"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'todas', label: 'Todas' },
              { value: 'única', label: 'Pontual' },
              { value: 'mensal', label: 'Mensal' },
              { value: 'anual', label: 'Anual' },
            ]}
          />
        </div>
        <Metrics
          items={[
            ['Total filtrado', money(total)],
            ['Maior categoria', categories[0]?.label || 'Sem gastos'],
            [
              'Média diária',
              money(ratio(total, Math.max(1, daysBetween(from, to) + 1))),
            ],
            [
              'Variação mensal até hoje',
              comparison.expenseChange === null
                ? 'Sem base'
                : dec(comparison.expenseChange, 1) + '%',
            ],
          ]}
        />
      </Card>
      <Chart title="Categorias no período" items={categories} />
      <Metrics
        items={[
          ['Gastos registrados', money(sum(d.expenses, 'amount'))],
          ['Serviços da moto', money(sum(d.services, 'amount'))],
          ['Total real', money(financial(d).spent)],
          ['Orçamento mensal', money(targets(d).mandatory)],
        ]}
      />
      <p className="notice">
        Recorrências compõem o orçamento, mas não criam despesas
        automaticamente. Cadastre cada pagamento realizado. Serviços registrados
        em Manutenção já entram nos totais.
      </p>
      <Records
        {...p}
        kind="expenses"
        rows={rows}
        filterKey="category"
        columns={[
          dateCol,
          { label: 'Nome', render: (r) => String(r.name) },
          { label: 'Categoria', render: (r) => String(r.category) },
          amountCol,
          { label: 'Recorrência', render: (r) => String(r.recurrence) },
          {
            label: 'Uso / atribuição',
            render: (r) =>
              `${r.scope} · ${r.scope === 'pessoal' ? 'sem atribuição' : r.allocation}`,
          },
        ]}
      />
    </>
  );
}

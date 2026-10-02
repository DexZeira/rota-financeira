import { openDatePicker } from '../components/native-input';
import { PageHeader, FinancialItem, EmptyState } from '../components/finance-ui';
import { dateRange, monthComparison } from '../insights';
import { useState } from 'react';
import { Metrics, Records, Choice, Bar } from '../components/common';
import { money, dec, today, num, brDate } from '../model';
import { financial, targets, sum, ratio, daysBetween } from '../calculations';
import { type ViewProps, dateCol, amountCol } from './shared';
import { Sheet } from '../components/sheet';
import { PersonalExpenses } from '../components/personal-expenses';
import { BudgetSection } from '../components/planning-phase-two';
import { PrivateValue } from '../components/value-privacy';
import './expenses.css';
export function Expenses(p: ViewProps) {
  const d = p.data;
  const [from, setFrom] = useState(today().slice(0, 7) + '-01'),
    [to, setTo] = useState(today()),
    [kind, setKind] = useState('todas'), [filtersOpen, setFiltersOpen] = useState(false);
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
    <div className="expenses-page">
      <PageHeader title="Gastos" description="Acompanhe suas despesas por período e categoria." action={<button className="primary" onClick={() => p.edit('expenses')}>+ Registrar gasto</button>} />
      <section className="expense-period-panel" aria-label="Gastos no período selecionado">
      <div className="expense-total"><div><h2>Gastos no período selecionado</h2><p>{brDate(from) + ' a ' + brDate(to)}</p></div><strong><PrivateValue>{money(total)}</PrivateValue></strong></div>
      <div className="expense-period-controls">
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
        <button className="mobile-filter-button" onClick={() => setFiltersOpen(true)}>Filtros{kind !== 'todas' ? ' · 1' : ''}</button><div className="list-tools desktop-filters">
          <label>
            De
            <input
              aria-label="Gastos de"
              type="date" onClick={openDatePicker}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              aria-label="Gastos até"
              type="date" onClick={openDatePicker}
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
      </div></section>
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtros de gastos"><div className="list-tools"><label>De<input type="date" onClick={openDatePicker} value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>Até<input type="date" onClick={openDatePicker} value={to} onChange={(e) => setTo(e.target.value)} /></label><Choice label="Recorrência" value={kind} onChange={setKind} options={['todas', 'única', 'mensal', 'anual']} /></div><button className="primary" onClick={() => setFiltersOpen(false)}>Aplicar filtros</button></Sheet>
      <div className="expense-reading-grid"><section className="content-section"><div className="section-heading"><h2>Para onde foi seu dinheiro?</h2><span>{categories.length} categorias</span></div>
        {categories.length ? categories.slice(0,6).map((category) => <div className="category-row" key={category.label}><span>{category.label}</span><strong><PrivateValue>{money(category.value)}</PrivateValue></strong><Bar label={category.label} value={ratio(category.value, total) * 100}/></div>) : <EmptyState title="Comece pelo primeiro gasto" description="Suas categorias aparecem aqui conforme você registra despesas." action={<button onClick={() => p.edit('expenses')}>Registrar gasto</button>}/>}
      </section>
      <section className="content-section"><div className="section-heading"><h2>Últimos gastos</h2><span>{rows.length} registros</span></div>{[...rows].sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0,8).map((r) => <FinancialItem key={r.id} title={String(r.name)} description={String(r.category) + ' · ' + brDate(r.date)} value={money(num(r.amount))} action={<button aria-label={'Editar ' + r.name} onClick={() => p.edit('expenses', r)}>Editar</button>}/>)}{!rows.length && <p className="inline-note">Nenhum gasto no período selecionado.</p>}</section></div>
      <BudgetSection {...p}/>
      <PersonalExpenses data={d}/>
      <details className="disclosure"><summary>Referência de despesas e totais gerais</summary>
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
      </details><details className="history-disclosure"><summary>Ver histórico completo de gastos</summary><Records
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
      /></details>
    </div>
  );
}

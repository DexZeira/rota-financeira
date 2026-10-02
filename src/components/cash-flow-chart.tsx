import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { type Data, money, today, brDate } from '../model';
import { addMonths } from '../calculations';
import { dateRange } from '../insights';
import { cashFlowPoints } from '../services/transaction-view';
import { useValuePrivacy, PrivateValue } from './value-privacy';
import { EmptyState } from './finance-ui';

export function CashFlowChart({
  data,
  go,
}: {
  data: Data;
  go: (page: string) => void;
}) {
  const [range, setRange] = useState('30D');
  const { hidden } = useValuePrivacy();
  const at = today();
  const daily = range.endsWith('D');
  const points = useMemo(() => {
    const months = range === '1A' ? 12 : Number.parseInt(range, 10);
    const from = daily
      ? dateRange(range === '7D' ? '7 dias' : '30 dias').from
      : addMonths(at.slice(0, 7) + '-01', 1 - months);
    return cashFlowPoints(data, from, at, daily);
  }, [data, range, at, daily]);
  const label = (date: string) =>
    daily
      ? brDate(date).slice(0, 5)
      : new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(
          new Date(date + '-15T12:00:00'),
        );
  return (
    <section
      className="dashboard-panel dashboard-cashflow"
      aria-labelledby="cashflow-title"
    >
      <div className="section-heading">
        <div>
          <h2 id="cashflow-title">Movimentos de caixa</h2>
          <p>
            Principal de aportes e resgates fica fora; custos pagos e rendimentos
            líquidos entram.
          </p>
        </div>
        <div className="chart-periods" aria-label="Período dos movimentos">
          {['7D', '30D', '3M', '6M', '1A'].map((period) => (
            <button
              key={period}
              aria-pressed={range === period}
              onClick={() => setRange(period)}
            >
              {period}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-legend">
        <span>
          <i className="income-mark" />
          Entradas
        </span>
        <span>
          <i className="expense-mark" />
          Saídas
        </span>
      </div>
      {!points.length ? (
        <EmptyState
          title="Seu fluxo aparece com os primeiros registros"
          description="Adicione entradas ou gastos para comparar os movimentos do período."
          action={
            <button onClick={() => go('Transações')}>Ver transações</button>
          }
        />
      ) : (
        <>
          <div className="cashflow-canvas" key={range} aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={points}
                accessibilityLayer={false}
                margin={{ top: 16, right: 8, bottom: 8, left: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 5"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={label}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  minTickGap={16}
                />
                <YAxis
                  tickFormatter={(value) =>
                    hidden
                      ? '•••'
                      : new Intl.NumberFormat('pt-BR', {
                          notation: 'compact',
                        }).format(Number(value) / 100)
                  }
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  width={52}
                />
                <Tooltip
                  cursor={{ fill: 'var(--muted)' }}
                  content={({ active, payload, label: date }) =>
                    active && payload?.length ? (
                      <div className="rota-chart-tooltip">
                        <strong>
                          {daily ? brDate(String(date)) : String(date)}
                        </strong>
                        {payload.map((item) => (
                          <span key={String(item.dataKey)}>
                            {item.dataKey === 'income' ? 'Entradas' : 'Saídas'}
                            <b>
                              {hidden
                                ? '••••'
                                : money(Number(item.value) / 100)}
                            </b>
                          </span>
                        ))}
                      </div>
                    ) : null
                  }
                />
                <Bar
                  dataKey="income"
                  fill="var(--chart-1)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={30}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="expense"
                  fill="var(--chart-3)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={30}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <details className="chart-data">
            <summary>Consultar valores dos movimentos</summary>
            <dl>
              {points.map((point) => (
                <div key={point.date}>
                  <dt>{daily ? brDate(point.date) : point.date}</dt>
                  <dd>
                    <PrivateValue>{`Entradas ${money(point.income / 100)} · Saídas ${money(point.expense / 100)}`}</PrivateValue>
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      )}
    </section>
  );
}

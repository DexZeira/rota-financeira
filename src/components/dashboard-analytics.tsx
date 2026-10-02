import { useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Bar } from './common';
import { EmptyState, FinancialItem } from './finance-ui';
import { PrivateValue, useValuePrivacy } from './value-privacy';
import { money, num, dec, brDate, today, type Data } from '../model';
import { difference } from '../services/financial-change-explainer';
import { upcoming } from '../insights';
import { transactionView } from '../services/transaction-view';
import type { MonthlyFinancialSnapshot } from '../services/reporting-state';
import type { planningPhaseTwo } from '../services/planning-phase-two';

function recordedWealthPoints(data: Data, from: string, through: string) {
  const byDate = new Map<string, { date: string; cents: number }>();
  for (const closure of data.reporting.closures) {
    const revision = closure.revisions.at(-1);
    if (
      closure.status === 'closed' &&
      revision &&
      revision.dataCompleteness !== 'insufficient'
    )
      byDate.set(revision.through, {
        date: revision.through,
        cents: revision.netWorthCents,
      });
  }
  for (const row of data.netWorthSnapshots)
    byDate.set(String(row.date), {
      date: String(row.date),
      cents: num(row.netCents),
    });
  return [...byDate.values()]
    .filter((point) => point.date >= from && point.date <= through)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function WealthSparkline({
  data,
  through,
}: {
  data: Data;
  through: string;
}) {
  const { hidden } = useValuePrivacy();
  const start = new Date(through + 'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - 30);
  const points = recordedWealthPoints(
    data,
    start.toISOString().slice(0, 10),
    through,
  );
  if (points.length < 2) return null;
  const change = difference(points.at(-1)!.cents, points[0].cents);
  return (
    <div className="dashboard-wealth-trend">
      <div className="dashboard-sparkline" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={points.map((point) => ({
              ...point,
              timestamp: Date.parse(point.date + 'T12:00:00Z'),
            }))}
            accessibilityLayer={false}
            margin={{ top: 4, right: 2, bottom: 4, left: 2 }}
          >
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              hide
            />
            <YAxis domain={['auto', 'auto']} hide />
            <Area
              type="linear"
              dataKey="cents"
              stroke="var(--chart-1)"
              fill="var(--accent)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <span>
        Posições salvas · {brDate(points[0].date).slice(0, 5)}–
        {brDate(points.at(-1)!.date).slice(0, 5)}
        <br />
        {hidden ? (
          'Variação oculta'
        ) : (
          <>
            {change.absolute! < 0 ? '−' : '+'}
            {money(Math.abs(change.absolute || 0) / 100)}
            {change.percent !== null && ` (${dec(change.percent, 1)}%)`}
          </>
        )}
      </span>
    </div>
  );
}

export function DashboardAnalytics({
  data,
  snapshot,
  budget,
  go,
}: {
  data: Data;
  snapshot: MonthlyFinancialSnapshot | null;
  budget: ReturnType<typeof planningPhaseTwo>['budget'];
  go: (page: string) => void;
}) {
  const [windowSize, setWindowSize] = useState('6m');
  const { hidden } = useValuePrivacy();
  const at = today();
  const points = useMemo(() => {
    const start = new Date(at + 'T00:00:00Z');
    if (windowSize.endsWith('d'))
      start.setUTCDate(start.getUTCDate() - Number.parseInt(windowSize, 10));
    else if (windowSize !== 'all')
      start.setUTCMonth(start.getUTCMonth() - Number.parseInt(windowSize, 10));
    return recordedWealthPoints(
      data,
      windowSize === 'all' ? '' : start.toISOString().slice(0, 10),
      at,
    );
  }, [data, at, windowSize]);
  const historyPoints = points.map((point) => ({
    ...point,
    timestamp: Date.parse(point.date + 'T12:00:00Z'),
  }));
  const change =
    points.length >= 2
      ? difference(points.at(-1)!.cents, points[0].cents)
      : null;
  const categories = snapshot
    ? [
        ...Object.entries(snapshot.categories),
        ...(snapshot.maintenanceCents
          ? [['Manutenção', snapshot.maintenanceCents] as [string, number]]
          : []),
      ]
        .filter(([, cents]) => cents > 0)
        .sort((a, b) => b[1] - a[1])
    : [];
  const commitments = upcoming(data, at)
    .filter((item) => item.days <= 30)
    .slice(0, 4);
  const recent = useMemo(() => transactionView(data).slice(0, 5), [data]);
  const category = (name: string) => {
    if (name === 'Manutenção') {
      go('Manutenção');
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set('category', name);
    history.replaceState(null, '', url.pathname + url.search);
    go('Transações');
  };
  return (
    <>
      <div className="dashboard-intelligence-grid">
        <section
          className="dashboard-panel dashboard-history"
          aria-labelledby="wealth-history-title"
        >
          <div className="section-heading">
            <div>
              <h2 id="wealth-history-title">Evolução do patrimônio</h2>
              <p>Somente posições e fechamentos salvos.</p>
            </div>
            <label className="sr-only" htmlFor="wealth-window">
              Janela do histórico
            </label>
            <select
              id="wealth-window"
              value={windowSize}
              onChange={(event) => setWindowSize(event.target.value)}
            >
              {[
                ['7d', '7 dias'],
                ['30d', '30 dias'],
                ['3m', '3 meses'],
                ['6m', '6 meses'],
                ['12m', '1 ano'],
                ['all', 'Tudo'],
              ].map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {change && (
            <p className="dashboard-history-change">
              Entre as posições exibidas:{' '}
              {change.absolute === 0
                ? 'sem variação'
                : change.absolute! > 0
                  ? 'aumento'
                  : 'redução'}{' '}
              <PrivateValue>
                {money(Math.abs(change.absolute || 0) / 100)}
              </PrivateValue>
              {hidden
                ? ' · variação oculta'
                : change.percent !== null
                  ? ` (${dec(Math.abs(change.percent), 1)}%)`
                  : ' · percentual indisponível com base zero'}
              . Consulte a origem dos valores em Patrimônio.
            </p>
          )}
          {points.length < 2 ? (
            <EmptyState
              title="Ainda não há posições históricas suficientes"
              description="Salve posições em Patrimônio ou feche meses em Relatórios. Não criamos valores retroativos."
              action={
                <button onClick={() => go('Patrimônio')}>
                  Registrar posição
                </button>
              }
            />
          ) : (
            <>
              <div className="dashboard-history-range">
                <span>
                  <PrivateValue>{money(points[0].cents / 100)}</PrivateValue>
                </span>
                <span>
                  <PrivateValue>
                    {money(points.at(-1)!.cents / 100)}
                  </PrivateValue>
                </span>
              </div>
              <div
                className="wealth-line-chart"
                key={windowSize}
                aria-hidden="true"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={historyPoints}
                    accessibilityLayer={false}
                    margin={{ top: 16, right: 12, bottom: 8, left: 0 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--border)"
                      strokeDasharray="3 5"
                    />
                    <XAxis
                      dataKey="timestamp"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(value) =>
                        brDate(
                          new Date(Number(value)).toISOString().slice(0, 10),
                        ).slice(0, 5)
                      }
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tickFormatter={(value) =>
                        hidden
                          ? '•••'
                          : new Intl.NumberFormat('pt-BR', {
                              maximumFractionDigits: 2,
                            }).format(Number(value) / 100)
                      }
                      axisLine={false}
                      tickLine={false}
                      width={76}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    />
                    <Tooltip
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <div className="rota-chart-tooltip">
                            <strong>
                              {brDate(String(payload[0].payload.date))}
                            </strong>
                            <span>
                              Patrimônio
                              <b>
                                {hidden
                                  ? '••••'
                                  : money(Number(payload[0].value) / 100)}
                              </b>
                            </span>
                          </div>
                        ) : null
                      }
                    />
                    <Area
                      type="linear"
                      dataKey="cents"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      fill="var(--chart-1)"
                      fillOpacity={0.08}
                      dot={{ r: 3, fill: 'var(--chart-1)' }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="dashboard-history-range">
                <span>{brDate(points[0].date)}</span>
                <span>{brDate(points.at(-1)!.date)}</span>
              </div>
              <details className="chart-data">
                <summary>Consultar valores do gráfico</summary>
                <dl>
                  {points.map((point) => (
                    <div key={point.date}>
                      <dt>{brDate(point.date)}</dt>
                      <dd>
                        <PrivateValue>{money(point.cents / 100)}</PrivateValue>
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            </>
          )}
        </section>
        <section
          className="dashboard-panel dashboard-categories"
          aria-labelledby="dashboard-category-title"
        >
          <div className="section-heading">
            <div>
              <h2 id="dashboard-category-title">Distribuição dos gastos</h2>
              <p>Realizado no mês, sem aportes ou transferências.</p>
            </div>
          </div>
          {!categories.length ? (
            <EmptyState
              title="Sem gastos registrados neste mês"
              description="A composição aparece depois do primeiro lançamento."
              action={
                <button onClick={() => go('Transações')}>Ver transações</button>
              }
            />
          ) : (
            <ul>
              {categories.map(([name, cents], index) => (
                <li key={name}>
                  <button onClick={() => category(name)}>
                    <span
                      className="category-mark"
                      style={{ background: `var(--chart-${(index % 5) + 1})` }}
                      aria-hidden="true"
                    />
                    <span>{name}</span>
                    <strong>
                      <PrivateValue>{money(cents / 100)}</PrivateValue>
                    </strong>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                  <Bar
                    label={`Participação de ${name}`}
                    value={
                      snapshot && snapshot.expenseCents > 0
                        ? (cents / snapshot.expenseCents) * 100
                        : 0
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="dashboard-detail-grid">
        <section
          className="dashboard-panel"
          aria-labelledby="dashboard-budgets-title"
        >
          <div className="section-heading">
            <h2 id="dashboard-budgets-title">Orçamentos do mês</h2>
            <button onClick={() => go('Orçamentos')}>Ver todos</button>
          </div>
          {!budget.rows.length ? (
            <EmptyState
              title="Dê um limite aos seus gastos"
              description="Defina categorias e acompanhe o realizado sem bloquear lançamentos."
              action={
                <button onClick={() => go('Orçamentos')}>
                  Configurar orçamento
                </button>
              }
            />
          ) : (
            budget.rows.slice(0, 4).map((row) => (
              <div className="dashboard-budget" key={row.id}>
                <div>
                  <strong>{row.category}</strong>
                  <span>
                    <PrivateValue>{`${money(row.actualCents / 100)} / ${money(row.limitCents / 100)}`}</PrivateValue>
                  </span>
                </div>
                <Bar
                  value={row.percent || 0}
                  label={`Orçamento de ${row.category}`}
                />
                <small>
                  {row.status === 'over_budget'
                    ? 'Acima do limite'
                    : row.status === 'near_limit'
                      ? 'Próximo do limite'
                      : 'Dentro do limite'}{' '}
                  ·{' '}
                  {row.percent === null
                    ? 'Limite zero'
                    : `${Math.round(row.percent)}% utilizado`}
                </small>
              </div>
            ))
          )}
        </section>
        <section
          className="dashboard-panel"
          aria-labelledby="dashboard-upcoming-title"
        >
          <div className="section-heading">
            <h2 id="dashboard-upcoming-title">Próximos compromissos</h2>
            <button onClick={() => go('Planejamento')}>Calendário</button>
          </div>
          {commitments.length ? (
            commitments.map((item) => (
              <FinancialItem
                key={item.id}
                title={item.name}
                description={item.detail}
                value={
                  item.amount === null
                    ? 'Valor não definido'
                    : money(item.amount)
                }
                context={
                  item.days < 0
                    ? 'Atrasado'
                    : item.days === 0
                      ? 'Hoje'
                      : `Em ${item.days} dias`
                }
                action={
                  <button
                    className="icon-button"
                    aria-label={`Revisar ${item.name}`}
                    onClick={() => go(item.page)}
                  >
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                }
              />
            ))
          ) : (
            <EmptyState
              title="Sem compromissos próximos"
              description="Nenhum compromisso com data nos próximos 30 dias."
            />
          )}
        </section>
      </div>
      <section
        className="dashboard-panel dashboard-recent"
        aria-labelledby="dashboard-recent-title"
      >
        <div className="section-heading">
          <h2 id="dashboard-recent-title">Movimentos recentes</h2>
          <button onClick={() => go('Transações')}>Ver todos</button>
        </div>
        {recent.length ? (
          recent.map((row) => (
            <FinancialItem
              key={row.id}
              title={row.description}
              description={`${brDate(row.date)} · ${row.category} · ${row.origin}`}
              value={money(row.amountCents / 100)}
              context={row.direction}
            />
          ))
        ) : (
          <EmptyState
            title="O seu histórico começa aqui"
            description="Registre movimentos ou revise uma importação. Nada é lançado automaticamente."
            action={
              <button onClick={() => go('Transações')}>
                Registrar movimento
              </button>
            }
          />
        )}
      </section>
      {hidden && (
        <p className="inline-note">
          Valores dos resumos ocultos neste dispositivo. Ao abrir um formulário,
          os campos permanecem editáveis.
        </p>
      )}
    </>
  );
}

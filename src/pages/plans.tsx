import { NextBike } from '../components/overview';
import { useState } from 'react';
import { Metrics, Bar, Records, Choice } from '../components/common';
import { emptyRow, type Row, money, dec, brDate, today, id } from '../model';
import { plan } from '../calculations';
import { type ViewProps, dateCol, amountCol } from './shared';
export function Plans(p: ViewProps) {
  const { data: d, edit } = p;
  const [history, setHistory] = useState('todos');
  const result = (r: Row) => plan(r, today(), d);
  function transaction(r: Row, kind: string) {
    edit('planTransactions', {
      ...emptyRow('planTransactions'),
      id: id(),
      planId: r.id,
      kind,
    });
  }
  return (
    <>
      <header className="work-page-header"><div><p className="eyebrow">OBJETIVOS</p><h1>Planos</h1><p className="page-subtitle">Transforme seus objetivos em próximos passos.</p></div></header>
      <div className="section-heading page-section-intro"><div><p className="eyebrow">SEUS OBJETIVOS</p><h2>Metas que avançam com você</h2></div></div>
      <NextBike data={d} />
      <Metrics
        items={[
          ['Objetivos', String(d.plans.length)],
          [
            'Já guardado',
            money(d.plans.reduce((s, r) => s + result(r).current, 0)),
          ],
          [
            'Falta guardar',
            money(
              d.plans
                .filter((r) => r.status !== 'concluído')
                .reduce((s, r) => s + result(r).remaining, 0),
            ),
          ],
          [
            'Aporte mensal necessário',
            money(
              d.plans
                .filter((r) => r.status !== 'concluído')
                .reduce((s, r) => s + result(r).monthly, 0),
            ),
          ],
        ]}
      />
      <p className="notice">
        O saldo inicial mais aportes menos retiradas determina o valor guardado.
        Essas alocações acompanham os objetivos e não são somadas novamente ao
        patrimônio. Registre transferências reais na aba Investimentos e gastos
        efetivos em Gastos.
      </p>
      <Records
        {...p}
        kind="plans"
        rows={d.plans}
        filterKey="status"
        sortKey="deadline"
        columns={[
          {
            label: 'Plano',
            render: (r) => (
              <>
                <b>{String(r.name)}</b>
                <p>
                  {r.kind} · {r.status}
                </p>
              </>
            ),
          },
          {
            label: 'Prazo',
            render: (r) => (
              <>
                {brDate(r.deadline)}
                {result(r).overdue && r.status !== 'concluído' && (
                  <p className="error">Prazo vencido</p>
                )}
              </>
            ),
          },
          {
            label: 'Guardado / restante',
            render: (r) =>
              money(result(r).current) + ' / ' + money(result(r).remaining),
          },
          {
            label: 'Progresso',
            render: (r) => (
              <>
                <Bar value={result(r).percent} label="Progresso do plano" />
                {dec(result(r).percent)}%
              </>
            ),
          },
          {
            label: 'Mensal / semanal / diário',
            render: (r) => {
              const x = result(r);
              return (
                money(x.monthly) +
                ' / ' +
                money(x.weekly) +
                ' / ' +
                money(x.daily)
              );
            },
          },
        ]}
        extra={(r) => (
          <>
            <button onClick={() => transaction(r, 'deposit')}>Aportar</button>
            <button onClick={() => transaction(r, 'withdrawal')}>
              Retirar
            </button>
            <button
              onClick={() => {
                setHistory(r.id);
                document
                  .getElementById('plan-history')
                  ?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Histórico
            </button>
          </>
        )}
      />
      <div id="plan-history">
        <div className="section-heading">
          <h2>Movimentações dos objetivos</h2>
          <Choice
            label="Plano do histórico"
            value={history}
            onChange={setHistory}
            options={[
              { value: 'todos', label: 'Todos os planos' },
              ...d.plans.map((r) => ({ value: r.id, label: String(r.name) })),
            ]}
          />
        </div>
        <Records
          {...p}
          kind="planTransactions"
          rows={d.planTransactions.filter(
            (t) => history === 'todos' || t.planId === history,
          )}
          filterKey="kind"
          columns={[
            dateCol,
            {
              label: 'Plano',
              render: (r) =>
                String(d.plans.find((p) => p.id === r.planId)?.name || ''),
            },
            {
              label: 'Tipo',
              render: (r) => (r.kind === 'withdrawal' ? 'Retirada' : 'Aporte'),
            },
            amountCol,
            { label: 'Observações', render: (r) => String(r.notes) },
          ]}
        />
      </div>
    </>
  );
}

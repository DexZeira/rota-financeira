import { PageHeader, HeroMetric, FinancialItem, EmptyState } from '../components/finance-ui';
import { NextBike } from '../components/overview';
import { useState } from 'react';
import { Metrics, Bar, Records, Choice } from '../components/common';
import { emptyRow, type Row, money, dec, brDate, today, id } from '../model';
import { plan } from '../calculations';
import { useEconomicIndicators } from '../hooks/use-economic-indicators';
import { PlanInflation } from '../components/plan-inflation';
import { type ViewProps, dateCol, amountCol } from './shared';
export function Plans(p: ViewProps) {
  const { data: d, edit } = p;
  const economic = useEconomicIndicators();
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
      <PageHeader title="Objetivos" description="O futuro se constrói aos poucos." action={<button className="primary" onClick={() => edit('plans')}>+ Novo objetivo</button>} />
      <HeroMetric label="Já guardado para seus planos" value={money(d.plans.reduce((total, r) => total + result(r).current, 0))} context={d.plans.length + ' objetivos cadastrados'} />
      <section aria-label="Seus objetivos">{!d.plans.length && <EmptyState title="O que você quer conquistar?" description="Defina um objetivo e acompanhe cada avanço." action={<button onClick={() => edit('plans')}>Criar objetivo</button>} />}
      {d.plans.map((r) => <FinancialItem key={r.id} title={String(r.name)} description={String(r.status) + ' · ' + brDate(r.deadline)} value={money(result(r).current)} context={'Faltam ' + money(result(r).remaining)} action={<button onClick={() => transaction(r, 'deposit')}>Aportar</button>}><Bar value={result(r).percent} label={'Progresso de ' + r.name}/><small>{dec(result(r).percent)}% concluído</small><PlanInflation row={r} economic={economic} current={result(r).current} monthly={result(r).monthly} edit={() => edit('plans', r)}/></FinancialItem>)}</section>
      <details className="disclosure"><summary>Seu planejamento de aportes</summary>
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
      </details><details className="disclosure"><summary>Gerenciar objetivos e retiradas</summary><Records
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
      </details><details className="disclosure"><summary>Planejar a próxima moto</summary><NextBike data={d}/></details><div id="plan-history">
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

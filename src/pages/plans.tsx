import {
  PageHeader,
  FinancialItem,
  EmptyState,
} from '../components/finance-ui';
import { Flag, ArrowUpRight } from 'lucide-react';
import { NextBike } from '../components/overview';
import { useState } from 'react';
import { Metrics, Bar, Records, Choice } from '../components/common';
import { emptyRow, type Row, money, dec, brDate, today, id } from '../model';
import { plan } from '../calculations';
import { useEconomicIndicators } from '../hooks/use-economic-indicators';
import { PlanInflation } from '../components/plan-inflation';
import { type ViewProps, dateCol, amountCol } from './shared';
import { PrivateValue } from '../components/value-privacy';
import './plans.css';
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
    <div className="plans-page">
      <PageHeader
        title="Objetivos"
        description="Acompanhe o que já guardou e o próximo aporte."
        action={
          <button className="primary" onClick={() => edit('plans')}>
            Novo objetivo <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        }
      />
      <section className="goals-overview" aria-label="Resumo dos objetivos">
        <div>
          <h2>
            <Flag size={18} aria-hidden="true" /> Guardado para seus planos
          </h2>
          <strong>
            <PrivateValue>
              {money(
                d.plans.reduce((total, r) => total + result(r).current, 0),
              )}
            </PrivateValue>
          </strong>
          <p>{d.plans.length} objetivos cadastrados</p>
        </div>
        <div className="goals-overview-note">
          <h2>Cada aporte tem um destino</h2>
          <p>
            Os valores alocados acompanham seus objetivos. Eles não são somados
            novamente ao patrimônio.
          </p>
          <button
            onClick={() =>
              document
                .getElementById('plan-history')
                ?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            Ver movimentações
          </button>
        </div>
      </section>
      <section className="goal-portfolio" aria-label="Seus objetivos">
        {!d.plans.length && (
          <EmptyState
            title="O que você quer conquistar?"
            description="Defina um objetivo e acompanhe cada avanço."
            action={
              <button onClick={() => edit('plans')}>Criar objetivo</button>
            }
          />
        )}
        {d.plans.map((r) => {
          const current = result(r);
          return (
            <FinancialItem
              key={r.id}
              title={String(r.name)}
              description={String(r.status) + ' · ' + brDate(r.deadline)}
              value={money(current.current)}
              context={'Faltam ' + money(current.remaining)}
              action={
                <button onClick={() => transaction(r, 'deposit')}>
                  Aportar
                </button>
              }
            >
              <div className="goal-progress">
                <Bar value={current.percent} label={'Progresso de ' + r.name} />
                <span>{dec(current.percent)}% concluído</span>
              </div>
              <div className="goal-next-step">
                <span>
                  {current.overdue && r.status !== 'concluído'
                    ? 'Prazo vencido · revise o plano'
                    : 'Aporte mensal necessário'}
                </span>
                <strong>
                  <PrivateValue>{money(current.monthly)}</PrivateValue>
                </strong>
                <button onClick={() => edit('plans', r)}>
                  Revisar objetivo
                </button>
              </div>
              <PlanInflation
                row={r}
                economic={economic}
                current={current.current}
                monthly={current.monthly}
                edit={() => edit('plans', r)}
              />
            </FinancialItem>
          );
        })}
      </section>
      <details className="disclosure">
        <summary>Seu planejamento de aportes</summary>
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
          O saldo inicial mais aportes menos retiradas determina o valor
          guardado. Essas alocações acompanham os objetivos e não são somadas
          novamente ao patrimônio. Registre transferências reais na aba
          Investimentos e gastos efetivos em Gastos.
        </p>
      </details>
      <details className="disclosure">
        <summary>Gerenciar objetivos e retiradas</summary>
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
      </details>
      <details className="disclosure">
        <summary>Planejar a próxima moto</summary>
        <NextBike data={d} />
      </details>
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
    </div>
  );
}

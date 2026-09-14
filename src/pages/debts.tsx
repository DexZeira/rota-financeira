import { PageHeader, HeroMetric, FinancialItem } from '../components/finance-ui';
import { DebtCards } from '../components/overview';
import { useState } from 'react';
import { Card, Metrics, Bar, NoData, Records, Choice } from '../components/common';
import { num, money, dec, brDate, today, id } from '../model';
import { financial, targets, prioritized, debtState, sum } from '../calculations';
import { type ViewProps, dateCol, amountCol } from './shared';
export function Debts(p: ViewProps) {
  const { data: d, edit } = p,
    [strategy, setStrategy] = useState('otimizada'),
    ranked = prioritized(d, strategy),
    all = d.debts.map((r) => debtState(d, r));
  return (
    <>
      <PageHeader title="Dívidas" description="Um compromisso de cada vez." />
      <HeroMetric label="Total em dívidas" value={money(financial(d).debt)} context={money(targets(d).installments) + ' previstos neste mês'} action={<button className="primary" onClick={() => edit('debts')}>+ Nova dívida</button>} />
      <section className="content-section"><h2>Próximos compromissos</h2>{[...all].filter((r) => r.balance > 0).sort((a,b) => String(a.due || '9999').localeCompare(String(b.due || '9999'))).map((r) => <FinancialItem key={r.id} title={String(r.name)} description={'Vencimento · ' + brDate(r.due)} value={money(r.balance)} context={String(r.remaining) + ' parcelas restantes'} action={<button onClick={() => edit('payments', { id: id(), debtId: r.id, date: today(), amount: 0, installments: 0, kind: 'normal', notes: '' })}>Pagar</button>}><Bar value={num(r.progress)} label={'Quitação de ' + r.name}/><small>{dec(num(r.progress))}% quitado</small></FinancialItem>)}</section>
      <details className="disclosure"><summary>Estratégia e previsão de quitação</summary>
      <Metrics
        items={[
          ['Dívidas restantes', money(financial(d).debt)],
          ['Pagamentos realizados', money(sum(d.payments, 'amount'))],
          ['Parcelas mensais', money(targets(d).installments)],
          ['Dívidas ativas', String(ranked.length)],
        ]}
      />
      <Card
        title="Ordem de pagamento"
        action={
          <Choice
            label="Estratégia de dívida"
            value={strategy}
            onChange={setStrategy}
            options={[
              'otimizada',
              'avalanche',
              'bola de neve',
              'saldo',
              'vencimento',
            ]}
          />
        }
      >
        <p className="inline-note">
          A estratégia otimizada pondera atraso, juros, vencimento, parcela e
          saldo. É uma comparação dos seus dados; nenhum pagamento é automático.
        </p>
        {ranked.length ? (
          ranked.map((r, i) => (
            <div className="rank-row" key={r.id}>
              <span className="rank">{i + 1}</span>
              <div>
                <h3>
                  {String(r.name)}{' '}
                  <span className={'status ' + r.priority}>{r.priority}</span>
                </h3>
                <p>{r.reason}</p>
              </div>
              <strong>{money(r.balance)}</strong>
            </div>
          ))
        ) : (
          <NoData text="Nenhuma dívida ativa." />
        )}
      </Card>
      <DebtCards data={d} edit={edit} /></details>
      <details className="history-disclosure"><summary>Ver todas as dívidas</summary><Records
        {...p}
        kind="debts"
        rows={all}
        filterKey="status"
        sortKey="balance"
        columns={[
          { label: 'Dívida', render: (r) => <b>{String(r.name)}</b> },
          { label: 'Saldo restante', render: (r) => money(num(r.balance)) },
          {
            label: 'Juros / vencimento',
            render: (r) => `${dec(num(r.interest))}% · ${brDate(r.due)}`,
          },
          { label: 'Parcelas restantes', render: (r) => String(r.remaining) },
          {
            label: 'Quitação',
            render: (r) => (
              <>
                <Bar value={num(r.progress)} label="Quitação" />
                {dec(num(r.progress))}%
              </>
            ),
          },
        ]}
        extra={(r) => (
          <button
            onClick={() =>
              edit('payments', {
                id: id(),
                debtId: r.id,
                date: today(),
                amount: 0,
                installments: 0,
                kind: 'normal',
                notes: '',
              })
            }
          >
            Pagar
          </button>
        )}
      /></details>
      <details className="history-disclosure"><summary>Ver pagamentos registrados</summary><Records
        {...p}
        kind="payments"
        rows={d.payments}
        columns={[
          dateCol,
          {
            label: 'Dívida',
            render: (r) =>
              String(d.debts.find((x) => x.id === r.debtId)?.name || ''),
          },
          amountCol,
          {
            label: 'Tipo / parcelas',
            render: (r) => `${r.kind} · ${r.installments}`,
          },
        ]}
        filterKey="kind"
      /></details>
    </>
  );
}

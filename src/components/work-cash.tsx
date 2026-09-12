import { Card } from './common';
import { type Data, type Row, brDate, dec, money } from '../model';
import { workCashResult } from '../work-results';
import { workExpenseAmount } from '../expense-allocation';
export const cashMetrics = (
  r: ReturnType<typeof workCashResult>,
): [string, string][] => [
  ['Faturamento real', money(r.revenue)],
  ['Despesas reais atribuídas', money(r.realExpenses)],
  ['Lucro de caixa', money(r.cashProfit)],
  ['Provisões', money(r.provisions)],
  ['Resultado após provisões', money(r.afterProvisions)],
  ['Depreciação', money(r.depreciation)],
  ['Resultado econômico', money(r.economic)],
  ['Horas', dec(r.hours)],
  ['KM', dec(r.km)],
  ['Lucro de caixa/h', money(r.cashHour)],
  ['Lucro de caixa/km', money(r.cashKm)],
];
export function CashDetails({
  result,
}: {
  result: ReturnType<typeof workCashResult>;
}) {
  return (
    <div className="work-stats">
      {cashMetrics(result).map(([label, v]) => (
        <div className="detail" key={label}>
          <span>{label}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}
export function ActivityComparison({
  data,
  rows,
  from,
  to,
  activity,
}: {
  data: Data;
  rows: Row[];
  from: string;
  to: string;
  activity: string;
}) {
  const names = [
    ...new Set([
      'Uber Moto',
      'Entrega de cartões',
      ...data.activities.map((r) => String(r.name)),
      ...rows.map((r) => String(r.activity)),
      ...data.expenses.map((r) => String(r.workActivity || '')),
      ...data.services.map((r) => String(r.workActivity || '')),
    ]),
  ].filter((n) => n && (activity === 'todos' || n === activity));
  return (
    <Card title="Comparação por atividade no período">
      <div className="work-list">
        {names.map((name) => (
          <div className="activity-card" key={name}>
            <h3>{name}</h3>
            <CashDetails
              result={workCashResult(
                data,
                rows.filter((r) => r.activity === name),
                name,
                from,
                to,
              )}
            />
          </div>
        ))}
      </div>
      <p className="inline-note">
        Despesas gerais com atividade são incluídas nessa atividade. As sem
        atividade ficam no grupo Geral do trabalho, sem divisão arbitrária entre
        atividades ou sessões. Lucro/h e lucro/km usam o lucro de caixa.
      </p>
    </Card>
  );
}
export function ExpenseBreakdown({
  data,
  result,
  edit,
}: {
  data: Data;
  result: ReturnType<typeof workCashResult>;
  edit: (kind: 'expenses' | 'services', r: Row) => void;
}) {
  const general = result.expenses.filter((e) => e.row.allocation !== 'sessão');
  const unassigned = general
    .filter((e) => !e.row.workActivity)
    .reduce((s, e) => s + workExpenseAmount(e.row), 0);
  return (
    <Card title="Despesas reais do filtro">
      <p>
        Gerais, sem rateio por sessão: {money(result.generalExpenses)}. Geral do
        trabalho, sem atividade: {money(unassigned)}.
      </p>
      {result.expenses.length ? (
        result.expenses.map(({ row: r, kind }) => (
          <div className="activity-card" key={kind + r.id}>
            <div className="section-heading">
              <b>
                {String(
                  r.name ||
                    data.maintenance.find((m) => m.id === r.maintenanceId)
                      ?.name ||
                    'Serviço',
                )}{' '}
                · {money(workExpenseAmount(r))}
              </b>
              <button onClick={() => edit(kind, r)}>Editar atribuição</button>
            </div>
            <p>
              Pago em {brDate(r.date)} · {String(r.scope)} ·{' '}
              {r.allocation === 'sessão'
                ? 'Sessão de trabalho'
                : String(r.workActivity || 'Geral do trabalho')}
            </p>
            {r.allocation === 'período' && (
              <p>
                Referência: {brDate(r.periodFrom)} a {brDate(r.periodTo)}
              </p>
            )}
          </div>
        ))
      ) : (
        <p>Nenhuma despesa real atribuída no filtro.</p>
      )}
    </Card>
  );
}

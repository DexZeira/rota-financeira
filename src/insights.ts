import { type Data, type Row, num, today } from './model';
import {
  addMonths,
  costs,
  daysBetween,
  debtState,
  financial,
  investmentBalance,
  maintenanceState,
  plan,
  ratio,
  sum,
  targets,
} from './calculations';

export function dateRange(period: string, at = today()) {
  const offset = period === '7 dias' ? 6 : period === '30 dias' ? 29 : 0;
  return {
    from:
      period === 'Este mês'
        ? at.slice(0, 7) + '-01'
        : new Date(Date.parse(at + 'T12:00:00Z') - offset * 86400000)
            .toISOString()
            .slice(0, 10),
    to: at,
  };
}
export function periodSummary(d: Data, from: string, to: string) {
  const within = (r: Row) => String(r.date) >= from && String(r.date) <= to;
  const work = d.work.filter(within),
    revenue = sum(work, 'revenue');
  const expenses =
    sum(d.expenses.filter(within), 'amount') +
    sum(d.services.filter(within), 'amount');
  const debtPayments = sum(d.payments.filter(within), 'amount');
  const movements = d.movements.filter(within);
  const investments = sum(
    movements.filter((r) => r.kind === 'aporte'),
    'amount',
  );
  const withdrawals = sum(
    movements.filter((r) => r.kind === 'retirada'),
    'amount',
  );
  const plans = sum(
    d.planTransactions.filter((r) => within(r) && r.kind === 'deposit'),
    'amount',
  );
  return {
    revenue,
    expenses,
    debtPayments,
    investments,
    withdrawals,
    plans,
    result: revenue - expenses - debtPayments - investments + withdrawals,
    km: sum(work, 'km'),
    hours: sum(work, 'hours'),
    cards: sum(
      work.filter((r) => r.activity === 'Entrega de cartões'),
      'cardQuantity',
    ),
  };
}
export function monthlyTrend(d: Data, at = today()) {
  const start = at.slice(0, 7) + '-01';
  return Array.from({ length: 6 }, (_, i) => {
    const from = addMonths(start, i - 5),
      end = addMonths(from, 1);
    const to =
      end > at
        ? at
        : new Date(Date.parse(end + 'T12:00:00Z') - 86400000)
            .toISOString()
            .slice(0, 10);
    return { month: from.slice(0, 7), ...periodSummary(d, from, to) };
  });
}
export function monthComparison(d: Data, at = today()) {
  const previous = addMonths(at, -1);
  const current = periodSummary(d, at.slice(0, 7) + '-01', at),
    past = periodSummary(d, previous.slice(0, 7) + '-01', previous);
  return {
    current,
    past,
    revenueChange: past.revenue
      ? (current.revenue / past.revenue - 1) * 100
      : null,
    expenseChange: past.expenses
      ? (current.expenses / past.expenses - 1) * 100
      : null,
  };
}
export type AttentionItem = {
  id: string;
  name: string;
  detail: string;
  page: string;
  days: number;
  amount: number | null;
};
export function upcoming(d: Data, at = today()): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const r of d.debts) {
    const state = debtState(d, r, at);
    if (state.balance > 0 && state.status !== 'quitada' && state.due)
      items.push({
        id: 'debt-' + r.id,
        name: String(r.name),
        detail: 'Parcela de dívida',
        page: 'Dívidas',
        days: daysBetween(at, String(state.due)),
        amount: Math.min(state.balance, num(state.installment)),
      });
  }
  for (const r of d.maintenance) {
    const state = maintenanceState(d, r);
    if (state.status !== 'concluída' && Number.isFinite(state.days))
      items.push({
        id: 'maintenance-' + r.id,
        name: String(r.name),
        detail: 'Manutenção estimada',
        page: 'Manutenção',
        days: Math.ceil(state.days),
        amount: num(r.estimated),
      });
  }
  for (const r of d.plans) {
    const state = plan(r, at, d);
    if (r.status !== 'concluído' && state.remaining > 0 && r.deadline)
      items.push({
        id: 'plan-' + r.id,
        name: String(r.name),
        detail: 'Prazo do plano',
        page: 'Planos',
        days: daysBetween(at, String(r.deadline)),
        amount: state.remaining,
      });
  }
  const recurring = new Map<string, Row>();
  for (const r of [...d.expenses].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  ))
    if (r.recurrence !== 'única' && String(r.date) <= at)
      recurring.set([r.name, r.category, r.recurrence].join('|'), r);
  for (const r of recurring.values()) {
    let next = String(r.date);
    const step = r.recurrence === 'anual' ? 12 : 1;
    do {
      next = addMonths(next, step);
    } while (next < at);
    items.push({
      id: 'expense-' + r.id,
      name: String(r.name),
      detail: 'Recorrência prevista; confirme vencimento',
      page: 'Gastos',
      days: daysBetween(at, next),
      amount: num(r.amount),
    });
  }
  return items.sort((a, b) => a.days - b.days);
}
export function financialHealth(d: Data, at = today()) {
  const month = periodSummary(d, at.slice(0, 7) + '-01', at),
    events = upcoming(d, at),
    f = financial(d, at);
  const overdue = events.filter((e) => e.page === 'Dívidas' && e.days < 0);
  const reserve = d.investments
    .filter((r) => r.category === 'reserva de emergência')
    .reduce((a, r) => a + investmentBalance(d, r, at), 0);
  const reserveGoal =
    num(d.settings.essential) * num(d.settings.emergencyMonths);
  const target = targets(d, at);
  const reasons: string[] = [];
  if (overdue.length) reasons.push(`${overdue.length} dívida(s) vencida(s).`);
  if (month.result < 0) reasons.push('Saídas do mês superam as entradas.');
  if (reserveGoal > 0 && reserve < reserveGoal)
    reasons.push('Reserva de emergência abaixo da meta configurada.');
  const dueSoon = events
    .filter((e) => e.page === 'Dívidas' && e.days >= 0 && e.days <= 7)
    .reduce((a, e) => a + (e.amount ?? 0), 0);
  if (dueSoon > Math.max(0, f.available))
    reasons.push('Saldo disponível não cobre parcelas dos próximos 7 dias.');
  if (!month.revenue)
    reasons.push('Sem receitas registradas neste mês; avaliação parcial.');
  const level =
    overdue.length || month.result < 0
      ? 'Crítica'
      : reasons.length
        ? 'Atenção'
        : reserveGoal > 0 &&
            reserve >= reserveGoal &&
            month.revenue >= target.minimumMonthly
          ? 'Excelente'
          : 'Boa';
  if (!reasons.length)
    reasons.push(
      'Sem dívidas vencidas e com entradas cobrindo as saídas registradas.',
    );
  return { level, reasons, reserve, reserveGoal, dueSoon };
}
export function payoffEstimate(d: Data, extra: number) {
  const active = d.debts
    .map((r) => debtState(d, r))
    .filter((r) => r.status !== 'quitada' && r.balance > 0);
  const balance = active.reduce((a, r) => a + r.balance, 0),
    monthly = active.reduce((a, r) => a + num(r.installment), 0);
  const base = monthly > 0 ? Math.ceil(balance / monthly) : null,
    withExtra =
      monthly + extra > 0 ? Math.ceil(balance / (monthly + extra)) : null;
  return {
    balance,
    monthly,
    base,
    withExtra,
    monthsSaved:
      base !== null && withExtra !== null
        ? Math.max(0, base - withExtra)
        : null,
    reduction: Math.min(balance, Math.max(0, extra) * 12),
  };
}
export function monthlyScenario(d: Data, s: Row) {
  const days = num(s.days),
    km = num(s.km) * days,
    gas = ratio(num(s.gas), num(d.bike.efficiency)),
    c = costs(d);
  const revenue = num(s.revenue) * days,
    fuel = km * gas,
    provision = km * c.reserve;
  const obligations = targets(d).mandatory + targets(d).installments;
  const remaining =
    revenue - fuel - provision - obligations - num(s.extra) - num(s.investment);
  return { revenue, fuel, provision, obligations, remaining, km };
}

import { type Data, type Row } from './model';
import { costs, ratio, sum } from './calculations';
import { attributedExpenses, workExpenseAmount } from './expense-allocation';

export function workCashResult(
  d: Data,
  rows: Row[],
  activity = 'todos',
  from = '',
  to = '',
  sessionOnly = false,
) {
  const expenses = attributedExpenses(d, rows, activity, from, to).filter(
    (e) => !sessionOnly || e.row.allocation === 'sessão',
  );
  const realExpenses = expenses.reduce(
    (s, e) => s + workExpenseAmount(e.row),
    0,
  );
  const generalExpenses = expenses
    .filter((e) => e.row.allocation !== 'sessão')
    .reduce((s, e) => s + workExpenseAmount(e.row), 0);
  const revenue = sum(rows, 'revenue'),
    km = sum(rows, 'km'),
    hours = sum(rows, 'hours'),
    c = costs(d);
  const cashProfit = revenue - realExpenses,
    provisions = km * c.reserve,
    depreciation = km * c.depKm;
  const afterProvisions = cashProfit - provisions,
    economic = afterProvisions - depreciation;
  return {
    revenue,
    km,
    hours,
    realExpenses,
    generalExpenses,
    cashProfit,
    provisions,
    depreciation,
    afterProvisions,
    economic,
    cashHour: ratio(cashProfit, hours),
    cashKm: ratio(cashProfit, km),
    economicHour: ratio(economic, hours),
    economicKm: ratio(economic, km),
    expenses,
  };
}

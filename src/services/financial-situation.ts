import { type Data } from '../model';
import { planningPhaseTwo } from './planning-phase-two';
import { calculateNetWorth } from './net-worth';
import { getCashFlowForecast } from './cash-flow';
import { auditFinancialData } from './financial-audit';
import { deriveAlerts } from './alerts';
import { compareMonths } from './financial-change-explainer';
import { shiftPeriod } from './month-close';
import { toCents } from './money-codec';
import { targets } from '../calculations';
/** Pure, dated summary using existing financial engines. No indicator requests. */
export function financialSituation(d: Data, at: string) {
  const planning = planningPhaseTwo(d, at),
    wealth = calculateNetWorth(d, at),
    forecast = getCashFlowForecast(d, at, 30),
    audit = auditFinancialData(d, at, forecast.events);
  const alerts = deriveAlerts(d, at, { planning, wealth, forecast, audit });
  const selected = d.settings.defaultTarget;
  const legacy = planning.target.enabled ? null : targets(d, at);
  const targetCents = legacy
    ? toCents(
        selected === 'minimum'
          ? legacy.minimumMonthly
          : selected === 'accelerated'
            ? legacy.acceleratedMonthly
            : legacy.idealMonthly,
      )
    : selected === 'minimum'
      ? planning.target.minimumMonthlyCents
      : selected === 'accelerated'
        ? planning.target.acceleratedMonthlyCents
        : planning.target.idealMonthlyCents;
  const period = at.slice(0, 7);
  const inMonth = (date: unknown) =>
    typeof date === 'string' && date.startsWith(period) && date <= at;
  const incomeCents =
    d.work
      .filter((r) => inMonth(r.date))
      .reduce((s, r) => s + toCents(Number(r.revenue)), 0) +
    d.bankReceipts
      .filter((r) => inMonth(r.date))
      .reduce((s, r) => s + Number(r.amountCents), 0);
  const expenseCents = [...d.expenses, ...d.services]
    .filter((r) => inMonth(r.date))
    .reduce((s, r) => s + toCents(Number(r.amount)), 0);
  const closures = d.reporting.closures
    .filter((c) => c.status === 'closed')
    .sort((a, b) => b.period.localeCompare(a.period));
  const last = closures[0]?.revisions.at(-1),
    previous = last
      ? closures
          .find((c) => c.period === shiftPeriod(last.period, -1))
          ?.revisions.at(-1)
      : undefined;
  return {
    at,
    planning,
    wealth,
    forecast,
    audit,
    alerts,
    targetCents,
    incomeCents,
    expenseCents,
    last,
    changes: last && previous ? compareMonths(last, previous) : null,
  };
}
const cache = new WeakMap<
  Data,
  { at: string; value: ReturnType<typeof financialSituation> }
>();
export function getFinancialSituation(d: Data, at: string) {
  const old = cache.get(d);
  if (old?.at === at) return old.value;
  const value = financialSituation(d, at);
  cache.set(d, { at, value });
  return value;
}

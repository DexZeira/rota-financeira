import { assetCashDelta } from './assets';
import { type Data, type Row, collections, num, validDate } from '../model';
import { calculateNetWorth } from './net-worth';
import { toCents } from './money-codec';
import { monthContext, categoryKey } from './budget';
import { planningPhaseTwo } from './planning-phase-two';
import { addDays, generateOccurrences } from './recurrences';
import { validateData } from './storage';
import { explainFinancialChange } from './financial-change-explainer';
import {
  validPeriod,
  validateReporting,
  type MonthlyFinancialSnapshot,
  type MonthlyClosure,
} from './reporting-state';
import { detectSubscriptions } from './import/subscription-detection';
import {
  inflationBetweenMonths,
  type InflationMonth,
} from './inflation-indicators';

export function periodBounds(period: string) {
  if (!validPeriod(period)) throw Error('Mês inválido. Use AAAA-MM.');
  const start = period + '-01';
  return { start, end: monthContext(start).end, before: addDays(start, -1) };
}
export function shiftPeriod(period: string, offset: number) {
  periodBounds(period);
  const n =
    Number(period.slice(0, 4)) * 12 + Number(period.slice(5)) - 1 + offset;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
}
/** SHA-256 over source data only. Reporting metadata never invalidates itself.
 * Date-less configuration is included conservatively because it is not versioned.
 */
export async function reportSourceSignature(d: Data, period: string) {
  const { end } = periodBounds(period);
  const payload = JSON.stringify([
    d.settings,
    d.bike,
    ...collections
      .filter((k) => k !== 'netWorthSnapshots')
      .map((k) => [k, d[k].filter((r) => !r.date || String(r.date) <= end)]),
    d.imports.links.filter((l) => l.transaction.date <= end),
  ]);
  const bytes = new TextEncoder().encode(payload);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export const latestSnapshot = (c?: MonthlyClosure) => c?.revisions.at(-1);
export async function isMonthStale(d: Data, c: MonthlyClosure) {
  return (
    latestSnapshot(c)!.sourceSignature !==
    (await reportSourceSignature(d, c.period))
  );
}
const total = (rows: Row[], key: string, cents = false) =>
  rows.reduce(
    (sum, r) => sum + (cents ? num(r[key]) : toCents(num(r[key]))),
    0,
  );
export async function buildMonthlySnapshot(
  d: Data,
  period: string,
  options: {
    at: string;
    generatedAt: string;
    inflation?: InflationMonth[];
    revision?: number;
  },
): Promise<MonthlyFinancialSnapshot> {
  const { start, end, before } = periodBounds(period);
  if (!validDate(options.at) || start > options.at)
    throw Error('Não é possível consolidar um mês futuro.');
  validateData(d);
  const through = options.at < end ? options.at : end;
  const inPeriod = (r: Row) =>
    String(r.date) >= start && String(r.date) <= through;
  const work = d.work.filter(inPeriod),
    expenses = d.expenses.filter(inPeriod),
    services = d.services.filter(inPeriod),
    payments = d.payments.filter(inPeriod),
    movements = d.movements.filter(inPeriod);
  const opening = calculateNetWorth(d, before),
    closing = calculateNetWorth(d, through);
  const planning = planningPhaseTwo(d, through),
    prior = planningPhaseTwo(d, before);
  const workIncomeCents = total(work, 'revenue'),
    otherIncomeCents = total(
      d.bankReceipts.filter(inPeriod),
      'amountCents',
      true,
    );
  const maintenanceCents = total(services, 'amount'),
    expenseCents = total(expenses, 'amount') + maintenanceCents,
    debtPaymentsCents = total(payments, 'amount');
  const investmentContributionsCents = total(
      movements.filter((r) => r.kind === 'aporte'),
      'amount',
    ),
    investmentWithdrawalsCents = total(
      movements.filter((r) => r.kind === 'retirada'),
      'amount',
    );
  const investmentReturnCents =
    total(
      movements.filter((r) => r.kind === 'rendimento'),
      'amount',
    ) -
    total(
      movements.filter((r) => r.kind === 'perda'),
      'amount',
    );
  const categories: Record<string, number> = Object.create(null),
    expenseGroups: Record<string, number> = Object.create(null);
  const policies = new Map(
    d.categoryPolicies.map((r) => [categoryKey(r.category), String(r.level)]),
  );
  for (const r of expenses) {
    const key = categoryKey(r.category);
    const cents = toCents(num(r.amount));
    categories[key] = (categories[key] ?? 0) + cents;
    const group =
      policies.get(key) ??
      (r.essentiality === 'essencial'
        ? 'essencial'
        : r.essentiality === 'não essencial'
          ? 'discricionária'
          : 'normal');
    expenseGroups[group] = (expenseGroups[group] ?? 0) + cents;
  }
  expenseGroups.manutenção = maintenanceCents;
  const interest = new Map(
    d.assetCostLinks
      .filter((r) => r.recordKind === 'payments' && r.interestCents !== null)
      .map((r) => [String(r.recordId), num(r.interestCents)]),
  );
  const knownInterest = payments.every((r) => interest.has(r.id));
  const debtInterestCents = knownInterest
    ? payments.reduce((s, r) => s + interest.get(r.id)!, 0)
    : null;
  const debtPrincipalReductionCents =
    debtInterestCents === null ? null : debtPaymentsCents - debtInterestCents;
  const bridgeValue = explainFinancialChange({
    openingCents: opening.netCents,
    closingCents: closing.netCents,
    incomeCents: workIncomeCents + otherIncomeCents,
    expenseCents,
    debtPaymentsCents,
    investmentReturnCents,
    assetCashCents: assetCashDelta(d, through) - assetCashDelta(d, before),
    assetChangeCents: closing.assetsCents - opening.assetsCents,
    debtBalanceChangeCents:
      opening.liabilitiesCents -
      Math.max(0, -opening.cashCents) -
      closing.liabilitiesCents +
      Math.max(0, -closing.cashCents),
  });
  const warnings: string[] = [];
  if (opening.partial || closing.partial)
    warnings.push('Há bens sem avaliação; o patrimônio é parcial.');
  if (expenses.some((r) => !r.category || r.category === 'outras'))
    warnings.push('Há despesas sem categoria específica.');
  if (debtInterestCents === null)
    warnings.push(
      'Juros e principal não estão discriminados em todos os pagamentos.',
    );
  if (through < end)
    warnings.push('Mês em andamento; valores realizados até ' + through + '.');
  if (
    d.budgets.length ||
    d.planningSettings.length ||
    d.reserveAllocations.length ||
    d.work.length
  )
    warnings.push(
      'Meta, orçamento e cobertura da reserva são estimativas reconstruídas com a configuração atual.',
    );
  if (bridgeValue.unexplainedCents)
    warnings.push(
      'Parte da variação patrimonial não pôde ser atribuída aos movimentos registrados.',
    );
  const inflationRate =
    through === end
      ? inflationBetweenMonths(options.inflation ?? [], period, period)
      : null;
  if (inflationRate === null)
    warnings.push(
      'IPCA observado do mês indisponível; variação real não calculada.',
    );
  const links = d.imports.links.filter(
    (l) =>
      l.transaction.date <= through &&
      ['created', 'matched'].includes(l.action),
  );
  const uniqueLinks = [
    ...new Map(links.map((l) => [l.recordKind + ':' + l.recordId, l])).values(),
  ];
  const subscriptions = detectSubscriptions(
    uniqueLinks.map((l) => l.transaction),
    through,
  ).filter((r) => !r.inactive);
  let recurringCommitmentsCents = 0;
  for (const r of d.recurrences)
    for (const occurrence of generateOccurrences(r, start, through)) {
      if (occurrence.kind !== 'receita') {
        if (occurrence.amount === null) {
          if (!warnings.includes('Há compromissos recorrentes sem valor.'))
            warnings.push('Há compromissos recorrentes sem valor.');
        } else recurringCommitmentsCents += toCents(occurrence.amount);
      }
    }
  const days = new Set(work.map((r) => r.date)).size;
  const targetCents =
    d.settings.defaultTarget === 'minimum'
      ? planning.target.minimumMonthlyCents
      : d.settings.defaultTarget === 'accelerated'
        ? planning.target.acceleratedMonthlyCents
        : planning.target.idealMonthlyCents;
  const revision = options.revision ?? 1;
  const snapshot: MonthlyFinancialSnapshot = {
    period,
    closedAt: options.generatedAt,
    generatedAt: options.generatedAt,
    revision,
    snapshotRevision: revision,
    sourceVersion: 'reporting-1',
    sourceSignature: await reportSourceSignature(d, period),
    through,
    workIncomeCents,
    otherIncomeCents,
    incomeCents: workIncomeCents + otherIncomeCents,
    expenseCents,
    maintenanceCents,
    debtPaymentsCents,
    investmentContributionsCents,
    investmentWithdrawalsCents,
    investmentReturnCents,
    openingCashCents: opening.cashCents,
    closingCashCents: closing.cashCents,
    netCashFlowCents: closing.cashCents - opening.cashCents,
    openingNetWorthCents: opening.netCents,
    grossAssetsCents: closing.grossCents,
    liabilitiesCents: closing.liabilitiesCents,
    netWorthCents: closing.netCents,
    inflationRate,
    realNetWorthCents:
      inflationRate === null
        ? null
        : toCents(closing.netCents / 100 / (1 + inflationRate)),
    categories,
    expenseGroups,
    debtInterestCents,
    debtPrincipalReductionCents,
    budgetSummary: planning.budget.rows.map((r) => ({
      category: r.category,
      limitCents: r.limitCents,
      actualCents: r.actualCents,
      status: r.status,
    })),
    reserveSummary: {
      before: prior.reserve.coverage,
      after: planning.reserve.coverage,
      beforeCents: prior.reserve.totalCents,
      afterCents: planning.reserve.totalCents,
    },
    workSummary: {
      targetCents: targetCents > 0 ? targetCents : null,
      realizedCents: workIncomeCents,
      days,
      dailyCents: days ? Math.round(workIncomeCents / days) : null,
      percent: targetCents > 0 ? (workIncomeCents / targetCents) * 100 : null,
    },
    bridge: bridgeValue.factors,
    unexplainedCents: bridgeValue.unexplainedCents,
    subscriptionCents: subscriptions.reduce((s, r) => s + r.averageCents, 0),
    recurringCommitmentsCents,
    importedCount: uniqueLinks.filter((l) => l.transaction.date >= start)
      .length,
    dataCompleteness:
      !work.length &&
      !expenses.length &&
      !services.length &&
      !payments.length &&
      !movements.length &&
      !otherIncomeCents
        ? 'insufficient'
        : warnings.length
          ? 'partial'
          : 'complete',
    warnings,
  };
  if (snapshot.dataCompleteness === 'insufficient')
    snapshot.warnings.push(
      'Não há movimentos suficientes para caracterizar este mês.',
    );
  return structuredClone(snapshot);
}
export async function closeMonth(
  d: Data,
  period: string,
  options: {
    at: string;
    generatedAt: string;
    inflation?: InflationMonth[];
    allowPartial: boolean;
    reprocess?: boolean;
  },
) {
  const existing = d.reporting.closures.find((c) => c.period === period);
  if (periodBounds(period).end >= options.at)
    throw Error('O mês ainda está em andamento.');
  if (existing?.status === 'closed' && !options.reprocess)
    throw Error('Mês já fechado. Reabra ou reprocesse explicitamente.');
  if (existing && existing.revisions.length >= 100)
    throw Error('Limite de 100 revisões por mês atingido.');
  const snapshot = await buildMonthlySnapshot(d, period, {
    ...options,
    revision: (existing?.revisions.length ?? 0) + 1,
  });
  if (snapshot.dataCompleteness !== 'complete' && !options.allowPartial)
    throw Error('Confirme o fechamento com dados parciais.');
  const closure: MonthlyClosure = {
    period,
    status: 'closed',
    reopenedAt: existing?.reopenedAt ?? null,
    regeneratedAt: existing ? options.generatedAt : null,
    revisions: [...(existing?.revisions ?? []), snapshot],
  };
  const reporting = {
    closures: [
      ...d.reporting.closures.filter((c) => c.period !== period),
      closure,
    ],
  };
  validateReporting(reporting);
  return { ...d, reporting };
}
export function reopenMonth(d: Data, period: string, at: string): Data {
  const closure = d.reporting.closures.find((c) => c.period === period);
  if (!closure) throw Error('Fechamento não encontrado.');
  if (closure.status === 'reopened') return d;
  const reporting = {
    closures: d.reporting.closures.map((c) =>
      c === closure ? { ...c, status: 'reopened' as const, reopenedAt: at } : c,
    ),
  };
  validateReporting(reporting);
  return { ...d, reporting };
}

import { workProjection } from './work-projection';
import { type Data, type Row, num, today, validDate, debtTerms } from './model';
import { costs, debtState, plan, ratio, sum } from './calculations';

export function debtObligation(d: Data, r: Row, at: string) {
  const state = debtState(d, r, at),
    installment = debtTerms(r).installment;
  if (r.status === 'quitada' || state.balance <= 0)
    return { id: r.id, name: String(r.name), amount: 0, reason: 'Quitada' };
  if (installment <= 0)
    return {
      id: r.id,
      name: String(r.name),
      amount: 0,
      reason: 'Sem valor de parcela: obrigação não definida',
    };
  const ps = d.payments.filter(
    (p) => p.debtId === r.id && String(p.date) <= at,
  );
  const count =
    debtTerms(r).remaining || Math.ceil(debtTerms(r).balance / installment);
  if (!r.due || !validDate(String(r.due))) {
    const paid = sum(
      ps.filter(
        (p) =>
          String(p.date).slice(0, 7) === at.slice(0, 7) && p.kind === 'normal',
      ),
      'amount',
    );
    const amount = Math.min(state.balance, Math.max(0, installment - paid));
    return {
      id: r.id,
      name: String(r.name),
      amount,
      reason:
        'Sem vencimento: uma parcela mensal, abatidos pagamentos normais do mês',
    };
  }
  const due = String(r.due),
    months =
      (Number(at.slice(0, 4)) - Number(due.slice(0, 4))) * 12 +
      Number(at.slice(5, 7)) -
      Number(due.slice(5, 7)) +
      1;
  const dueCount = Math.min(count, Math.max(0, months));
  const normal = ps.filter((p) => p.kind === 'normal'),
    extras = ps.filter((p) => p.kind === 'extra');
  // Installment counts advance the schedule; partial normal payments credit the same obligation once.
  const credited = Math.max(
    sum(ps, 'installments') * installment,
    sum(normal, 'amount') + sum(extras, 'installments') * installment,
  );
  const amount = Math.min(
    state.balance,
    Math.max(
      0,
      Math.min(debtTerms(r).balance, dueCount * installment) - credited,
    ),
  );
  return {
    id: r.id,
    name: String(r.name),
    amount,
    reason:
      months <= 0
        ? 'Vencimento em mês futuro'
        : amount > 0
          ? 'Parcelas pendentes até o fim do mês, incluindo atrasadas'
          : 'Parcelas do período já pagas',
  };
}

export function calculateTargets(d: Data, at = today()) {
  const month = at.slice(0, 7),
    s = d.settings,
    c = costs(d),
    days = workProjection(d, at).days,
    kmMonthly = workProjection(d, at).kmDay * days;
  const groups = new Map<string, Row[]>();
  for (const r of d.expenses)
    if (r.recurrence !== 'única' && String(r.date) <= at) {
      const key = [r.name, r.category, r.recurrence]
        .map((v) => String(v).trim().toLocaleLowerCase())
        .join('|');
      groups.set(key, [...(groups.get(key) || []), r]);
    }
  const recurringItems = [...groups.values()].map((rows) => {
    const latest = [...rows].sort((a, b) =>
      String(b.date).localeCompare(String(a.date)),
    )[0];
    const monthly =
      num(latest.amount) / (latest.recurrence === 'anual' ? 12 : 1);
    const paid = Math.min(
      monthly,
      sum(
        rows.filter((r) => String(r.date).slice(0, 7) === month),
        'amount',
      ),
    );
    return {
      name: String(latest.name),
      monthly,
      paid,
      remaining: Math.max(0, monthly - paid),
    };
  });
  const recurringGross = recurringItems.reduce((a, r) => a + r.monthly, 0),
    recurringPaid = recurringItems.reduce((a, r) => a + r.paid, 0);
  const fixedExpenses =
    s.expenseBaseMode === 'adicional às recorrentes'
      ? num(s.essential)
      : Math.max(0, num(s.essential) - recurringGross);
  const recurringEssentialExpenses = recurringGross - recurringPaid;
  const debtItems = d.debts.map((r) => debtObligation(d, r, at));
  const mandatoryDebtPayments = debtItems.reduce((a, r) => a + r.amount, 0);
  const fuelCosts = kmMonthly * c.fuel;
  const otherMotoProvision = kmMonthly * Math.max(0, c.reserve - c.maintenance);
  const otherRequiredCosts = 0; // Per-km forecasts are future provisions, not payments due.
  const requiredOperatingCosts = fuelCosts + otherRequiredCosts;
  const maintenanceProvision = kmMonthly * c.maintenance;
  const plannedInvestmentGoal = num(s.reserveMonth);
  const investmentsPaid = sum(
    d.movements.filter(
      (r) =>
        r.kind === 'aporte' &&
        String(r.date).slice(0, 7) === month &&
        String(r.date) <= at,
    ),
    'amount',
  );
  const plannedInvestments = Math.max(
    0,
    plannedInvestmentGoal - investmentsPaid,
  );
  const planItems = d.plans
    .filter((r) => r.status !== 'concluído')
    .map((r) => ({
      id: r.id,
      name: String(r.name),
      monthly: plan(r, at, d).monthly,
    }));
  const activePlanContributions = planItems.reduce((a, r) => a + r.monthly, 0);
  const extraDebtPayments = num(s.extra),
    extraGoalContributions = num(s.extraPlans),
    extraInvestments = num(s.extraInvestments);
  const minimumMonthly =
    fixedExpenses +
    recurringEssentialExpenses +
    mandatoryDebtPayments +
    requiredOperatingCosts;
  const idealPercent = num(s.idealTargetPercent ?? 20);
  const acceleratedPercent = num(s.acceleratedTargetPercent ?? 40);
  const desiredIncomeTopUp = 0;
  const minimum = ratio(minimumMonthly, days);
  const ideal = minimum * (1 + idealPercent / 100);
  const accelerated = minimum * (1 + acceleratedPercent / 100);
  const idealMonthly = minimumMonthly * (1 + idealPercent / 100);
  const acceleratedMonthly = minimumMonthly * (1 + acceleratedPercent / 100);
  const breakdown = {
    fixedExpenses,
    recurringEssentialExpenses,
    mandatoryDebtPayments,
    requiredOperatingCosts,
    maintenanceProvision,
    otherMotoProvision,
    plannedInvestments,
    activePlanContributions,
    desiredIncomeTopUp,
    extraDebtPayments,
    extraGoalContributions,
    extraInvestments,
  };
  const warnings: string[] = [];
  if (!days)
    warnings.push(
      'Configure os dias de trabalho: os totais mensais estão disponíveis, mas não há divisor para as metas diárias.',
    );
  if (workProjection(d, at).kmDay > 0 && !c.configured)
    warnings.push(
      'Combustível incompleto: informe preço e consumo na aba Moto.',
    );
  if (!workProjection(d, at).kmDay && c.reserve > 0)
    warnings.push(
      'Há custos por km, mas os km planejados por dia estão zerados.',
    );
  for (const item of debtItems)
    if (item.reason.startsWith('Sem'))
      warnings.push(`${item.name}: ${item.reason}.`);
  if (
    !plannedInvestmentGoal &&
    (d.investments.length || num(s.emergencyMonths))
  )
    warnings.push(
      'Investimentos: aporte planejado mensal não configurado. Saldo investido e meta total de reserva não são parcelas mensais.',
    );
  return {
    idealPercent,
    acceleratedPercent,
    minimum,
    ideal,
    accelerated,
    hour: ratio(ideal, num(s.hoursDay)),
    minimumMonthly,
    idealMonthly,
    acceleratedMonthly,
    days,
    month,
    configured: days > 0,
    mandatory: fixedExpenses + recurringEssentialExpenses,
    installments: mandatoryDebtPayments,
    plans: activePlanContributions,
    moto: ratio(
      requiredOperatingCosts + maintenanceProvision + otherMotoProvision,
      days,
    ),
    breakdown,
    debtItems,
    planItems,
    recurringItems,
    recurringGross,
    recurringPaid,
    plannedInvestmentGoal,
    investmentsPaid,
    fuelCosts,
    otherRequiredCosts,
    kmMonthly,
    projectionSource: workProjection(d, at).source,
    warnings,
  };
}

export function targetBreakdownRows(t: ReturnType<typeof calculateTargets>) {
  const b = t.breakdown;
  return [
    {
      title: 'Meta mínima',
      monthly: t.minimumMonthly,
      daily: t.minimum,
      rows: [
        ['Despesas fixas / essenciais', b.fixedExpenses],
        ['Despesas recorrentes pendentes', b.recurringEssentialExpenses],
        ['Dívidas do período', b.mandatoryDebtPayments],
        ['Custos obrigatórios da moto', b.requiredOperatingCosts],
      ],
    },
    {
      title: 'Meta ideal',
      monthly: t.idealMonthly,
      daily: t.ideal,
      rows: [
        ['Meta mínima', t.minimumMonthly],
        [
          `Margem ideal (+${t.idealPercent}%)`,
          t.idealMonthly - t.minimumMonthly,
        ],
      ],
    },
    {
      title: 'Meta acelerada',
      monthly: t.acceleratedMonthly,
      daily: t.accelerated,
      rows: [
        ['Meta mínima', t.minimumMonthly],
        [
          `Margem acelerada (+${t.acceleratedPercent}%)`,
          t.acceleratedMonthly - t.minimumMonthly,
        ],
      ],
    },
  ] as {
    title: string;
    monthly: number;
    daily: number;
    rows: [string, number][];
  }[];
}

import { type Data, type Row, emptyRow, num, validDate } from '../model';
import {
  addMonths,
  daysBetween,
  debtState,
  investmentBalance,
} from '../calculations';
import { addDays } from './recurrences';
import { calculateNetWorth } from './net-worth';
import { assetRows } from './assets';
import { calculateOwnershipCost } from './ownership-cost';
import { planningPhaseTwo } from './planning-phase-two';
import { getCashFlowForecast } from './cash-flow';
import { calculateEmergencyFund, emergencyScenario } from './emergency-fund';
import { debtOpportunity } from './financial-intelligence';
import { nominalToReal } from './purchasing-power';
import { opportunityCost } from './opportunity-cost';
import {
  simulateFinancing,
  decisionMoney,
  decisionRate,
  monthlyToAnnual,
} from './financing-simulator';
import {
  type DecisionScenario,
  decisionLabels,
  vehicleCostLabels,
} from './decision-types';
import { toCents } from './money-codec';

export function validateDecision(s: DecisionScenario) {
  if (!Object.hasOwn(decisionLabels, s.type))
    throw Error('Tipo de decisão inválido.');
  if (!['cash', 'finance'].includes(s.payment))
    throw Error('Forma de pagamento inválida.');
  if (![0, 30, 90, 365, 730, 1825].includes(s.horizonDays))
    throw Error('Horizonte inválido.');
  for (const value of [
    s.amountCents,
    s.downPaymentCents,
    s.acquisitionCostsCents,
    s.saleCents,
    s.withdrawalCents,
    s.waitingContributionCents,
    s.waitingExtraCostCents,
    ...Object.values(s.vehicleCosts),
  ])
    if (value !== null) decisionMoney(value);
  for (const value of [
    s.monthlyRate,
    s.annualCet,
    s.annualReturn,
    s.annualInflation,
    s.annualDepreciation,
    s.oldAnnualDepreciation,
  ])
    decisionRate(value);
  if (s.annualDepreciation !== null && s.annualDepreciation > 1)
    throw Error('Depreciação anual não pode exceder 100%.');
  if (s.oldAnnualDepreciation !== null && s.oldAnnualDepreciation > 1)
    throw Error('Depreciação do veículo atual não pode exceder 100%.');
  if (
    s.incomeLossPercent !== null &&
    (!Number.isFinite(s.incomeLossPercent) ||
      s.incomeLossPercent < 0 ||
      s.incomeLossPercent > 100)
  )
    throw Error('Redução de renda deve ficar entre 0 e 100%.');
  if (!Number.isInteger(s.waitMonths) || s.waitMonths < 1 || s.waitMonths > 60)
    throw Error('Espera deve ficar entre 1 e 60 meses.');
  if (
    !Number.isInteger(s.installments) ||
    s.installments < 1 ||
    s.installments > 600
  )
    throw Error('Parcelas devem ficar entre 1 e 600.');
}
const simulatedRow = (
  kind: Parameters<typeof emptyRow>[0],
  id: string,
  values: Partial<Row>,
): Row => ({ ...emptyRow(kind), id, ...values });

export function simulateDecision(
  current: Data,
  scenario: DecisionScenario,
  at: string,
) {
  validateDecision(scenario);
  if (!validDate(at)) throw Error('Data inválida.');
  const s = scenario,
    d = structuredClone(current);
  const warnings: string[] = [],
    assumptions = [
      'Cenário isolado: nenhum lançamento será aplicado.',
      'Retornos são hipóteses brutas; impostos e custos de resgate não são estimados.',
      'Meta dinâmica calculada para o próximo mês, com a agenda existente.',
      'Novos compromissos mensais começam um mês após a data de referência. Compromissos existentes preservam suas datas.',
    ];
  const missing: string[] = [];
  const requireValue = (value: number | null, label: string) => {
    if (value === null) throw Error(`Informe ${label}.`);
    return value;
  };
  const optionalCost = (value: number | null, label: string) => {
    if (value === null) missing.push(label);
    return value ?? 0;
  };
  const before = calculateNetWorth(current, at);
  const beforePlanning = planningPhaseTwo(current, at);
  const targetDate = addMonths(at.slice(0, 7) + '-01', 1);
  const targetBefore = planningPhaseTwo(current, targetDate).target;
  const baseline = getCashFlowForecast(
    current,
    at,
    Math.min(366, s.horizonDays),
  );
  let monthlyOperatingCents = 0,
    monthlyIncomeCents = 0,
    monthlyContributionCents = 0;
  let immediateSpendingCents = 0,
    newPrincipalCents = 0;
  let financing: ReturnType<typeof simulateFinancing> | null = null;
  let ownership: ReturnType<typeof calculateOwnershipCost> = null;
  let debtComparison: ReturnType<typeof debtOpportunity> = null;
  const recurrence = (
    key: string,
    kind: string,
    cents: number | null,
    startDate = addMonths(at, 1),
    frequency = 'mensal',
  ) => {
    if (cents === 0) return;
    d.recurrences.push(
      simulatedRow('recurrences', 'simulation:' + key, {
        name: 'Simulação: ' + key,
        kind,
        amount: cents === null ? null : cents / 100,
        startDate,
        frequency,
        category: 'simulação',
        status: 'ativa',
        sourceKind:
          kind === 'aporte' && s.investmentId ? 'investments' : 'nenhum',
        sourceId: kind === 'aporte' ? s.investmentId : '',
      }),
    );
  };
  const pay = (debtId: string, cents: number) => {
    const debt = d.debts.find((r) => r.id === debtId);
    if (!debt) throw Error('Selecione a dívida.');
    const balance = toCents(debtState(d, debt, at).balance);
    if (cents > balance) throw Error('Pagamento supera o saldo cadastrado.');
    d.payments.push(
      simulatedRow('payments', 'simulation:payment:' + debtId, {
        debtId,
        date: at,
        amount: cents / 100,
        installments: 0,
        kind: s.type === 'amortize' ? 'extra' : 'normal',
      }),
    );
    if (cents === balance)
      for (const rule of d.recurrences)
        if (rule.sourceKind === 'debts' && rule.sourceId === debtId)
          rule.status = 'finalizada';
    return debt;
  };
  const withdrawal = s.withdrawalCents ?? 0;
  if (withdrawal > 0 || s.type === 'withdrawal') {
    const amount =
      s.type === 'withdrawal'
        ? requireValue(s.amountCents, 'o valor da retirada')
        : withdrawal;
    const investment = d.investments.find((r) => r.id === s.investmentId);
    if (!investment) throw Error('Selecione o investimento de origem.');
    if (amount > toCents(investmentBalance(d, investment, at)))
      throw Error('Retirada supera o saldo disponível registrado.');
    d.movements.push(
      simulatedRow('movements', 'simulation:withdrawal', {
        investmentId: investment.id,
        date: at,
        kind: 'retirada',
        amount: amount / 100,
      }),
    );
    warnings.push(
      'Confirme prazo de resgate, impostos e taxas antes de executar a retirada.',
    );
    missing.push('custos líquidos e disponibilidade efetiva do resgate');
  }
  if (s.type === 'buy_asset' || s.type === 'trade_vehicle') {
    const price = requireValue(s.amountCents, 'o preço do bem');
    if (price <= 0) throw Error('Preço deve ser maior que zero.');
    if (s.type === 'trade_vehicle') {
      const old = assetRows(d).find(
        (r) => r.id === s.assetId && r.active === 'sim',
      );
      if (!old) throw Error('Selecione o veículo atual.');
      const sale = requireValue(s.saleCents, 'o valor de venda');
      ownership = calculateOwnershipCost(current, old.id, at);
      d.assets = [
        ...d.assets.filter((r) => r.id !== old.id),
        { ...old, active: 'não', soldAt: at, cashSale: 'não' },
      ];
      d.settings.openingCash = num(d.settings.openingCash) + sale / 100;
      if (old.financingDebtId) {
        const debt = d.debts.find((r) => r.id === old.financingDebtId);
        if (debt) pay(debt.id, toCents(debtState(d, debt, at).balance));
        warnings.push(
          'Venda considera quitação pelo saldo cadastrado, sem desconto bancário presumido.',
        );
      }
      missing.push('cancelamento dos custos futuros do veículo antigo');
      assumptions.push(
        'Custos antigos do forecast foram mantidos por prudência; ajuste a hipótese de custos novos para não somar uma substituição duas vezes.',
      );
    }
    const fees = optionalCost(s.acquisitionCostsCents, 'custos de aquisição');
    const down =
      s.payment === 'cash'
        ? price
        : requireValue(s.downPaymentCents, 'a entrada');
    if (down > price) throw Error('Entrada maior que preço.');
    d.settings.openingCash = num(d.settings.openingCash) - (down + fees) / 100;
    immediateSpendingCents = down + fees;
    d.assets.push(
      simulatedRow('assets', 'simulation:asset', {
        name: s.name || 'Bem simulado',
        type: 'other',
        purchaseDate: at,
        purchasePriceCents: price,
      }),
    );
    d.assetValuations.push(
      simulatedRow('assetValuations', 'simulation:value', {
        assetId: 'simulation:asset',
        date: at,
        valueCents: price,
        sequence: 1,
        source: 'estimated',
      }),
    );
    assumptions.push(
      'Valor inicial do bem igual ao preço de compra; não é avaliação de mercado.',
    );
    if (s.payment === 'finance') {
      financing = simulateFinancing({
        priceCents: price,
        downPaymentCents: down,
        installments: s.installments,
        monthlyRate: s.monthlyRate,
        annualCet: s.annualCet,
      });
      newPrincipalCents = financing.principalCents;
      if (!financing.complete) {
        missing.push('taxa de financiamento');
        recurrence('financiamento', 'dívida', null, addMonths(at, 1));
      } else
        for (const item of financing.schedule)
          recurrence(
            'parcela ' + item.number,
            'dívida',
            item.paymentCents,
            addMonths(at, item.number),
            'única',
          );
      if (s.annualCet !== null)
        assumptions.push(
          'CET substitui juros. Custos de aquisição devem excluir encargos já incluídos no CET.',
        );
    }
    for (const [key, label] of Object.entries(vehicleCostLabels))
      monthlyOperatingCents += optionalCost(
        s.vehicleCosts[key as keyof typeof vehicleCostLabels],
        label,
      );
    if (monthlyOperatingCents > 0)
      recurrence('custos do bem', 'despesa', monthlyOperatingCents);
    if (s.annualDepreciation === null && s.horizonDays > 0)
      missing.push('depreciação futura do bem');
  } else if (s.type === 'one_off' || s.type === 'travel') {
    immediateSpendingCents = requireValue(s.amountCents, 'o gasto');
    d.expenses.push(
      simulatedRow('expenses', 'simulation:expense', {
        name: s.name,
        date: at,
        amount: immediateSpendingCents / 100,
        recurrence: 'única',
      }),
    );
  } else if (s.type === 'pay_debt' || s.type === 'amortize') {
    const debt = d.debts.find((r) => r.id === s.debtId);
    if (!debt) throw Error('Selecione a dívida.');
    immediateSpendingCents =
      s.type === 'pay_debt'
        ? toCents(debtState(d, debt, at).balance)
        : requireValue(s.amountCents, 'a amortização');
    pay(debt.id, immediateSpendingCents);
    debtComparison = debtOpportunity(
      monthlyToAnnual(num(debt.interest) / 100),
      s.annualReturn,
    );
    missing.push('proposta bancária de juros evitados/revisão das parcelas');
    assumptions.push(
      'Pagamento reduz o saldo conforme a regra atual. Não presume desconto nem recontratação do cronograma.',
    );
  } else if (s.type === 'monthly_expense') {
    monthlyOperatingCents = requireValue(s.amountCents, 'o custo mensal');
    if (monthlyOperatingCents > 0)
      recurrence('novo custo', 'despesa', monthlyOperatingCents);
  } else if (s.type === 'increase_income') {
    monthlyIncomeCents = requireValue(
      s.amountCents,
      'o aumento mensal de renda',
    );
    if (monthlyIncomeCents > 0)
      recurrence('renda adicional', 'receita', monthlyIncomeCents);
  } else if (s.type === 'reduce_income') {
    const percent = requireValue(
      s.incomeLossPercent,
      'o percentual de redução',
    );
    const incomes = d.recurrences.filter(
      (r) =>
        r.kind === 'receita' &&
        r.frequency === 'mensal' &&
        r.status === 'ativa',
    );
    if (!incomes.length)
      throw Error(
        'Cadastre uma previsão mensal de receita no Planejamento para simular sua redução.',
      );
    for (const row of incomes) {
      if (row.amount === null) {
        missing.push('valor da receita ' + row.name);
        continue;
      }
      const reduction = Math.round((toCents(num(row.amount)) * percent) / 100);
      monthlyIncomeCents -= reduction;
      if (reduction === toCents(num(row.amount))) row.status = 'finalizada';
      else row.amount = num(row.amount) - reduction / 100;
    }
    assumptions.push(
      'Redução aplicada apenas às receitas mensais previstas, preservando trabalho já realizado.',
    );
  } else if (s.type === 'increase_contribution') {
    monthlyContributionCents = requireValue(
      s.amountCents,
      'o aporte adicional',
    );
    if (monthlyContributionCents > 0)
      recurrence('aporte adicional', 'aporte', monthlyContributionCents);
  } else if (
    s.type === 'decrease_contribution' ||
    s.type === 'remove_expense'
  ) {
    const rule = d.recurrences.find(
      (r) =>
        r.id === s.recurrenceId &&
        r.frequency === 'mensal' &&
        r.status === 'ativa' &&
        r.kind === (s.type === 'remove_expense' ? 'despesa' : 'aporte'),
    );
    if (!rule || rule.amount === null)
      throw Error(
        'Selecione uma recorrência mensal ativa com valor conhecido.',
      );
    const reduction =
      s.type === 'remove_expense'
        ? toCents(num(rule.amount))
        : requireValue(s.amountCents, 'a redução do aporte');
    if (reduction > toCents(num(rule.amount)))
      throw Error('Redução maior que o compromisso atual.');
    if (reduction === toCents(num(rule.amount))) rule.status = 'finalizada';
    else rule.amount = num(rule.amount) - reduction / 100;
    if (s.type === 'remove_expense') monthlyOperatingCents = -reduction;
    else monthlyContributionCents = -reduction;
    assumptions.push(
      'Somente a previsão escolhida muda. Despesas históricas e pisos de custo de vida continuam preservados.',
    );
  }
  // New obligations change the explicit floor, while their recurrence supplies
  // timing to forecast. The existing target engine still owns the formula.
  d.settings.essential = Math.max(
    0,
    num(d.settings.essential) + monthlyOperatingCents / 100,
  );
  const afterBase = calculateNetWorth(d, at);
  const after = {
    ...afterBase,
    liabilitiesCents: afterBase.liabilitiesCents + newPrincipalCents,
    netCents: afterBase.netCents - newPrincipalCents,
    financialNetCents: afterBase.financialNetCents - newPrincipalCents,
    quickNetCents: afterBase.quickNetCents - newPrincipalCents,
  };
  const afterPlanning = planningPhaseTwo(d, at),
    targetAfter = planningPhaseTwo(d, targetDate).target;
  const forecast = getCashFlowForecast(d, at, Math.min(366, s.horizonDays));
  const debtMonthlyChange =
    targetAfter.components.debt - targetBefore.components.debt;
  const monthly =
    financing && !financing.complete
      ? null
      : monthlyOperatingCents +
        debtMonthlyChange +
        monthlyContributionCents -
        monthlyIncomeCents;
  const reserve = calculateEmergencyFund(d, at, {
    ...afterPlanning.living,
    minimumCents: Math.max(
      beforePlanning.living.minimumCents +
        monthlyOperatingCents +
        debtMonthlyChange,
      0,
    ),
  });
  if (financing && !financing.complete) {
    reserve.coverage = null;
    reserve.immediateCoverage = null;
    reserve.partial = true;
  }
  const horizonDate = addDays(at, s.horizonDays);
  let fullMonths = 0;
  while (addMonths(at, fullMonths + 1) <= horizonDate) fullMonths++;
  const monthStart = addMonths(at, fullMonths),
    nextMonth = addMonths(at, fullMonths + 1);
  const months =
    fullMonths +
    daysBetween(monthStart, horizonDate) / daysBetween(monthStart, nextMonth);
  const opportunity = opportunityCost(
    s.type === 'withdrawal' ? (s.amountCents ?? 0) : immediateSpendingCents,
    s.annualReturn,
    months,
    s.annualInflation,
  );
  const contribution = opportunityCost(
    0,
    s.annualReturn,
    months,
    s.annualInflation,
    Math.abs(monthlyContributionCents),
  );
  const contributionRule = current.recurrences.find(
    (r) => r.id === s.recurrenceId && r.kind === 'aporte',
  );
  const destination =
    s.type === 'decrease_contribution' &&
    contributionRule?.sourceKind === 'investments'
      ? String(contributionRule.sourceId)
      : s.investmentId;
  const allocation = current.reserveAllocations.find(
    (r) => r.investmentId === destination,
  );
  const destinationInvestment = current.investments.find(
    (r) => r.id === destination,
  );
  const reserveDestination = allocation
    ? allocation.enabled === 'sim'
    : destinationInvestment?.category === 'reserva de emergência';
  const reserveIncrementCents =
    monthlyContributionCents === 0
      ? 0
      : !destinationInvestment || !contribution
        ? null
        : reserveDestination
          ? contribution.finalCents * Math.sign(monthlyContributionCents)
          : 0;
  const depreciationCents =
    s.annualDepreciation === null ||
    !['buy_asset', 'trade_vehicle'].includes(s.type)
      ? null
      : Math.round(
          (s.amountCents ?? 0) *
            (1 - (1 - s.annualDepreciation) ** (months / 12)),
        );
  const interestCents = financing?.complete
    ? financing.schedule
        .slice(0, Math.floor(months))
        .reduce((sum, r) => sum + r.interestCents, 0)
    : financing
      ? null
      : 0;
  const incrementalNetCents =
    interestCents === null
      ? null
      : after.netCents -
        before.netCents +
        Math.floor(months) * (monthlyIncomeCents - monthlyOperatingCents) -
        interestCents -
        (depreciationCents ?? 0) +
        (contribution?.potentialReturnCents ?? 0) *
          Math.sign(monthlyContributionCents);
  const real =
    incrementalNetCents === null
      ? null
      : nominalToReal(
          incrementalNetCents / 100,
          s.annualInflation,
          months / 12,
        );
  const incomeSamples = new Map<string, number>();
  for (const row of current.work)
    if (String(row.date) <= at && String(row.date) >= addMonths(at, -3))
      incomeSamples.set(
        String(row.date).slice(0, 7),
        (incomeSamples.get(String(row.date).slice(0, 7)) ?? 0) +
          toCents(num(row.revenue)),
      );
  const plannedIncome = current.recurrences.filter(
    (r) =>
      r.kind === 'receita' && r.frequency === 'mensal' && r.status === 'ativa',
  );
  const monthlyIncomeBase =
    plannedIncome.length && plannedIncome.every((r) => r.amount !== null)
      ? plannedIncome.reduce((sum, r) => sum + toCents(num(r.amount)), 0)
      : incomeSamples.size
        ? [...incomeSamples.values()].reduce((a, b) => a + b, 0) /
          incomeSamples.size
        : null;
  const firstNegative =
    forecast.days.find((day) => day.balance !== null && day.balance < 0)
      ?.date ?? null;
  if (!forecast.complete) missing.push('fluxo base incompleto');
  if (beforePlanning.living.partial) missing.push('histórico de custo de vida');
  if (!targetAfter.enabled) missing.push('agenda de trabalho para meta diária');
  if (s.horizonDays > 366) missing.push('fluxo completo além de 366 dias');
  if (
    s.annualReturn === null &&
    (immediateSpendingCents > 0 || monthlyContributionCents !== 0)
  )
    missing.push('retorno esperado');
  if (s.annualInflation === null && s.horizonDays > 0)
    missing.push('inflação para valores reais');
  if (after.cashCents < 0)
    warnings.push(
      'Caixa imediato negativo: a origem dos recursos não cobre a decisão.',
    );
  if (firstNegative)
    warnings.push(
      'Primeiro saldo negativo conhecido no fluxo: ' + firstNegative + '.',
    );
  const recovery =
    forecast.days.find(
      (day) =>
        day.date > at &&
        day.balance !== null &&
        toCents(day.balance) >= before.cashCents,
    )?.date ?? null;
  return {
    acquisitionTotalCents: ['buy_asset', 'trade_vehicle'].includes(s.type)
      ? financing && !financing.complete
        ? null
        : (s.amountCents ?? 0) +
          (s.acquisitionCostsCents ?? 0) +
          (financing?.interestCents ?? 0)
      : null,
    downPaymentCents: ['buy_asset', 'trade_vehicle'].includes(s.type)
      ? s.payment === 'cash'
        ? s.amountCents
        : s.downPaymentCents
      : null,
    before,
    after,
    difference: {
      cashCents: after.cashCents - before.cashCents,
      netCents: after.netCents - before.netCents,
      quickCents: after.quickNetCents - before.quickNetCents,
    },
    financing,
    ownership,
    debtComparison,
    monthly: {
      operatingCents: monthlyOperatingCents,
      incomeCents: monthlyIncomeCents,
      contributionCents: monthlyContributionCents,
      totalCents: monthly,
      paymentCents: financing?.paymentCents ?? null,
      pressurePercent:
        (!financing || financing.complete) &&
        monthlyIncomeBase &&
        monthlyIncomeBase > 0
          ? (Math.max(
              0,
              monthlyOperatingCents + (financing?.paymentCents ?? 0),
            ) /
              monthlyIncomeBase) *
            100
          : null,
    },
    target: { before: targetBefore, after: targetAfter, date: targetDate },
    reserve: { before: beforePlanning.reserve, after: reserve },
    emergency:
      monthlyIncomeBase === null || (financing && !financing.complete)
        ? null
        : emergencyScenario(
            reserve.totalCents,
            Math.max(
              0,
              beforePlanning.living.minimumCents +
                monthlyOperatingCents +
                debtMonthlyChange,
            ),
            Math.max(0, Math.round(monthlyIncomeBase ?? 0)),
            s.type === 'reduce_income' ? (s.incomeLossPercent ?? 0) : 0,
            0,
          ),
    forecast: {
      before: baseline,
      after: forecast,
      firstNegative,
      recovery: immediateSpendingCents > 0 ? recovery : null,
      fullHorizon: s.horizonDays <= 366,
    },
    longTerm: {
      months,
      opportunity,
      contribution,
      reserveIncrementCents,
      interestCents,
      depreciationCents,
      incrementalNetCents,
      realIncrementCents: real === null ? null : toCents(real),
    },
    completeness: missing.length ? ('partial' as const) : ('complete' as const),
    missing: [...new Set(missing)],
    assumptions,
    warnings,
  };
}

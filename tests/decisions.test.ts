import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow, type Data } from '../src/model';
import {
  simulateFinancing,
  annualToMonthly,
  monthlyToAnnual,
} from '../src/services/financing-simulator';
import { opportunityCost } from '../src/services/opportunity-cost';
import {
  emptyDecision,
  type DecisionScenario,
} from '../src/services/decision-types';
import { simulateDecision } from '../src/services/decision-simulator';
import { buyNowOrWait } from '../src/services/buy-now-or-wait';
import { getCashFlowForecast } from '../src/services/cash-flow';
const at = '2026-09-21';
const scenario = (
  changes: Partial<DecisionScenario> = {},
): DecisionScenario => ({
  ...emptyDecision(),
  amountCents: 2000000,
  acquisitionCostsCents: 0,
  annualReturn: 0,
  annualInflation: 0,
  annualDepreciation: 0,
  vehicleCosts: {
    insurance: 0,
    fuel: 0,
    maintenance: 0,
    ipva: 0,
    licensing: 0,
    parking: 0,
    other: 0,
  },
  ...changes,
});
function data(): Data {
  const d = defaults();
  d.settings.openingCash = 30000;
  d.settings.essential = 1000;
  d.planningSettings = [
    {
      ...emptyRow('planningSettings'),
      scheduleEnabled: 'sim',
      workWeekdays: 'seg,ter,qua,qui,sex,sab,dom',
    },
  ];
  return d;
}
void test('PRICE: taxa zero, entrada, prazo um e ajuste da última parcela', () => {
  const f = simulateFinancing({
    priceCents: 10000,
    downPaymentCents: 0,
    installments: 3,
    monthlyRate: 0,
    annualCet: null,
  });
  assert.deepEqual(
    f.schedule.map((r) => r.paymentCents),
    [3333, 3333, 3334],
  );
  assert.equal(f.schedule.at(-1)!.balanceCents, 0);
  assert.equal(f.interestCents, 0);
  assert.equal(
    simulateFinancing({
      priceCents: 10000,
      downPaymentCents: 2000,
      installments: 1,
      monthlyRate: 0.01,
      annualCet: null,
    }).schedule[0].paymentCents,
    8080,
  );
});
void test('PRICE: valor matemático, 60/600 parcelas e conservação de centavos', () => {
  for (const n of [60, 600]) {
    const f = simulateFinancing({
      priceCents: 1000000,
      downPaymentCents: 0,
      installments: n,
      monthlyRate: 0.01,
      annualCet: null,
    });
    assert.equal(
      f.paymentCents,
      Math.round((1000000 * 0.01) / (1 - 1.01 ** -n)),
    );
    assert.equal(
      f.schedule.reduce((sum, r) => sum + r.principalCents, 0),
      1000000,
    );
    assert.equal(
      f.schedule.reduce((sum, r) => sum + r.paymentCents, 0),
      f.totalCents,
    );
    assert.equal(f.schedule.at(-1)!.balanceCents, 0);
  }
});
void test('taxa equivalente composta e CET prevalece, inclusive zero explícito', () => {
  assert.ok(
    Math.abs(annualToMonthly(monthlyToAnnual(0.0169)) - 0.0169) < 1e-12,
  );
  const f = simulateFinancing({
    priceCents: 10000,
    downPaymentCents: 0,
    installments: 2,
    monthlyRate: 0.5,
    annualCet: 0,
  });
  assert.equal(f.interestCents, 0);
  assert.equal(f.monthlyRate, 0);
});
void test('financiamento desconhecido é parcial; entradas/taxas/prazos inválidos falham', () => {
  const base = {
    priceCents: 10000,
    downPaymentCents: 0,
    installments: 12,
    monthlyRate: null,
    annualCet: null,
  };
  assert.equal(simulateFinancing(base).paymentCents, null);
  for (const rate of [NaN, Infinity, -1, 11])
    assert.throws(() => simulateFinancing({ ...base, monthlyRate: rate }));
  for (const installments of [0, 1.1, 601])
    assert.throws(() => simulateFinancing({ ...base, installments }));
  assert.throws(() => simulateFinancing({ ...base, downPaymentCents: 10001 }));
  assert.throws(() => simulateFinancing({ ...base, priceCents: 1.01 }));
});
void test('oportunidade: zero, composto, fracionado, inflação e desconhecido', () => {
  assert.equal(opportunityCost(100000, 0, 12)!.potentialReturnCents, 0);
  assert.equal(opportunityCost(100000, 0.1, 24)!.finalCents, 121000);
  assert.equal(
    opportunityCost(100000, 0.1, 6, 0.05)!.finalCents,
    Math.round(100000 * Math.sqrt(1.1)),
  );
  assert.ok(opportunityCost(100000, 0.1, 6, 0.05)!.realCents! < 104881);
  assert.equal(opportunityCost(100000, null, 12), null);
  assert.throws(() => opportunityCost(1, 0, -1));
});
void test('compra à vista troca caixa por bem; apenas taxas reduzem patrimônio', () => {
  const d = data(),
    r = simulateDecision(d, scenario({ acquisitionCostsCents: 50000 }), at);
  assert.equal(r.difference.cashCents, -2050000);
  assert.equal(r.after.assetsCents, 2000000);
  assert.equal(r.difference.netCents, -50000);
  assert.equal(r.reserve.before.totalCents, r.reserve.after.totalCents);
});
void test('financiamento: ativo 50 mil, entrada 10 mil, passivo 40 mil', () => {
  const r = simulateDecision(
    data(),
    scenario({
      amountCents: 5000000,
      payment: 'finance',
      downPaymentCents: 1000000,
      monthlyRate: 0.01,
    }),
    at,
  );
  assert.equal(r.difference.cashCents, -1000000);
  assert.equal(r.difference.netCents, 0);
  assert.equal(r.after.liabilitiesCents - r.before.liabilitiesCents, 4000000);
  assert.ok(r.monthly.totalCents! > 0);
  assert.ok(r.financing!.interestCents! > 0);
  assert.ok(r.forecast.after.knownBalance < r.forecast.before.knownBalance);
});
void test('reserva é reduzida/esgotada somente pela retirada escolhida', () => {
  const d = data();
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'reserve',
      name: 'Reserva',
      date: '2026-01-01',
      balance: 10000,
      category: 'reserva de emergência',
    },
  ];
  for (const withdrawalCents of [0, 500000, 1000000]) {
    const r = simulateDecision(
      d,
      scenario({ investmentId: 'reserve', withdrawalCents }),
      at,
    );
    assert.equal(r.reserve.after.totalCents, 1000000 - withdrawalCents);
  }
  assert.throws(
    () =>
      simulateDecision(
        d,
        scenario({ investmentId: 'reserve', withdrawalCents: 1000001 }),
        at,
      ),
    /Retirada/,
  );
});
void test('novo compromisso recalcula meta e forecast sem alterar dados reais', () => {
  const d = data(),
    before = JSON.stringify(d),
    forecast = getCashFlowForecast(d, at, 30);
  const r = simulateDecision(
    d,
    scenario({ type: 'monthly_expense', amountCents: 50000 }),
    at,
  );
  assert.ok(r.target.after.minimumCents! > r.target.before.minimumCents!);
  assert.ok(r.forecast.after.knownBalance < r.forecast.before.knownBalance);
  assert.equal(JSON.stringify(d), before);
  assert.deepEqual(getCashFlowForecast(d, at, 30), forecast);
});
void test('todos os tipos válidos não mutam nem objetos congelados', () => {
  const d = data();
  d.debts = [
    {
      ...emptyRow('debts'),
      id: 'debt',
      name: 'Dívida',
      balance: 1000,
      installmentAmount: 100,
      due: at,
    },
  ];
  d.recurrences = [
    {
      ...emptyRow('recurrences'),
      id: 'income',
      name: 'Salário',
      kind: 'receita',
      amount: 3000,
      startDate: at,
      frequency: 'mensal',
    },
  ];
  const frozen = JSON.stringify(d);
  const freeze = (value: unknown): void => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  };
  freeze(d);
  for (const type of [
    'pay_debt',
    'amortize',
    'one_off',
    'travel',
    'increase_income',
    'reduce_income',
    'increase_contribution',
  ] as const)
    simulateDecision(
      d,
      scenario({
        type,
        debtId: 'debt',
        amountCents: 10000,
        incomeLossPercent: 100,
      }),
      at,
    );
  assert.equal(JSON.stringify(d), frozen);
});
void test('reduzir aporte e eliminar despesa afetam só previsões escolhidas', () => {
  const d = data();
  d.recurrences = [
    {
      ...emptyRow('recurrences'),
      id: 'r',
      name: 'Aporte',
      kind: 'aporte',
      amount: 200,
      startDate: at,
      frequency: 'mensal',
    },
  ];
  const r = simulateDecision(
    d,
    scenario({
      type: 'decrease_contribution',
      recurrenceId: 'r',
      amountCents: 10000,
    }),
    at,
  );
  assert.equal(r.monthly.contributionCents, -10000);
  assert.equal(d.recurrences[0].amount, 200);
  d.recurrences[0].kind = 'despesa';
  assert.equal(
    simulateDecision(
      d,
      scenario({ type: 'remove_expense', recurrenceId: 'r' }),
      at,
    ).monthly.operatingCents,
    -20000,
  );
});
void test('esperar: preço sem/com inflação, rendimento e aportes não são renda nova', () => {
  const d = data();
  const base = scenario({
    payment: 'finance',
    downPaymentCents: 1000000,
    monthlyRate: 0,
    waitingContributionCents: 10000,
  });
  const wait = buyNowOrWait(d, base, at);
  assert.equal(wait.futurePriceCents, 2000000);
  assert.equal(wait.savings!.finalCents, 1120000);
  assert.equal(wait.later!.financing!.principalCents, 880000);
  assert.equal(wait.later!.difference.netCents, 0);
  const inflated = buyNowOrWait(
    d,
    { ...base, annualInflation: 0.1, annualReturn: 0.1 },
    at,
  );
  assert.equal(inflated.futurePriceCents, 2200000);
  assert.ok(inflated.savings!.potentialReturnCents > 0);
  assert.equal(
    buyNowOrWait(d, { ...base, annualReturn: null }, at).completeness,
    'insufficient',
  );
});
void test('horizonte longo não finge forecast completo nem taxa zero desconhecida', () => {
  const r = simulateDecision(
    data(),
    scenario({
      horizonDays: 1825,
      payment: 'finance',
      downPaymentCents: 0,
      monthlyRate: null,
    }),
    at,
  );
  assert.equal(r.forecast.fullHorizon, false);
  assert.equal(r.completeness, 'partial');
  assert.equal(r.monthly.totalCents, null);
  assert.equal(r.longTerm.incrementalNetCents, null);
  assert.equal(r.reserve.after.coverage, null);
  assert.equal(r.monthly.pressurePercent, null);
  assert.equal(r.emergency, null);
});
void test('100 cenários de 60 parcelas e 5 anos', (t) => {
  const d = data(),
    start = performance.now();
  for (let i = 0; i < 100; i++) {
    const r = simulateDecision(
      d,
      scenario({
        horizonDays: 1825,
        payment: 'finance',
        downPaymentCents: i * 100,
        monthlyRate: 0.01,
      }),
      at,
    );
    assert.equal(r.financing!.schedule.length, 60);
  }
  const ms = performance.now() - start;
  t.diagnostic(`100 cenários: ${ms.toFixed(1)} ms`);
  assert.ok(ms < 10000);
});

void test('troca vende o ativo e quita financiamento sem duplicar principal', () => {
  const d = data();
  d.debts = [
    {
      ...emptyRow('debts'),
      id: 'loan',
      name: 'Financiamento atual',
      totalInstallments: 10,
      installmentAmount: 500,
      paidInstallments: 0,
      due: at,
    },
  ];
  d.assets = [
    {
      ...emptyRow('assets'),
      id: 'vehicle',
      name: 'Veículo atual',
      type: 'car',
      purchaseDate: '2026-01-01',
      purchasePriceCents: 1600000,
      financingDebtId: 'loan',
    },
  ];
  d.assetValuations = [
    {
      ...emptyRow('assetValuations'),
      id: 'valuation',
      assetId: 'vehicle',
      date: at,
      valueCents: 1600000,
      sequence: 1,
    },
  ];
  const before = JSON.stringify(d);
  const r = simulateDecision(
    d,
    scenario({
      type: 'trade_vehicle',
      assetId: 'vehicle',
      saleCents: 1600000,
      amountCents: 2800000,
    }),
    at,
  );
  assert.equal(r.difference.netCents, 0);
  assert.equal(r.difference.cashCents, -1700000);
  assert.equal(r.after.assetsCents, 2800000);
  assert.equal(r.after.liabilitiesCents, 0);
  const wait = buyNowOrWait(
    d,
    scenario({
      type: 'trade_vehicle',
      assetId: 'vehicle',
      saleCents: 1600000,
      amountCents: 2800000,
      waitMonths: 1,
      waitingContributionCents: 0,
      waitingExtraCostCents: 0,
      oldAnnualDepreciation: 0.12,
    }),
    at,
  );
  assert.ok(wait.later!.before.assetsCents < 1600000);
  assert.ok(wait.later!.before.liabilitiesCents < 500000);
  assert.equal(JSON.stringify(d), before);
});
void test('espera reutiliza fluxo e preserva contraparte patrimonial dos aportes', () => {
  const d = data();
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'reserve',
      name: 'Reserva',
      date: '2026-01-01',
      balance: 0,
      category: 'reserva de emergência',
    },
  ];
  d.recurrences = [
    {
      ...emptyRow('recurrences'),
      id: 'deposit',
      name: 'Aporte',
      kind: 'aporte',
      amount: 1000,
      frequency: 'mensal',
      startDate: at,
      sourceKind: 'investments',
      sourceId: 'reserve',
    },
  ];
  const r = buyNowOrWait(
    d,
    scenario({
      waitMonths: 2,
      waitingContributionCents: 0,
      waitingExtraCostCents: 0,
    }),
    at,
  );
  assert.equal(
    r.later!.before.cashCents,
    Math.round(r.waitingForecast.knownBalance * 100),
  );
  assert.equal(r.later!.before.netCents, 3000000);
  assert.ok(r.later!.reserve.before.totalCents > 0);
  assert.equal(
    buyNowOrWait(
      d,
      scenario({ waitMonths: 60, waitingContributionCents: 0 }),
      at,
    ).later,
    null,
  );
});
void test('entrada integral não cria parcelas vazias nem dívida artificial', () => {
  const r = simulateDecision(
    data(),
    scenario({
      payment: 'finance',
      downPaymentCents: 2000000,
      monthlyRate: null,
    }),
    at,
  );
  assert.equal(r.financing!.principalCents, 0);
  assert.equal(r.after.liabilitiesCents, 0);
});

void test('horizonte de 30 dias inclui a parcela na mesma data do mês seguinte', () => {
  const r = simulateDecision(
    data(),
    scenario({
      horizonDays: 30,
      payment: 'finance',
      downPaymentCents: 0,
      monthlyRate: 0.01,
    }),
    at,
  );
  assert.equal(r.longTerm.months, 1);
  assert.equal(
    r.longTerm.interestCents,
    r.financing!.schedule[0].interestCents,
  );
});

void test('aporte projeta reserva apenas quando há destino explicitamente reservado', () => {
  const d = data();
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'reserve',
      name: 'Reserva',
      date: '2026-01-01',
      balance: 0,
      category: 'reserva de emergência',
    },
  ];
  const s = scenario({
    type: 'increase_contribution',
    amountCents: 10000,
    horizonDays: 30,
    investmentId: 'reserve',
  });
  assert.equal(
    simulateDecision(d, s, at).longTerm.reserveIncrementCents,
    10000,
  );
  assert.equal(
    simulateDecision(d, { ...s, investmentId: '' }, at).longTerm
      .reserveIncrementCents,
    null,
  );
  assert.equal(
    simulateDecision(d, { ...s, annualReturn: null }, at).longTerm
      .reserveIncrementCents,
    null,
  );
});

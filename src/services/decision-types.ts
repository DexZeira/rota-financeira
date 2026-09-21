export const decisionLabels = {
  buy_asset: 'Comprar bem / veículo',
  trade_vehicle: 'Trocar veículo',
  pay_debt: 'Quitar dívida',
  amortize: 'Amortizar dívida',
  increase_contribution: 'Aumentar aporte',
  decrease_contribution: 'Diminuir aporte',
  monthly_expense: 'Nova despesa mensal',
  remove_expense: 'Eliminar despesa mensal',
  reduce_income: 'Reduzir renda',
  increase_income: 'Aumentar renda',
  withdrawal: 'Retirar investimento',
  one_off: 'Gasto único',
  travel: 'Viagem',
} as const;
export type DecisionType = keyof typeof decisionLabels;
export const vehicleCostLabels = {
  insurance: 'Seguro',
  fuel: 'Combustível',
  maintenance: 'Manutenção',
  ipva: 'IPVA',
  licensing: 'Licenciamento',
  parking: 'Estacionamento',
  other: 'Outros custos mensais',
} as const;
export type DecisionScenario = {
  name: string;
  type: DecisionType;
  horizonDays: number;
  amountCents: number | null;
  payment: 'cash' | 'finance';
  downPaymentCents: number | null;
  installments: number;
  monthlyRate: number | null;
  annualCet: number | null;
  acquisitionCostsCents: number | null;
  assetId: string;
  saleCents: number | null;
  debtId: string;
  investmentId: string;
  withdrawalCents: number | null;
  recurrenceId: string;
  annualReturn: number | null;
  annualInflation: number | null;
  annualDepreciation: number | null;
  oldAnnualDepreciation: number | null;
  waitingExtraCostCents: number | null;
  incomeLossPercent: number | null;
  vehicleCosts: Record<keyof typeof vehicleCostLabels, number | null>;
  waitMonths: number;
  waitingContributionCents: number | null;
};
export function emptyDecision(): DecisionScenario {
  return {
    name: 'Cenário base',
    type: 'buy_asset',
    horizonDays: 365,
    amountCents: null,
    payment: 'cash',
    downPaymentCents: null,
    installments: 60,
    monthlyRate: null,
    annualCet: null,
    acquisitionCostsCents: null,
    assetId: '',
    saleCents: null,
    debtId: '',
    investmentId: '',
    withdrawalCents: null,
    recurrenceId: '',
    annualReturn: null,
    annualInflation: null,
    annualDepreciation: null,
    oldAnnualDepreciation: null,
    waitingExtraCostCents: null,
    incomeLossPercent: null,
    vehicleCosts: {
      insurance: null,
      fuel: null,
      maintenance: null,
      ipva: null,
      licensing: null,
      parking: null,
      other: null,
    },
    waitMonths: 12,
    waitingContributionCents: null,
  };
}

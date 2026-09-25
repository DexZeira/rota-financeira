import type { MonthlyFinancialSnapshot as Snapshot } from './reporting-state';
export function explainFinancialChange(p: {
  openingCents: number;
  closingCents: number;
  incomeCents: number;
  expenseCents: number;
  debtPaymentsCents: number;
  investmentReturnCents: number;
  assetCashCents: number;
  assetChangeCents: number;
  debtBalanceChangeCents: number;
}) {
  const factors = [
    { label: 'Receitas registradas', amountCents: p.incomeCents },
    { label: 'Despesas e manutenção', amountCents: 0 - p.expenseCents },
    { label: 'Pagamentos de dívidas', amountCents: 0 - p.debtPaymentsCents },
    {
      label: 'Rendimentos e perdas registrados',
      amountCents: p.investmentReturnCents,
    },
    {
      label: 'Caixa de compras e vendas de bens',
      amountCents: p.assetCashCents,
    },
    {
      label: 'Variação dos bens (avaliações, entradas e saídas)',
      amountCents: p.assetChangeCents,
    },
    {
      label: 'Variação do saldo das dívidas',
      amountCents: p.debtBalanceChangeCents,
    },
  ];
  // Contributions and withdrawals transfer wealth; neither creates wealth.
  // A balance difference alone does not identify interest or principal repaid.
  return {
    factors,
    unexplainedCents:
      p.closingCents -
      p.openingCents -
      factors.reduce((s, r) => s + r.amountCents, 0),
  };
}
export function difference(current: number | null, previous: number | null) {
  return {
    absolute: current === null || previous === null ? null : current - previous,
    percent:
      current === null || previous === null || previous === 0
        ? null
        : ((current - previous) / Math.abs(previous)) * 100,
  };
}
export function compareMonths(current: Snapshot, previous: Snapshot) {
  const categories = [
    ...new Set([
      ...Object.keys(current.categories),
      ...Object.keys(previous.categories),
    ]),
  ]
    .map((category) => ({
      category,
      ...difference(
        current.categories[category] ?? 0,
        previous.categories[category] ?? 0,
      ),
      status: !Object.hasOwn(previous.categories, category)
        ? 'new'
        : !Object.hasOwn(current.categories, category)
          ? 'absent'
          : 'comparable',
    }))
    .sort((a, b) => Math.abs(b.absolute ?? 0) - Math.abs(a.absolute ?? 0));
  const values: [string, number | null, number | null][] = [
    ['Receitas', current.incomeCents, previous.incomeCents],
    ['Despesas', current.expenseCents, previous.expenseCents],
    [
      'Aportes',
      current.investmentContributionsCents,
      previous.investmentContributionsCents,
    ],
    ['Dívidas pagas', current.debtPaymentsCents, previous.debtPaymentsCents],
    ['Patrimônio', current.netWorthCents, previous.netWorthCents],
    [
      'Reserva',
      current.reserveSummary.afterCents,
      previous.reserveSummary.afterCents,
    ],
    [
      'Orçamento disponível',
      current.budgetSummary.length
        ? current.budgetSummary.reduce(
            (s, r) => s + r.limitCents - r.actualCents,
            0,
          )
        : null,
      previous.budgetSummary.length
        ? previous.budgetSummary.reduce(
            (s, r) => s + r.limitCents - r.actualCents,
            0,
          )
        : null,
    ],
    ['Trabalho', current.workIncomeCents, previous.workIncomeCents],
  ];
  return {
    categories,
    metrics: values.map(([label, now, before]) => ({
      label,
      ...difference(now, before),
    })),
  };
}
/** Missing months are not zero. Require contiguous saved months. */
export function movingAverage(
  snapshots: Snapshot[],
  end: string,
  count: 3 | 6 | 12,
) {
  const indexed = new Map(snapshots.map((s) => [s.period, s]));
  const last = Number(end.slice(0, 4)) * 12 + Number(end.slice(5)) - 1;
  const rows: Snapshot[] = [];
  for (let i = 0; i < count; i++) {
    const n = last - i;
    const p = `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
    const row = indexed.get(p);
    if (!row) return null;
    rows.push(row);
  }
  return {
    incomeCents: Math.round(
      rows.reduce((s, r) => s + r.incomeCents, 0) / count,
    ),
    expenseCents: Math.round(
      rows.reduce((s, r) => s + r.expenseCents, 0) / count,
    ),
    samples: count,
  };
}

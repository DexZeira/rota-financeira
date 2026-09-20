import { type Data, type Row, num, today, validDate } from '../model';
import {
  financial,
  targets,
  plan,
  investmentBalance,
  debtState,
  costs,
  addMonths,
} from '../calculations';
import { fromCents, toCents } from './money-codec';
import { getCashFlowForecast, type CashEvent } from './cash-flow';
import { addDays } from './recurrences';

/** Read-only boundary for new views. No snapshots, posting or external requests. */
export class FinancialQueryService {
  constructor(
    private readonly data: Data,
    readonly at = today(),
  ) {
    if (!validDate(at)) throw Error('Data de referência inválida.');
  }
  getCashFlowForecast(horizon: number) {
    return getCashFlowForecast(this.data, this.at, horizon);
  }
  getMonthlyExpenses(month = this.at.slice(0, 7)) {
    return fromCents(
      this.data.expenses
        .filter(
          (r) => String(r.date).startsWith(month) && String(r.date) <= this.at,
        )
        .reduce((s, r) => s + toCents(num(r.amount)), 0),
    );
  }
  getDebtSummary() {
    return this.data.debts.map((r) => debtState(this.data, r, this.at));
  }
  getNetWorth() {
    return {
      amount: financial(this.data, this.at).netWorth,
      source: 'Caixa + investimentos + valor cadastrado da moto − dívidas',
      status: 'registrado' as const,
    };
  }
  getGoalForecast() {
    return this.data.plans
      .filter((r) => r.status !== 'concluído')
      .map((r) => ({
        id: r.id,
        name: String(r.name),
        deadline: String(r.deadline),
        ...plan(r, this.at, this.data),
      }));
  }
  getMotorcycleCost() {
    return costs(this.data);
  }
  getInvestmentSummary() {
    return this.data.investments.map((r) => ({
      id: r.id,
      name: String(r.name),
      balance: investmentBalance(this.data, r, this.at),
      maturity: String(r.maturity || ''),
    }));
  }
  getWorkTarget() {
    const t = targets(this.data, this.at),
      selection = this.data.settings.defaultTarget;
    const selected =
      selection === 'minimum'
        ? t.minimum
        : selection === 'accelerated'
          ? t.accelerated
          : t.ideal;
    const work = this.data.work.filter((r) => r.date === this.at);
    const earned = fromCents(
      work.reduce((s, r) => s + toCents(num(r.revenue)), 0),
    );
    const hours = work.reduce((s, r) => s + num(r.hours), 0);
    const target = t.configured ? selected : null;
    const remaining =
      target === null
        ? null
        : Math.max(0, fromCents(toCents(target) - toCents(earned)));
    return {
      target,
      earned,
      remaining,
      hours,
      estimatedHours:
        remaining === 0
          ? 0
          : remaining !== null && earned > 0 && hours > 0
            ? remaining / (earned / hours)
            : null,
      status: 'estimado' as const,
    };
  }
  getToday() {
    const cash = financial(this.data, this.at),
      forecast = this.getCashFlowForecast(7);
    const reserve = this.data.investments
      .filter((r) => r.category === 'reserva de emergência')
      .reduce((s, r) => s + investmentBalance(this.data, r, this.at), 0);
    const essential = num(this.data.settings.essential);
    const next =
      forecast.events.find(
        (e) => e.direction === 'saída' && e.impact === 'caixa',
      ) ?? null;
    const alerts = [
      ...forecast.events
        .filter((e) => e.originalDate < this.at && e.impact === 'caixa')
        .map((e) => `${e.name}: previsão pendente desde ${e.originalDate}.`),
      ...(forecast.minimumBalance !== null && forecast.minimumBalance < 0
        ? ['O saldo projetado pode ficar negativo nos próximos 7 dias.']
        : []),
      ...(!forecast.complete
        ? [
            'Há compromissos sem valor, sem data ou fora da janela de revisão; a projeção está incompleta.',
          ]
        : []),
    ];
    return {
      available: cash.available,
      cash: cash.cash,
      reservedForBike: cash.fund,
      work: this.getWorkTarget(),
      next,
      reserve,
      reserveMonths: essential > 0 ? reserve / essential : null,
      reserveDays: essential > 0 ? (reserve / essential) * 30 : null,
      goals: this.getGoalForecast(),
      alerts,
      nextSevenDays: {
        income: forecast.income,
        outflow: forecast.outflow,
        net: fromCents(toCents(forecast.income) - toCents(forecast.outflow)),
        partial: !forecast.complete,
      },
    };
  }
  getCalendar(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('Mês inválido.');
    const first = month + '-01',
      last = addDays(addMonths(first, 1), -1);
    const future = this.getCashFlowForecast(90);
    const realized: CashEvent[] = [];
    const append = (
      rows: Row[],
      source: string,
      label: (r: Row) => string,
      direction: (r: Row) => 'entrada' | 'saída',
      field = 'amount',
    ) => {
      for (const r of rows.filter(
        (r) =>
          String(r.date) >= first &&
          String(r.date) <= last &&
          String(r.date) <= this.at,
      ))
        realized.push({
          id: `${source}:${r.id}`,
          date: String(r.date),
          originalDate: String(r.date),
          name: label(r),
          amount: num(r[field]),
          direction: direction(r),
          impact: source === 'planTransactions' ? 'alocação' : 'caixa',
          status: 'realizado',
          source,
          sourceId: r.id,
        });
    };
    append(
      this.data.work,
      'work',
      (r) => String(r.activity),
      () => 'entrada',
      'revenue',
    );
    append(
      this.data.expenses,
      'expenses',
      (r) => String(r.name),
      () => 'saída',
    );
    append(
      this.data.payments,
      'payments',
      (r) =>
        String(
          this.data.debts.find((x) => x.id === r.debtId)?.name || 'Pagamento',
        ),
      () => 'saída',
    );
    append(
      this.data.services,
      'services',
      (r) =>
        String(
          this.data.maintenance.find((x) => x.id === r.maintenanceId)?.name ||
            'Serviço',
        ),
      () => 'saída',
    );
    append(
      this.data.movements.filter(
        (r) => r.kind === 'aporte' || r.kind === 'retirada',
      ),
      'movements',
      (r) =>
        String(
          this.data.investments.find((x) => x.id === r.investmentId)?.name ||
            'Investimento',
        ),
      (r) => (r.kind === 'aporte' ? 'saída' : 'entrada'),
    );
    append(
      this.data.planTransactions,
      'planTransactions',
      (r) =>
        String(this.data.plans.find((x) => x.id === r.planId)?.name || 'Plano'),
      (r) => (r.kind === 'deposit' ? 'saída' : 'entrada'),
    );
    return {
      events: [
        ...realized,
        ...future.events.filter((e) => e.date >= first && e.date <= last),
      ],
      days: Array.from({ length: Number(last.slice(-2)) }, (_, i) => {
        const date = addDays(first, i),
          projected = future.days.find((d) => d.date === date);
        return {
          date,
          balance:
            date < this.at
              ? financial(this.data, date).cash
              : (projected?.balance ?? null),
          status:
            date < this.at ? ('realizado' as const) : ('previsto' as const),
          outsideHorizon: date > future.end,
        };
      }),
    };
  }
}

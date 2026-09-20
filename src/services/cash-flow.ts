import { type Data, type Row, num, validDate, debtTerms } from '../model';
import {
  financial,
  debtState,
  maintenanceState,
  investmentBalance,
  addMonths,
  daysBetween,
} from '../calculations';
import { toCents, fromCents } from './money-codec';
import {
  addDays,
  generateOccurrences,
  occurrenceId,
  recurrenceFirstDate,
} from './recurrences';

export type CashEvent = {
  id: string;
  date: string;
  originalDate: string;
  name: string;
  amount: number | null;
  direction: 'entrada' | 'saída';
  impact: 'caixa' | 'alocação' | 'aviso';
  status: 'realizado' | 'previsto' | 'estimado';
  source: string;
  sourceId: string;
  recurrenceId?: string;
  account?: string;
  overdue?: boolean;
};
export type CashDay = {
  date: string;
  knownBalance: number;
  balance: number | null;
  income: number;
  outflow: number;
  events: CashEvent[];
};
export function getForecastOpeningBalance(d: Data, at: string) {
  if (!validDate(at)) throw Error('Data de referência inválida.');
  return fromCents(toCents(financial(d, at).cash));
}
export function getCashFlowForecast(d: Data, at: string, horizon: number) {
  if (
    !validDate(at) ||
    !Number.isInteger(horizon) ||
    horizon < 0 ||
    horizon > 366
  )
    throw Error('Horizonte deve ficar entre 0 e 366 dias.');
  const end = addDays(at, horizon),
    events: CashEvent[] = [],
    warnings: string[] = [];
  const excludedSources = new Set(
    d.recurrences
      .filter((r) => r.sourceKind !== 'nenhum')
      .map((r) => `${r.sourceKind}:${r.sourceId}`),
  );
  const resolutions = new Set(
    d.forecastResolutions.map((r) =>
      occurrenceId(String(r.recurrenceId), String(r.occurrenceDate)),
    ),
  );
  let truncated = false,
    incomplete = false;
  let missingDateCount = 0;
  const push = (event: CashEvent) => {
    if (event.originalDate > end) return;
    if (events.length >= 10000) {
      truncated = true;
      return;
    }
    events.push({
      ...event,
      overdue: event.originalDate < at,
      date: event.originalDate < at ? at : event.originalDate,
    });
  };
  for (const rule of d.recurrences) {
    const firstDate = recurrenceFirstDate(rule);
    // Unreviewed occurrences before today remain explicit backlog, bounded to one year.
    const from = addDays(
      at,
      -Math.min(276, Math.max(0, daysBetween(firstDate, at))),
    );
    if (rule.status === 'ativa' && String(rule.startDate) < from) {
      incomplete = true;
      warnings.push(
        `${rule.name}: ocorrências anteriores a ${from} exigem revisão fora desta janela.`,
      );
    }
    for (const occurrence of generateOccurrences(rule, from, end)) {
      if (resolutions.has(occurrence.id)) continue;
      push({
        id: occurrence.id,
        date: occurrence.date,
        originalDate: occurrence.date,
        name: occurrence.name,
        amount: occurrence.amount,
        direction: occurrence.kind === 'receita' ? 'entrada' : 'saída',
        impact: occurrence.kind === 'plano' ? 'alocação' : 'caixa',
        status: 'previsto',
        source: 'recurrences',
        sourceId: rule.id,
        recurrenceId: rule.id,
        account: occurrence.account,
      });
    }
  }
  // Legacy recurrence describes a paid expense. The next matching period is an estimate.
  const groups = new Map<string, Row[]>();
  for (const row of d.expenses.filter(
    (r) => r.recurrence !== 'única' && String(r.date) <= at,
  )) {
    const key = [row.name, row.category, row.recurrence]
      .map((v) => String(v).trim().toLocaleLowerCase('pt-BR'))
      .join('|');
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  for (const group of groups.values()) {
    if (group.some((r) => excludedSources.has(`expenses:${r.id}`))) continue;
    const row = [...group].sort((a, b) =>
      String(b.date).localeCompare(String(a.date)),
    )[0];
    const step = row.recurrence === 'anual' ? 12 : 1;
    const difference =
      (Number(at.slice(0, 4)) - Number(String(row.date).slice(0, 4))) * 12 +
      Number(at.slice(5, 7)) -
      Number(String(row.date).slice(5, 7));
    for (let i = Math.max(1, Math.floor(difference / step)); ; i++) {
      const date = addMonths(String(row.date), i * step);
      if (date > end) break;
      if (
        date < at ||
        group.some((r) =>
          step === 12
            ? String(r.date).slice(0, 4) === date.slice(0, 4)
            : String(r.date).slice(0, 7) === date.slice(0, 7),
        )
      )
        continue;
      push({
        id: `expense:${row.id}:${date}`,
        date,
        originalDate: date,
        name: String(row.name),
        amount: num(row.amount),
        direction: 'saída',
        impact: 'caixa',
        status: 'estimado',
        source: 'expenses',
        sourceId: row.id,
      });
    }
  }
  for (const row of d.debts) {
    if (excludedSources.has(`debts:${row.id}`)) continue;
    const state = debtState(d, row, at),
      terms = debtTerms(row);
    if (state.balance <= 0) continue;
    if (!validDate(String(row.due)) || terms.installment <= 0) {
      incomplete = true;
      missingDateCount++;
      warnings.push(
        `${row.name}: dívida sem data ou parcela definida; não incluída no caixa projetado.`,
      );
      continue;
    }
    const installment = toCents(terms.installment),
      ps = d.payments.filter(
        (p) => p.debtId === row.id && String(p.date) <= at,
      );
    const credit = Math.max(
      ps.reduce((s, p) => s + num(p.installments) * installment, 0),
      ps.reduce(
        (s, p) =>
          s +
          (p.kind === 'normal'
            ? toCents(num(p.amount))
            : num(p.installments) * installment),
        0,
      ),
    );
    const count =
      terms.remaining || Math.ceil(terms.balance / terms.installment);
    let remaining = toCents(state.balance),
      start = Math.floor(credit / installment);
    const months = Math.max(
      0,
      (Number(at.slice(0, 4)) - Number(String(row.due).slice(0, 4))) * 12 +
        Number(at.slice(5, 7)) -
        Number(String(row.due).slice(5, 7)),
    );
    const overdueCount = Math.min(
      count,
      Math.max(0, months + (addMonths(String(row.due), months) < at ? 1 : 0)),
    );
    if (overdueCount > start) {
      const amount = Math.min(
        remaining,
        Math.max(0, overdueCount * installment - credit),
      );
      push({
        id: `debt:${row.id}:overdue`,
        date: at,
        originalDate: addMonths(String(row.due), start),
        name: `${row.name} · parcelas atrasadas`,
        amount: fromCents(amount),
        direction: 'saída',
        impact: 'caixa',
        status: 'previsto',
        source: 'debts',
        sourceId: row.id,
      });
      remaining -= amount;
      start = overdueCount;
    }
    for (let i = start; i < count && remaining > 0; i++) {
      const date = addMonths(String(row.due), i);
      if (date > end) break;
      const amount = Math.min(
        remaining,
        installment - Math.max(0, credit - i * installment),
      );
      if (amount <= 0) continue;
      push({
        id: `debt:${row.id}:${date}`,
        date,
        originalDate: date,
        name: String(row.name),
        amount: fromCents(amount),
        direction: 'saída',
        impact: 'caixa',
        status: 'previsto',
        source: 'debts',
        sourceId: row.id,
      });
      remaining -= amount;
    }
  }
  for (const row of d.maintenance) {
    if (excludedSources.has(`maintenance:${row.id}`)) continue;
    const state = maintenanceState(d, row, at);
    if (state.status === 'concluída' || state.status === 'não configurada')
      continue;
    const estimatedDate = Number.isFinite(state.days)
      ? addDays(at, Math.ceil(state.days))
      : null;
    const date =
      state.nextDate && (!estimatedDate || state.nextDate < estimatedDate)
        ? state.nextDate
        : estimatedDate;
    if (!date) {
      incomplete = true;
      missingDateCount++;
      warnings.push(`${row.name}: manutenção sem previsão de data.`);
      continue;
    }
    push({
      id: `maintenance:${row.id}:${date}`,
      date,
      originalDate: date,
      name: String(row.name),
      amount: num(row.estimated) > 0 ? num(row.estimated) : null,
      direction: 'saída',
      impact: 'caixa',
      status: 'estimado',
      source: 'maintenance',
      sourceId: row.id,
    });
  }
  for (const row of d.plans) {
    if (
      row.status === 'concluído' ||
      excludedSources.has(`plans:${row.id}`) ||
      !validDate(String(row.deadline))
    )
      continue;
    push({
      id: `plan:${row.id}`,
      date: String(row.deadline),
      originalDate: String(row.deadline),
      name: `${row.name} · prazo do objetivo`,
      amount: num(row.target),
      direction: 'saída',
      impact: 'aviso',
      status: 'previsto',
      source: 'plans',
      sourceId: row.id,
    });
  }
  for (const row of d.investments)
    if (validDate(String(row.maturity)) && String(row.maturity) >= at) {
      push({
        id: `maturity:${row.id}`,
        date: String(row.maturity),
        originalDate: String(row.maturity),
        name: `${row.name} · vencimento, resgate não presumido`,
        amount: investmentBalance(d, row, at),
        direction: 'entrada',
        impact: 'aviso',
        status: 'previsto',
        source: 'investments',
        sourceId: row.id,
      });
    }
  if (
    num(d.settings.reserveMonth) > 0 &&
    !d.recurrences.some((r) => r.kind === 'aporte')
  )
    warnings.push(
      'Aporte mensal configurado sem data: crie uma recorrência para incluí-lo no caixa futuro.',
    );
  if (
    d.costs.some((r) => ['seguro', 'documentação'].includes(String(r.category)))
  )
    warnings.push(
      'Previsões por km não são vencimentos. Cadastre recorrências com datas para seguro, IPVA e documentação.',
    );
  warnings.push(
    'Receitas futuras de trabalho entram somente quando cadastradas como previsão. Provisões e metas sem vencimento não são pagamentos automáticos.',
  );
  if (truncated)
    warnings.push(
      'Limite de 10 mil ocorrências atingido; reduza as regras ativas. Projeção incompleta.',
    );
  events.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  const byDate = new Map<string, CashEvent[]>();
  for (const event of events) {
    const bucket = byDate.get(event.date);
    if (bucket) bucket.push(event);
    else byDate.set(event.date, [event]);
  }
  let balance = toCents(getForecastOpeningBalance(d, at)),
    unknown = truncated || incomplete;
  const initialBalance = fromCents(balance),
    days: CashDay[] = [];
  let minimum = balance,
    minimumDate = at,
    income = 0,
    outflow = 0;
  for (let i = 0; i <= horizon; i++) {
    const date = addDays(at, i),
      daily = byDate.get(date) || [];
    let dailyIncome = 0,
      dailyOutflow = 0;
    for (const event of daily)
      if (event.impact === 'caixa') {
        if (event.amount === null) {
          unknown = true;
          continue;
        }
        const cents = toCents(event.amount);
        if (event.direction === 'entrada') dailyIncome += cents;
        else dailyOutflow += cents;
      }
    income += dailyIncome;
    outflow += dailyOutflow;
    balance += dailyIncome - dailyOutflow;
    if (balance < minimum) {
      minimum = balance;
      minimumDate = date;
    }
    days.push({
      date,
      knownBalance: fromCents(balance),
      balance: unknown ? null : fromCents(balance),
      income: fromCents(dailyIncome),
      outflow: fromCents(dailyOutflow),
      events: daily,
    });
  }
  const cashEvents = events.filter((e) => e.impact === 'caixa');
  const knownAmountCount = cashEvents.filter((e) => e.amount !== null).length;
  const unknownAmountCount = cashEvents.length - knownAmountCount;
  const totalCount = cashEvents.length + missingDateCount;
  const forecastCompleteness = {
    knownCount: knownAmountCount,
    unknownCount: unknownAmountCount + missingDateCount,
    knownAmountCount,
    unknownAmountCount,
    missingDateCount,
    totalCount,
    coveragePercent: totalCount
      ? Math.round((knownAmountCount / totalCount) * 100)
      : null,
    bounded: truncated || incomplete,
  };
  return {
    at,
    end,
    initialBalance,
    projectedBalance: unknown ? null : fromCents(balance),
    knownBalance: fromCents(balance),
    minimumBalance: unknown ? null : fromCents(minimum),
    minimumDate: unknown ? null : minimumDate,
    income: fromCents(income),
    outflow: fromCents(outflow),
    complete: !unknown,
    events,
    days,
    warnings,
    forecastCompleteness,
  };
}

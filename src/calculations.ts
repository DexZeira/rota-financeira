import { debtTerms } from './model';
import { assetCashDelta, assetValues } from './services/assets';
import { calculateTargets } from './target-sources';
import { componentMatches } from './component-matching';
import { type Data, type Row, num, today } from './model';
export const sum = (rows: Row[], key: string) => rows.reduce((a, r) => a + num(r[key]), 0);
export const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
export const progress = (a: number, b: number) => Math.max(0, Math.min(100, ratio(a, b) * 100));
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
export const addMonths = (date: string, months: number) => {
    const d = new Date(date + 'T12:00:00Z'), day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, end));
    return d.toISOString().slice(0, 10);
};
export function costs(d: Data) {
    const distance = num(d.bike.km) - num(d.bike.purchaseKm), depreciation = num(d.bike.purchaseValue) - num(d.bike.currentValue);
    const fuel = ratio(num(d.bike.fuelPrice), num(d.bike.efficiency));
    const maintenance = maintenanceSummary(d);
    const components = d.costs
        .filter((r) => !maintenance.replaced.has(r.id))
        .map((r): Row & { perKm: number } => ({
        ...r,
        perKm: ratio(num(r.amount), num(r.lifeKm)),
    }));
    for (const r of d.maintenance) {
        const m = maintenanceCosts(d, r);
        if (m.estimatedCostPerKm !== null)
            components.push({
                ...r,
                amount: r.estimated,
                lifeKm: m.lifeKm,
                perKm: m.estimatedCostPerKm,
            });
    }
    const reserve = components.reduce((s, r) => s + r.perKm, 0);
    const operating = fuel + reserve;
    return {
        fuel,
        reserve,
        maintenance: maintenance.totalEstimatedCostPerKm,
        operating,
        economic: operating + ratio(depreciation, distance),
        depreciation,
        depKm: ratio(depreciation, distance),
        depPercent: ratio(depreciation, num(d.bike.purchaseValue)) * 100,
        distance,
        components,
        configured: num(d.bike.efficiency) > 0 && num(d.bike.fuelPrice) > 0,
    };
}
export function workResult(revenue: number, km: number, hours: number, perKm: number) {
    const cost = km * perKm, profit = revenue - cost;
    return {
        revenue,
        km,
        hours,
        cost,
        profit,
        revenueHour: ratio(revenue, hours),
        revenueKm: ratio(revenue, km),
        profitHour: ratio(profit, hours),
        profitKm: ratio(profit, km),
    };
}
export function calculateWorkRevenues(r: Row) {
    const expected = r.activity === 'Entrega de cartões' &&
        typeof r.cardQuantity === 'number' &&
        typeof r.cardUnitValue === 'number'
        ? Math.round(r.cardQuantity * r.cardUnitValue * 100) / 100
        : null;
    return { expected, actual: num(r.revenue) };
}
export function updateCardWork(previous: Row, next: Row, automatic: boolean): Row {
    const { expected } = calculateWorkRevenues(next);
    return {
        ...next,
        expectedRevenue: expected,
        revenue: automatic &&
            expected !== null &&
            (previous.cardQuantity !== next.cardQuantity ||
                previous.cardUnitValue !== next.cardUnitValue ||
                previous.activity !== next.activity)
            ? expected
            : next.revenue,
    };
}
export function filterWork(rows: Row[], activity = 'todos', from = '', to = '', search = '') {
    return rows.filter((r) => (activity === 'todos' || r.activity === activity) &&
        (!from || String(r.date) >= from) &&
        (!to || String(r.date) <= to) &&
        [r.activity, r.notes, r.date]
            .join(' ')
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()));
}
export function cardSummary(rows: Row[], perKm: number) {
    const cards = rows.filter((r) => r.activity === 'Entrega de cartões');
    const known = cards.filter((r) => calculateWorkRevenues(r).expected !== null);
    const expected = known.reduce((s, r) => s + (calculateWorkRevenues(r).expected ?? 0), 0);
    const quantity = sum(known, 'cardQuantity');
    return {
        ...workResult(sum(cards, 'revenue'), sum(cards, 'km'), sum(cards, 'hours'), perKm),
        quantity,
        expected,
        unknown: cards.length - known.length,
        difference: sum(known, 'revenue') - expected,
        average: ratio(sum(known, 'revenue'), quantity),
        cardsHour: ratio(quantity, sum(known, 'hours')),
        cardsKm: ratio(quantity, sum(known, 'km')),
    };
}
export function debtState(d: Data, r: Row, at = today()): Row & {balance:number;paid:number;remaining:number;score:number;priority:string;reason:string;progress:number;status:string} {
    r = { ...r, ...debtTerms(r) };
    const payments = d.payments.filter((p) => p.debtId === r.id && String(p.date) <= at), paid = sum(payments, 'amount'), balance = Math.max(0, num(r.balance) - paid), remaining = Math.max(0, num(r.remaining) - sum(payments, 'installments'));
    const nextDue = r.due
        ? addMonths(String(r.due), sum(payments, 'installments'))
        : '';
    const due = nextDue ? daysBetween(at, nextDue) : Infinity;
    const score = (due < 0 ? 100 : due <= 7 ? 35 : 0) +
        num(r.interest) * 8 +
        ratio(num(r.installment), num(d.settings.essential) || 1) * 10 +
        ratio(1000, balance);
    const reasons = [
        due < 0 ? 'vencimento atrasado' : due <= 7 ? 'vencimento próximo' : '',
        num(r.interest) > 0 ? `juros de ${r.interest}% ao mês` : '',
        num(r.installment) > num(d.settings.essential) * 0.2 &&
            num(r.installment) > 0
            ? 'parcela relevante no orçamento'
            : '',
        balance > 0 ? 'saldo restante considerado' : '',
    ].filter(Boolean);
    return {
        ...r,
        due: nextDue,
        status: r.status === 'quitada' || balance === 0 ? 'quitada' : 'ativa',
        balance: r.status === 'quitada' ? 0 : balance,
        paid,
        remaining,
        score,
        priority: score >= 60 ? 'alta' : score >= 20 ? 'média' : 'baixa',
        reason: reasons.join('; ') || 'sem encargos ou vencimento informado',
        progress: progress(num(r.original) - balance, num(r.original)),
    };
}
export function prioritized(d: Data, strategy = 'otimizada') {
    return d.debts
        .map((r) => debtState(d, r))
        .filter((r) => r.balance > 0)
        .sort((a, b) => strategy === 'avalanche'
        ? num(b.interest) - num(a.interest)
        : strategy === 'bola de neve'
            ? a.balance - b.balance
            : strategy === 'saldo'
                ? b.balance - a.balance
                : strategy === 'vencimento'
                    ? String(a.due || '9999').localeCompare(String(b.due || '9999'))
                    : b.score - a.score);
}
export function investmentBalance(d: Data, r: Row, at = today()) {
    return ((String(r.date) <= at ? num(r.balance) : 0) +
        d.movements
            .filter((m) => m.investmentId === r.id && String(m.date) <= at)
            .reduce((s, m) => s +
            num(m.amount) *
                (['retirada', 'perda'].includes(String(m.kind)) ? -1 : 1), 0));
}
export function planTransactions(d: Data, planId: string) {
    return d.planTransactions.filter((t) => t.planId === planId);
}
export function plan(r: Row, at = today(), d?: Data) {
    let currentAmount = num(r.current);
    // Se existir uma coleção de transações e dados para consulta, calcular baseado em histórico
    if (d && r.id && Array.isArray(d.planTransactions)) {
        const transactions = d.planTransactions.filter((t) => t.planId === r.id && String(t.date) <= at);
        for (const t of transactions) {
            if (t.kind === 'deposit') {
                currentAmount += num(t.amount);
            }
            else if (t.kind === 'withdrawal') {
                currentAmount -= num(t.amount);
            }
        }
    }
    const target = Math.max(0, num(r.target) - (r.kind === 'próxima moto' ? num(r.bikeValue) : 0)), remaining = Math.max(0, target - currentAmount), days = r.deadline ? Math.max(1, daysBetween(at, String(r.deadline))) : 0;
    return {
        target,
        remaining,
        percent: progress(currentAmount, target),
        daily: ratio(remaining, days),
        weekly: ratio(remaining, days) * 7,
        monthly: ratio(remaining, days) * 30,
        overdue: r.deadline && String(r.deadline) < at && remaining > 0,
        current: currentAmount, // Adicionando o valor atual calculado com histórico
    };
}
export function maintenanceState(d: Data, r: Row, at = today()): Row & {lastKm:number;lastDate:string;nextKm:number|null;nextDate:string|null;kmLeft:number|null;days:number;average:number;status:string} {
    const last = d.services
        .filter((s) => s.maintenanceId === r.id && String(s.date) <= at)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || num(b.km) - num(a.km))[0];
    const lastKm = last ? num(last.km) : num(r.lastKm), lastDate = last ? String(last.date) : String(r.lastDate);
    const nextKm = num(r.nextKm) > lastKm
        ? num(r.nextKm)
        : (Boolean(last) || lastKm > 0 || Boolean(lastDate) || num(d.bike.km) === 0) && (num(r.intervalKm) || num(r.lifeKm)) > 0
            ? lastKm + (num(r.intervalKm) || num(r.lifeKm))
            : null;
    const nextDate = r.nextDate && String(r.nextDate) > lastDate
        ? String(r.nextDate)
        : lastDate && num(r.intervalMonths) > 0
            ? addMonths(lastDate, num(r.intervalMonths))
            : null;
    const kmLeft = nextKm === null ? null : nextKm - num(d.bike.km), dateDays = nextDate ? daysBetween(at, nextDate) : Infinity;
    const recent = d.work.filter((w) => String(w.date) <= at && daysBetween(String(w.date), at) < 30), average = sum(recent, 'km') / 30;
    const kmDays = kmLeft !== null && average > 0 ? kmLeft / average : Infinity;
    const days = Math.min(dateDays, kmDays);
    const status = r.status === 'concluída' && !last
        ? 'concluída'
        : nextKm === null && !nextDate
            ? 'não configurada'
            : dateDays < 0 || (kmLeft !== null && kmLeft < 0)
                ? 'atrasada'
                : dateDays <= num(d.settings.nearDays) ||
                    (kmLeft !== null && kmLeft <= num(d.settings.nearKm))
                    ? 'próxima'
                    : 'em dia';
    return {
        ...r,
        lastKm,
        lastDate,
        nextKm,
        nextDate,
        kmLeft,
        days,
        average,
        status,
    };
}
export function financial(d: Data, at = today()) {
    const before = (r: Row) => String(r.date) <= at;
    const work = d.work.filter(before), expenses = d.expenses.filter(before), services = d.services.filter(before), payments = d.payments.filter(before), movements = d.movements.filter(before);
    const revenue = sum(work, 'revenue'), spent = sum(expenses, 'amount') + sum(services, 'amount'), paid = sum(payments, 'amount');
    const contributions = sum(movements.filter((m) => m.kind === 'aporte'), 'amount'), withdrawals = sum(movements.filter((m) => m.kind === 'retirada'), 'amount');
    const cash = num(d.settings.openingCash) +
        revenue -
        spent -
        paid -
        contributions +
        withdrawals + assetCashDelta(d, at) / 100;
    const investments = d.investments.reduce((s, r) => s + investmentBalance(d, r, at), 0), debt = d.debts.reduce((s, r) => s + debtState(d, r, at).balance, 0);
    const fund = d.fund
        .filter(before)
        .reduce((s, r) => s + (r.kind === 'uso' ? -1 : 1) * num(r.amount), 0);
    return {
        cash,
        revenue,
        spent,
        paid,
        investments,
        debt,
        netWorth: cash + investments + assetValues(d, at).filter((r) => r.current).reduce((sum, r) => sum + (r.valueCents ?? 0)/100, 0) - debt,
        contributions,
        withdrawals,
        fund,
        available: cash - fund,
    };
}
export function targets(d: Data, at = today()) {
  return calculateTargets(d,at);
}
export function forecast(d: Data, horizon: number) {
    return d.maintenance
        .map((r) => maintenanceState(d, r))
        .filter((r) => !['concluída', 'não configurada'].includes(r.status) &&
        r.days <= horizon)
        .reduce((s, r) => s + num(r.estimated), 0);
}
export function maintenanceCosts(d: Data, r: Row) {
    const lifeKm = num(r.lifeKm) || num(r.intervalKm);
    const estimatedCostPerKm = lifeKm > 0 && num(r.estimated) > 0 ? num(r.estimated) / lifeKm : null;
    const history = d.services
        .filter((s) => s.maintenanceId === r.id && String(s.date) <= today())
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || num(a.km) - num(b.km));
    // The paid amount belongs to the installed part, whose life ends at the following replacement.
    const initial: Row[] = typeof r.value === 'number' &&
        r.lastDate &&
        (!history.length || String(r.lastDate) < String(history[0].date))
        ? [{ id: 'initial', date: r.lastDate, km: r.lastKm, amount: r.value }]
        : [];
    const installations = [...initial, ...history];
    let actualCostPerKm: number | null = null, actualLifeKm: number | null = null, actualValue: number | null = null;
    for (let i = 1; i < installations.length; i++) {
        const previous = installations[i - 1], current = installations[i];
        const distance = num(current.km) - num(previous.km);
        if (distance > 0) {
            actualLifeKm = distance;
            actualValue = num(previous.amount);
            actualCostPerKm = actualValue / distance;
        }
    }
    return {
        lifeKm,
        estimatedCostPerKm,
        actualCostPerKm,
        actualLifeKm,
        actualValue,
        hasActualCost: actualCostPerKm !== null,
    };
}
export function maintenanceSummary(d: Data) {
    const items = d.maintenance.map((r) => ({
        ...r,
        name: r.name,
        costId: r.costId,
        estimated: r.estimated,
        ...maintenanceCosts(d, r),
    }));
    const validIds = new Set(items.filter(r => r.estimatedCostPerKm !== null).map(r => r.id));
    const replaced = new Set(componentMatches(d).filter(m => m.component && validIds.has(m.component.id)).map(m => m.cost.id));
    const legacy = d.costs
        .filter((r) => !replaced.has(r.id) &&
        !['seguro', 'documentação', 'outros'].includes(String(r.category)))
        .map((r) => ({
        ...r,
        name: r.name,
        costId: '',
        estimated: r.amount,
        ...maintenanceCosts(d, { ...r, estimated: r.amount }),
        actualCostPerKm: null,
        hasActualCost: false,
    }));
    const components = [...items, ...legacy];
    const actual = components.filter((r) => r.actualCostPerKm !== null);
    return {
        items: components,
        replaced,
        totalEstimatedCostPerKm: components.reduce((s, r) => s + (r.estimatedCostPerKm ?? 0), 0),
        totalActualCostPerKm: actual.length
            ? actual.reduce((s, r) => s + (r.actualCostPerKm ?? 0), 0)
            : null,
        actualCount: actual.length,
    };
}
export function simulate(d: Data, s: Row) {
    const c = costs(d), perKm = c.economic - c.fuel + ratio(num(s.gas), num(d.bike.efficiency)), daily = workResult(num(s.revenue), num(s.km), num(s.hours), perKm), days = num(d.settings.workDays), f = financial(d);
    const free = daily.profit * days - num(s.expenses) - num(s.extra) - num(s.contribution);
    return {
        ...daily,
        free,
        debt: Math.max(0, f.debt - num(s.extra)),
        plans: num(s.contribution),
        netWorth: f.netWorth + daily.profit * days - num(s.expenses),
        target: ratio(num(s.expenses) + num(s.extra) + num(s.contribution), days) +
            num(s.km) * perKm,
    };
}

import { defaultAliases } from '../component-matching';
import { validateAttribution, detachWorkExpense } from '../expense-allocation';
import { calculateWorkRevenues } from '../calculations';
import {
  debtTerms,
  collections,
  defaults,
  emptyRow,
  schemas,
  validateRow,
  num,
  today,
  type Data,
  type Collection,
  type Row,
} from '../model';
export const STORAGE_KEY = 'rota-financeira-v1';
export function validateData(value: unknown): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Estrutura de dados inválida.');
  const raw = value as Record<string, unknown>;
  if (
    raw.dataVersion !== 4 &&
    raw.dataVersion !== 3 &&
    raw.dataVersion !== 2 &&
    raw.dataVersion !== 1 &&
    raw.dataVersion !== 0
  )
    throw Error('Versão de dados incompatível.');
  const migrated = raw.dataVersion === 0;
  const result = defaults();
  for (const key of ['settings', 'bike', ...collections] as const) {
    const source = raw[key];
    if (
      key === 'planTransactions' &&
      source === undefined &&
      Number(raw.dataVersion) < 2
    )
      continue;
    if (source === undefined && !migrated)
      throw Error(`Backup incompleto: ${key}.`);
    if (source === undefined) continue;
    if (key === 'settings' || key === 'bike') {
      if (!source || typeof source !== 'object' || Array.isArray(source))
        throw Error(`Cadastro inválido: ${key}.`);
      const r = { ...emptyRow(key), ...source } as Row;
      validateRow(key, r);
      result[key] = r;
    } else {
      if (!Array.isArray(source) || source.length > 100000)
        throw Error(`Lista inválida: ${key}.`);
      const ids = new Set<string>();
      result[key] = source.map((item: unknown) => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
          throw Error(`Registro inválido: ${key}.`);
        const r = { ...emptyRow(key), ...item } as Row;
        if (key === 'maintenance' && !('aliases' in item))
          r.aliases = defaultAliases(r.name);
        if (key === 'work') {
          if (
            !('revenue' in item) &&
            typeof (item as Row).actualRevenue === 'number'
          )
            r.revenue = (item as Row).actualRevenue;
          r.expectedRevenue = calculateWorkRevenues(r).expected;
        }
        if (
          key === 'maintenance' &&
          Number(raw.dataVersion) < 3 &&
          num(r.value) === 0
        )
          r.value = null;
        if (key === 'plans' && !('status' in item)) {
          r.status = (item as Record<string, unknown>).completed
            ? 'concluído'
            : 'ativo';
        }
        if (
          key === 'planTransactions' &&
          !('notes' in item) &&
          typeof (item as Row).note === 'string'
        )
          r.notes = (item as Row).note;
        if (typeof r.id !== 'string' || !r.id || ids.has(r.id))
          throw Error(`ID inválido ou duplicado: ${key}.`);
        ids.add(r.id);
        validateRow(key, r);
        const allowed = new Set(['id', ...schemas[key].map((f) => f.key)]);
        // Older backups still carry these real debt terms; never discard them.
        if (key === 'debts') for (const field of ['original', 'installment', 'remaining']) {
          if (r[field] !== undefined && (typeof r[field] !== 'number' || !Number.isFinite(r[field]) || num(r[field]) < 0))
            throw Error('Condição de dívida inválida.');
          allowed.add(field);
        }
        return Object.fromEntries(
          Object.entries(r).filter(([k]) => allowed.has(k)),
        ) as Row;
      });
    }
  }
  result.dataVersion = 4;
  validateRelations(result);
  return result;
}
export function validateRelations(d: Data) {
  for (const r of [...d.expenses, ...d.services]) validateAttribution(r, d);
  for (const c of d.costs)
    if (c.matchMode === 'manual') {
      if (!d.maintenance.some((m) => m.id === c.componentId))
        throw Error('Selecione um componente existente para o vínculo manual.');
      if (
        d.maintenance.some((m) => m.costId === c.id && m.id !== c.componentId)
      )
        throw Error('A previsão já está vinculada a outro componente.');
    }

  const linked = new Set<string>();
  for (const r of d.maintenance)
    if (r.costId) {
      if (!d.costs.some((c) => c.id === r.costId))
        throw Error('Previsão da moto vinculada não encontrada.');
      if (linked.has(String(r.costId)))
        throw Error(
          'Uma previsão da moto só pode ser substituída por um item.',
        );
      linked.add(String(r.costId));
    }

  for (const key of [
    'work',
    'expenses',
    'payments',
    'services',
    'movements',
    'fund',
    'checklists',
    'planTransactions',
  ] as const)
    for (const r of d[key])
      if (String(r.date) > today())
        throw Error(
          'Registros reais não podem ter data futura. Use planos ou o simulador.',
        );
  for (const p of d.payments)
    if (!d.debts.some((r) => r.id === p.debtId))
      throw Error('Pagamento sem dívida correspondente.');
  for (const t of d.planTransactions)
    if (!d.plans.some((r) => r.id === t.planId))
      throw Error('Movimentação sem plano correspondente.');
  for (const p of d.plans) {
    let balance = num(p.current);
    for (const t of d.planTransactions
      .filter((t) => t.planId === p.id)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
      balance += num(t.amount) * (t.kind === 'withdrawal' ? -1 : 1);
      if (balance < -0.001)
        throw Error('Retirada supera o saldo guardado no plano.');
    }
  }
  for (const r of d.debts) {
    const ps = d.payments.filter((p) => p.debtId === r.id);
    if (ps.reduce((s, p) => s + num(p.amount), 0) > debtTerms(r).balance + 0.001)
      throw Error('Pagamentos superam o saldo da dívida.');
    if (ps.reduce((s, p) => s + num(p.installments), 0) > debtTerms(r).remaining)
      throw Error('Parcelas pagas superam as parcelas cadastradas.');
  }
  for (const m of d.movements)
    if (!d.investments.some((r) => r.id === m.investmentId))
      throw Error('Movimentação sem investimento correspondente.');
  for (const r of d.investments) {
    let balance = num(r.balance);
    for (const m of d.movements
      .filter((m) => m.investmentId === r.id)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
      if (String(m.date) < String(r.date))
        throw Error('Movimentação anterior ao saldo inicial do investimento.');
      balance +=
        num(m.amount) *
        (['retirada', 'perda'].includes(String(m.kind)) ? -1 : 1);
      if (balance < -0.001)
        throw Error('Retirada/perda supera o saldo do investimento.');
    }
  }
  for (const s of d.services) {
    if (!d.maintenance.some((r) => r.id === s.maintenanceId))
      throw Error('Serviço sem manutenção correspondente.');
    if (num(s.km) > num(d.bike.km) || num(s.km) < num(d.bike.purchaseKm))
      throw Error(
        'KM do serviço deve ficar entre o KM de compra e o KM atual da moto.',
      );
  }
  let fund = 0;
  for (const r of [...d.fund].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  )) {
    fund += num(r.amount) * (r.kind === 'uso' ? -1 : 1);
    if (fund < -0.001) throw Error('Uso da reserva supera o valor reservado.');
  }
}
export function upsert(d: Data, key: Collection, row: Row) {
  if (key === 'work')
    row = { ...row, expectedRevenue: calculateWorkRevenues(row).expected };
  validateRow(key, row);
  const next = {
    ...d,
    [key]: d[key].some((r) => r.id === row.id)
      ? d[key].map((r) => (r.id === row.id ? row : r))
      : [...d[key], row],
  };
  validateRelations(next);
  return next;
}
export function remove(d: Data, key: Collection, id: string) {
  const next = { ...d, [key]: d[key].filter((r) => r.id !== id) };
  if (key === 'costs')
    next.maintenance = d.maintenance.map((r) =>
      r.costId === id ? { ...r, costId: '' } : r,
    );
  if (key === 'work') {
    next.expenses = d.expenses.map((r) =>
      detachWorkExpense(
        r,
        d.work.filter((w) => w.id === id),
      ),
    );
    next.services = d.services.map((r) =>
      detachWorkExpense(
        r,
        d.work.filter((w) => w.id === id),
      ),
    );
  }
  if (key === 'maintenance')
    next.costs = d.costs.map((c) =>
      c.componentId === id
        ? { ...c, componentId: '', matchMode: 'automático' }
        : c,
    );
  if (key === 'debts')
    next.payments = d.payments.filter((r) => r.debtId !== id);
  if (key === 'investments')
    next.movements = d.movements.filter((r) => r.investmentId !== id);
  if (key === 'maintenance')
    next.services = d.services.filter((r) => r.maintenanceId !== id);
  if (key === 'plans')
    next.planTransactions = d.planTransactions.filter((r) => r.planId !== id);
  validateRelations(next);
  return next;
}
export type ResetKind = 'settings' | 'finance' | 'bike' | 'plans' | 'total';
export function resetData(d: Data, kind: ResetKind): Data {
  const fresh = defaults();
  if (kind === 'total') return fresh;
  if (kind === 'settings')
    return {
      ...d,
      settings: { ...fresh.settings, openingCash: d.settings.openingCash },
    };
  if (kind === 'finance')
    return {
      ...d,
      work: [],
      services: d.services.map((r) => detachWorkExpense(r, d.work)),
      expenses: [],
      debts: [],
      payments: [],
      investments: [],
      movements: [],
      settings: { ...d.settings, openingCash: 0 },
    };
  if (kind === 'bike')
    return {
      ...d,
      bike: fresh.bike,
      maintenance: [],
      services: [],
      costs: [],
      checklists: [],
      fund: [],
    };
  return { ...d, plans: [], planTransactions: [] };
}
export const backup = (d: Data) =>
  JSON.stringify(
    { version: 4, exportDate: new Date().toISOString(), data: d },
    null,
    2,
  );
export function parseBackup(text: string) {
  if (text.length > 20_000_000) throw Error('Arquivo maior que 20 MB.');
  const b = JSON.parse(text);
  if (
    b.version !== 4 &&
    b.version !== 3 &&
    b.version !== 2 &&
    b.version !== 1 &&
    b.version !== 0
  )
    throw Error('Versão do backup incompatível.');
  return validateData({
    ...b.data,
    dataVersion: b.data?.dataVersion ?? b.version,
  });
}
export function load(storage: Pick<Storage, 'getItem'>): Data {
  const text = storage.getItem(STORAGE_KEY);
  if (text) return validateData(JSON.parse(text));
  const legacy = storage.getItem('rota-financeira');
  return legacy
    ? validateData({ ...JSON.parse(legacy), dataVersion: 0 })
    : defaults();
}
export function save(storage: Pick<Storage, 'setItem'>, d: Data) {
  storage.setItem(STORAGE_KEY, JSON.stringify(d));
}
export function download(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

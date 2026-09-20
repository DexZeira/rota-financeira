import { defaultAliases } from '../component-matching';
import { decodeMoney, encodeMoney, serializeData, MONEY_SCHEMA_VERSION } from './money-codec';
import { validateAttribution, detachWorkExpense } from '../expense-allocation';
import { calculateWorkRevenues } from '../calculations';
import { recurrenceSources, realizedCollections, hasOccurrence, recurrenceAt, recurrenceHistory, reviseRecurrence, recurrenceSignature, occurrenceId } from './recurrences';
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
export const FUTURE_VERSION_ERROR = 'Estes dados foram criados por uma versão mais recente do Rota Financeira. Formato incompatível com esta versão; atualize o aplicativo.';
export function assertSupportedVersion(value: unknown) {
  if (!value || typeof value !== 'object') return;
  const raw = value as Record<string, unknown>;
  if ([raw.version, raw.dataVersion, raw.schemaVersion, raw.schema_version].some((v) => typeof v === 'number' && v > MONEY_SCHEMA_VERSION) || (typeof raw.planningVersion === 'number' && raw.planningVersion > 2)) throw Error(FUTURE_VERSION_ERROR);
  if (raw.data && typeof raw.data === 'object') assertSupportedVersion(raw.data);
}
export function validateData(value: unknown): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Estrutura de dados inválida.');
  assertSupportedVersion(value);
  if ((value as Record<string, unknown>).dataVersion === MONEY_SCHEMA_VERSION && ![1, 2].includes(Number((value as Record<string, unknown>).planningVersion)))
    throw Error('Backup incompleto: versão do planejamento ausente.');
  const raw = decodeMoney(value as Record<string, unknown>);
  if (raw.planningVersion !== undefined && raw.planningVersion !== 1 && raw.planningVersion !== 2)
    throw Error('Versão do planejamento incompatível.');
  // Additive metadata v1: old snapshots default to no inflation correction.
  // Original targets and balances are untouched; the v6 envelope adds planning.
  if (raw.intelligenceVersion !== undefined && raw.intelligenceVersion !== 1)
    throw Error('Versão da inteligência financeira incompatível.');
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
    if ((key === 'recurrences' || key === 'forecastResolutions') && source === undefined && raw.planningVersion === undefined) continue;
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
  const signatures = new Set<string>();
  const sources = new Set<string>();
  for (const rule of d.recurrences) {
    const history = recurrenceHistory(rule);
    if (history.length && (!rule.effectiveFrom || history.at(-1)!.until >= String(rule.effectiveFrom))) throw Error('Histórico de vigências sobreposto.');
    if (rule.status === 'ativa') {
      const signature = recurrenceSignature(rule);
      if (signatures.has(signature)) throw Error('Já existe uma recorrência ativa igual.');
      signatures.add(signature);
    }
    if (rule.sourceKind !== 'nenhum') {
      const key = recurrenceSources.find((k) => k === rule.sourceKind);
      if (!key || !d[key].some((r) => r.id === rule.sourceId)) throw Error('Origem da recorrência não encontrada.');
      const expected: Record<string, string> = { expenses: 'despesa', debts: 'dívida', maintenance: 'manutenção', plans: 'plano', investments: 'aporte' };
      if (rule.kind !== expected[key]) throw Error('Tipo de previsão incompatível com a origem.');
      const source = key + ':' + rule.sourceId;
      if (!rule.archived) {
        if (sources.has(source)) throw Error('Uma origem só pode ter uma regra de recorrência.');
        sources.add(source);
      }
    }
  }
  const occurrences = new Set<string>(), records = new Set<string>();
  for (const resolution of d.forecastResolutions) {
    const currentRule = d.recurrences.find((r) => r.id === resolution.recurrenceId);
    const date = String(resolution.occurrenceDate);
    if (!currentRule || !hasOccurrence(currentRule, date)) throw Error('Conferência sem ocorrência correspondente.');
    const rule = recurrenceAt(currentRule, date);
    const id = occurrenceId(rule.id, date);
    if (occurrences.has(id)) throw Error('Ocorrência já conferida.');
    occurrences.add(id);
    if (resolution.action === 'vincular') {
      const key = realizedCollections.find((k) => k === resolution.recordKind);
      const record = key && d[key].find((r) => r.id === resolution.recordId);
      const expected: Record<string, string> = { despesa: 'expenses', receita: 'work', dívida: 'payments', aporte: 'movements', plano: 'planTransactions', manutenção: 'services' };
      if (!key || !record || key !== expected[String(rule.kind)]) throw Error('Registro realizado incompatível com a previsão.');
      if ((key === 'movements' && record.kind !== 'aporte') || (key === 'planTransactions' && record.kind !== 'deposit')) throw Error('Vincule um aporte realizado.');
      const ref: Record<string, string> = { debts: 'debtId', investments: 'investmentId', maintenance: 'maintenanceId', plans: 'planId' };
      if (ref[String(rule.sourceKind)] && record[ref[String(rule.sourceKind)]] !== rule.sourceId) throw Error('O lançamento pertence a outra origem.');
      const recordKey = `${key}:${record.id}`;
      if (records.has(recordKey)) throw Error('Registro realizado já relacionado a outra ocorrência.');
      records.add(recordKey);
    } else if (resolution.recordId) throw Error('Ocorrência ignorada não deve ter lançamento vinculado.');
  }
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
export function upsert(d: Data, key: Collection, row: Row, at = today()) {
  if (key === 'recurrences') {
    const previous = d.recurrences.find((r) => r.id === row.id);
    const protectedChange = previous && schemas.recurrences.some((f) => !['status', 'effectiveFrom', 'scheduleHistory'].includes(f.key) && previous[f.key] !== row[f.key]);
    if (protectedChange && d.forecastResolutions.some((r) => r.recurrenceId === row.id && String(r.occurrenceDate) >= at))
      throw Error('Há ocorrências conferidas hoje ou no futuro. Desfaça essas conferências antes de alterar a regra; os lançamentos realizados serão preservados.');
    row = reviseRecurrence(previous, row, at);
  }
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
export function remove(d: Data, key: Collection, id: string, at = today()) {
  if (key === 'recurrences') {
    const row = d.recurrences.find((r) => r.id === id);
    if (!row || row.archived) return d;
    const archived = { ...reviseRecurrence(row, { ...row, status: 'finalizada' }, at), archived: 1 };
    const next = { ...d, recurrences: d.recurrences.map((r) => r.id === id ? archived : r) };
    validateRelations(next);
    return next;
  }
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
  next.recurrences = next.recurrences.map((r) => r.sourceKind === key && r.sourceId === id ? { ...r, sourceKind: 'nenhum', sourceId: '', status: r.archived ? 'finalizada' : 'pausada' } : r);
  next.forecastResolutions = next.forecastResolutions.filter((r) => r.action === 'ignorar' || realizedCollections.some((k) => k === r.recordKind && next[k].some((item) => item.id === r.recordId)));
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
  if (kind === 'finance') {
    const recurrences = d.recurrences.filter((r) => ['plans', 'maintenance'].includes(String(r.sourceKind)));
    return {
      ...d,
      work: [],
      services: d.services.map((r) => detachWorkExpense(r, d.work)),
      expenses: [],
      debts: [],
      payments: [],
      investments: [],
      movements: [],
      recurrences,
      forecastResolutions: d.forecastResolutions.filter((r) => recurrences.some((rule) => rule.id === r.recurrenceId) && (r.action === 'ignorar' || ['services', 'planTransactions'].includes(String(r.recordKind)))),
      settings: { ...d.settings, openingCash: 0 },
    };
  }
  if (kind === 'bike')
    return {
      ...d,
      bike: fresh.bike,
      maintenance: [],
      services: [],
      costs: [],
      checklists: [],
      fund: [],
      recurrences: d.recurrences.filter((r) => r.sourceKind !== 'maintenance'),
      forecastResolutions: d.forecastResolutions.filter((r) => r.recordKind !== 'services' && !d.recurrences.some((rule) => rule.id === r.recurrenceId && rule.sourceKind === 'maintenance')),
    };
  const recurrences = d.recurrences.filter((r) => r.sourceKind !== 'plans');
  return { ...d, plans: [], planTransactions: [], recurrences, forecastResolutions: d.forecastResolutions.filter((r) => r.recordKind !== 'planTransactions' && recurrences.some((rule) => rule.id === r.recurrenceId)) };
}
export const backup = (d: Data) =>
  JSON.stringify(
    { version: MONEY_SCHEMA_VERSION, exportDate: new Date().toISOString(), data: encodeMoney(d) },
    null,
    2,
  );
export function parseBackup(text: string) {
  if (text.length > 20_000_000) throw Error('Arquivo maior que 20 MB.');
  const b = JSON.parse(text);
  assertSupportedVersion(b);
  // Exact pre-migration snapshots are deliberately kept in their original raw format.
  if (b && b.version === undefined && b.dataVersion !== undefined) return validateData(b);
  if (
    b.version !== MONEY_SCHEMA_VERSION &&
    b.version !== 5 &&
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
export function save(storage: Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'getItem'>>, d: Data) {
  const current = storage.getItem?.(STORAGE_KEY);
  if (current) {
    let parsed: unknown;
    try { parsed = JSON.parse(current); } catch { /* exact corrupt bytes are archived below */ }
    assertSupportedVersion(parsed);
  }
  const normalized = validateData(JSON.parse(serializeData(d)));
  // Recompute derived fields after rounding their source records, before publishing bytes.
  const encoded = serializeData(normalized);
  const previous = storage.getItem?.(STORAGE_KEY) || storage.getItem?.('rota-financeira');
  const owner = storage.getItem?.('rota-cloud-owner') || 'guest';
  if (previous) {
    let version: unknown;
    try { version = JSON.parse(previous).planningVersion; } catch { /* preserve previous bytes */ }
    const key = `rota-money-before-migration:${version === 1 ? 'planning-v2' : 'planning-v1'}:${owner}`;
    if (version !== 2 && !storage.getItem?.(key)) storage.setItem(key, previous);
  }
  const intelligenceCopy = `rota-money-before-migration:intelligence-v1:${owner}`;
  if (previous) {
    let extensionVersion: unknown;
    try { extensionVersion = JSON.parse(previous).intelligenceVersion; } catch { /* preserve exact bytes */ }
    if (extensionVersion !== 1 && !storage.getItem?.(intelligenceCopy))
      storage.setItem(intelligenceCopy, previous);
  }
  const migrationKey = `rota-money-before-migration:${owner}`;
  // Archive exact previous bytes before upgrading the snapshot. Failure aborts the write.
  let previousVersion: unknown;
  try { previousVersion = previous ? JSON.parse(previous).dataVersion : undefined; } catch { /* Preserve corrupt bytes too. */ }
  if (previousVersion !== MONEY_SCHEMA_VERSION && !storage.getItem?.(migrationKey)) {
    storage.setItem(migrationKey, previous || JSON.stringify(d));
  }
  if (JSON.stringify(d) !== JSON.stringify(normalized)) {
    storage.setItem(`rota-money-rounding:${crypto.randomUUID()}`, JSON.stringify(d));
  }
  storage.setItem(STORAGE_KEY, encoded);
  return normalized;
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

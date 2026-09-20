import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { defaults, emptyRow, type Row } from '../src/model';
import {
  recurrenceDates,
  generateOccurrences,
} from '../src/services/recurrences';
import {
  getCashFlowForecast,
  getForecastOpeningBalance,
} from '../src/services/cash-flow';
import { FinancialQueryService } from '../src/services/financial-query';
import {
  backup,
  parseBackup,
  validateData,
  upsert,
  remove,
  resetData,
  save,
  STORAGE_KEY,
} from '../src/services/storage';
import { decode } from '../src/services/cloud-codec';
import {
  serializeSnapshot,
  resolveInitialSync,
  fingerprint,
} from '../src/services/sync-core';
const rule = (values: Partial<Row> = {}): Row => ({
  ...emptyRow('recurrences'),
  id: 'r',
  name: 'Internet',
  amount: 100,
  frequency: 'mensal',
  startDate: '2026-01-31',
  ...values,
});

void test('edição não reescreve conferência do próprio dia ou futura; pausa continua possível', () => {
  let d = defaults(); d.recurrences = [rule({ startDate: '2026-09-20' })];
  d = upsert(d, 'forecastResolutions', { ...emptyRow('forecastResolutions'), id: 'resolved', action: 'ignorar', recurrenceId: 'r', occurrenceDate: '2026-09-20' });
  for (const at of ['2026-09-19', '2026-09-20']) {
    assert.throws(() => upsert(d, 'recurrences', { ...d.recurrences[0], amount: 120 }, at), /ocorrências conferidas/);
    assert.doesNotThrow(() => upsert(d, 'recurrences', { ...d.recurrences[0], status: 'pausada' }, at));
  }
  assert.doesNotThrow(() => upsert(d, 'recurrences', { ...d.recurrences[0], amount: 120 }, '2026-09-21'));
});

void test('excluir arquiva regra: conserva pendências e conferências, interrompe só futuro', () => {
  let d = defaults(); d.recurrences = [rule({ startDate: '2026-01-10' })];
  d.expenses = [{ ...emptyRow('expenses'), id: 'paid', name: 'Internet', date: '2026-01-10', amount: 100 }];
  d = upsert(d, 'forecastResolutions', { ...emptyRow('forecastResolutions'), id: 'done', recurrenceId: 'r', occurrenceDate: '2026-01-10', recordKind: 'expenses', recordId: 'paid' });
  const archived = remove(d, 'recurrences', 'r', '2026-03-01');
  assert.deepEqual(archived.expenses, d.expenses); assert.deepEqual(archived.forecastResolutions, d.forecastResolutions);
  assert.equal(archived.recurrences[0].archived, 1);
  const f = getCashFlowForecast(archived, '2026-03-01', 90);
  assert.deepEqual(f.events.filter((e) => e.recurrenceId).map((e) => e.originalDate), ['2026-02-10']);
  assert.deepEqual(remove(archived, 'recurrences', 'r'), archived);
  assert.deepEqual(parseBackup(backup(archived)), archived);
});

void test('dias 28–31: último dia explícito, âncora restaurada e dezembro/janeiro', () => {
  for (const year of [2024, 2026])
    for (const day of [28, 29, 30, 31]) {
      const dates = recurrenceDates(
        rule({ startDate: `${year}-01-${day}` }),
        `${year}-01-01`,
        `${year + 1}-01-31`,
      );
      const lengths = [
        31,
        year === 2024 ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
        31,
      ];
      assert.deepEqual(
        dates,
        lengths.map(
          (last, i) =>
            `${year + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`,
        ),
      );
    }
});
void test('pause/resume conserva pendentes anteriores, sem recriar o intervalo pausado', () => {
  let d = defaults();
  d.recurrences = [rule({ startDate: '2026-01-01', frequency: 'diário' })];
  d = upsert(
    d,
    'recurrences',
    { ...d.recurrences[0], status: 'pausada' },
    '2026-01-03',
  );
  assert.deepEqual(
    recurrenceDates(d.recurrences[0], '2026-01-01', '2026-01-10'),
    ['2026-01-01', '2026-01-02'],
  );
  d = upsert(
    d,
    'recurrences',
    { ...d.recurrences[0], status: 'ativa' },
    '2026-01-06',
  );
  const expected = ['2026-01-01', '2026-01-02', '2026-01-06', '2026-01-07'];
  assert.deepEqual(
    recurrenceDates(d.recurrences[0], '2026-01-01', '2026-01-07'),
    expected,
  );
  const restored = parseBackup(backup(d));
  assert.deepEqual(
    recurrenceDates(restored.recurrences[0], '2026-01-01', '2026-01-07'),
    expected,
  );
  for (let i = 0; i < 10; i++) {
    const events = getCashFlowForecast(restored, '2026-01-07', 7).events;
    assert.equal(new Set(events.map((e) => e.id)).size, events.length);
    assert.deepEqual(
      events,
      getCashFlowForecast(restored, '2026-01-07', 7).events,
    );
  }
});
void test('editar valor e data afeta vigência atual; janeiro/fevereiro e conferências permanecem', () => {
  let d = defaults();
  d.recurrences = [rule({ startDate: '2026-01-10' })];
  d.expenses = ['01', '02'].map((m) => ({
    ...emptyRow('expenses'),
    id: m,
    name: 'Internet',
    amount: 100,
    date: `2026-${m}-10`,
  }));
  for (const expense of d.expenses)
    d = upsert(d, 'forecastResolutions', {
      ...emptyRow('forecastResolutions'),
      id: expense.id,
      recurrenceId: 'r',
      occurrenceDate: expense.date,
      recordKind: 'expenses',
      recordId: expense.id,
    });
  const history = JSON.stringify(d.expenses),
    resolutions = JSON.stringify(d.forecastResolutions);
  d = upsert(
    d,
    'recurrences',
    { ...d.recurrences[0], amount: 120, startDate: '2026-03-15' },
    '2026-03-01',
  );
  const occurrences = generateOccurrences(
    d.recurrences[0],
    '2026-01-01',
    '2026-04-30',
  );
  assert.deepEqual(
    occurrences.map((o) => [o.date, o.amount]),
    [
      ['2026-01-10', 100],
      ['2026-02-10', 100],
      ['2026-03-15', 120],
      ['2026-04-15', 120],
    ],
  );
  assert.equal(JSON.stringify(d.expenses), history);
  assert.equal(JSON.stringify(d.forecastResolutions), resolutions);
  assert.equal(getCashFlowForecast(d, '2026-03-01', 30).outflow, 120);
  assert.deepEqual(parseBackup(backup(d)), d);
  const wire = serializeSnapshot(d);
  assert.deepEqual(
    decode({
      data: wire,
      updated_at: '2026-03-01T00:00:00.123456Z',
      schema_version: 6,
      device_id: 'fixture',
    }).data,
    d,
  );
  assert.equal(JSON.stringify(remove(d, 'recurrences', 'r').expenses), history);
});
void test('obrigação de 500 afeta o caixa uma vez e desaparece das previsões após conferência', () => {
  let d = defaults();
  d.settings.openingCash = 1000;
  d.recurrences = [
    rule({ amount: 500, startDate: '2026-09-18', frequency: 'única' }),
  ];
  assert.equal(getCashFlowForecast(d, '2026-09-19', 7).events[0].overdue, true);
  d = upsert(d, 'expenses', {
    ...emptyRow('expenses'),
    id: 'paid',
    name: 'Conta',
    amount: 500,
    date: '2026-09-18',
  });
  d = upsert(d, 'forecastResolutions', {
    ...emptyRow('forecastResolutions'),
    id: 'ok',
    recurrenceId: 'r',
    occurrenceDate: '2026-09-18',
    recordKind: 'expenses',
    recordId: 'paid',
  });
  const forecast = getCashFlowForecast(d, '2026-09-19', 7);
  assert.equal(forecast.initialBalance, 500);
  assert.equal(forecast.projectedBalance, 500);
  assert.equal(forecast.outflow, 0);
});
void test('saldo-base usa caixa realizado, não disponível nem patrimônio; completude é explícita', () => {
  const d = defaults();
  d.settings.openingCash = 1000;
  d.fund = [
    { ...emptyRow('fund'), id: 'fund', amount: 100, date: '2026-09-19' },
  ];
  d.recurrences = [
    rule({ frequency: 'única', startDate: '2026-09-20', amount: null }),
    rule({
      id: 'known',
      frequency: 'única',
      startDate: '2026-09-20',
      amount: 200,
    }),
  ];
  assert.equal(getForecastOpeningBalance(d, '2026-09-19'), 1000);
  const q = new FinancialQueryService(d, '2026-09-19');
  assert.equal(q.getToday().available, 900);
  assert.equal(q.getToday().nextSevenDays.partial, true);
  assert.equal(q.getToday().nextSevenDays.net, -200);
  const completeness = q.getCashFlowForecast(180).forecastCompleteness;
  assert.equal(completeness.knownCount, 1);
  assert.equal(completeness.unknownCount, 1);
  assert.equal(completeness.coveragePercent, 50);
  for (const h of [-1, 1.5, 367, NaN])
    assert.throws(() => q.getCashFlowForecast(h));
});
void test('date-only mantém 10/10 em UTC, São Paulo e extremos de fuso', () => {
  for (const TZ of [
    'UTC',
    'America/Sao_Paulo',
    'Pacific/Honolulu',
    'Pacific/Kiritimati',
  ]) {
    const script = `const { emptyRow, brDate } = await import('./.test-output/src/model.js'); const { recurrenceDates } = await import('./.test-output/src/services/recurrences.js'); const r = {...emptyRow('recurrences'), id:'r', name:'Conta', startDate:'2026-10-10', amount:100, frequency:'mensal'}; process.stdout.write(JSON.stringify([brDate(r.startDate), recurrenceDates(r,'2026-10-01','2026-11-30')]));`;
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      { env: { ...process.env, TZ }, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [
      '10/10/2026',
      ['2026-10-10', '2026-11-10'],
    ]);
  }
});
void test('versão futura nunca sobrescreve snapshot local e mantém revisão cloud literal', () => {
  const d = defaults();
  const future = { ...JSON.parse(backup(d)), version: 7 };
  future.data.dataVersion = 7;
  const raw = JSON.stringify(future.data),
    entries = new Map([[STORAGE_KEY, raw]]);
  const store = {
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => {
      entries.set(k, v);
    },
  };
  assert.throws(
    () => parseBackup(JSON.stringify(future)),
    /versão mais recente/,
  );
  assert.throws(
    () =>
      decode({
        data: future,
        schema_version: 7,
        updated_at: 'revision',
        device_id: 'other',
      }),
    /versão mais recente/,
  );
  assert.throws(() => save(store, d), /versão mais recente/);
  assert.equal(entries.size, 1);
  assert.equal(entries.get(STORAGE_KEY), raw);
});
void test('migração planning v1 preserva bytes uma vez; repetição não altera snapshot', () => {
  const d = defaults();
  d.recurrences = [rule()];
  const prior = JSON.parse(backup(d)).data;
  prior.planningVersion = 1;
  delete prior.recurrences[0].effectiveFrom;
  delete prior.recurrences[0].scheduleHistory;
  const raw = JSON.stringify(prior),
    entries = new Map([[STORAGE_KEY, raw]]);
  const store = {
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => {
      entries.set(k, v);
    },
  };
  const migrated = validateData(prior);
  save(store, migrated);
  const first = entries.get(STORAGE_KEY);
  save(store, parseBackup(first!));
  assert.equal(entries.get(STORAGE_KEY), first);
  assert.equal(
    entries.get('rota-money-before-migration:planning-v2:guest'),
    raw,
  );
});
void test('500 recorrências / 90 dias: identidade única e execução limitada', (t) => {
  const d = defaults();
  d.recurrences = Array.from({ length: 500 }, (_, i) =>
    rule({ id: `r${i}`, name: `Conta ${i}`, startDate: '2026-09-19' }),
  );
  const start = performance.now();
  const f = getCashFlowForecast(d, '2026-09-19', 90);
  const elapsed = performance.now() - start;
  assert.equal(f.events.length, 1500);
  assert.equal(new Set(f.events.map((e) => e.id)).size, 1500);
  assert.ok(elapsed < 5000, `projeção demorou ${elapsed}ms`);
  t.diagnostic(
    `500 regras / 90 dias: ${elapsed.toFixed(1)} ms, ${f.events.length} ocorrências`,
  );
});

void test('previsão de manutenção respeita o primeiro prazo por km ou data', () => {
  const d = defaults();
  d.bike.km = 1000;
  d.work = [{ ...emptyRow('work'), id: 'w', date: '2026-09-19', km: 300 }];
  d.maintenance = [
    {
      ...emptyRow('maintenance'),
      id: 'm',
      name: 'Óleo',
      nextKm: 1020,
      nextDate: '2026-10-01',
      estimated: 100,
    },
  ];
  assert.equal(
    getCashFlowForecast(d, '2026-09-19', 30).events[0].originalDate,
    '2026-09-21',
  );
});
void test('ignorar e desfazer ocorrência não alteram realizados nem o caixa atual', () => {
  let d = defaults();
  d.settings.openingCash = 1000;
  d.recurrences = [rule({ startDate: '2026-09-20', frequency: 'única' })];
  d = upsert(d, 'forecastResolutions', {
    ...emptyRow('forecastResolutions'),
    id: 'ignored',
    recurrenceId: 'r',
    occurrenceDate: '2026-09-20',
    action: 'ignorar',
  });
  assert.equal(getCashFlowForecast(d, '2026-09-19', 7).projectedBalance, 1000);
  d = remove(d, 'forecastResolutions', 'ignored');
  const f = getCashFlowForecast(d, '2026-09-19', 7);
  assert.equal(f.projectedBalance, 900);
  assert.equal(f.initialBalance, 1000);
  assert.deepEqual(d.expenses, []);
});
void test('reset financeiro preserva conferência de manutenção que permanece realizada', () => {
  const d = defaults();
  d.bike.km = 1000;
  d.maintenance = [{ ...emptyRow('maintenance'), id: 'm', name: 'Óleo' }];
  d.services = [
    {
      ...emptyRow('services'),
      id: 's',
      maintenanceId: 'm',
      date: '2026-09-18',
      km: 1000,
      amount: 100,
    },
  ];
  d.recurrences = [
    rule({
      kind: 'manutenção',
      sourceKind: 'maintenance',
      sourceId: 'm',
      startDate: '2026-09-18',
      frequency: 'única',
    }),
  ];
  d.forecastResolutions = [
    {
      ...emptyRow('forecastResolutions'),
      id: 'resolved',
      recurrenceId: 'r',
      occurrenceDate: '2026-09-18',
      recordKind: 'services',
      recordId: 's',
    },
  ];
  const reset = validateData(resetData(validateData(d), 'finance'));
  assert.equal(reset.services.length, 1);
  assert.equal(reset.forecastResolutions.length, 1);
  assert.equal(
    getCashFlowForecast(reset, '2026-09-19', 0).events.filter(
      (e) => e.recurrenceId,
    ).length,
    0,
  );
});

void test('recorrência mensal conserva âncora 31 e respeita ano bissexto e dia explícito', () => {
  assert.deepEqual(recurrenceDates(rule(), '2026-01-01', '2026-03-31'), [
    '2026-01-31',
    '2026-02-28',
    '2026-03-31',
  ]);
  assert.deepEqual(
    recurrenceDates(
      rule({ startDate: '2024-01-31' }),
      '2024-02-01',
      '2024-02-29',
    ),
    ['2024-02-29'],
  );
  assert.deepEqual(
    recurrenceDates(rule({ dueDay: 10 }), '2026-01-01', '2026-03-31'),
    ['2026-02-10', '2026-03-10'],
  );
});
void test('frequências diárias, semanais, quinzenais, únicas e personalizadas', () => {
  for (const [frequency, interval, expected] of [
    ['diário', 1, 15],
    ['semanal', 7, 3],
    ['quinzenal', 14, 2],
    ['personalizado', 3, 5],
    ['única', 1, 1],
  ] as const) {
    assert.equal(
      recurrenceDates(
        rule({ frequency, intervalDays: interval, startDate: '2026-01-01' }),
        '2026-01-01',
        '2026-01-15',
      ).length,
      expected,
    );
  }
  for (const [frequency, expected] of [
    ['bimestral', 6],
    ['trimestral', 4],
    ['semestral', 2],
    ['anual', 1],
  ] as const)
    assert.equal(
      recurrenceDates(rule({ frequency }), '2026-01-01', '2026-12-31').length,
      expected,
    );
});
void test('fim inclusivo, pausa, intervalo inválido, janela limitada e idempotência', () => {
  const r = rule({ endDate: '2026-02-28' });
  assert.equal(recurrenceDates(r, '2026-01-01', '2026-03-31').length, 2);
  assert.deepEqual(
    recurrenceDates({ ...r, status: 'pausada' }, '2026-01-01', '2026-03-31'),
    [],
  );
  assert.throws(() =>
    recurrenceDates(
      rule({ frequency: 'personalizado', intervalDays: 0 }),
      '2026-01-01',
      '2026-02-01',
    ),
  );
  assert.throws(() => recurrenceDates(r, '2026-01-01', '2040-01-01'));
  assert.deepEqual(
    generateOccurrences(r, '2026-01-01', '2026-03-31'),
    generateOccurrences(r, '2026-01-01', '2026-03-31'),
  );
});
void test('fluxo não lança realizado; separa caixa e alocação e preserva centavos', () => {
  const d = defaults();
  d.settings.openingCash = 1000;
  d.recurrences = [
    rule({ startDate: '2026-09-20', frequency: 'única', amount: 100.01 }),
    rule({
      id: 'income',
      name: 'Trabalho previsto',
      kind: 'receita',
      frequency: 'única',
      startDate: '2026-09-21',
      amount: 200,
    }),
    rule({
      id: 'plan',
      name: 'Separar para plano',
      kind: 'plano',
      frequency: 'única',
      startDate: '2026-09-22',
      amount: 300,
    }),
  ];
  const before = JSON.stringify(d),
    result = getCashFlowForecast(d, '2026-09-19', 7);
  assert.equal(result.projectedBalance, 1099.99);
  assert.equal(result.minimumBalance, 899.99);
  assert.equal(result.minimumDate, '2026-09-20');
  assert.equal(result.days[2].balance, 1099.99);
  assert.equal(JSON.stringify(d), before);
  assert.equal(d.expenses.length, 0);
});
void test('valor desconhecido torna saldo incompleto, sem fallback zero', () => {
  const d = defaults();
  d.settings.openingCash = 1000;
  d.recurrences = [
    rule({ amount: null, frequency: 'única', startDate: '2026-09-20' }),
  ];
  const f = getCashFlowForecast(d, '2026-09-19', 7);
  assert.equal(f.days[0].balance, 1000);
  assert.equal(f.projectedBalance, null);
  assert.equal(f.complete, false);
  assert.equal(f.knownBalance, 1000);
  assert.equal(f.events[0].amount, null);
});
void test('dívida sem data e backlog fora da janela não produzem saldo completo', () => {
  const d = defaults();
  d.settings.openingCash = 1000;
  d.debts = [
    {
      ...emptyRow('debts'),
      id: 'debt',
      name: 'Sem vencimento',
      totalInstallments: 3,
      installmentAmount: 100,
    },
  ];
  assert.equal(getCashFlowForecast(d, '2026-09-19', 30).complete, false);
  d.debts = [];
  d.recurrences = [rule({ startDate: '2020-01-01' })];
  assert.equal(getCashFlowForecast(d, '2026-09-19', 30).projectedBalance, null);
});
void test('conferência explícita evita duplicação de realizado; exclusão libera a previsão', () => {
  let d = defaults();
  d.settings.openingCash = 1000;
  d.recurrences = [rule({ startDate: '2026-09-18', frequency: 'única' })];
  d = upsert(d, 'expenses', {
    ...emptyRow('expenses'),
    id: 'expense',
    name: 'Internet',
    date: '2026-09-18',
    amount: 100,
  });
  d = upsert(d, 'forecastResolutions', {
    ...emptyRow('forecastResolutions'),
    id: 'resolution',
    recurrenceId: 'r',
    occurrenceDate: '2026-09-18',
    recordKind: 'expenses',
    recordId: 'expense',
  });
  assert.equal(getCashFlowForecast(d, '2026-09-19', 0).projectedBalance, 900);
  assert.throws(
    () =>
      upsert(d, 'forecastResolutions', {
        ...d.forecastResolutions[0],
        id: 'duplicate',
      }),
    /conferida/,
  );
  const removed = remove(d, 'expenses', 'expense');
  assert.equal(removed.forecastResolutions.length, 0);
  assert.equal(
    getCashFlowForecast(removed, '2026-09-19', 0).projectedBalance,
    900,
  );
  assert.equal(remove(d, 'recurrences', 'r').expenses.length, 1);
});
void test('origens substituídas não duplicam previsões antigas; duplicatas e órfãos são rejeitados', () => {
  let d = defaults();
  d.expenses = [
    {
      ...emptyRow('expenses'),
      id: 'e',
      name: 'Internet',
      amount: 100,
      date: '2026-08-25',
      recurrence: 'mensal',
    },
  ];
  d.recurrences = [
    rule({ startDate: '2026-09-25', sourceKind: 'expenses', sourceId: 'e' }),
  ];
  const f = getCashFlowForecast(d, '2026-09-19', 15);
  assert.equal(f.events.filter((e) => e.impact === 'caixa').length, 1);
  assert.throws(() =>
    upsert(d, 'recurrences', { ...d.recurrences[0], id: 'copy' }),
  );
  assert.throws(() =>
    upsert(
      d,
      'recurrences',
      rule({ sourceKind: 'expenses', sourceId: 'missing' }),
    ),
  );
  d = remove(d, 'expenses', 'e');
  assert.equal(d.recurrences[0].status, 'pausada');
  assert.equal(d.recurrences[0].sourceId, '');
});
void test('dívidas respeitam parcial, extra, parcelas e saldo máximo sem inventar juros', () => {
  const d = defaults();
  d.debts = [
    {
      ...emptyRow('debts'),
      id: 'debt',
      name: 'Parcela',
      totalInstallments: 3,
      installmentAmount: 100,
      balance: 300,
      due: '2026-09-20',
    },
  ];
  d.payments = [
    {
      ...emptyRow('payments'),
      id: 'partial',
      debtId: 'debt',
      date: '2026-09-18',
      amount: 40,
      installments: 0,
    },
  ];
  const f = getCashFlowForecast(d, '2026-09-19', 90);
  assert.equal(f.outflow, 260);
  assert.equal(f.events[0].amount, 60);
  d.payments.push({
    ...emptyRow('payments'),
    id: 'extra',
    debtId: 'debt',
    date: '2026-09-18',
    kind: 'extra',
    amount: 50,
    installments: 0,
  });
  assert.equal(getCashFlowForecast(d, '2026-09-19', 90).outflow, 210);
});
void test('consultas reutilizam meta existente; calendário distingue realizado e previsto', () => {
  const d = defaults();
  d.settings.openingCash = 1000;
  d.settings.workDays = 20;
  d.work = [
    {
      ...emptyRow('work'),
      id: 'w',
      activity: 'Uber Moto',
      date: '2026-09-19',
      revenue: 200,
      hours: 4,
    },
  ];
  d.recurrences = [rule({ startDate: '2026-09-20', frequency: 'única' })];
  const query = new FinancialQueryService(d, '2026-09-19');
  assert.equal(query.getToday().work.earned, 200);
  assert.equal(query.getToday().reserveMonths, null);
  assert.equal(
    query.getCalendar('2026-09').events.filter((e) => e.status === 'realizado')
      .length,
    1,
  );
  assert.equal(
    query.getCalendar('2026-09').days.find((d) => d.date === '2026-09-20')!
      .balance,
    1100,
  );
});
void test('v5 migra para v6, restauração idempotente, envelope cloud e CAS preservados', () => {
  const d = defaults();
  const old = JSON.parse(backup(d));
  old.version = 5;
  old.data.dataVersion = 5;
  delete old.data.planningVersion;
  delete old.data.recurrences;
  delete old.data.forecastResolutions;
  const migrated = parseBackup(JSON.stringify(old));
  assert.deepEqual(migrated.recurrences, []);
  migrated.recurrences = [rule({ amount: 123.45 })];
  const wire = JSON.parse(backup(migrated));
  assert.equal(wire.version, 6);
  assert.equal(wire.data.recurrences[0].amount, 12345);
  const incomplete = JSON.parse(backup(migrated));
  delete incomplete.data.planningVersion;
  assert.throws(() => parseBackup(JSON.stringify(incomplete)), /incompleto/);
  assert.deepEqual(parseBackup(backup(migrated)), migrated);
  assert.deepEqual(validateData(validateData(migrated)), migrated);
  const revision = '2026-09-19T12:00:00.123456+00:00';
  const remote = decode({
    data: serializeSnapshot(migrated),
    schema_version: 6,
    updated_at: revision,
    device_id: 'fixture',
  });
  assert.equal(remote.updated_at, revision);
  assert.deepEqual(remote.data, migrated);
  assert.equal(
    resolveInitialSync(migrated, remote, fingerprint(migrated)),
    'equal',
  );
});
void test('migração protege bytes anteriores e quota impede sobrescrita; resets não deixam órfãos', () => {
  const d = defaults(),
    raw = JSON.parse(backup(d)).data;
  delete raw.planningVersion;
  delete raw.recurrences;
  delete raw.forecastResolutions;
  raw.dataVersion = 5;
  const before = JSON.stringify(raw),
    values = new Map([[STORAGE_KEY, before]]);
  const store = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, val: string) => {
      values.set(key, val);
    },
  };
  assert.throws(() =>
    save(
      {
        ...store,
        setItem: () => {
          throw new DOMException('full', 'QuotaExceededError');
        },
      },
      d,
    ),
  );
  assert.equal(store.getItem(STORAGE_KEY), before);
  save(store, d);
  assert.equal(
    store.getItem('rota-money-before-migration:planning-v1:guest'),
    before,
  );
  for (const kind of ['finance', 'plans', 'bike', 'total'] as const)
    assert.doesNotThrow(() => validateData(resetData(d, kind)));
});

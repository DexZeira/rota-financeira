import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow } from '../src/model';
import { FinancialQueryService } from '../src/services/financial-query';
import {
  queryNames,
  type FinancialAnswer,
  type AnswerData,
} from '../src/services/financial-answer';
import {
  DeterministicFinancialAssistant,
  assistantQuestions,
} from '../src/services/financial-assistant';
import {
  activateNotifications,
  deliverNotifications,
  notificationCandidates,
  type NotificationPort,
  validNotificationRoute,
} from '../src/services/local-notifications';
import {
  defaultNotificationPreferences,
  isQuietTime,
  validateNotificationPreferences,
} from '../src/services/notification-preferences';
import {
  backup,
  parseBackup,
  save,
  validateData,
  STORAGE_KEY,
  resetData,
} from '../src/services/storage';
import { closeMonth } from '../src/services/month-close';
import { decode } from '../src/services/cloud-codec';
const at = '2026-09-27';
function fixture() {
  const d = defaults();
  d.expenses = [
    {
      ...emptyRow('expenses'),
      id: 'expense',
      name: 'Mercado',
      amount: 100,
      date: '2026-09-10',
      category: 'alimentação',
      essentiality: 'essencial',
    },
  ];
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'reserve',
      name: 'Reserva',
      category: 'reserva de emergência',
      balance: 600,
      date: '2026-01-01',
    },
  ];
  d.reserveAllocations = [
    {
      ...emptyRow('reserveAllocations'),
      id: 'allocation',
      investmentId: 'reserve',
      enabled: 'sim',
      liquidity: 'imediata',
    },
  ];
  return d;
}
function store() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    map,
  };
}
function port(
  permission: ReturnType<NotificationPort['permission']> = 'granted',
) {
  const calls: NotificationOptions[] = [];
  let requests = 0;
  return {
    calls,
    get requests() {
      return requests;
    },
    permission: () => permission,
    requestPermission: async () => {
      requests++;
      return 'granted' as const;
    },
    show: async (_title: string, options: NotificationOptions) => {
      calls.push(options);
    },
  };
}
for (const name of queryNames)
  void test(`Fase 9: ${name} produz envelope, fontes e não muda registros`, () => {
    const d = fixture(),
      before = JSON.stringify(d),
      q = new FinancialQueryService(d, at);
    for (const period of [
      'current',
      'previous',
      'last-closed',
      'year',
    ] as const) {
      const answer = q.answer(name, period);
      assert.ok(
        ['available', 'partial', 'unavailable'].includes(answer.status),
      );
      assert.ok(
        Array.isArray(answer.assumptions) && Array.isArray(answer.sources),
      );
      if (answer.status === 'unavailable') assert.equal(answer.data, undefined);
      else {
        assert.ok(answer.sources.length);
        assert.ok(answer.assumptions.length);
      }
      assert.equal(JSON.stringify(d), before);
    }
  });
for (const [intent, , method] of assistantQuestions)
  void test(`Fase 9: intent ${intent} usa somente ${method}`, () => {
    const calls: string[] = [];
    const expected: FinancialAnswer<AnswerData> = {
      status: 'unavailable',
      summary: 'teste',
      sources: [],
      assumptions: [],
      warnings: [],
    };
    const provider = new DeterministicFinancialAssistant({
      answer: (name, period) => {
        calls.push(name + ':' + period);
        return expected;
      },
    });
    assert.equal(provider.ask(intent, 'previous'), expected);
    assert.deepEqual(calls, [method + ':previous']);
  });
void test('Fase 9: despesas, reserva e investimentos usam unidades corretas e invalidam ao mudar dados', () => {
  const d = fixture(),
    q = new FinancialQueryService(d, at);
  assert.equal(q.answer('getMonthlyExpenses').data?.metrics[0].value, 100);
  const reserve = q.answer('getReserveSummary');
  assert.equal(reserve.data?.metrics[0].value, 600);
  assert.equal(reserve.data?.metrics[2].value, 6);
  assert.equal(q.answer('getInvestmentSummary').data?.metrics[0].value, 600);
  assert.equal(reserve.status, 'partial');
  const answer = q.answer('getMonthlyExpenses');
  answer.data!.metrics[0].value = 999;
  assert.equal(q.answer('getMonthlyExpenses').data?.metrics[0].value, 100);
  const changed = { ...d, expenses: [{ ...d.expenses[0], amount: 250 }] };
  assert.equal(
    new FinancialQueryService(changed, at).answer('getMonthlyExpenses').data
      ?.metrics[0].value,
    250,
  );
});
void test('Fase 9: ausência de dados não vira zero e câmbio ausente gera parcial', () => {
  const q = new FinancialQueryService(defaults(), at);
  for (const method of [
    'getMonthlyExpenses',
    'getInvestmentSummary',
    'getDebtSummary',
    'getReserveSummary',
    'getPassiveIncomeSummary',
  ] as const)
    assert.equal(q.answer(method).status, 'unavailable');
  const d = fixture();
  d.investments[0] = {
    ...d.investments[0],
    currentValue: 10,
    valuationDate: at,
    valuationCurrency: 'USD',
    fxToBRL: null,
  };
  assert.equal(
    new FinancialQueryService(d, at).answer('getInvestmentSummary').status,
    'partial',
  );
  assert.equal(
    new FinancialQueryService(d, at).answer('getInvestmentSummary').data
      ?.metrics[0].value,
    null,
  );
});
void test('Fase 9: passado usa última revisão fechada, nunca o cadastro editado', async () => {
  let d = fixture();
  d.expenses[0].date = '2026-08-05';
  d = await closeMonth(d, '2026-08', {
    at,
    generatedAt: '2026-09-27T12:00:00.000Z',
    allowPartial: true,
  });
  d.expenses[0].amount = 900;
  const q = new FinancialQueryService(d, at),
    answer = q.answer('getMonthlyExpenses', 'previous');
  assert.equal(answer.data?.metrics[0].value, 100);
  assert.equal(answer.sources[0].status, 'snapshot');
  assert.equal(answer.sources[0].revision, 1);
  assert.equal(
    q.answer('getMonthlyExpenses', 'last-closed').data?.metrics[0].value,
    100,
  );
  assert.equal(q.answer('getMonthlyExpenses', 'year').status, 'partial');
  assert.equal(
    q.answer('getInvestmentSummary', 'previous').status,
    'unavailable',
  );
});
void test('Fase 9: quiet hours atravessam meia-noite e horários iguais silenciam o dia', () => {
  const p = defaultNotificationPreferences();
  assert.equal(isQuietTime(p, new Date(2026, 8, 27, 23)), true);
  assert.equal(isQuietTime(p, new Date(2026, 8, 27, 7)), true);
  assert.equal(isQuietTime(p, new Date(2026, 8, 27, 8)), false);
  assert.equal(
    isQuietTime({ ...p, quietEnd: p.quietStart }, new Date(2026, 8, 27, 12)),
    true,
  );
  assert.equal(
    isQuietTime({ ...p, quietEnabled: false }, new Date(2026, 8, 27, 23)),
    false,
  );
});
void test('Fase 9: default/granted/denied/unsupported não pedem permissão ao avaliar entregas', async () => {
  for (const permission of [
    'default',
    'granted',
    'denied',
    'unsupported',
  ] as const) {
    const mock = port(permission);
    await deliverNotifications({
      preferences: defaultNotificationPreferences(),
      owner: 'guest',
      storage: store(),
      port: mock,
      candidates: () => assert.fail('Não avaliar desativado'),
    });
    assert.equal(mock.requests, 0);
    assert.equal(mock.calls.length, 0);
    const result = await activateNotifications(mock);
    assert.equal(mock.requests, permission === 'default' ? 1 : 0);
    assert.equal(result, permission === 'default' ? 'granted' : permission);
  }
});
void test('Fase 9: deduplicação, teto diário e isolamento por dono', async () => {
  const p = {
      ...defaultNotificationPreferences(),
      enabled: true,
      quietEnabled: false,
    },
    storage = store(),
    mock = port();
  const candidates = () =>
    Array.from({ length: 8 }, (_, i) => ({
      id: 'event' + i,
      route: 'Dívidas',
      body: 'Compromisso pendente.',
    }));
  const options = {
    preferences: p,
    owner: 'A',
    storage,
    port: mock,
    candidates,
    now: new Date(2026, 8, 27, 12),
  };
  await Promise.all([
    deliverNotifications(options),
    deliverNotifications(options),
  ]);
  await deliverNotifications(options);
  assert.equal(mock.calls.length, 3);
  await deliverNotifications({ ...options, owner: 'B' });
  assert.equal(mock.calls.length, 6);
  assert.ok(
    [...storage.map.values()].every(
      (v) => !v.includes('Compromisso') && !v.includes('event'),
    ),
  );
});
void test('Fase 9: silêncio, cancelamento, falha de exibição e quota são seguros', async () => {
  const preferences = { ...defaultNotificationPreferences(), enabled: true },
    mock = port(),
    storage = store();
  const options = {
    preferences,
    owner: 'A',
    storage,
    port: mock,
    candidates: () => [{ id: 'e', route: 'Alertas', body: 'Pendência' }],
    now: new Date(2026, 8, 27, 23),
  };
  await deliverNotifications(options);
  assert.equal(mock.calls.length, 0);
  await deliverNotifications({
    ...options,
    now: new Date(2026, 8, 27, 12),
    stillActive: () => false,
  });
  assert.equal(mock.calls.length, 0);
  const fail = {
    ...options,
    now: new Date(2026, 8, 27, 12),
    port: {
      ...mock,
      show: async () => {
        throw Error('os');
      },
    },
  };
  assert.ok(await deliverNotifications(fail));
  assert.ok(
    await deliverNotifications({
      ...fail,
      port: mock,
      storage: {
        getItem: () => null,
        setItem: () => {
          throw Error('quota');
        },
      },
    }),
  );
  assert.equal(mock.calls.length, 0);
  await deliverNotifications({ ...options, now: new Date(2026, 8, 27, 12) });
  assert.equal(mock.calls.length, 1);
});
void test('Fase 9: privado omite nomes e valores; opt-out por categoria é respeitado', () => {
  const d = fixture();
  d.notificationPreferences.categories.reserve = true;
  const privateCandidates = notificationCandidates(d, at);
  assert.ok(privateCandidates.length);
  assert.ok(
    privateCandidates.every(
      (c) => !c.body.includes('R$') && !c.body.includes('Mercado'),
    ),
  );
  d.notificationPreferences.categories.reporting = false;
  assert.ok(
    notificationCandidates(d, at).every((c) => c.route !== 'Relatórios'),
  );
  assert.equal(validNotificationRoute('https://evil.test'), false);
  assert.equal(validNotificationRoute('Dívidas'), true);
});
void test('Fase 9: preferências validam, migram sem duplicação, backup e CAS preservados', () => {
  const d = fixture(),
    p = d.notificationPreferences;
  p.enabled = true;
  p.leadDays = 15;
  assert.throws(() =>
    validateNotificationPreferences({ ...p, quietStart: '29:00' }),
  );
  assert.deepEqual(parseBackup(backup(d)).notificationPreferences, p);
  const timestamp = '2026-09-27T12:00:00.123456+00:00';
  const cloud = decode({
    data: JSON.parse(backup(d)),
    updated_at: timestamp,
    device_id: 'test',
    schema_version: 6,
  });
  assert.deepEqual(cloud.data.notificationPreferences, p);
  assert.equal(cloud.updated_at, timestamp);
  const old = {
    ...d,
    planningVersion: 7,
    notificationVersion: undefined,
    notificationPreferences: undefined,
  };
  const upgraded = validateData(old);
  assert.equal(upgraded.notificationPreferences.enabled, false);
  assert.deepEqual(validateData(upgraded), upgraded);
  const disk = store();
  const bytes = JSON.stringify(old);
  disk.setItem(STORAGE_KEY, bytes);
  save(disk, upgraded);
  assert.equal(
    disk.getItem('rota-money-before-migration:notifications-v1:guest'),
    bytes,
  );
  save(disk, upgraded);
  assert.equal(
    disk.getItem('rota-money-before-migration:notifications-v1:guest'),
    bytes,
  );
  assert.throws(() => validateData({ ...d, notificationVersion: 2 }));
  assert.throws(() =>
    validateData({ ...d, notificationPreferences: undefined }),
  );
  assert.equal(resetData(d, 'settings').notificationPreferences.enabled, false);
  assert.equal(resetData(d, 'finance').notificationPreferences.enabled, true);
});
void test('Fase 9: antecedência usa dias locais e orçamento em 71% não gera spam', () => {
  const d = fixture();
  d.notificationPreferences.categories.budget = true;
  d.budgets = [
    {
      ...emptyRow('budgets'),
      id: 'budget',
      category: 'alimentação',
      limitCents: 10000,
      enabled: 'sim',
    },
  ];
  d.expenses[0].amount = 71;
  assert.equal(
    notificationCandidates(d, at).some((c) => c.route === 'Gastos'),
    false,
  );
  d.expenses[0].amount = 101;
  assert.equal(
    notificationCandidates(d, at).some((c) => c.route === 'Gastos'),
    true,
  );
  d.investments[0].maturity = '2026-09-30';
  d.notificationPreferences.leadDays = 1;
  assert.equal(
    notificationCandidates(d, at).some((c) => c.route === 'Investimentos'),
    false,
  );
  d.notificationPreferences.leadDays = 3;
  assert.equal(
    notificationCandidates(d, at).some((c) => c.route === 'Investimentos'),
    true,
  );
  d.notificationPreferences.showValues = true;
  assert.ok(notificationCandidates(d, at).some((c) => c.body.includes('R$')));
});
void test('Fase 9: migração interrompida não publica dados sem cópia de segurança', () => {
  const old = {
    ...fixture(),
    planningVersion: 7,
    notificationVersion: undefined,
    notificationPreferences: undefined,
  };
  const disk = store(),
    bytes = JSON.stringify(old);
  disk.setItem(STORAGE_KEY, bytes);
  assert.throws(() =>
    save(
      {
        ...disk,
        setItem: () => {
          throw Error('quota');
        },
      },
      validateData(old),
    ),
  );
  assert.equal(disk.getItem(STORAGE_KEY), bytes);
});
void test('Fase 9: primeiro mês oferece custo parcial e respostas limitam listas sem perder total', () => {
  const d = fixture();
  assert.equal(
    new FinancialQueryService(d, at).answer('getCostOfLiving').status,
    'partial',
  );
  d.investments = Array.from({ length: 40 }, (_, i) => ({
    ...d.investments[0],
    id: 'i' + i,
    name: 'Ativo ' + i,
  }));
  const answer = new FinancialQueryService(d, at).answer(
    'getInvestmentSummary',
  );
  assert.equal(answer.data?.items?.length, 30);
  assert.equal(answer.data?.metrics[0].value, 24000);
  assert.ok(answer.warnings.some((w) => w.includes('30 de 40')));
});
void test('Fase 9: manutenção no km exato notifica, mesmo com data alternativa distante', () => {
  const d = fixture();
  d.bike.km = 1000;
  d.maintenance = [
    {
      ...emptyRow('maintenance'),
      id: 'oil',
      name: 'Óleo',
      nextKm: 1000,
      status: 'pendente',
    },
  ];
  const due = notificationCandidates(d, at).find(
    (c) => c.route === 'Manutenção',
  );
  assert.ok(due);
  d.bike.km = 1001;
  assert.equal(
    notificationCandidates(d, at).find((c) => c.route === 'Manutenção')?.id,
    due.id,
  );
  d.maintenance[0].nextDate = '2027-01-01';
  assert.ok(
    notificationCandidates(d, at).some((c) => c.route === 'Manutenção'),
  );
  d.maintenance[0].nextDate = '';
  d.bike.km = 999;
  assert.equal(
    notificationCandidates(d, at).some((c) => c.route === 'Manutenção'),
    false,
  );
});
void test('Fase 9: cupons e carências respeitam Investimentos; vencimento respeita Vencimentos', () => {
  const d = fixture();
  d.investments[0].couponDate = at;
  d.investments[0].maturity = at;
  d.notificationPreferences.categories.investment = false;
  assert.equal(
    notificationCandidates(d, at).filter((c) => c.route === 'Investimentos')
      .length,
    1,
  );
  d.notificationPreferences.categories.investment = true;
  assert.equal(
    notificationCandidates(d, at).filter((c) => c.route === 'Investimentos')
      .length,
    2,
  );
  d.notificationPreferences.categories.maturities = false;
  assert.equal(
    notificationCandidates(d, at).filter((c) => c.route === 'Investimentos')
      .length,
    1,
  );
  d.notificationPreferences.categories.investment = false;
  assert.equal(
    notificationCandidates(d, at).filter((c) => c.route === 'Investimentos')
      .length,
    0,
  );
});

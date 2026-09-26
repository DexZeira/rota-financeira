import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow } from '../src/model';
import {
  buildSearchIndex,
  searchIndex,
} from '../src/services/universal-search';
import { auditFinancialData } from '../src/services/financial-audit';
import { deriveAlerts } from '../src/services/alerts';
import { getFinancialSituation } from '../src/services/financial-situation';
import { closeMonth } from '../src/services/month-close';
import type { CashEvent } from '../src/services/cash-flow';
const at = '2026-09-25';
void test('auditoria do forecast detecta duplicação, referência e valor inválido', () => {
  const d = defaults();
  const event: CashEvent = {
    id: 'fake',
    date: at,
    originalDate: at,
    name: 'Teste',
    amount: -1,
    direction: 'saída',
    impact: 'caixa',
    status: 'previsto',
    source: 'recurrences',
    sourceId: 'missing',
  };
  const issues = auditFinancialData(d, at, [event, { ...event }]);
  for (const code of ['duplicate', 'orphan', 'amount'])
    assert.ok(issues.some((i) => i.id === `forecast:fake:${code}`));
});
void test('busca normaliza acentos, caixa e espaços sem apagar pontuação de identidade', () => {
  const d = defaults();
  d.expenses = [
    {
      ...emptyRow('expenses'),
      id: 'a',
      name: 'Cartão   Azul',
      amount: 500,
      date: '2026-09-10',
    },
  ];
  const index = buildSearchIndex(d, at);
  for (const q of [
    'CARTAO azul',
    '500',
    '500,00',
    'R$ 500,00',
    '2026-09-10',
    '10/09/2026',
  ])
    assert.equal(searchIndex(index, q).results[0]?.sourceId, 'a', q);
  assert.equal(searchIndex(index, 'cartaoazul').total, 0);
  assert.equal(searchIndex(index, 'Cartão', 'Dívidas').total, 0);
});
void test('ranking exact > prefix > contains > subtitle > metadata, com limite', () => {
  const d = defaults();
  d.expenses = [
    'Meu Mercado local',
    'Mercado mensal',
    'Mercado',
    'Outro',
    'Quinto',
  ].map((name, i) => ({
    ...emptyRow('expenses'),
    id: String(i),
    name,
    category: i === 3 ? 'Mercado' : 'outras',
    notes: i === 4 ? 'Mercado' : '',
  }));
  assert.deepEqual(
    searchIndex(buildSearchIndex(d, at), 'mercado').results.map(
      (r) => r.sourceId,
    ),
    ['2', '1', '0', '3', '4'],
  );
  assert.equal(
    searchIndex(buildSearchIndex(d, at), 'mercado', 'Todos', 2).results.length,
    2,
  );
});
void test('índice de 100 mil registros: construção, consulta e resultado limitado', (t) => {
  const d = defaults();
  d.expenses = Array.from({ length: 100000 }, (_, i) => ({
    ...emptyRow('expenses'),
    id: String(i),
    name: `Mercado ${i}`,
    amount: 500,
  }));
  const start = performance.now(),
    index = buildSearchIndex(d, at),
    built = performance.now();
  const result = searchIndex(index, 'mercado');
  const end = performance.now();
  t.diagnostic(
    `100k: índice ${(built - start).toFixed(1)} ms; consulta ${(end - built).toFixed(1)} ms`,
  );
  assert.equal(result.total, 100000);
  assert.equal(result.results.length, 30);
  assert.equal(
    searchIndex(index, 'Mercado 99999').results[0].sourceId,
    '99999',
  );
  assert.ok(
    end - start < 15000,
    'limite amplo para identificar regressão quadrática',
  );
});
void test('auditoria detecta dívida inválida sem modificar o estado', () => {
  const d = defaults();
  d.debts = [
    {
      ...emptyRow('debts'),
      id: 'debt',
      totalInstallments: 2,
      paidInstallments: 3,
      installmentAmount: 100,
    },
  ];
  const before = JSON.stringify(d);
  assert.ok(
    auditFinancialData(d, at).some(
      (i) => i.domain === 'debts' && i.severity === 'error',
    ),
  );
  assert.equal(JSON.stringify(d), before);
});
void test('auditoria identifica recorrências duplicadas e origem órfã', () => {
  const d = defaults();
  const r = {
    ...emptyRow('recurrences'),
    id: 'r',
    name: 'Luz',
    startDate: '2026-09-01',
    sourceKind: 'expenses',
    sourceId: 'missing',
  };
  d.recurrences = [r, { ...r }];
  const issues = auditFinancialData(d, at);
  assert.ok(issues.some((i) => i.id === 'recurrences:r:identity'));
  assert.ok(issues.some((i) => i.id === 'recurrences:r:orphan'));
});
void test('auditoria: valuation órfã, budget duplicado, reserva inválida', () => {
  const d = defaults();
  d.assetValuations = [
    {
      ...emptyRow('assetValuations'),
      id: 'v',
      assetId: 'missing',
      date: at,
      valueCents: 100,
    },
  ];
  d.budgets = [
    { ...emptyRow('budgets'), id: 'b1', category: 'alimentação' },
    { ...emptyRow('budgets'), id: 'b2', category: 'alimentação' },
  ];
  d.reserveAllocations = [
    { ...emptyRow('reserveAllocations'), id: 'a', investmentId: 'missing' },
  ];
  const issues = auditFinancialData(d, at);
  for (const id of [
    'assetValuations:v:orphan',
    'budgets:b2:duplicate',
    'reserveAllocations:a:orphan',
  ])
    assert.ok(
      issues.some((i) => i.id === id),
      id,
    );
});
void test('auditoria de links distingue sessão órfã de exclusão histórica intencional', () => {
  const d = defaults();
  d.imports.links = [
    {
      id: 'l',
      sessionId: 'missing',
      action: 'created',
      recordKind: 'expenses',
      recordId: 'deleted',
      fingerprint: '',
      transaction: {
        line: 1,
        externalId: 'x',
        date: at,
        description: 'Teste',
        normalizedDescription: 'teste',
        amountCents: 100,
        direction: 'debit',
        accountLabel: 'teste',
        document: '',
        source: 'csv',
      },
    },
  ];
  const issues = auditFinancialData(d, at);
  assert.equal(
    issues.find((i) => i.id === 'import:l:session')?.severity,
    'error',
  );
  assert.equal(
    issues.find((i) => i.id === 'import:l:record')?.severity,
    'info',
  );
});
void test('snapshot sem revisão produz erro de auditoria', () => {
  const d = defaults();
  d.reporting.closures = [
    {
      period: '2026-08',
      status: 'closed',
      reopenedAt: null,
      regeneratedAt: null,
      revisions: [],
    },
  ];
  assert.ok(
    auditFinancialData(d, at).some((i) => i.id === 'reporting:2026-08:invalid'),
  );
});
void test('alerta orçamento desaparece após correção; identidade determinística', () => {
  const d = defaults();
  d.budgets = [
    {
      ...emptyRow('budgets'),
      id: 'food',
      category: 'alimentação',
      limitCents: 10000,
      enabled: 'sim',
      alertThresholdPercent: 70,
      nearThresholdPercent: 90,
    },
  ];
  d.expenses = [
    {
      ...emptyRow('expenses'),
      id: 'e',
      name: 'Mercado',
      category: 'alimentação',
      date: at,
      amount: 120,
    },
  ];
  const first = deriveAlerts(d, at);
  assert.ok(first.some((a) => a.source === 'budget'));
  assert.deepEqual(first, deriveAlerts(d, at));
  d.expenses = [];
  assert.equal(
    deriveAlerts(d, at).filter((a) => a.source === 'budget').length,
    0,
  );
});
void test('alertas dívida, forecast e manutenção reutilizam condições existentes', () => {
  const d = defaults();
  d.debts = [
    {
      ...emptyRow('debts'),
      id: 'debt',
      name: 'Parcela',
      totalInstallments: 10,
      paidInstallments: 0,
      installmentAmount: 100,
      due: '2026-09-20',
      status: 'ativa',
    },
  ];
  d.maintenance = [
    {
      ...emptyRow('maintenance'),
      id: 'm',
      name: 'Óleo',
      nextDate: '2026-09-20',
    },
  ];
  const alerts = deriveAlerts(d, at);
  for (const source of ['debt', 'forecast', 'maintenance'])
    assert.ok(
      alerts.some((a) => a.source === source),
      source,
    );
});
void test('reserva incompleta não presume liquidez, patrimônio desconhecido não vira zero', () => {
  const d = defaults();
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'i',
      name: 'Reserva',
      category: 'reserva de emergência',
      balance: 100,
      date: '2026-09-01',
    },
  ];
  d.assets = [
    {
      ...emptyRow('assets'),
      id: 'a',
      name: 'Bem',
      active: 'sim',
      purchaseDate: '2026-01-01',
    },
  ];
  const alerts = deriveAlerts(d, at);
  assert.ok(alerts.some((a) => a.source === 'reserve' && a.type === 'unknown'));
  assert.ok(alerts.some((a) => a.source === 'asset' && a.type === 'missing'));
});
void test('investimento mostra informação sem recomendar produto', () => {
  const d = defaults();
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'i',
      name: 'CDB',
      category: 'CDB',
      balance: 100,
      date: '2026-09-01',
      maturity: '2026-10-01',
    },
  ];
  const alerts = deriveAlerts(d, at);
  assert.ok(
    alerts.some((a) => a.type === 'metadata' && a.source === 'investment'),
  );
  assert.ok(alerts.some((a) => a.type === 'maturity'));
});
void test('importação parcial e fechamento inexistente não fingem pendência em preview descartado', () => {
  const d = defaults();
  d.imports.sessions = [
    {
      id: 's',
      source: 'csv',
      fileName: 'teste.csv',
      createdAt: at + 'T12:00:00Z',
      hash: 'a'.repeat(64),
      rowCount: 1,
      importedCount: 0,
      matchedCount: 0,
      ignoredCount: 0,
      duplicateCount: 0,
      invalidCount: 1,
    },
  ];
  const alerts = deriveAlerts(d, at);
  assert.ok(alerts.some((a) => a.source === 'import' && a.type === 'partial'));
  assert.ok(alerts.some((a) => a.source === 'reporting'));
  assert.ok(!alerts.some((a) => a.source === 'import' && a.type === 'pending'));
});
void test('alertas de sistema exigem evidência explícita, não quota inventada', () => {
  const d = defaults();
  assert.ok(
    !deriveAlerts(d, at).some(
      (a) => a.source === 'system' && a.type === 'failure',
    ),
  );
  const alerts = deriveAlerts(d, at, {
    storageUsage: { bytes: 950, quota: 1000 },
    syncConflict: true,
  });
  assert.ok(alerts.some((a) => a.type === 'quota'));
  assert.ok(alerts.some((a) => a.sourceId === 'sync'));
});
void test('resumo é memoizado por estado e data, invalidado na revisão financeira', () => {
  const d = defaults(),
    s = getFinancialSituation(d, at);
  assert.equal(getFinancialSituation(d, at), s);
  assert.notEqual(getFinancialSituation({ ...d }, at), s);
  assert.notEqual(getFinancialSituation(d, '2026-09-26'), s);
});
void test('Minha Situação compara revisões usando motor existente', async () => {
  let d = defaults();
  d = await closeMonth(d, '2026-07', {
    at,
    generatedAt: at + 'T12:00:00Z',
    allowPartial: true,
  });
  d = await closeMonth(d, '2026-08', {
    at,
    generatedAt: at + 'T12:00:00Z',
    allowPartial: true,
  });
  const s = getFinancialSituation(d, at);
  assert.equal(s.last?.period, '2026-08');
  assert.ok(s.changes);
  assert.ok(s.changes.metrics.some((m) => m.label === 'Patrimônio'));
});

void test('alertas e auditoria com 10 mil gastos não alteram os dados', (t) => {
  const d = defaults();
  d.expenses = Array.from({ length: 10000 }, (_, i) => ({
    ...emptyRow('expenses'),
    id: String(i),
    name: 'Mercado',
    date: at,
    amount: 1,
  }));
  const before = JSON.stringify(d),
    start = performance.now();
  const result = getFinancialSituation(d, at);
  const elapsed = performance.now() - start;
  t.diagnostic(`10k: resumo, alertas e auditoria ${elapsed.toFixed(1)} ms`);
  assert.ok(result.alerts.length < 100);
  assert.equal(JSON.stringify(d), before);
  assert.ok(elapsed < 15000);
});
void test('auditoria detecta excesso de pagamentos e retirada acima do saldo', () => {
  const d = defaults();
  d.debts = [
    {
      ...emptyRow('debts'),
      id: 'd',
      totalInstallments: 1,
      installmentAmount: 100,
    },
  ];
  d.payments = [
    {
      ...emptyRow('payments'),
      id: 'p',
      debtId: 'd',
      amount: 200,
      installments: 2,
      date: at,
    },
  ];
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'i',
      name: 'Teste',
      date: at,
      balance: 10,
    },
  ];
  d.movements = [
    {
      ...emptyRow('movements'),
      id: 'm',
      investmentId: 'i',
      date: at,
      kind: 'retirada',
      amount: 20,
    },
  ];
  const issues = auditFinancialData(d, at);
  assert.ok(issues.some((i) => i.id === 'debts:d:overpaid'));
  assert.ok(issues.some((i) => i.id === 'investments:i:negative'));
});

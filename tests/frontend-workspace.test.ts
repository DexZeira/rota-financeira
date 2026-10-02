import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow, money } from '../src/model';
import { transactionView, cashFlowPoints } from '../src/services/transaction-view';
import { profileName, profileInitials } from '../src/services/profile-identity';
import { encodeMoney, decodeMoney } from '../src/services/money-codec';

void test('visão unificada preserva centavos, sinais e origem sem lançar duplicatas', () => {
  const d = defaults();
  d.expenses = [{ ...emptyRow('expenses'), id: 'expense', date: '2026-09-02', name: 'Mercado', amount: 125.40 }];
  d.bankReceipts = [{ ...emptyRow('bankReceipts'), id: 'receipt', date: '2026-09-03', name: 'Salário', amountCents: 90000, account: 'Conta pessoal' }];
  d.imports.links = [{ id: 'csv-link', sessionId: 'csv', action: 'created', recordKind: 'expenses', recordId: 'expense', fingerprint: 'f', transaction: { line: 1, externalId: 'external', date: '2026-09-02', description: 'Mercado', normalizedDescription: 'mercado', amountCents: 12540, direction: 'debit', accountLabel: 'Conta corrente', document: '', source: 'csv' } }];
  const before = JSON.stringify(d), rows = transactionView(d);
  assert.equal(rows.filter(r => r.id === 'expenses:expense').length, 1);
  assert.equal(rows.find(r => r.id === 'expenses:expense')?.amountCents, 12540);
  assert.equal(rows.find(r => r.id === 'expenses:expense')?.direction, 'Saída');
  assert.equal(rows.find(r => r.id === 'expenses:expense')?.account, 'Conta corrente');
  assert.equal(rows.find(r => r.id === 'expenses:expense')?.origin, 'CSV');
  assert.equal(rows.find(r => r.id === 'bankReceipts:receipt')?.amountCents, 90000);
  assert.equal(rows.find(r => r.id === 'bankReceipts:receipt')?.direction, 'Entrada');
  assert.equal(JSON.stringify(d), before);
});
void test('não transforma previsão, reserva ou aporte interno em receita', () => {
  const d = defaults();
  d.work = [];
  d.movements = [{ ...emptyRow('movements'), id: 'm', date: '2026-09-02', kind: 'aporte', amount: 50 }];
  d.recurrences = [{ ...emptyRow('recurrences'), id: 'future', amount: 999 }];
  const rows = transactionView(d);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].direction, 'Transferência');
  assert.equal(rows[0].amountCents, 5000);
});
void test('formatador central permite moedas sem converter montantes', () => {
  assert.match(money(125.4), /125,40/);
  assert.match(money(125.4, 'USD'), /US\$/);
  assert.match(money(-125.4, 'EUR'), /-.*€/);
});

void test('visão distingue taxa em caixa de ajuste patrimonial sem criar receita', () => {
  const d = defaults();
  d.movements = [
    { ...emptyRow('movements'), id: 'fee', kind: 'perda', operation: 'taxa', amount: 5 },
    { ...emptyRow('movements'), id: 'mark', kind: 'perda', operation: 'ajuste', amount: 10 },
    { ...emptyRow('movements'), id: 'reinvested', kind: 'rendimento', paidOut: 'não', amount: 20 },
    { ...emptyRow('movements'), id: 'income', kind: 'rendimento', paidOut: 'sim', amount: 30 },
  ];
  const rows = transactionView(d);
  assert.equal(rows.find(row => row.row.id === 'fee')?.direction, 'Saída');
  assert.equal(rows.find(row => row.row.id === 'mark')?.direction, 'Ajuste patrimonial');
  assert.equal(rows.find(row => row.row.id === 'reinvested')?.direction, 'Ajuste patrimonial');
  assert.equal(rows.find(row => row.row.id === 'income')?.direction, 'Entrada');
});

void test('movimentos do gráfico agregam centavos por janela sem contar transferências ou previsões', () => {
  const d = defaults();
  d.expenses = [
    { ...emptyRow('expenses'), id: 'a', date: '2026-09-01', amount: .10 },
    { ...emptyRow('expenses'), id: 'b', date: '2026-09-01', amount: .20 },
    { ...emptyRow('expenses'), id: 'old', date: '2026-08-01', amount: 100 },
    { ...emptyRow('expenses'), id: 'future', date: '2026-10-02', amount: 200 },
  ];
  d.bankReceipts = [{ ...emptyRow('bankReceipts'), id: 'r', date: '2026-09-30', amountCents: 10000 }];
  d.movements = [{ ...emptyRow('movements'), id: 'm', date: '2026-09-01', kind: 'aporte', amount: 500 }];
  const before = JSON.stringify(d);
  assert.deepEqual(cashFlowPoints(d, '2026-09-01', '2026-10-01', true), [
    { date: '2026-09-01', income: 0, expense: 30 },
    { date: '2026-09-30', income: 10000, expense: 0 },
  ]);
  assert.deepEqual(cashFlowPoints(d, '2026-09-01', '2026-10-01', false), [{ date: '2026-09', income: 10000, expense: 30 }]);
  assert.equal(JSON.stringify(d), before);
});

void test('identidade usa nome amigável e permanece compatível com o codec persistido', () => {
  const d = defaults();
  const user = { email: 'ana.silva@example.test', user_metadata: { full_name: 'Ana Maria' } };
  assert.equal(profileName(d.settings, user), 'Ana Maria');
  assert.equal(profileName(d.settings, { email: user.email }), 'Ana Silva');
  assert.equal(profileName(d.settings, null), 'Seu perfil');
  assert.equal(profileInitials(' Ana Maria Silva '), 'AS');
  assert.equal(profileInitials(''), 'RF');
  d.settings.profileName = '  Talisson  ';
  const restored = decodeMoney(encodeMoney(d)).settings as typeof d.settings;
  assert.equal(profileName(restored, user), 'Talisson');
  assert.equal(restored.openingCash, d.settings.openingCash);
});

void test('gráfico reutiliza caixa líquido e preserva custos de transferências sem contar seu principal', () => {
  const d = defaults();
  d.movements = [
    { ...emptyRow('movements'), id: 'income', date: '2026-09-02', kind: 'rendimento', paidOut: 'sim', amount: 100, feesCents: 200, taxCents: 1500 },
    { ...emptyRow('movements'), id: 'deposit', date: '2026-09-03', kind: 'aporte', amount: 500, feesCents: 500, taxCents: 100 },
    { ...emptyRow('movements'), id: 'withdraw', date: '2026-09-04', kind: 'retirada', amount: 600, feesCents: 300, taxCents: 200 },
    { ...emptyRow('movements'), id: 'reinvest', date: '2026-09-05', kind: 'rendimento', paidOut: 'não', amount: 100, feesCents: 200, taxCents: 100 },
    { ...emptyRow('movements'), id: 'loss', date: '2026-09-06', kind: 'perda', operation: 'taxa', amount: 5, feesCents: 100 },
    { ...emptyRow('movements'), id: 'free-deposit', date: '2026-09-07', kind: 'aporte', amount: 500, feesCents: 0, taxCents: 0 },
    { ...emptyRow('movements'), id: 'free-withdraw', date: '2026-09-08', kind: 'retirada', amount: 100, feesCents: 0, taxCents: 0 },
  ];
  const before = JSON.stringify(d);
  assert.deepEqual(cashFlowPoints(d, '2026-09-01', '2026-09-30', true), [
    { date: '2026-09-02', income: 8300, expense: 0 },
    { date: '2026-09-03', income: 0, expense: 600 },
    { date: '2026-09-04', income: 0, expense: 500 },
    { date: '2026-09-05', income: 0, expense: 300 },
    { date: '2026-09-06', income: 0, expense: 600 },
  ]);
  assert.deepEqual(cashFlowPoints(d, '2026-09-01', '2026-09-30', false), [{ date: '2026-09', income: 8300, expense: 2000 }]);
  assert.equal(JSON.stringify(d), before);
  d.movements = [{ ...emptyRow('movements'), id: 'net-loss', date: '2026-09-02', kind: 'rendimento', paidOut: 'sim', amount: 1, taxCents: 150 }];
  assert.deepEqual(cashFlowPoints(d, '2026-09-01', '2026-09-30', true), [{ date: '2026-09-02', income: 0, expense: 50 }]);
});

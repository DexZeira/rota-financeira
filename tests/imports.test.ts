import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow } from '../src/model';
import { financial } from '../src/calculations';
import {
  csvCells,
  detectCsv,
  parseCsv,
} from '../src/services/import/csv-import';
import { parseOfx } from '../src/services/import/ofx-import';
import {
  dateOnly,
  decodeStatement,
  fileHash,
  normalizeDescription,
  parseAmount,
} from '../src/services/import/transaction-normalizer';
import {
  previewImport,
  prepareImport,
} from '../src/services/import/import-session';
import {
  categorize,
  safeRule,
} from '../src/services/import/categorization-rules';
import { detectSubscriptions } from '../src/services/import/subscription-detection';
import {
  reconciliationIndex,
  reconcileTransaction,
} from '../src/services/import/reconciliation';
import {
  type Review,
  type Transaction,
  type Rule,
} from '../src/services/import/types';
import {
  backup,
  parseBackup,
  resetData,
  remove,
  save,
  validateData,
  STORAGE_KEY,
} from '../src/services/storage';
import { serializeSnapshot } from '../src/services/sync-core';
import { getCashFlowForecast } from '../src/services/cash-flow';
void test('receita importada confirma previsão sem repetir entrada no forecast', () => {
  const d = defaults();
  d.recurrences = [
    {
      ...emptyRow('recurrences'),
      id: 'income-rule',
      name: 'Receita fictícia',
      kind: 'receita',
      amount: 500,
      frequency: 'mensal',
      startDate: '2026-01-11',
    },
  ];
  const next = prepareImport(
    d,
    lines(),
    { 3: review('create', { recurrenceId: 'income-rule' }) },
    meta,
  );
  assert.equal(next.forecastResolutions[0].recordKind, 'bankReceipts');
  assert.equal(next.forecastResolutions[0].occurrenceDate, '2026-09-11');
  assert.equal(financial(next).cash, 500);
  assert.equal(
    getCashFlowForecast(next, '2026-09-11', 0).knownBalance,
    getCashFlowForecast(d, '2026-09-11', 0).knownBalance,
  );
});
void test('aporte e retirada importados preservam patrimônio sem virar gasto/receita', () => {
  const d = defaults();
  d.settings.openingCash = 1000;
  d.investments = [
    {
      ...emptyRow('investments'),
      id: 'investment',
      name: 'Teste',
      balance: 1000,
      date: '2026-01-01',
    },
  ];
  const next = prepareImport(
    d,
    lines(),
    { 2: review('investment', { recordId: 'investment' }) },
    meta,
  );
  assert.equal(next.movements[0].kind, 'aporte');
  assert.equal(next.expenses.length, 0);
  assert.equal(financial(next).netWorth, financial(d).netWorth);
  const out = prepareImport(
    next,
    lines(),
    { 3: review('investment', { recordId: 'investment' }) },
    meta,
  );
  assert.equal(out.movements[1].kind, 'retirada');
  assert.equal(out.bankReceipts.length, 0);
  assert.equal(financial(out).netWorth, financial(d).netWorth);
});
void test('FITID divergente e contas diferentes não viram vínculo silencioso', () => {
  const l = parseOfx(ofx()),
    d = prepareImport(
      defaults(),
      l,
      { 1: review() },
      { ...meta, source: 'ofx' },
    );
  const changed = parseOfx(ofx('test-1', '123', '-22'));
  assert.match(previewImport(d, changed)[0].duplicate!.reason, /divergentes/);
  assert.throws(() =>
    prepareImport(
      d,
      changed,
      {
        1: review('match', {
          recordKind: 'expenses',
          recordId: d.expenses[0].id,
        }),
      },
      { ...meta, source: 'ofx' },
    ),
  );
  const other = transaction({ accountLabel: 'Outra conta' });
  const income = prepareImport(defaults(), lines(), { 2: review() }, meta);
  assert.equal(
    reconcileTransaction(other, reconciliationIndex(income)).length,
    0,
  );
});
void test('linha ignorada pode ser relacionada depois, preservando vínculo rastreável', () => {
  const d = prepareImport(defaults(), lines(), { 2: review('ignore') }, meta);
  d.expenses = [
    {
      ...emptyRow('expenses'),
      id: 'manual',
      name: 'POSTO FICTÍCIO',
      date: '2026-09-10',
      amount: 123.45,
    },
  ];
  const next = prepareImport(
    d,
    lines(),
    { 2: review('match', { recordKind: 'expenses', recordId: 'manual' }) },
    meta,
  );
  assert.equal(next.imports.links.length, 1);
  assert.equal(next.imports.links[0].recordId, 'manual');
  assert.equal(next.imports.links[0].action, 'matched');
});
const csv =
  'Data;Descrição;Valor;Conta\n10/09/2026;POSTO FICTÍCIO;-123,45;Conta teste\n11/09/2026;Receita fictícia;500,00;Conta teste';
const lines = () => parseCsv(csv, detectCsv(csv));
const review = (
  action: Review['action'] = 'create',
  patch: Partial<Review> = {},
): Review => ({
  action,
  category: 'outras',
  recordKind: '',
  recordId: '',
  override: false,
  remember: false,
  ...patch,
});
const meta = {
  source: 'csv' as const,
  fileName: 'ficticio.csv',
  hash: 'a'.repeat(64),
};
const transaction = (patch: Partial<Transaction> = {}): Transaction => ({
  ...lines()[0].transaction!,
  ...patch,
});
const ofx = (
  id = 'test-1',
  account = '123',
  amount = '-10.50',
  type = 'DEBIT',
) =>
  `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTRS><BANKID>999<ACCTID>${account}<BANKTRANLIST><STMTTRN><TRNTYPE>${type}<DTPOSTED>20260910120000[-3:BRT]<TRNAMT>${amount}<FITID>${id}<NAME>Loja fictícia<MEMO>Teste</STMTTRN></BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>`;

void test('CSV ; , aspas BOM acentos CRLF LF e descrição multilinha', () => {
  assert.equal(lines()[0].transaction?.amountCents, 12345);
  const quoted =
    '\uFEFFData,Descrição,Valor,Conta\r\n2026-09-10,"Loja, ""Teste""\ncentro",-12.30,Teste';
  const parsed = parseCsv(quoted, detectCsv(quoted));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].transaction?.description, 'Loja, "Teste"\ncentro');
  assert.equal(parsed[0].transaction?.amountCents, 1230);
  assert.equal(csvCells('a;b\n"erro', ';')[1].error, 'Aspas não fechadas.');
});
void test('CSV erros por linha não descartam as válidas', () => {
  const input =
    csv + '\n32/09/2026;Data errada;1,00;Teste\n10/09/2026;Sem valor;;Teste';
  const result = parseCsv(input, detectCsv(input));
  assert.equal(result.filter((r) => r.transaction).length, 2);
  assert.equal(result.filter((r) => r.errors.length).length, 2);
  const o = detectCsv(csv);
  o.mapping.date = -1;
  assert.ok(parseCsv(csv, o).every((r) => !r.transaction));
});
void test('valores BRL/en, sinais, ambiguidade e precisão em centavos', () => {
  for (const value of ['R$ 1.234,56', '1,234.56'])
    assert.equal(parseAmount(value), 123456);
  assert.equal(parseAmount('(12,34)'), -1234);
  assert.equal(parseAmount('1.234', 'br'), 123400);
  for (const value of [
    '1.234',
    '1,234',
    '',
    'NaN',
    '1,2345',
    '0',
    '12x',
    '1e4',
  ])
    assert.throws(() => parseAmount(value));
});
void test('colunas crédito/débito e conflito explícito de sinal', () => {
  const text =
    'Data;Descrição;Crédito;Débito;Conta\n10/09/2026;Teste;0;20,00;A';
  assert.equal(
    parseCsv(text, detectCsv(text))[0].transaction?.direction,
    'debit',
  );
  const conflict =
    'Data;Descrição;Valor;Tipo;Conta\n10/09/2026;Teste;-10;Crédito;A';
  assert.equal(parseCsv(conflict, detectCsv(conflict))[0].transaction, null);
});
void test('OFX SGML/XML FITID conta MEMO NAME datas date-only e conflito', () => {
  const t = parseOfx(ofx())[0].transaction!;
  assert.equal(t.externalId, 'test-1');
  assert.equal(t.accountLabel, '999:123');
  assert.equal(t.date, '2026-09-10');
  assert.equal(t.amountCents, 1050);
  assert.equal(t.description, 'Loja fictícia — Teste');
  assert.equal(parseOfx(ofx('test', 'a', '-1', 'CREDIT'))[0].transaction, null);
  const xml =
    '<OFX><STMTRS><ACCTID>Teste</ACCTID><BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260910</DTPOSTED><TRNAMT>1.20</TRNAMT><FITID>A</FITID><MEMO>A &amp; B</MEMO></STMTTRN></BANKTRANLIST></STMTRS></OFX>';
  assert.equal(parseOfx(xml)[0].transaction?.description, 'A & B');
  assert.throws(() => parseOfx('<!DOCTYPE OFX><OFX>'));
  assert.equal(dateOnly('20260910000000[-3:BRT]'), '2026-09-10');
});
void test('UTF8 Windows1252 Latin1 e limite do arquivo', () => {
  assert.equal(decodeStatement(new TextEncoder().encode('Ação')), 'Ação');
  assert.equal(decodeStatement(Uint8Array.from([65, 231, 227, 111])), 'Ação');
  assert.throws(() => decodeStatement(new Uint8Array(10 * 1024 * 1024 + 1)));
});
void test('normalização mantém loja e números e não executa conteúdo', () => {
  assert.notEqual(
    normalizeDescription('POSTO IPIRANGA 1234'),
    normalizeDescription('POSTO SHELL 1234'),
  );
  assert.equal(normalizeDescription('  AÇÃO  PIX 42'), 'acao pix 42');
  const text = 'Data;Descrição;Valor;Conta\n10/09/2026;=CMD("teste");-10;Teste';
  assert.ok(parseCsv(text, detectCsv(text))[0].errors.length); // malformed quote is data error, never executable
});
void test('preview imutável e confirmação de débito/crédito sem trabalho artificial', () => {
  const d = defaults(),
    before = JSON.stringify(d);
  previewImport(d, lines());
  assert.equal(JSON.stringify(d), before);
  const next = prepareImport(d, lines(), { 2: review(), 3: review() }, meta);
  assert.equal(d.expenses.length, 0);
  assert.equal(next.expenses.length, 1);
  assert.equal(next.bankReceipts.length, 1);
  assert.equal(next.work.length, 0);
  assert.equal(financial(next).cash, 376.55);
  assert.equal(financial(next).revenue, 0);
});
void test('CSV reimportado é detectado por conteúdo e override exige ação explícita', () => {
  const d = prepareImport(
    defaults(),
    lines(),
    { 2: review(), 3: review() },
    meta,
  );
  assert.ok(previewImport(d, lines()).every((r) => r.status === 'duplicate'));
  assert.throws(() => prepareImport(d, lines(), { 2: review() }, meta));
  const again = prepareImport(
    d,
    lines(),
    { 2: review('ignore'), 3: review('ignore') },
    meta,
  );
  assert.equal(again.expenses.length, 1);
  assert.equal(again.bankReceipts.length, 1);
  assert.equal(
    prepareImport(d, lines(), { 2: review('create', { override: true }) }, meta)
      .expenses.length,
    2,
  );
});
void test('FITID exige origem/conta; identificadores diferentes permanecem distintos', () => {
  const l = parseOfx(ofx()),
    d = prepareImport(
      defaults(),
      l,
      { 1: review() },
      { ...meta, source: 'ofx' },
    );
  assert.equal(previewImport(d, parseOfx(ofx()))[0].duplicate?.level, 'exact');
  assert.equal(previewImport(d, parseOfx(ofx('outro')))[0].duplicate, null);
  assert.equal(
    previewImport(d, parseOfx(ofx('test-1', '456')))[0].duplicate,
    null,
  );
});
void test('duplicata dentro do arquivo exige revisão e soma só a escolhida', () => {
  const l = parseCsv(
    csv + '\n10/09/2026;POSTO FICTÍCIO;-123,45;Conta teste',
    detectCsv(csv),
  );
  assert.equal(previewImport(defaults(), l)[2].status, 'duplicate');
  assert.throws(() =>
    prepareImport(defaults(), l, { 2: review(), 4: review() }, meta),
  );
});
void test('conciliação manual preserva gasto, trabalho, pagamentos, movimentos e serviços', () => {
  const d = defaults();
  d.expenses = [
    {
      ...emptyRow('expenses'),
      id: 'expense',
      name: 'POSTO FICTÍCIO',
      date: '2026-09-10',
      amount: 123.45,
    },
  ];
  d.work = [
    {
      ...emptyRow('work'),
      id: 'work',
      activity: 'Uber',
      date: '2026-09-11',
      hours: 1,
      revenue: 500,
    },
  ];
  const p = previewImport(d, lines());
  assert.equal(p[0].candidates[0].level, 'high_confidence');
  assert.equal(p[1].candidates[0].kind, 'work');
  const next = prepareImport(
    d,
    lines(),
    {
      2: review('match', { recordKind: 'expenses', recordId: 'expense' }),
      3: review('match', { recordKind: 'work', recordId: 'work' }),
    },
    meta,
  );
  assert.equal(next.expenses.length, 1);
  assert.equal(next.bankReceipts.length, 0);
  assert.equal(financial(next).cash, financial(d).cash);
  for (const kind of ['payments', 'movements', 'services'] as const) {
    const copy = structuredClone(d);
    copy[kind] = [
      {
        ...emptyRow(kind),
        id: 'existing',
        date: '2026-09-09',
        amount: 123.45,
        kind: 'aporte',
      },
    ];
    assert.ok(
      reconcileTransaction(transaction(), reconciliationIndex(copy)).some(
        (c) => c.kind === kind,
      ),
    );
  }
});
void test('parcela prevista cria um pagamento apenas por confirmação', () => {
  const d = defaults();
  d.debts = [
    {
      ...emptyRow('debts'),
      id: 'loan',
      name: 'Parcela',
      totalInstallments: 10,
      installmentAmount: 123.45,
      paidInstallments: 0,
      due: '2026-09-10',
    },
  ];
  assert.ok(
    previewImport(d, lines())[0].candidates.some((c) => c.kind === 'debts'),
  );
  const next = prepareImport(
    d,
    lines(),
    { 2: review('payment', { recordId: 'loan' }) },
    meta,
  );
  assert.equal(next.payments.length, 1);
  assert.equal(next.expenses.length, 0);
  assert.equal(next.payments[0].amount, 123.45);
  assert.equal(previewImport(next, lines())[0].status, 'duplicate');
});
void test('recorrência mensal em mês posterior é sugestão, não realizado', () => {
  const d = defaults();
  d.recurrences = [
    {
      ...emptyRow('recurrences'),
      id: 'rec',
      name: 'POSTO FICTÍCIO',
      kind: 'despesa',
      amount: 123.45,
      frequency: 'mensal',
      startDate: '2026-01-10',
    },
  ];
  assert.ok(
    previewImport(d, lines())[0].candidates.some(
      (c) => c.kind === 'recurrences',
    ),
  );
});
void test('transferência exige duas pontas e não cria patrimônio', () => {
  const text =
      'Data;Descrição;Valor;Conta\n10/09/2026;PIX;-500;Conta A\n11/09/2026;PIX;500;Conta B',
    l = parseCsv(text, detectCsv(text));
  const r = {
    2: review('transfer', { transferLine: 3 }),
    3: review('transfer', { transferLine: 2 }),
  };
  assert.throws(() => prepareImport(defaults(), l, { 2: r[2] }, meta));
  const d = prepareImport(defaults(), l, r, meta);
  assert.equal(financial(d).cash, 0);
  assert.equal(d.expenses.length, 0);
  assert.equal(d.bankReceipts.length, 0);
  assert.equal(d.imports.links.length, 2);
});
void test('categoria: regra exata, prioridade, conflito, desativação e regex limitada', () => {
  const rule: Rule = {
    id: 'r',
    pattern: 'posto',
    mode: 'contains',
    category: 'moto',
    enabled: true,
  };
  assert.equal(categorize('POSTO FICTÍCIO', [rule]).category, 'moto');
  assert.equal(categorize('POSTO FICTÍCIO', []).category, 'combustível');
  assert.equal(categorize('PIX', []).category, 'outras');
  const exact = {
    ...rule,
    id: 'e',
    pattern: 'posto ficticio',
    mode: 'equals' as const,
    category: 'outras',
  };
  assert.equal(categorize('POSTO FICTÍCIO', [rule, exact]).category, 'outras');
  assert.ok(
    categorize('POSTO', [rule, { ...rule, id: 'x', category: 'saúde' }])
      .conflict,
  );
  assert.equal(
    categorize('POSTO', [{ ...rule, enabled: false }]).category,
    'combustível',
  );
  assert.throws(() => safeRule({ ...rule, mode: 'regex', pattern: '(a+)+$' }));
  assert.equal(
    categorize('posto ficticio', [{ ...rule, mode: 'startsWith' }]).category,
    'moto',
  );
});
void test('assinaturas exigem 3 meses, aceitam pequena variação e apontam inatividade', () => {
  const t = [1, 2, 3].map((m, i) =>
    transaction({
      line: i + 1,
      date: `2026-0${m}-10`,
      description: 'Netflix',
      normalizedDescription: 'netflix',
      amountCents: [3990, 4190, 4190][i],
    }),
  );
  assert.equal(detectSubscriptions(t.slice(0, 1), '2026-03-20').length, 0);
  const s = detectSubscriptions(t, '2026-06-20')[0];
  assert.equal(s.inactive, true);
  assert.equal(s.annualCents, s.averageCents * 12);
  assert.equal(
    detectSubscriptions(
      t.map((r, i) => ({ ...r, date: `2026-03-${10 + i}` })),
      '2026-03-20',
    ).length,
    0,
  );
  assert.equal(
    detectSubscriptions(
      t.map((r) => ({
        ...r,
        description: 'Aluguel',
        normalizedDescription: 'aluguel',
      })),
      '2026-03-20',
    )[0].category,
    'Gasto recorrente',
  );
});
void test('backup/nuvem, perfil e regras fazem round trip de centavos sem arquivo bruto', () => {
  const d = prepareImport(
    defaults(),
    lines(),
    { 2: review('create', { remember: true }) },
    meta,
    { id: 'profile', name: 'Teste', options: detectCsv(csv) },
  );
  assert.deepEqual(parseBackup(backup(d)), d);
  assert.deepEqual(parseBackup(JSON.stringify(serializeSnapshot(d))), d);
  const raw = JSON.parse(backup(d));
  assert.equal(raw.data.expenses[0].amount, 12345);
  assert.equal(raw.data.imports.links[0].transaction.amountCents, 12345);
  assert.equal(raw.data.importVersion, 1);
});
void test('migração aditiva protegida e falha de quota deixam snapshot anterior intacto', () => {
  const old: Record<string, unknown> = { ...defaults(), planningVersion: 4 };
  delete old.importVersion;
  delete old.imports;
  delete old.bankReceipts;
  const raw = JSON.stringify(old),
    entries = new Map([[STORAGE_KEY, raw]]);
  const storage = {
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => {
      entries.set(k, v);
    },
  };
  const migrated = validateData(old);
  save(storage, migrated);
  assert.equal(
    entries.get('rota-money-before-migration:imports-v1:guest'),
    raw,
  );
  assert.deepEqual(validateData(migrated), migrated);
  assert.equal(migrated.planningVersion, 5);
  const before = entries.get(STORAGE_KEY);
  assert.throws(() =>
    save(
      {
        ...storage,
        setItem: () => {
          throw Error('quota');
        },
      },
      prepareImport(migrated, lines(), { 2: review() }, meta),
    ),
  );
  assert.equal(entries.get(STORAGE_KEY), before);
  assert.throws(() => validateData({ ...migrated, importVersion: 2 }));
  assert.throws(() => validateData({ ...migrated, planningVersion: 6 }));
});
void test('reset limpa metadados, exclusão preserva histórico de reimportação', () => {
  const d = prepareImport(defaults(), lines(), { 2: review() }, meta);
  const removed = remove(d, 'expenses', d.expenses[0].id);
  assert.equal(removed.imports.sessions.length, 1);
  assert.equal(previewImport(removed, lines())[0].status, 'duplicate');
  const reset = resetData(d, 'finance');
  assert.equal(reset.imports.links.length, 0);
  assert.equal(reset.imports.sessions.length, 0);
});
void test('hash depende dos bytes, não do nome', async () => {
  const a = new TextEncoder().encode(csv);
  assert.equal(await fileHash(a), await fileHash(a));
  assert.notEqual(
    await fileHash(a),
    await fileHash(new TextEncoder().encode(csv + ' ')),
  );
});
void test('1000, 10000 e 50000 linhas: parsing e índices sem busca quadrática', (t) => {
  for (const count of [1000, 10000, 50000]) {
    const text =
      'Data;Descrição;Valor;Conta\n' +
      Array.from(
        { length: count },
        (_, i) => `10/09/2026;Loja fictícia ${i};-1,20;Teste`,
      ).join('\n');
    const start = performance.now(),
      l = parseCsv(text, detectCsv(text)),
      p = previewImport(defaults(), l),
      elapsed = performance.now() - start;
    assert.equal(p.length, count);
    assert.ok(elapsed < 15000);
    t.diagnostic(`${count} transações: ${elapsed.toFixed(0)} ms`);
  }
});

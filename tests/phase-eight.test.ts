import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, emptyRow, type Row } from '../src/model';
import { investmentLedger } from '../src/services/investment-ledger';
import {
  investmentPosition,
  investmentPortfolio,
} from '../src/services/investment-portfolio';
import { passiveIncome, incomeYields } from '../src/services/passive-income';
import { investmentMaturities } from '../src/services/investment-maturities';
import { encodeMoney, decodeMoney } from '../src/services/money-codec';
import { financial } from '../src/calculations';
import { compareInvestmentBenchmark } from '../src/services/investment-benchmark';
import { buildMonthlySnapshot } from '../src/services/month-close';
import { investmentPeriod } from '../src/services/investment-period';
import { decode as decodeCloud } from '../src/services/cloud-codec';
import { validateData, save, STORAGE_KEY } from '../src/services/storage';

const at = '2026-09-26';
const asset = (extra: Partial<Row> = {}): Row => ({
  ...emptyRow('investments'),
  id: 'asset',
  name: 'Carteira',
  category: 'Ação',
  date: '2026-01-01',
  ...extra,
});
const movement = (
  id: string,
  kind: string,
  amount: number,
  units: number | null = null,
  extra: Partial<Row> = {},
): Row => ({
  ...emptyRow('movements'),
  id,
  investmentId: 'asset',
  date: '2026-09-01',
  kind,
  amount,
  units,
  feesCents: 0,
  taxCents: 0,
  ...extra,
});
void test('preço médio incorpora compras e custos, venda proporcional e recompra', () => {
  const rows = [
    movement('1', 'aporte', 100, 10, { operation: 'compra', feesCents: 100 }),
    movement('2', 'aporte', 200, 10, { operation: 'compra', feesCents: 100 }),
  ];
  const bought = investmentLedger(asset(), rows, at);
  assert.equal(bought.quantity, 20);
  assert.equal(bought.basisCents, 30200);
  assert.equal(bought.averagePrice, 15.1);
  rows.push(movement('3', 'retirada', 100, 5, { operation: 'venda' }));
  const sold = investmentLedger(asset(), rows, at);
  assert.equal(sold.quantity, 15);
  assert.equal(sold.averagePrice, 15.1);
  assert.equal(sold.entries.at(-1)?.realizedGainCents, 2450);
  rows.push(movement('4', 'retirada', 400, 15, { operation: 'venda' }));
  const closed = investmentLedger(asset(), rows, at);
  assert.equal(closed.quantity, 0);
  assert.equal(closed.basisCents, 0);
  assert.equal(closed.bookCents, 0);
  rows.push(movement('5', 'aporte', 50, 2, { operation: 'compra' }));
  assert.equal(investmentLedger(asset(), rows, at).averagePrice, 25);
});
void test('saldo legado não inventa custo ou quantidade; venda acima da posição é inválida', () => {
  const declared = asset({ balance: 100, quantity: 10, averagePrice: 8 });
  assert.equal(investmentLedger(declared, [], at).basisCents, 8000);
  assert.equal(investmentPosition(declared, [], at).grossResultCents, 2000);
  const legacy = investmentLedger(asset({ balance: 100 }), [], at);
  assert.equal(legacy.basisCents, null);
  assert.equal(legacy.quantity, null);
  assert.ok(
    investmentLedger(
      asset(),
      [movement('sale', 'retirada', 100, 1, { operation: 'venda' })],
      at,
    ).issues.length,
  );
});
void test('renda recebida entra no caixa uma vez e rendimento legado fica investido', () => {
  const d = defaults();
  d.investments = [asset({ category: 'CDB', balance: 100 })];
  d.movements = [
    movement('yield', 'rendimento', 10),
    movement('cash', 'rendimento', 5, null, {
      paidOut: 'sim',
      operation: 'juros',
    }),
  ];
  const f = financial(d, at);
  assert.equal(f.cash, 5);
  assert.equal(f.investments, 110);
  assert.equal(f.netWorth, 115);
  assert.equal(passiveIncome(d, at).totalCents, 500);
  const p = investmentPosition(d.investments[0], d.movements, at);
  assert.equal(p.grossResultCents, 1500);
});
void test('custos pagos em caixa não reduzem simultaneamente a posição', () => {
  const d = defaults();
  d.investments = [asset({ balance: 100 })];
  d.movements = [movement('fee', 'perda', 2, null, { operation: 'taxa' })];
  assert.equal(financial(d, at).cash, -2);
  assert.equal(financial(d, at).investments, 100);
  assert.equal(
    investmentPosition(d.investments[0], d.movements, at).netResultCents,
    -200,
  );
});
void test('renda passiva conserva meses zero e separa yield on cost de current yield', () => {
  const d = defaults();
  d.investments = [asset()];
  d.movements = [
    movement('jcp', 'rendimento', 12, null, {
      paidOut: 'sim',
      operation: 'JCP',
      taxCents: 200,
    }),
  ];
  const income = passiveIncome(d, at);
  assert.equal(income.months.length, 12);
  assert.equal(income.months[0].amountCents, 0);
  assert.equal(income.totalCents, 1000);
  assert.deepEqual(incomeYields(1000, 10000, 20000), {
    yieldOnCost: 0.1,
    currentYield: 0.05,
  });
  assert.deepEqual(incomeYields(0, 0, null), {
    yieldOnCost: null,
    currentYield: null,
  });
});
void test('cotação atual nunca reescreve passado; câmbio ausente permanece indisponível', () => {
  const a = asset({ balance: 100, quantity: 10 });
  const cached = investmentPosition(a, [], at, {
    price: 20,
    currency: 'BRL',
    date: '2026-09-25',
  });
  assert.equal(cached.valueCents, 20000);
  assert.equal(cached.valuationDate, '2026-09-25');
  assert.equal(
    investmentPosition(a, [], at, {
      price: 20,
      currency: 'BRL',
      date: '2026-09-27',
    }).valueCents,
    10000,
  );
  assert.equal(
    investmentPosition(a, [], at, { price: 20, currency: 'USD', date: at })
      .valueCents,
    null,
  );
  assert.equal(
    investmentPosition({ ...a, fxToBRL: 5 }, [], at, {
      price: 20,
      currency: 'USD',
      date: at,
    }).valueCents,
    100000,
  );
});
void test('calendário usa somente datas informadas e distingue vencido de próximos', () => {
  const d = defaults();
  d.investments = [asset({ maturity: '2026-10-01', couponDate: '2026-09-25' })];
  const calendar = investmentMaturities(d, at);
  assert.equal(calendar.events.length, 2);
  assert.equal(calendar.days30[0].days, 5);
  assert.equal(calendar.overdue.length, 1);
});
void test('codec preserva avaliação legada em reais e nova avaliação em centavos', () => {
  const d = defaults();
  d.investments = [asset({ currentValue: 123.45 })];
  const encoded = encodeMoney(d);
  assert.equal((encoded.investments as Row[])[0].currentValue, 12345);
  assert.equal(
    (decodeMoney(encoded).investments as Row[])[0].currentValue,
    123.45,
  );
  const old = {
    ...encoded,
    planningVersion: 6,
    investmentVersion: undefined,
    investments: [
      { ...(encoded.investments as Row[])[0], currentValue: 123.456 },
    ],
  };
  assert.equal(
    (decodeMoney(old).investments as Row[])[0].currentValue,
    123.456,
  );
});
void test('migração aditiva preserva bytes e rejeita versão futura', () => {
  const old = {
    ...defaults(),
    planningVersion: 6,
    investmentVersion: undefined,
  };
  const raw = JSON.stringify(old);
  const map = new Map([[STORAGE_KEY, raw]]);
  const migrated = validateData(old);
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
  save(storage, migrated);
  assert.equal(
    map.get('rota-money-before-migration:investments-v1:guest'),
    raw,
  );
  assert.deepEqual(validateData(migrated), migrated);
  assert.throws(() => validateData({ ...migrated, investmentVersion: 2 }));
});
void test('carteira indexa mil ativos e dez mil movimentos sem perder totais', () => {
  const d = defaults();
  for (let i = 0; i < 1000; i++) {
    d.investments.push(asset({ id: `a${i}` }));
    for (let j = 0; j < 10; j++)
      d.movements.push(
        movement(`${i}-${j}`, 'aporte', 1, 1, { investmentId: `a${i}` }),
      );
  }
  const p = investmentPortfolio(d, at);
  assert.equal(p.positions.length, 1000);
  assert.equal(p.knownValueCents, 1000000);
  assert.equal(p.distribution('category')[0].share, 1);
});
void test('benchmark exige mesmas datas e cobertura; diferença é em pontos percentuais', () => {
  for (const name of ['CDI', 'Selic'] as const) {
    const base = {
      name,
      start: '2026-01-01',
      end: '2026-01-31',
      portfolioReturn: 0.02,
    };
    assert.equal(compareInvestmentBenchmark(base).benchmarkReturn, null);
    const match = { ...base, returnRate: 0.01, complete: true };
    assert.equal(
      compareInvestmentBenchmark({ ...base, observations: [match] })
        .differencePp,
      1,
    );
    assert.equal(
      compareInvestmentBenchmark({
        ...base,
        observations: [{ ...match, complete: false }],
      }).benchmarkReturn,
      null,
    );
  }
  const base = {
    name: 'IPCA',
    start: '2026-01-01',
    end: '2026-01-31',
    portfolioReturn: 0.02,
    inflation: [{ month: '2026-01', percent: 1 }],
  };
  assert.ok(
    Math.abs(
      compareInvestmentBenchmark(base).portfolioReal! - (1.02 / 1.01 - 1),
    ) < 1e-10,
  );
  assert.equal(
    compareInvestmentBenchmark({ ...base, end: '2026-01-30' }).benchmarkReturn,
    null,
  );
});
void test('fechamento mensal separa aporte, venda e renda recebida sem duplicar patrimônio', async () => {
  const d = defaults();
  d.investments = [asset({ costsKnown: 'sim' })];
  d.movements = [
    movement('buy', 'aporte', 100, 10, { operation: 'compra' }),
    movement('income', 'rendimento', 10, null, {
      operation: 'dividendo',
      paidOut: 'sim',
    }),
    movement('sale', 'retirada', 60, 5, { operation: 'venda' }),
  ];
  const snapshot = await buildMonthlySnapshot(d, '2026-09', {
    at,
    generatedAt: at + 'T12:00:00Z',
  });
  assert.equal(snapshot.investmentContributionsCents, 10000);
  assert.equal(snapshot.investmentWithdrawalsCents, 6000);
  assert.equal(snapshot.investmentReturnCents, 2000);
  assert.equal(snapshot.netWorthCents, 2000);
  assert.equal(snapshot.closingCashCents, -3000);
});
void test('retorno do período não vira taxa falsa com aportes intermediários', () => {
  const d = defaults();
  d.investments = [asset({ category: 'CDB', balance: 100, costsKnown: 'sim' })];
  d.movements = [movement('yield', 'rendimento', 10)];
  assert.equal(investmentPeriod(d, '2026-09-01', '2026-09-26').returnRate, 0.1);
  d.movements.push(movement('deposit', 'aporte', 50));
  const result = investmentPeriod(d, '2026-09-01', '2026-09-26');
  assert.equal(result.returnRate, null);
  assert.equal(result.nominalCents, 1000);
});
void test('roundtrip remoto conserva metadados, valores e custo sem alterar CAS', () => {
  const d = defaults();
  d.investments = [asset()];
  d.movements = [
    movement('buy', 'aporte', 10, 0.12345678, {
      operation: 'compra',
      feesCents: 25,
    }),
  ];
  const timestamp = '2026-09-26T12:00:00.123456+00:00';
  const remote = decodeCloud({
    data: { version: 6, data: encodeMoney(d) },
    updated_at: timestamp,
    device_id: 'test',
    schema_version: 6,
  });
  assert.equal(remote.updated_at, timestamp);
  assert.equal(remote.data.investmentVersion, 1);
  assert.equal(remote.data.movements[0].units, 0.12345678);
  assert.equal(remote.data.movements[0].feesCents, 25);
});
void test('resgate de renda fixa preserva saldo e reduz custo proporcionalmente', () => {
  assert.deepEqual(
    investmentLedger(
      asset({ category: 'CDB' }),
      [movement('buy', 'aporte', 100, null, { operation: 'compra' })],
      at,
    ).issues,
    [],
  );
  assert.ok(
    investmentLedger(
      asset(),
      [movement('buy', 'aporte', 100, null, { operation: 'compra' })],
      at,
    ).issues.length > 0,
  );
  const a = asset({ category: 'CDB', balance: 100, openingCostCents: 10000 });
  const ledger = investmentLedger(
    a,
    [
      movement('yield', 'rendimento', 20),
      movement('redeem', 'retirada', 60, null, { operation: 'resgate' }),
    ],
    at,
  );
  assert.equal(ledger.bookCents, 6000);
  assert.equal(ledger.basisCents, 5000);
  assert.equal(ledger.quantity, null);
});
void test('migração aborta antes de substituir estado quando backup protegido não cabe', () => {
  const old = {
    ...defaults(),
    planningVersion: 6,
    investmentVersion: undefined,
  };
  const raw = JSON.stringify(old);
  const map = new Map([[STORAGE_KEY, raw]]);
  assert.throws(() =>
    save(
      {
        getItem: (k) => map.get(k) ?? null,
        setItem: () => {
          throw Error('quota');
        },
      },
      validateData(old),
    ),
  );
  assert.equal(map.get(STORAGE_KEY), raw);
});
void test('avaliação manual datada entra uma vez no patrimônio e não muda preço médio', async () => {
  assert.equal(
    investmentLedger(
      asset({ balance: 100, currentValue: null, valuationDate: '2026-09-10' }),
      [],
      at,
    ).bookCents,
    10000,
  );
  const d = defaults();
  d.investments = [
    asset({
      balance: 100,
      quantity: 10,
      openingCostCents: 10000,
      currentValue: 150,
      valuationDate: '2026-09-10',
    }),
  ];
  assert.equal(financial(d, '2026-09-09').investments, 100);
  assert.equal(financial(d, at).investments, 150);
  assert.equal(financial(d, at).cash, 0);
  assert.equal(investmentLedger(d.investments[0], [], at).averagePrice, 10);
  const snapshot = await buildMonthlySnapshot(d, '2026-09', {
    at,
    generatedAt: at + 'T12:00:00Z',
  });
  assert.equal(snapshot.investmentReturnCents, 5000);
  assert.equal(snapshot.netWorthCents, 15000);
  d.movements = [
    movement('sale', 'retirada', 40, 2, {
      operation: 'venda',
      date: '2026-09-11',
    }),
  ];
  assert.equal(financial(d, at).investments, 120);
  assert.equal(financial(d, at).cash, 40);
});

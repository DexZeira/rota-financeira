import test from 'node:test';
import assert from 'node:assert/strict';
import { inflationFactor, accumulatedInflation, nominalToReal, realToNominal, realReturn, requiredNominalReturn, netRealReturn, inflationAdjustedTarget, inflationAdjustedContribution } from '../src/services/purchasing-power';
import { estimateIncomeTax } from '../src/services/investment-tax';
import { projectPurchasingPower } from '../src/services/purchasing-power';

const near = (actual: number | null, expected: number) => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) < 1e-10, `${actual} != ${expected}`);
};
void test('inflação composta: 10000 a 5% por cinco anos e prazo fracionado', () => {
  near(inflationFactor(.05, 5), 1.05 ** 5);
  assert.equal(realToNominal(10000, .05, 5), 12762.82);
  near(inflationFactor(.21, .5), 1.1);
  assert.equal(realToNominal(1000, .21, .5), 1100);
});
void test('nominal e real são inversos até o arredondamento monetário', () => {
  assert.equal(nominalToReal(100000, .05, 10), 61391.33);
  assert.equal(realToNominal(100000, .05, 10), 162889.46);
  assert.ok(Math.abs(nominalToReal(realToNominal(100000, .05, 10)!, .05, 10)! - 100000) <= .01);
});
void test('retorno real usa divisão composta e não diferença de taxas', () => {
  near(realReturn(.10, .05), 1.1 / 1.05 - 1);
  near(requiredNominalReturn(.05, .04), .092);
  near(realReturn(requiredNominalReturn(.05, .04), .05), .04);
});
void test('invariantes de ganho, perda e empate com inflação', () => {
  for (const inflation of [-.05, 0, .03, .1, 1]) {
    near(realReturn(inflation, inflation), 0);
    assert.ok(realReturn(inflation + .02, inflation)! > 0);
    assert.ok(realReturn(inflation - .02, inflation)! < 0);
  }
});
void test('deflação, retorno negativo, perda total e taxa zero', () => {
  assert.equal(nominalToReal(950, -.05, 1), 1000);
  assert.ok(realReturn(-.10, -.05)! < 0);
  near(realReturn(-1, .05), -1);
  assert.equal(inflationFactor(0, 20), 1);
  assert.equal(inflationFactor(.05, 0), 1);
});
void test('dados ausentes nunca viram taxa zero ou retorno real conhecido', () => {
  assert.equal(inflationFactor(null, 5), null);
  assert.equal(nominalToReal(1000, null, 5), null);
  assert.equal(realToNominal(1000, null, 5), null);
  assert.equal(realReturn(.1, null), null);
  assert.equal(realReturn(null, .05), null);
  assert.equal(requiredNominalReturn(null, .04), null);
  assert.equal(accumulatedInflation([]), null);
  assert.equal(accumulatedInflation([.01, null]), null);
});
void test('série mensal multiplica fatores em vez de somar percentuais', () => {
  near(accumulatedInflation([.01, -.002, .015]), 1.01 * .998 * 1.015 - 1);
  assert.equal(accumulatedInflation([0, 0]), 0);
});
void test('retorno líquido real reutiliza imposto existente e desconta encargos explícitos', () => {
  const input = { principal: 10000, grossFinal: 11000, fees: 20, iof: 0, incomeTax: estimateIncomeTax(1000, 800, 'CDB'), inflationInPeriod: .05 };
  const result = netRealReturn(input);
  assert.equal(result.netFinal, 10830);
  assert.equal(result.netProfit, 830);
  assert.equal(result.realFinal, 10314.29);
  assert.equal(result.realProfit, 314.29);
  assert.equal(result.inflationLoss, 515.71);
  near(result.netRealRate, 1.083 / 1.05 - 1);
  assert.equal(netRealReturn({ ...input, iof: 100 }).netFinal, 10730);
  assert.equal(netRealReturn({ ...input, incomeTax: null }).netFinal, null);
  assert.equal(netRealReturn({ ...input, fees: null }).realFinal, null);
  assert.equal(netRealReturn({ ...input, inflationInPeriod: null }).realFinal, null);
  assert.equal(netRealReturn({ ...input, inflationInPeriod: null }).netFinal, 10830);
});
void test('custos em centavos, sem taxa sobre capital inicial nulo', () => {
  const result = netRealReturn({ principal: 100, grossFinal: 110.005, fees: .105, incomeTax: 0, iof: 0, inflationInPeriod: 0 });
  assert.equal(result.netFinal, 109.90);
  const zero = netRealReturn({ principal: 0, grossFinal: 0, fees: 0, incomeTax: 0, iof: 0, inflationInPeriod: 0 });
  assert.equal(zero.netRealRate, null);
  assert.equal(zero.realFinal, 0);
});
void test('meta corrigida preserva base e aportes mudam somente no aniversário anual', () => {
  assert.deepEqual(inflationAdjustedTarget(40000, .05, 5), { targetBase: 40000, targetInflationAdjusted: 51051.26, status: 'projected' });
  assert.equal(inflationAdjustedContribution(500, .05, 11), 500);
  assert.equal(inflationAdjustedContribution(500, .05, 12), 525);
  assert.equal(inflationAdjustedContribution(500, .05, 24), 551.25);
  assert.equal(inflationAdjustedContribution(500, null, 12), null);
});
void test('hipóteses inválidas e overflow são rejeitados explicitamente', () => {
  for (const value of [NaN, Infinity, -1, -2]) assert.throws(() => inflationFactor(value, 1));
  assert.throws(() => inflationFactor(.05, -1));
  assert.throws(() => inflationFactor(1, 10000));
  assert.throws(() => realToNominal(Number.MAX_VALUE, .05, 10));
  assert.throws(() => inflationAdjustedContribution(500, .05, 1.5));
  assert.throws(() => netRealReturn({ principal: 100, grossFinal: 110, fees: 111, incomeTax: 0, iof: 0, inflationInPeriod: 0 }));
});

const projection = { initial: 1000, months: 12, monthlyContribution: 100, annualReturn: .05, annualInflation: .05, adjustContributions: false, terminalFees: 0, terminalIncomeTax: 0, terminalIof: 0 };
void test('projeção desconta cada aporte na sua data e não inventa ganho real quando retorno iguala inflação', () => {
  const result = projectPurchasingPower(projection)!;
  assert.equal(result.nominalCapital, 2200);
  assert.ok(result.nominalFinal > result.nominalCapital);
  assert.ok(Math.abs(result.realGain!) <= .01);
  const withCharges = projectPurchasingPower({ ...projection, terminalFees: 10 })!;
  assert.ok(withCharges.realGain! < 0);
});
void test('projeção respeita capital inicial, aportes anuais corrigidos, prazo zero e imposto desconhecido', () => {
  const zeroRate = projectPurchasingPower({ ...projection, annualReturn: 0, annualInflation: 0 })!;
  assert.equal(zeroRate.nominalFinal, 2200);
  assert.equal(zeroRate.realGain, 0);
  assert.equal(projectPurchasingPower({ ...projection, months: 0 })?.nominalFinal, 1000);
  const adjusted = projectPurchasingPower({ ...projection, initial: 0, months: 24, monthlyContribution: 500, annualReturn: 0, adjustContributions: true })!;
  assert.equal(adjusted.nominalCapital, 12300);
  assert.equal(projectPurchasingPower({ ...projection, terminalIncomeTax: null })?.netFinal, null);
  assert.equal(projectPurchasingPower({ ...projection, annualReturn: null }), null);
  assert.equal(projectPurchasingPower({ ...projection, annualInflation: null })?.realFinal, null);
  assert.throws(() => projectPurchasingPower({ ...projection, months: 1201 }));
});

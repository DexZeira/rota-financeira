import { toCents, fromCents } from './money-codec';

/** Rates are decimal fractions (0.05 = 5%); years may be fractional.
 * Monetary inputs/outputs use BRL, rounded through the existing cents codec.
 * Missing inputs remain null. Invalid assumptions throw instead of becoming zero.
 */
function finite(value: number) {
  if (!Number.isFinite(value)) throw Error('Hipótese não finita.');
  return value;
}
function rate(value: number, allowTotalLoss = false) {
  finite(value);
  if (allowTotalLoss ? value < -1 : value <= -1) throw Error('Taxa fora do domínio composto.');
  return value;
}
function years(value: number) {
  if (finite(value) < 0) throw Error('Prazo negativo.');
  return value;
}
function money(value: number) { return fromCents(toCents(value)); }

export function inflationFactor(annualInflation: number | null, durationYears: number): number | null {
  years(durationYears);
  if (annualInflation === null) return null;
  const factor = finite(Math.pow(1 + rate(annualInflation), durationYears));
  if (factor <= 0) throw Error('Fator de inflação fora do limite numérico.');
  return factor;
}

/** Observed monthly rates must cover the entire requested period, in order.
 * An empty or incomplete series is unavailable, never zero inflation.
 */
export function accumulatedInflation(monthlyRates: readonly (number | null)[]): number | null {
  if (!monthlyRates.length || monthlyRates.some((item) => item === null)) return null;
  const factor = monthlyRates.reduce<number>((value, item) => finite(value * (1 + rate(item!))), 1);
  if (factor <= 0) throw Error('Fator de inflação fora do limite numérico.');
  return factor - 1;
}

export function nominalToReal(amount: number, annualInflation: number | null, durationYears: number): number | null {
  finite(amount);
  const factor = inflationFactor(annualInflation, durationYears);
  return factor === null ? null : money(amount / factor);
}

export function realToNominal(amount: number, annualInflation: number | null, durationYears: number): number | null {
  finite(amount);
  const factor = inflationFactor(annualInflation, durationYears);
  return factor === null ? null : money(amount * factor);
}

/** Both rates must describe the SAME period. No implicit annualization. */
export function realReturn(nominalReturn: number | null, inflation: number | null): number | null {
  if (nominalReturn === null || inflation === null) return null;
  return finite((1 + rate(nominalReturn, true)) / (1 + rate(inflation)) - 1);
}

export function requiredNominalReturn(inflation: number | null, desiredRealReturn: number): number | null {
  rate(desiredRealReturn, true);
  return inflation === null ? null : finite((1 + rate(inflation)) * (1 + desiredRealReturn) - 1);
}

export type NetRealInput = {
  principal: number;
  grossFinal: number;
  /** Explicit amounts supplied by the applicable tax/cost calculation.
   * null means unknown; zero means a confirmed absence of that charge.
   * Do not assume fees are deductible for income tax.
   */
  fees: number | null;
  incomeTax: number | null;
  iof: number | null;
  inflationInPeriod: number | null;
};

/** Single-lot settlement, without intermediate deposits or withdrawals.
 * Tax policy belongs to investment-tax, not to this purchasing-power engine.
 */
export function netRealReturn(input: NetRealInput) {
  const principal = toCents(input.principal);
  const gross = toCents(input.grossFinal);
  if (principal < 0 || gross < 0) throw Error('Patrimônio negativo.');
  const charges = [input.fees, input.incomeTax, input.iof].map((item) => {
    if (item === null) return null;
    const cents = toCents(item);
    if (cents < 0) throw Error('Custo ou imposto negativo.');
    return cents;
  });
  const net = charges.some((item) => item === null) ? null
    : gross - charges.reduce<number>((total, item) => total + item!, 0);
  if (net !== null && (!Number.isSafeInteger(net) || net < 0)) throw Error('Custos excedem o patrimônio ou limite seguro.');
  const nominalRate = principal > 0 ? gross / principal - 1 : null;
  const netRate = principal > 0 && net !== null ? net / principal - 1 : null;
  const realFinal = net === null ? null : nominalToReal(fromCents(net), input.inflationInPeriod, 1);
  return {
    grossFinal: fromCents(gross), grossProfit: fromCents(gross - principal),
    fees: charges[0] === null ? null : fromCents(charges[0]),
    incomeTax: charges[1] === null ? null : fromCents(charges[1]),
    iof: charges[2] === null ? null : fromCents(charges[2]),
    nominalRate, netRate, netFinal: net === null ? null : fromCents(net),
    netProfit: net === null ? null : fromCents(net - principal),
    realFinal,
    realProfit: realFinal === null ? null : fromCents(toCents(realFinal) - principal),
    netRealRate: realReturn(netRate, input.inflationInPeriod),
    inflationLoss: realFinal === null || net === null ? null : fromCents(net - toCents(realFinal)),
  };
}

/** Projection only: preserves target base and never mutates a stored plan. */
export function inflationAdjustedTarget(targetBase: number, annualInflation: number | null, durationYears: number) {
  if (targetBase < 0) throw Error('Meta negativa.');
  return { targetBase: money(targetBase), targetInflationAdjusted: realToNominal(targetBase, annualInflation, durationYears), status: 'projected' as const };
}

/** Annual adjustment at each completed anniversary (not every month). */
export function inflationAdjustedContribution(monthlyBase: number, annualInflation: number | null, elapsedMonths: number): number | null {
  if (!Number.isInteger(elapsedMonths) || elapsedMonths < 0 || monthlyBase < 0) throw Error('Aporte ou mês inválido.');
  return realToNominal(monthlyBase, annualInflation, Math.floor(elapsedMonths / 12));
}

export type PurchasingPowerProjection = {
  initial: number;
  months: number;
  monthlyContribution: number;
  annualReturn: number | null;
  annualInflation: number | null;
  adjustContributions: boolean;
  /** Known terminal charges. They are NOT estimated tax rules for each lot. */
  terminalFees: number | null;
  terminalIncomeTax: number | null;
  terminalIof: number | null;
};

/** End-of-month deposits; returns compounded monthly from an annual effective
 * rate. Each deposit is deflated at its own date for the real capital basis.
 * No assumed per-lot taxation; unknown terminal charges keep net totals null.
 */
export function projectPurchasingPower(input: PurchasingPowerProjection) {
  if (!Number.isInteger(input.months) || input.months < 0 || input.months > 1200) throw Error('Prazo deve ser de 0 a 1200 meses.');
  if (finite(input.initial) < 0 || finite(input.monthlyContribution) < 0) throw Error('Capital e aportes devem ser não negativos.');
  let balance = money(input.initial);
  let nominalCapital = toCents(input.initial);
  let realCapital: number | null = input.initial;
  if (input.annualReturn === null || (input.adjustContributions && input.annualInflation === null)) return null;
  const monthlyGrowth = Math.pow(1 + rate(input.annualReturn, true), 1 / 12);
  for (let month = 1; month <= input.months; month++) {
    const contribution = input.adjustContributions
      ? inflationAdjustedContribution(input.monthlyContribution, input.annualInflation, month - 1)!
      : money(input.monthlyContribution);
    balance = finite(balance * monthlyGrowth + contribution);
    // Validate the running balance without rounding hypothetical earnings monthly.
    toCents(balance);
    nominalCapital += toCents(contribution);
    fromCents(nominalCapital);
    const factor = inflationFactor(input.annualInflation, month / 12);
    realCapital = factor === null || realCapital === null ? null : realCapital + contribution / factor;
  }
  const inflation = inflationFactor(input.annualInflation, input.months / 12);
  const settlement = netRealReturn({ principal: fromCents(nominalCapital), grossFinal: money(balance), fees: input.terminalFees, incomeTax: input.terminalIncomeTax, iof: input.terminalIof, inflationInPeriod: inflation === null ? null : inflation - 1 });
  return {
    status: 'projected' as const,
    nominalCapital: fromCents(nominalCapital),
    realCapital: realCapital === null ? null : money(realCapital),
    nominalFinal: settlement.grossFinal,
    netFinal: settlement.netFinal,
    realFinal: settlement.realFinal,
    realGain: settlement.realFinal === null || realCapital === null ? null : money(settlement.realFinal - money(realCapital)),
    inflationLoss: settlement.inflationLoss,
  };
}

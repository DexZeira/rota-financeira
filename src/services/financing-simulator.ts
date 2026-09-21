export type FinancingInput = {
  priceCents: number;
  downPaymentCents: number;
  installments: number;
  monthlyRate: number | null;
  annualCet: number | null;
};
export function decisionMoney(value: number, label = 'Valor') {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000_000)
    throw Error(`${label}: use centavos inteiros entre zero e R$ 1 bilhão.`);
  return value;
}
export function decisionRate(value: number | null, label = 'Taxa') {
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 10))
    throw Error(`${label}: informe uma taxa finita entre 0% e 1.000%.`);
  return value;
}
export const annualToMonthly = (annual: number) =>
  Math.expm1(Math.log1p(decisionRate(annual)!) / 12);
export const monthlyToAnnual = (monthly: number) =>
  Math.expm1(Math.log1p(decisionRate(monthly)!) * 12);
/** PRICE: interest rounded once per installment, in cents. The final payment
 * settles the remaining principal exactly; APR/CET replaces, never adds to, interest. */
export function simulateFinancing(input: FinancingInput) {
  decisionMoney(input.priceCents);
  decisionMoney(input.downPaymentCents);
  if (input.downPaymentCents > input.priceCents)
    throw Error('Entrada maior que o preço.');
  if (
    !Number.isInteger(input.installments) ||
    input.installments < 1 ||
    input.installments > 600
  )
    throw Error('Prazo deve ser de 1 a 600 parcelas.');
  decisionRate(input.monthlyRate);
  decisionRate(input.annualCet, 'CET anual');
  const rate =
    input.annualCet !== null
      ? annualToMonthly(input.annualCet)
      : input.monthlyRate;
  const principalCents = input.priceCents - input.downPaymentCents;
  const schedule: {
    number: number;
    paymentCents: number;
    interestCents: number;
    principalCents: number;
    balanceCents: number;
  }[] = [];
  if (rate === null && principalCents > 0)
    return {
      principalCents,
      monthlyRate: null,
      source: 'Taxa não informada',
      paymentCents: null,
      totalCents: null,
      interestCents: null,
      schedule,
      complete: false,
    };
  const r = rate ?? 0;
  const paymentCents =
    r === 0
      ? Math.round(principalCents / input.installments)
      : Math.round(
          (principalCents * r) /
            -Math.expm1(-input.installments * Math.log1p(r)),
        );
  let balance = principalCents,
    interestTotal = 0;
  for (let n = 1; n <= input.installments; n++) {
    const interest = Math.round(balance * r);
    const amortization =
      n === input.installments
        ? balance
        : Math.min(balance, Math.max(0, paymentCents - interest));
    balance -= amortization;
    interestTotal += interest;
    if (
      ![balance, interestTotal, amortization + interest].every(
        Number.isSafeInteger,
      )
    )
      throw Error('Financiamento ultrapassa a precisão monetária segura.');
    schedule.push({
      number: n,
      paymentCents: amortization + interest,
      interestCents: interest,
      principalCents: amortization,
      balanceCents: balance,
    });
  }
  return {
    principalCents,
    monthlyRate: r,
    source:
      input.annualCet !== null
        ? 'CET anual efetivo convertido para mensal'
        : 'Juros mensais informados',
    paymentCents,
    totalCents: input.priceCents + interestTotal,
    interestCents: interestTotal,
    schedule,
    complete: true,
  };
}

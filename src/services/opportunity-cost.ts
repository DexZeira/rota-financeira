import { nominalToReal, projectPurchasingPower } from './purchasing-power';
import { decisionMoney, decisionRate } from './financing-simulator';
import { toCents } from './money-codec';
/** Hypothetical gross return, not a loss, prediction or tax calculation. */
export function opportunityCost(
  capitalCents: number,
  annualReturn: number | null,
  months: number,
  annualInflation: number | null = null,
  monthlyContributionCents = 0,
) {
  decisionMoney(capitalCents);
  decisionMoney(monthlyContributionCents);
  decisionRate(annualReturn, 'Retorno');
  decisionRate(annualInflation, 'Inflação');
  if (!Number.isFinite(months) || months < 0 || months > 600)
    throw Error('Horizonte deve ficar entre 0 e 600 meses.');
  if (annualReturn === null) return null;
  const whole = Math.floor(months),
    fraction = months - whole;
  const projection = projectPurchasingPower({
    initial: capitalCents / 100,
    months: whole,
    monthlyContribution: monthlyContributionCents / 100,
    annualReturn,
    annualInflation,
    adjustContributions: false,
    terminalFees: null,
    terminalIncomeTax: null,
    terminalIof: null,
  })!;
  const finalCents = toCents(
    projection.nominalFinal * (1 + annualReturn) ** (fraction / 12),
  );
  const real = nominalToReal(finalCents / 100, annualInflation, months / 12);
  return {
    finalCents,
    capitalCents: capitalCents + whole * monthlyContributionCents,
    potentialReturnCents:
      finalCents - capitalCents - whole * monthlyContributionCents,
    realCents: real === null ? null : toCents(real),
    status: 'projected' as const,
  };
}

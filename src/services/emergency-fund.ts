import { type Data, num } from '../model';
import { investmentBalance } from '../calculations';
import { toCents } from './money-codec';
import {
  planningPreferences,
  type calculateCostOfLiving,
} from './cost-of-living';
export function calculateEmergencyFund(
  d: Data,
  at: string,
  living: ReturnType<typeof calculateCostOfLiving>,
) {
  const allocations = new Map(
    d.reserveAllocations.map((r) => [r.investmentId, r]),
  );
  let totalCents = 0,
    immediateCents = 0,
    unknownLiquidityCents = 0;
  for (const row of d.investments) {
    const allocation = allocations.get(row.id);
    if (
      allocation
        ? allocation.enabled !== 'sim'
        : row.category !== 'reserva de emergência'
    )
      continue;
    const value = Math.max(0, toCents(investmentBalance(d, row, at)));
    totalCents += value;
    if (allocation?.liquidity === 'imediata') immediateCents += value;
    if (!allocation || allocation.liquidity === 'não informada')
      unknownLiquidityCents += value;
  }
  const minimum = living.minimumCents,
    months = d.planningSettings.length
      ? num(planningPreferences(d).emergencyMonths)
      : num(d.settings.emergencyMonths);
  const targetCents =
    months > 0 && minimum > 0 ? Math.round(minimum * months) : null;
  return {
    totalCents,
    immediateCents,
    unknownLiquidityCents,
    targetCents,
    months: months || null,
    missingCents:
      targetCents === null ? null : Math.max(0, targetCents - totalCents),
    partial: living.partial,
    coverage: minimum > 0 ? totalCents / minimum : null,
    immediateCoverage: minimum > 0 ? immediateCents / minimum : null,
  };
}
export function emergencyScenario(
  reserveCents: number,
  minimumCents: number,
  incomeCents: number,
  incomeLossPercent: number,
  unexpectedCents: number,
) {
  if (
    [reserveCents, minimumCents, incomeCents, unexpectedCents].some(
      (n) => !Number.isSafeInteger(n) || n < 0,
    ) ||
    !Number.isFinite(incomeLossPercent) ||
    incomeLossPercent < 0 ||
    incomeLossPercent > 100
  )
    throw Error('Cenário inválido.');
  const afterCents = Math.max(0, reserveCents - unexpectedCents),
    burn = Math.max(
      0,
      minimumCents - Math.round(incomeCents * (1 - incomeLossPercent / 100)),
    );
  return {
    before: minimumCents > 0 ? reserveCents / minimumCents : null,
    after: burn > 0 ? afterCents / burn : null,
    noDepletion: burn === 0 && minimumCents > 0,
    afterCents,
  };
}

import { type Data, type Row, emptyRow, num } from '../model';
import { financial, investmentBalance, debtState } from '../calculations';
import { assetValues } from './assets';
import { toCents, fromCents } from './money-codec';
import { nominalToReal, realReturn } from './purchasing-power';
export const liquidityLabel: Record<string, string> = {
  immediate: 'Imediata',
  short_term: 'Curto prazo',
  restricted: 'Restrita',
  illiquid: 'Ilíquida',
  unknown: 'Não informada',
};
function index(rows: Row[], key: string) {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const id = String(row[key]);
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(row);
  }
  return map;
}
export function calculateNetWorth(d: Data, at: string) {
  const movements = index(d.movements, 'investmentId'),
    payments = index(d.payments, 'debtId');
  const cashCents = toCents(
    financial({ ...d, investments: [], debts: [] }, at).cash,
  );
  const reserve = new Map(d.reserveAllocations.map((r) => [r.investmentId, r]));
  const liquidity: Record<string, number> = {
    immediate: Math.max(0, cashCents),
    short_term: 0,
    restricted: 0,
    illiquid: 0,
    unknown: 0,
  };
  const investmentPositions: Record<string, number> = Object.create(null),
    debtPositions: Record<string, number> = Object.create(null),
    assetPositions: Record<string, number> = Object.create(null);
  let investmentsCents = 0,
    liabilitiesCents = Math.max(0, -cashCents),
    reserveCents = 0;
  for (const row of d.investments) {
    const value = toCents(
      investmentBalance(
        { ...d, movements: movements.get(row.id) || [] },
        row,
        at,
      ),
    );
    investmentPositions[row.id] = value;
    investmentsCents += value;
    const allocation = reserve.get(row.id);
    if (
      allocation
        ? allocation.enabled === 'sim'
        : row.category === 'reserva de emergência'
    )
      reserveCents += value;
    const bucket =
      allocation?.enabled === 'sim' && allocation.liquidity === 'imediata'
        ? 'immediate'
        : row.liquidity === 'imediata'
          ? 'immediate'
          : row.liquidity === 'D+1'
            ? 'short_term'
            : ['com carência', 'somente no vencimento'].includes(
                  String(row.liquidity),
                )
              ? 'restricted'
              : 'unknown';
    liquidity[bucket] += value;
  }
  for (const row of d.debts) {
    const value = toCents(
      debtState({ ...d, payments: payments.get(row.id) || [] }, row, at)
        .balance,
    );
    debtPositions[row.id] = value;
    liabilitiesCents += value;
  }
  const assets = assetValues(d, at);
  let assetsCents = 0,
    vehiclesCents = 0,
    missingValues = 0;
  for (const item of assets) {
    if (!item.current) continue;
    if (item.valueCents === null) {
      missingValues++;
      continue;
    }
    assetPositions[item.asset.id] = item.valueCents;
    assetsCents += item.valueCents;
    if (['motorcycle', 'car'].includes(String(item.asset.type)))
      vehiclesCents += item.valueCents;
    liquidity[String(item.asset.liquidity)] += item.valueCents;
  }
  const grossCents = Math.max(0, cashCents) + investmentsCents + assetsCents;
  return {
    at,
    cashCents,
    investmentsCents,
    assetsCents,
    grossCents,
    liabilitiesCents,
    netCents: grossCents - liabilitiesCents,
    financialNetCents:
      Math.max(0, cashCents) + investmentsCents - liabilitiesCents,
    quickNetCents:
      liquidity.immediate + liquidity.short_term - liabilitiesCents,
    reserveCents,
    vehiclesCents,
    otherAssetsCents: assetsCents - vehiclesCents,
    liquidity,
    assets,
    missingValues,
    estimated: assets.some((r) => r.current && r.source === 'estimated'),
    partial: missingValues > 0,
    positions: {
      investments: investmentPositions,
      debts: debtPositions,
      assets: assetPositions,
    },
  };
}
export function createNetWorthSnapshot(d: Data, at: string): Row {
  const result = calculateNetWorth(d, at);
  return {
    ...emptyRow('netWorthSnapshots'),
    id: 'worth:' + at,
    date: at,
    cashCents: result.cashCents,
    investmentsCents: result.investmentsCents,
    assetsCents: result.assetsCents,
    liabilitiesCents: result.liabilitiesCents,
    netCents: result.netCents,
    partial: result.partial ? 1 : 0,
    notes: result.estimated ? 'Inclui avaliações estimadas.' : '',
    positions: JSON.stringify(result.positions),
  };
}
export function calculateNetWorthChange(
  d: Data,
  before: Row,
  after: Row,
  inflation: number | null = null,
) {
  const deltaCents = num(after.netCents) - num(before.netCents),
    nominal =
      num(before.netCents) > 0 ? deltaCents / num(before.netCents) : null;
  let internalFlowsCents = 0,
    returnsCents = 0;
  for (const row of d.movements) {
    if (
      String(row.date) <= String(before.date) ||
      String(row.date) > String(after.date)
    )
      continue;
    const cents = toCents(num(row.amount));
    if (row.kind === 'aporte') internalFlowsCents += cents;
    else if (row.kind === 'retirada') internalFlowsCents -= cents;
    else returnsCents += row.kind === 'perda' ? -cents : cents;
  }
  // Cash is signed in the bridge; its overdraft must not be counted again here.
  const cashChangeCents = num(after.cashCents) - num(before.cashCents),
    assetChangeCents = num(after.assetsCents) - num(before.assetsCents),
    debtReductionCents =
      num(before.liabilitiesCents) -
      Math.max(0, -num(before.cashCents)) -
      num(after.liabilitiesCents) +
      Math.max(0, -num(after.cashCents));
  const oldPositions = JSON.parse(String(before.positions)) as {
    assets: Record<string, number>;
  };
  const newPositions = JSON.parse(String(after.positions)) as {
    assets: Record<string, number>;
  };
  let valuationChangeCents = 0,
    addedAssetsCents = 0,
    removedAssetsCents = 0;
  for (const [id, value] of Object.entries(newPositions.assets)) {
    if (Object.hasOwn(oldPositions.assets, id))
      valuationChangeCents += value - oldPositions.assets[id];
    else addedAssetsCents += value;
  }
  for (const [id, value] of Object.entries(oldPositions.assets))
    if (!Object.hasOwn(newPositions.assets, id)) removedAssetsCents += value;
  const unexplainedCents =
    deltaCents -
    cashChangeCents -
    assetChangeCents -
    debtReductionCents -
    internalFlowsCents -
    returnsCents;
  const real = nominalToReal(fromCents(num(after.netCents)), inflation, 1);
  return {
    deltaCents,
    nominalPercent: nominal === null ? null : nominal * 100,
    realPercent:
      nominal === null || nominal < -1 ? null : realReturn(nominal, inflation),
    referenceNetCents: real === null ? null : toCents(real),
    cashChangeCents,
    internalFlowsCents,
    returnsCents,
    assetChangeCents,
    valuationChangeCents,
    addedAssetsCents,
    removedAssetsCents,
    debtReductionCents,
    unexplainedCents,
    partial: before.partial === 1 || after.partial === 1,
  };
}

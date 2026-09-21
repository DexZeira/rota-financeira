import { type Data, type Row, num } from '../model';
import { costs, daysBetween } from '../calculations';
import { workExpenseAmount } from '../expense-allocation';
import { workCashResult } from '../work-results';
import { assetValues, BIKE_ASSET_ID } from './assets';
import { calculateDepreciation } from './depreciation';
import { toCents } from './money-codec';
export function calculateOwnershipCost(d: Data, assetId: string, at: string) {
  const item = assetValues(d, at).find((r) => r.asset.id === assetId);
  if (!item) return null;
  const asset = item.asset,
    from = String(asset.purchaseDate || ''),
    links = new Map(
      d.assetCostLinks.map((r) => [r.recordKind + ':' + r.recordId, r]),
    );
  const categories: Record<string, number> = {
    combustível: 0,
    manutenção: 0,
    pneus: 0,
    peças: 0,
    seguro: 0,
    IPVA: 0,
    licenciamento: 0,
    documentação: 0,
    juros: 0,
    outros: 0,
  };
  let cashCents = 0,
    monthCents = 0,
    last12Cents = 0,
    professionalCents = 0,
    personalCents = 0,
    unassignedCents = 0,
    fuelProfessionalCents = 0;
  const last12 = new Date(at + 'T12:00:00Z');
  last12.setUTCMonth(last12.getUTCMonth() - 12);
  const records: { kind: string; row: Row; category: string; cents: number }[] =
    [];
  for (const kind of ['expenses', 'services', 'payments'] as const)
    for (const row of d[kind]) {
      const date = String(row.date);
      if (date > at || (from && date < from)) continue;
      const link = links.get(kind + ':' + row.id);
      const implicitBike =
        assetId === BIKE_ASSET_ID &&
        (kind === 'services' ||
          (kind === 'expenses' &&
            (row.scope === 'moto' || row.category === 'moto')));
      if (link ? link.assetId !== assetId : !implicitBike) continue;
      if (link?.category === 'aquisição') continue;
      const category = link
        ? String(link.category)
        : kind === 'services'
          ? 'manutenção'
          : 'outros';
      const cents =
        kind === 'payments'
          ? num(link?.interestCents)
          : toCents(num(row.amount));
      cashCents += cents;
      categories[category] = (categories[category] || 0) + cents;
      if (date.startsWith(at.slice(0, 7))) monthCents += cents;
      if (date > last12.toISOString().slice(0, 10)) last12Cents += cents;
      const professional = Math.min(cents, toCents(workExpenseAmount(row)));
      professionalCents += professional;
      if (row.scope === 'pessoal') personalCents += cents;
      else unassignedCents += cents - professional;
      if (category === 'combustível') fuelProfessionalCents += professional;
      records.push({ kind, row, category, cents });
    }
  const depreciation = calculateDepreciation(
    asset.purchasePriceCents === null ? null : num(asset.purchasePriceCents),
    item.valueCents,
    from,
    item.date,
  );
  const elapsed = from && from < at ? daysBetween(from, at) : null;
  const distance =
    assetId === BIKE_ASSET_ID
      ? num(d.bike.km) - num(d.bike.purchaseKm)
      : asset.purchaseKm !== null && asset.currentKm !== null
        ? num(asset.currentKm) - num(asset.purchaseKm)
        : null;
  const km = distance !== null && distance > 0 ? distance : null;
  const economicCents =
    depreciation.nominalCents === null
      ? null
      : cashCents + depreciation.nominalCents;
  const work =
    assetId === BIKE_ASSET_ID
      ? workCashResult(
          d,
          d.work.filter(
            (r) => String(r.date) <= at && (!from || String(r.date) >= from),
          ),
          'todos',
          from,
          at,
        )
      : null;
  // Unclassified professional spending may already include fuel. Do not subtract
  // an estimate again until its nature is known.
  const classifiedSources = new Set(
    records
      .filter((r) => r.category !== 'outros')
      .map((r) => r.kind + ':' + r.row.id),
  );
  const unclassifiedWork = work?.expenses.some(
    (r) => !classifiedSources.has(r.kind + ':' + r.row.id),
  );
  const fuelGapCents =
    work && !unclassifiedWork
      ? Math.max(0, toCents(work.km * costs(d).fuel) - fuelProfessionalCents)
      : null;
  return {
    asset,
    records,
    categories,
    cashCents,
    monthCents,
    last12Cents,
    professionalCents,
    personalCents,
    unassignedCents,
    depreciation,
    economicCents,
    km,
    cashPerKm: km ? cashCents / 100 / km : null,
    economicPerKm:
      km && economicCents !== null ? economicCents / 100 / km : null,
    byKm: Object.fromEntries(
      Object.entries(categories).map(([key, cents]) => [
        key,
        km ? cents / 100 / km : null,
      ]),
    ),
    monthlyCents: elapsed
      ? Math.round(((cashCents / elapsed) * 365.2425) / 12)
      : null,
    annualizedCents: elapsed
      ? Math.round((cashCents / elapsed) * 365.2425)
      : null,
    partial: !from || item.valueCents === null || !km,
    work,
    fuelGapCents,
    operationalWorkCents:
      work && fuelGapCents !== null
        ? toCents(work.cashProfit) - fuelGapCents
        : null,
  };
}

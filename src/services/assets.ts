import { type Data, type Row, emptyRow, num } from '../model';
import { toCents } from './money-codec';
export const BIKE_ASSET_ID = 'asset:primary-bike';
export function assetRows(d: Data): Row[] {
  const linked = d.assets.find((r) => r.id === BIKE_ASSET_ID);
  const configured =
    !!d.bike.purchaseDate ||
    num(d.bike.purchaseValue) > 0 ||
    num(d.bike.currentValue) > 0 ||
    num(d.bike.km) > 0;
  if (
    !configured &&
    !linked &&
    !d.assetValuations.some((r) => r.assetId === BIKE_ASSET_ID)
  )
    return d.assets;
  const bike: Row = {
    ...emptyRow('assets'),
    ...linked,
    id: BIKE_ASSET_ID,
    linkedBike: d.bike.id,
    name: `${d.bike.brand} ${d.bike.model}`,
    type: 'motorcycle',
    purchaseDate: d.bike.purchaseDate,
    purchasePriceCents:
      num(d.bike.purchaseValue) > 0 ? toCents(num(d.bike.purchaseValue)) : null,
  };
  return [...d.assets.filter((r) => r.id !== BIKE_ASSET_ID), bike];
}
export function assetValues(d: Data, at: string) {
  const valuations = new Map<string, Row>();
  for (const row of d.assetValuations) {
    if (String(row.date) > at) continue;
    const previous = valuations.get(String(row.assetId));
    const real = row.source !== 'estimated',
      oldReal = previous?.source !== 'estimated';
    if (
      !previous ||
      (real && !oldReal) ||
      (real === oldReal &&
        (String(row.date) > String(previous.date) ||
          (row.date === previous.date &&
            num(row.sequence) > num(previous.sequence))))
    )
      valuations.set(String(row.assetId), row);
  }
  return assetRows(d).map((asset) => {
    const valuation = valuations.get(asset.id);
    const legacyValue =
      asset.id === BIKE_ASSET_ID &&
      !d.assetValuations.some((r) => r.assetId === BIKE_ASSET_ID) &&
      num(d.bike.currentValue) > 0
        ? toCents(num(d.bike.currentValue))
        : null;
    const current =
      (!asset.purchaseDate || String(asset.purchaseDate) <= at) &&
      (asset.active === 'sim' || (!!asset.soldAt && String(asset.soldAt) > at));
    return {
      asset,
      current,
      valueCents: valuation ? num(valuation.valueCents) : legacyValue,
      date: valuation ? String(valuation.date) : null,
      source: valuation
        ? String(valuation.source)
        : legacyValue === null
          ? 'unknown'
          : 'manual',
      legacy: !valuation && legacyValue !== null,
    };
  });
}
/** Explicit acquisition/sale transfers, not operating expenses or new income. */
export function assetCashDelta(d: Data, at: string) {
  return assetRows(d).reduce(
    (sum, asset) =>
      sum -
      (asset.cashPurchase === 'sim' &&
      asset.purchaseDate &&
      String(asset.purchaseDate) <= at
        ? num(asset.cashPurchaseCents)
        : 0) +
      (asset.cashSale === 'sim' && asset.soldAt && String(asset.soldAt) <= at
        ? num(asset.saleValueCents)
        : 0),
    0,
  );
}
export function updateBikeAsset(d: Data, bike: Row, at: string): Data {
  if (bike.currentValue === d.bike.currentValue) return { ...d, bike };
  const sequence =
    d.assetValuations.reduce(
      (max, row) => Math.max(max, num(row.sequence)),
      0,
    ) + 1;
  const previous =
    d.assetValuations.some((r) => r.assetId === BIKE_ASSET_ID) ||
    num(d.bike.currentValue) === 0
      ? []
      : [
          {
            ...emptyRow('assetValuations'),
            id: `bike-legacy-${sequence}`,
            assetId: BIKE_ASSET_ID,
            date: at,
            valueCents: toCents(num(d.bike.currentValue)),
            sequence,
            notes:
              'Valor legado observado neste registro; data original desconhecida.',
          },
        ];
  return {
    ...d,
    bike,
    assetValuations: [
      ...d.assetValuations,
      ...previous,
      {
        ...emptyRow('assetValuations'),
        id: `bike-value-${sequence + 1}`,
        assetId: BIKE_ASSET_ID,
        date: at,
        valueCents: toCents(num(bike.currentValue)),
        sequence: sequence + 1,
      },
    ],
  };
}

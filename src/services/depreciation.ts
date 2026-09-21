import { daysBetween } from '../calculations';
import { toCents, fromCents } from './money-codec';
import { nominalToReal, realToNominal } from './purchasing-power';
import {
  inflationBetweenMonths,
  type InflationHistory,
} from './inflation-indicators';
export function observedAssetInflation(
  history: InflationHistory | undefined,
  from: string,
  to: string,
) {
  if (!history || !from || !to || from > to) return null;
  const start = new Date(from + 'T12:00:00Z');
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() + 1);
  const first = start.toISOString().slice(0, 7),
    last = to.slice(0, 7);
  return first > last
    ? null
    : inflationBetweenMonths(history.months, first, last);
}
export function calculateDepreciation(
  purchaseCents: number | null,
  valueCents: number | null,
  purchaseDate: string,
  valueDate: string | null,
  inflation: number | null = null,
) {
  if (purchaseCents === null || valueCents === null)
    return {
      nominalCents: null,
      percent: null,
      annualPercent: null,
      monthlyCents: null,
      realCents: null,
      referenceValueCents: null,
    };
  const days =
    valueDate && purchaseDate && valueDate > purchaseDate
      ? daysBetween(purchaseDate, valueDate)
      : null;
  const nominalCents = purchaseCents - valueCents,
    percent = purchaseCents > 0 ? (nominalCents / purchaseCents) * 100 : null;
  const adjusted = realToNominal(fromCents(purchaseCents), inflation, 1),
    reference = nominalToReal(fromCents(valueCents), inflation, 1);
  const annual =
    days && purchaseCents > 0
      ? (1 - (valueCents / purchaseCents) ** (365.2425 / days)) * 100
      : null;
  return {
    nominalCents,
    percent,
    annualPercent: annual !== null && Number.isFinite(annual) ? annual : null,
    monthlyCents: days
      ? Math.round(nominalCents / ((days / 365.2425) * 12))
      : null,
    realCents: adjusted === null ? null : toCents(adjusted) - valueCents,
    referenceValueCents: reference === null ? null : toCents(reference),
  };
}

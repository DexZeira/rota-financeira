import { type Data, validDate } from '../model';
import { addMonths, daysBetween } from '../calculations';

export function investmentMaturities(d: Data, at: string) {
  const fields = {
    maturity: 'Vencimento',
    lockupEnd: 'Fim da carência',
    couponDate: 'Cupom',
    amortizationDate: 'Amortização',
    redemptionDate: 'Resgate programado',
  } as const;
  const events = d.investments
    .flatMap((asset) =>
      Object.entries(fields).flatMap(([field, label]) => {
        const date = String(asset[field] || '');
        return validDate(date)
          ? [
              {
                id: `${asset.id}:${field}`,
                investmentId: asset.id,
                name: String(asset.name),
                label,
                date,
                days: daysBetween(at, date),
              },
            ]
          : [];
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return {
    events,
    overdue: events.filter((e) => e.date < at),
    days30: events.filter((e) => e.days >= 0 && e.days <= 30),
    days90: events.filter((e) => e.days >= 0 && e.days <= 90),
    months6: events.filter((e) => e.date >= at && e.date <= addMonths(at, 6)),
    months12: events.filter((e) => e.date >= at && e.date <= addMonths(at, 12)),
  };
}

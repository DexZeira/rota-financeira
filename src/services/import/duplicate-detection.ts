import type { Link, Transaction } from './types';
export const strongKey = (t: Transaction) =>
  t.externalId && t.accountLabel
    ? JSON.stringify([t.source, t.accountLabel, t.externalId])
    : '';
export const contentKey = (t: Transaction) =>
  JSON.stringify([
    t.source,
    t.accountLabel,
    t.date,
    t.direction,
    t.amountCents,
    t.normalizedDescription,
  ]);
export function duplicateIndex(links: Link[]) {
  const strong = new Map<string, Link>(),
    content = new Map<string, Link>();
  for (const link of links) {
    const key = strongKey(link.transaction);
    if (key) strong.set(key, link);
    content.set(contentKey(link.transaction), link);
  }
  return { strong, content };
}
export function duplicate(
  t: Transaction,
  index: ReturnType<typeof duplicateIndex>,
) {
  const key = strongKey(t),
    exact = key ? index.strong.get(key) : undefined;
  if (exact)
    return {
      level: 'exact' as const,
      link: exact,
      reason:
        exact.transaction.amountCents !== t.amountCents ||
        exact.transaction.direction !== t.direction ||
        exact.transaction.date !== t.date
          ? 'Mesmo identificador externo, mas data/valor/direção divergentes. Não relacione sem esclarecer a divergência.'
          : 'Mesmo identificador externo, origem e conta.',
    };
  const same = index.content.get(contentKey(t));
  // Different strong identifiers are not the same transaction merely because their descriptions match.
  if (
    same &&
    !(
      t.externalId &&
      same.transaction.externalId &&
      t.externalId !== same.transaction.externalId
    )
  )
    return {
      level: 'possible' as const,
      link: same,
      reason: 'Mesma data, valor, direção, descrição, origem e conta.',
    };
  return null;
}

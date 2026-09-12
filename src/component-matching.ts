import type { Data, Row } from './model';

export function normalizeComponentName(value: unknown) {
  const text =
    typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(troca|substituicao|manutencao|de|do|da)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function defaultAliases(name: unknown) {
  const n = normalizeComponentName(name);
  if (n === 'pneu traseiro')
    return 'pneu tras\npneu traseiro xre\npneu traseiro xre 190';
  if (n === 'pneu dianteiro')
    return 'pneu diant\npneu dianteiro xre\npneu dianteiro xre 190';
  return '';
}
const names = (r: Row) =>
  [
    r.name,
    ...defaultAliases(r.name).split('\n'),
    ...String(r.aliases ?? '').split(/\n|;/),
  ]
    .map(normalizeComponentName)
    .filter(Boolean);
export type ComponentMatch = {
  cost: Row;
  component: Row | null;
  candidates: Row[];
  source: 'manual' | 'automático' | 'incerto' | 'ignorado' | 'nenhum';
};
export function componentMatches(d: Data): ComponentMatch[] {
  return d.costs.map((cost) => {
    const manual =
      d.maintenance.find((m) => m.costId === cost.id) ||
      (cost.matchMode === 'manual'
        ? d.maintenance.find((m) => m.id === cost.componentId)
        : undefined);
    if (manual)
      return { cost, component: manual, candidates: [], source: 'manual' };
    if (cost.matchMode === 'ignorar')
      return { cost, component: null, candidates: [], source: 'ignorado' };
    const n = normalizeComponentName(cost.name);
    const exact = d.maintenance.filter((m) => n && names(m).includes(n));
    if (exact.length === 1)
      return {
        cost,
        component: exact[0],
        candidates: [],
        source: 'automático',
      };
    const tokens = n
      .split(' ')
      .filter((t) => t.length > 2 && !['xre', '190', 'geral'].includes(t));
    const candidates =
      exact.length > 1
        ? exact
        : d.maintenance.filter((m) =>
            names(m).some((name) => {
              const opposite =
                ((n.includes('traseir') || /\btras\b/.test(n)) &&
                  name.includes('dianteir')) ||
                ((n.includes('dianteir') || /\bdiant\b/.test(n)) &&
                  name.includes('traseir'));
              return (
                !opposite && tokens.some((t) => name.split(' ').includes(t))
              );
            }),
          );
    return {
      cost,
      component: null,
      candidates,
      source: candidates.length ? 'incerto' : 'nenhum',
    };
  });
}

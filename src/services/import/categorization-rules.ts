import { categories } from '../../model';
import type { Rule } from './types';
import { normalizeDescription } from './transaction-normalizer';
export function safeRule(rule: Rule) {
  if (
    !rule.pattern.trim() ||
    rule.pattern.length > 100 ||
    !categories.includes(rule.category)
  )
    throw Error('Regra inválida.');
  if (
    rule.mode === 'regex' &&
    !/^\^?[a-zA-Z0-9 ._-]{1,100}\$?$/.test(rule.pattern)
  )
    throw Error(
      'Regex permite somente texto, ponto e âncoras; sem repetições, grupos ou alternativas.',
    );
}
export function categorize(description: string, rules: Rule[]) {
  const text = normalizeDescription(description);
  const hits = rules.filter((r) => {
    if (!r.enabled) return false;
    safeRule(r);
    const p = normalizeDescription(r.pattern);
    return r.mode === 'equals'
      ? text === p
      : r.mode === 'contains'
        ? text.includes(p)
        : r.mode === 'startsWith'
          ? text.startsWith(p)
          : new RegExp(r.pattern, 'i').test(text);
  });
  const exact = hits.filter((r) => r.mode === 'equals'),
    candidates = exact.length ? exact : hits;
  const values = [...new Set(candidates.map((r) => r.category))];
  if (values.length)
    return {
      category: values.length === 1 ? values[0] : 'outras',
      reason:
        values.length === 1
          ? 'Regra do usuário.'
          : 'Conflito entre regras; revise a categoria.',
      conflict: values.length > 1,
    };
  const aliases: [RegExp, string][] = [
    [/\bposto\b/, 'combustível'],
    [/\bifood\b/, 'alimentação'],
    [/\b(netflix|spotify|disney|prime video)\b/, 'assinaturas'],
  ];
  const alias = aliases.find(([p]) => p.test(text));
  return {
    category: alias?.[1] ?? 'outras',
    reason: alias ? 'Descrição conhecida; confirme.' : 'Sem regra; revise.',
    conflict: false,
  };
}

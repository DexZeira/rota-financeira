import { emptyRow, type Data, type Row, today } from '../../model';
import { debtState, investmentBalance } from '../../calculations';
import { validateData } from '../storage';
import { toCents } from '../money-codec';
import { categorize } from './categorization-rules';
import {
  contentKey,
  strongKey,
  duplicate,
  duplicateIndex,
} from './duplicate-detection';
import {
  reconcileTransaction,
  reconciliationIndex,
  transferSuggestions,
} from './reconciliation';
import type { ImportLine, Link, Profile, Review, Source } from './types';

export function previewImport(d: Data, lines: ImportLine[]) {
  const duplicates = duplicateIndex(d.imports.links),
    matches = reconciliationIndex(d);
  const transfers = transferSuggestions(
    lines.flatMap((r) => (r.transaction ? [r.transaction] : [])),
  );
  return lines.map((row) => {
    const t = row.transaction;
    if (!t)
      return {
        ...row,
        status: 'invalid' as const,
        duplicate: null,
        candidates: [],
        transferLines: [] as number[],
        category: {
          category: 'outras',
          reason: 'Linha inválida.',
          conflict: false,
        },
      };
    const repeated = duplicate(t, duplicates),
      candidates = reconcileTransaction(t, matches);
    const temporary: Link = {
      id: 'preview:' + row.line,
      sessionId: '',
      transaction: t,
      action: 'ignored',
      recordKind: '',
      recordId: '',
      fingerprint: '',
    };
    const strong = strongKey(t);
    if (strong && !duplicates.strong.has(strong))
      duplicates.strong.set(strong, temporary);
    if (!duplicates.content.has(contentKey(t)))
      duplicates.content.set(contentKey(t), temporary);
    return {
      ...row,
      status: repeated
        ? ('duplicate' as const)
        : candidates.length
          ? ('possible_match' as const)
          : ('new' as const),
      duplicate: repeated,
      candidates,
      transferLines: transfers.get(row.line) ?? [],
      category: categorize(t.description, d.imports.rules),
    };
  });
}
export function prepareImport(
  d: Data,
  lines: ImportLine[],
  reviews: Record<number, Review>,
  metadata: { source: Source; fileName: string; hash: string },
  profile?: Profile,
) {
  const preview = previewImport(d, lines),
    next = structuredClone(d),
    sessionId = crypto.randomUUID();
  if (lines.length === 0 || lines.length > 50000)
    throw Error('Importação vazia ou acima do limite.');
  const byLine = new Map(preview.map((r) => [r.line, r]));
  const session = {
    id: sessionId,
    ...metadata,
    createdAt: new Date().toISOString(),
    rowCount: lines.length,
    importedCount: 0,
    matchedCount: 0,
    ignoredCount: 0,
    duplicateCount: preview.filter((r) => r.duplicate).length,
    invalidCount: lines.filter((r) => !r.transaction).length,
  };
  const used = new Set<string>();
  const linkPositions = new Map(next.imports.links.map((l, i) => [l.id, i]));
  let processed = 0;
  for (const row of preview) {
    const r = reviews[row.line],
      t = row.transaction;
    if (!r || r.action === 'pending' || !t) continue;
    if (!t.accountLabel.trim())
      throw Error('Identifique a conta antes de confirmar.');
    if (t.date > today())
      throw Error('Movimentação futura não pode ser importada como realizada.');
    let action: Link['action'] = 'ignored',
      recordKind: Link['recordKind'] = '',
      recordId = '';
    if (
      r.action === 'create' ||
      r.action === 'payment' ||
      r.action === 'investment'
    ) {
      if (row.duplicate && !r.override)
        throw Error(
          'Duplicata exige confirmação individual de importar mesmo assim.',
        );
      const record: Row = {
        ...emptyRow(
          r.action === 'investment'
            ? 'movements'
            : r.action === 'payment'
              ? 'payments'
              : t.direction === 'debit'
                ? 'expenses'
                : 'bankReceipts',
        ),
        id: crypto.randomUUID(),
        date: t.date,
        notes: t.description,
      };
      if (r.action === 'investment') {
        const investment = next.investments.find((x) => x.id === r.recordId);
        if (
          !investment ||
          (t.direction === 'credit' &&
            t.amountCents >
              toCents(investmentBalance(next, investment, t.date)))
        )
          throw Error(
            'Investimento não encontrado ou retirada acima do saldo registrado.',
          );
        record.investmentId = investment.id;
        record.amount = t.amountCents / 100;
        record.kind = t.direction === 'debit' ? 'aporte' : 'retirada';
        recordKind = 'movements';
      } else if (r.action === 'payment') {
        const debt = next.debts.find((x) => x.id === r.recordId);
        if (
          t.direction !== 'debit' ||
          !debt ||
          t.amountCents > toCents(debtState(next, debt, t.date).balance)
        )
          throw Error('Pagamento incompatível com a dívida selecionada.');
        record.debtId = debt.id;
        record.amount = t.amountCents / 100;
        record.installments = 0;
        record.kind = 'normal';
        recordKind = 'payments';
      } else if (t.direction === 'debit') {
        record.name = t.description;
        record.amount = t.amountCents / 100;
        record.category = r.category;
        record.recurrence = 'única';
        recordKind = 'expenses';
      } else {
        record.name = t.description;
        record.amountCents = t.amountCents;
        record.account = t.accountLabel;
        recordKind = 'bankReceipts';
      }
      next[recordKind].push(record);
      recordId = record.id;
      if (r.recurrenceId) {
        const candidate = row.candidates.find(
          (c) => c.kind === 'recurrences' && c.id === r.recurrenceId,
        );
        if (!candidate)
          throw Error('Previsão mudou; gere o preview novamente.');
        next.forecastResolutions.push({
          ...emptyRow('forecastResolutions'),
          id: crypto.randomUUID(),
          recurrenceId: r.recurrenceId,
          occurrenceDate: candidate.date,
          action: 'vincular',
          recordKind,
          recordId,
        });
      }
      action = 'created';
      session.importedCount++;
      if (r.remember && t.direction === 'debit')
        next.imports.rules.push({
          id: crypto.randomUUID(),
          pattern: t.normalizedDescription.slice(0, 100),
          mode: 'equals',
          category: r.category,
          enabled: true,
        });
    } else if (r.action === 'match') {
      if (!r.recordKind || !next[r.recordKind].some((x) => x.id === r.recordId))
        throw Error('Registro relacionado não existe mais.');
      const candidate = row.candidates.find(
        (c) => c.kind === r.recordKind && c.id === r.recordId,
      );
      const previous = row.duplicate?.link;
      if (
        previous &&
        (previous.transaction.amountCents !== t.amountCents ||
          previous.transaction.direction !== t.direction ||
          previous.transaction.date !== t.date)
      )
        throw Error(
          'Identificador repetido com valores divergentes. Revise a origem antes de relacionar.',
        );
      if (
        !candidate &&
        !(
          previous?.recordKind === r.recordKind &&
          previous.recordId === r.recordId
        )
      )
        throw Error('Correspondência mudou; revise novamente.');
      const key = r.recordKind + ':' + r.recordId;
      if (used.has(key))
        throw Error(
          'Dois movimentos selecionados para o mesmo registro; revise individualmente.',
        );
      used.add(key);
      recordKind = r.recordKind;
      recordId = r.recordId;
      action = 'matched';
      session.matchedCount++;
    } else if (r.action === 'transfer') {
      const other =
          r.transferLine === undefined ? undefined : byLine.get(r.transferLine),
        otherReview =
          r.transferLine === undefined ? undefined : reviews[r.transferLine];
      if (
        !other?.transaction ||
        otherReview?.action !== 'transfer' ||
        otherReview.transferLine !== row.line ||
        !row.transferLines.includes(other.line) ||
        row.duplicate ||
        other.duplicate
      )
        throw Error(
          'Confirme as duas pontas novas de uma transferência sugerida.',
        );
      action = 'transfer';
      session.matchedCount++;
    } else session.ignoredCount++;
    // Repeated ignored/matched rows keep the existing audit link rather than growing history indefinitely.
    if (row.duplicate && action === 'matched') {
      const position = linkPositions.get(row.duplicate.link.id);
      if (position !== undefined)
        next.imports.links[position] = {
          ...next.imports.links[position],
          action,
          recordKind,
          recordId,
        };
      else
        next.imports.links.push({
          id: crypto.randomUUID(),
          sessionId,
          transaction: { ...t },
          action,
          recordKind,
          recordId,
          fingerprint: '',
        });
    } else if (!row.duplicate || action === 'created')
      next.imports.links.push({
        id: crypto.randomUUID(),
        sessionId,
        transaction: { ...t },
        action,
        recordKind,
        recordId,
        fingerprint: '',
      });
    processed++;
  }
  if (!processed)
    throw Error('Selecione pelo menos uma linha válida para revisar/importar.');
  next.imports.sessions.push(session);
  if (profile)
    next.imports.profiles = [
      ...next.imports.profiles.filter((p) => p.id !== profile.id),
      profile,
    ];
  return validateData(next);
}

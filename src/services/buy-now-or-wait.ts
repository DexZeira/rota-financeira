import { type Data, emptyRow, num } from '../model';
import { addMonths, daysBetween, debtState, financial } from '../calculations';
import { getCashFlowForecast } from './cash-flow';
import { assetValues } from './assets';
import { type DecisionScenario } from './decision-types';
import { simulateDecision } from './decision-simulator';
import { opportunityCost } from './opportunity-cost';
import { realToNominal } from './purchasing-power';
import { calculateOwnershipCost } from './ownership-cost';
import { toCents } from './money-codec';

/** Compares purchase conditions, not a reconstructed future ledger. Additional
 * deposits are earmarked from existing cash, never introduced as free income. */
export function buyNowOrWait(d: Data, scenario: DecisionScenario, at: string) {
  if (!['buy_asset', 'trade_vehicle'].includes(scenario.type))
    throw Error('Comparação disponível para compra ou troca.');
  const now = simulateDecision(d, scenario, at);
  const futureDate = addMonths(at, scenario.waitMonths);
  const waitDays = daysBetween(at, futureDate);
  const waitingForecast = getCashFlowForecast(d, at, Math.min(366, waitDays));
  const price = scenario.amountCents;
  const projected =
    price === null
      ? null
      : realToNominal(
          price / 100,
          scenario.annualInflation,
          scenario.waitMonths / 12,
        );
  const requestedCapital =
    scenario.payment === 'cash' ? price : scenario.downPaymentCents;
  const capital =
    requestedCapital === null
      ? null
      : Math.min(
          requestedCapital,
          Math.max(0, now.before.cashCents) + (scenario.withdrawalCents ?? 0),
        );
  const savings =
    capital === null
      ? null
      : opportunityCost(
          capital,
          scenario.annualReturn,
          scenario.waitMonths,
          scenario.annualInflation,
          scenario.waitingContributionCents ?? 0,
        );
  const currentCost = scenario.assetId
    ? calculateOwnershipCost(d, scenario.assetId, at)
    : null;
  const costsWhileWaiting =
    scenario.waitingExtraCostCents === null
      ? null
      : scenario.waitingExtraCostCents * scenario.waitMonths;
  const assumptions = [
    'Preço projetado pela hipótese selecionada; IPCA não prevê o preço exato do bem.',
    'Aportes durante a espera separam dinheiro do caixa existente: não são renda nova.',
    'Capital inicial remunerado limitado ao caixa e à retirada explicitamente escolhida; venda futura não rende antes de acontecer.',
    'O forecast existente fornece renda, pagamentos e despesas durante a espera, até 366 dias. Custos adicionais são somados somente quando informados.',
    'Juros e cotações futuros permanecem hipóteses; saldos sem avaliação nova não são preços de mercado futuros.',
  ];
  if (
    projected === null ||
    savings === null ||
    scenario.waitingContributionCents === null ||
    waitDays > 366
  )
    return {
      now,
      later: null,
      futurePriceCents: projected === null ? null : toCents(projected),
      savings,
      costsWhileWaiting,
      assumptions,
      waitingForecast,
      futureDate,
      historicalMonthlyCostCents: currentCost?.monthlyCents ?? null,
      completeness: 'insufficient' as const,
    };
  const copy = structuredClone(d);
  const unassigned: string[] = [];
  // Materialize only forecast counterparties in this disposable state. The cash
  // total is reconciled once below, so principal payments/deposits are not lost.
  for (const event of waitingForecast.events) {
    if (event.impact !== 'caixa' || event.amount === null) continue;
    const rule =
      event.source === 'recurrences'
        ? d.recurrences.find((r) => r.id === event.sourceId)
        : undefined;
    const debtId =
      event.source === 'debts'
        ? event.sourceId
        : rule?.sourceKind === 'debts'
          ? String(rule.sourceId)
          : '';
    const debt = copy.debts.find((r) => r.id === debtId);
    if (debt)
      copy.payments.push({
        ...emptyRow('payments'),
        id: 'wait:' + event.id,
        debtId,
        date: event.date,
        amount: Math.min(
          event.amount,
          debtState(copy, debt, event.date).balance,
        ),
        kind: 'normal',
        installments: 0,
      });
    if (rule?.kind === 'aporte') {
      if (
        rule.sourceKind === 'investments' &&
        copy.investments.some((r) => r.id === rule.sourceId)
      )
        copy.movements.push({
          ...emptyRow('movements'),
          id: 'wait:' + event.id,
          investmentId: rule.sourceId,
          date: event.date,
          kind: 'aporte',
          amount: event.amount,
        });
      else
        unassigned.push(
          'Aporte previsto sem investimento de destino: contraparte patrimonial desconhecida.',
        );
    }
    if (rule)
      copy.forecastResolutions.push({
        ...emptyRow('forecastResolutions'),
        id: 'wait:' + event.id,
        recurrenceId: rule.id,
        occurrenceDate: event.originalDate,
        action: 'ignorar',
      });
    if (event.source === 'expenses') {
      const original = d.expenses.find((r) => r.id === event.sourceId);
      if (original)
        copy.expenses.push({
          ...original,
          id: 'wait:' + event.id,
          date: event.date,
          amount: event.amount,
        });
    }
  }
  const old = assetValues(d, at).find((r) => r.asset.id === scenario.assetId);
  const oldFactor =
    scenario.oldAnnualDepreciation === null
      ? null
      : (1 - scenario.oldAnnualDepreciation) ** (scenario.waitMonths / 12);
  if (old && old.valueCents !== null && oldFactor !== null) {
    copy.assetValuations = copy.assetValuations.filter(
      (r) => r.assetId !== old.asset.id,
    );
    copy.assetValuations.push({
      ...emptyRow('assetValuations'),
      id: 'wait:valuation',
      assetId: old.asset.id,
      date: futureDate,
      valueCents: Math.round(old.valueCents * oldFactor),
      source: 'estimated',
      sequence: 1,
    });
  }
  // Only earnings are new wealth. Principal and deposits already exist in cash.
  const targetCash =
    waitingForecast.knownBalance +
    (savings.potentialReturnCents - (costsWhileWaiting ?? 0)) / 100;
  copy.settings.openingCash =
    num(copy.settings.openingCash) +
    targetCash -
    financial(copy, futureDate).cash;
  const futurePriceCents = toCents(projected);
  const later = simulateDecision(
    copy,
    {
      ...scenario,
      amountCents: futurePriceCents,
      downPaymentCents: Math.min(futurePriceCents, savings.finalCents),
      saleCents:
        scenario.saleCents !== null && oldFactor !== null
          ? Math.round(scenario.saleCents * oldFactor)
          : scenario.saleCents,
    },
    futureDate,
  );
  later.warnings.push(
    'Balanço condicional ao forecast: venda e quitação precisam de confirmação externa. Não inclui retorno de todos os investimentos nem avaliações futuras dos demais bens.',
  );
  later.warnings.push(...new Set(unassigned));
  if (!waitingForecast.complete) later.missing.push('fluxo durante a espera');
  if (costsWhileWaiting === null)
    later.missing.push('custos adicionais durante a espera');
  if (old && oldFactor === null)
    later.missing.push('depreciação do veículo atual durante a espera');
  later.completeness = 'partial';
  return {
    now,
    later,
    futurePriceCents,
    savings,
    costsWhileWaiting,
    assumptions,
    waitingForecast,
    futureDate,
    historicalMonthlyCostCents: currentCost?.monthlyCents ?? null,
    completeness: 'partial' as const,
  };
}

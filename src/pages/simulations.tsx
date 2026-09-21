import { useDeferredValue, useMemo, useState } from 'react';
import { type ViewProps, value } from './shared';
import { today, money, dec, brDate } from '../model';
import { PageHeader } from '../components/finance-ui';
import { assetRows } from '../services/assets';
import {
  type DecisionScenario,
  decisionLabels,
  emptyDecision,
  vehicleCostLabels,
} from '../services/decision-types';
import { simulateDecision } from '../services/decision-simulator';
import { buyNowOrWait } from '../services/buy-now-or-wait';
import { useEconomicIndicators } from '../hooks/use-economic-indicators';
import './simulations.css';

const cash = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? 'Não informado' : money(cents / 100);
const count = (v: number | null) => (v === null ? 'Indisponível' : dec(v, 1));
type Result = ReturnType<typeof simulateDecision>;
function NumberField({
  label,
  value: current,
  onChange,
  percent = false,
  integer = false,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  percent?: boolean;
  integer?: boolean;
}) {
  const factor = percent ? 100 : integer ? 1 : 0.01;
  return (
    <label className="simulation-field">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step={integer ? '1' : 'any'}
        inputMode={integer ? 'numeric' : 'decimal'}
        value={
          current === null ? '' : Number((current * factor).toPrecision(12))
        }
        onChange={(e) =>
          onChange(
            e.target.value === ''
              ? null
              : integer
                ? Number(e.target.value)
                : percent
                  ? Number(e.target.value) / 100
                  : Math.round(Number(e.target.value) * 100),
          )
        }
      />
    </label>
  );
}
function Metrics({ result: r }: { result: Result }) {
  return (
    <div className="simulation-results" aria-label="Impactos simulados">
      <p>
        <strong>
          {r.completeness === 'complete'
            ? 'Simulação completa nas hipóteses informadas'
            : 'Simulação parcial'}
        </strong>{' '}
        · Valores projetados, sem aplicação nos dados reais.
      </p>
      <table className="simulation-comparison" aria-label="Antes e depois">
        <thead>
          <tr>
            <th scope="col">Métrica</th>
            <th scope="col">Antes</th>
            <th scope="col">Depois</th>
            <th scope="col">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Caixa', r.before.cashCents, r.after.cashCents],
            ['Patrimônio líquido', r.before.netCents, r.after.netCents],
            [
              'Liquidez rápida líquida',
              r.before.quickNetCents,
              r.after.quickNetCents,
            ],
            [
              'Reserva',
              r.reserve.before.totalCents,
              r.reserve.after.totalCents,
            ],
          ].map(([label, b, a]) => (
            <tr key={String(label)}>
              <th scope="row">{label}</th>
              <td>{cash(Number(b))}</td>
              <td>{cash(Number(a))}</td>
              <td>{cash(Number(a) - Number(b))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Reserva: {count(r.reserve.before.coverage)} →{' '}
        {count(r.reserve.after.coverage)} meses. Cobertura imediata:{' '}
        {count(r.reserve.after.immediateCoverage)} meses. Caixa e reserva são
        fontes distintas; uma compra não retira automaticamente de
        investimentos.
      </p>
      <details className="disclosure">
        <summary>Impacto mensal e meta diária</summary>
        <div className="disclosure-body">
          <div className="inline-stats">
            {value(
              'Variação mensal no caixa (positivo = pressão)',
              cash(r.monthly.totalCents),
            )}
            {value('Custos novos líquidos', cash(r.monthly.operatingCents))}
            {value('Nova parcela', cash(r.monthly.paymentCents))}
            {value('Variação da renda', cash(r.monthly.incomeCents))}
            {value('Variação de aportes', cash(r.monthly.contributionCents))}
            {value(
              'Novos compromissos / renda média observada',
              r.monthly.pressurePercent === null
                ? 'Base insuficiente'
                : dec(r.monthly.pressurePercent) + '%',
            )}
          </div>
          <p>
            Meta de {brDate(r.target.date)}: mínima{' '}
            {cash(r.target.before.minimumCents)} →{' '}
            {cash(r.target.after.minimumCents)}; ideal{' '}
            {cash(r.target.before.idealCents)} →{' '}
            {cash(r.target.after.idealCents)}; acelerada{' '}
            {cash(r.target.before.acceleratedCents)} →{' '}
            {cash(r.target.after.acceleratedCents)}.
          </p>
          <p>
            A meta usa as obrigações e a agenda existentes; mudança de renda
            prevista não altera trabalho já realizado.
          </p>
          <p>
            Comprometimento mensal: dívidas{' '}
            {cash(r.target.before.components.debt)} →{' '}
            {cash(r.target.after.components.debt)}; despesas-base{' '}
            {cash(r.target.before.components.expenses)} →{' '}
            {cash(r.target.after.components.expenses)}. Não é um score.
          </p>
        </div>
      </details>
      <details className="disclosure">
        <summary>Fluxo e sustentabilidade</summary>
        <div className="disclosure-body">
          <p>
            Janela: {brDate(r.forecast.after.at)} a{' '}
            {brDate(r.forecast.after.end)}.{' '}
            {r.forecast.fullHorizon
              ? ''
              : 'Fluxo total acima de 366 dias indisponível; não extrapolamos o motor existente.'}
          </p>
          <div className="inline-stats">
            {value(
              'Saldo final do fluxo antes',
              cash(
                r.forecast.before.projectedBalance === null
                  ? null
                  : Math.round(r.forecast.before.projectedBalance * 100),
              ),
            )}
            {value(
              'Saldo final do fluxo depois',
              cash(
                r.forecast.after.projectedBalance === null
                  ? null
                  : Math.round(r.forecast.after.projectedBalance * 100),
              ),
            )}
            {value(
              'Menor saldo',
              cash(
                r.forecast.after.minimumBalance === null
                  ? null
                  : Math.round(r.forecast.after.minimumBalance * 100),
              ),
            )}
            {value(
              'Data do menor saldo',
              r.forecast.after.minimumDate
                ? brDate(r.forecast.after.minimumDate)
                : 'Indisponível',
            )}
            {value(
              'Primeiro saldo negativo conhecido',
              r.forecast.firstNegative
                ? brDate(r.forecast.firstNegative)
                : 'Não identificado na janela',
            )}
            {value(
              'Retorno do caixa ao nível inicial',
              r.forecast.recovery
                ? brDate(r.forecast.recovery)
                : 'Não identificado na janela',
            )}
            {value(
              'Cobertura após perda de renda',
              !r.emergency
                ? 'Renda-base indisponível'
                : r.emergency.noDepletion
                  ? 'Sem consumo nas hipóteses'
                  : count(r.emergency.after) + ' meses',
            )}
          </div>
          <p>
            Não há garantia de recuperação. Valores ausentes no forecast
            continuam ausentes na simulação.
          </p>
        </div>
      </details>
      <details className="disclosure">
        <summary>Longo prazo e oportunidade</summary>
        <div className="disclosure-body">
          <div className="inline-stats">
            {value(
              'Variação patrimonial incremental conhecida',
              cash(r.longTerm.incrementalNetCents),
            )}
            {value(
              'Variação incremental em reais de hoje',
              cash(r.longTerm.realIncrementCents),
            )}
            {value(
              'Retorno potencial não realizado (bruto)',
              cash(r.longTerm.opportunity?.potentialReturnCents),
            )}
            {value(
              'Efeito dos aportes: retorno potencial',
              cash(r.longTerm.contribution?.potentialReturnCents),
            )}
            {value('Depreciação projetada', cash(r.longTerm.depreciationCents))}
            {value(
              'Efeito incremental na reserva selecionada',
              cash(r.longTerm.reserveIncrementCents),
            )}
            {value(
              'Juros/encargos no horizonte',
              cash(r.longTerm.interestCents),
            )}
          </div>
          <p>
            Comparação incremental de {dec(r.longTerm.months, 1)} meses, não
            patrimônio futuro completo. Aportes transferem capital; só seus
            rendimentos aumentam patrimônio. Oportunidade não é prejuízo.
          </p>
          {r.debtComparison && (
            <p>
              Retorno bruto esperado menos custo anual equivalente da dívida
              (antes de impostos): {dec(r.debtComparison.differencePoints)}{' '}
              pontos percentuais. Juros efetivamente evitados dependem de
              proposta de amortização/quitação; indisponíveis sem ela.
            </p>
          )}
          {r.ownership && (
            <p>
              Veículo atual: média histórica paga{' '}
              {cash(r.ownership.monthlyCents)}/mês; custo econômico registrado{' '}
              {cash(r.ownership.economicCents)}. Custos históricos não são
              cotação do novo veículo.
            </p>
          )}
        </div>
      </details>
      {r.financing && (
        <details className="disclosure">
          <summary>Cronograma PRICE</summary>
          <div className="disclosure-body">
            <div className="inline-stats">
              {value('Financiado', cash(r.financing.principalCents))}
              {value('Prestação regular', cash(r.financing.paymentCents))}
              {value('Total com entrada', cash(r.financing.totalCents))}
              {value(
                'Juros / encargos efetivos',
                cash(r.financing.interestCents),
              )}
            </div>
            <p>
              {r.financing.source}. Juros arredondados a centavos por parcela;
              última prestação liquida o saldo. O cronograma é uma simulação.
            </p>
            <ol className="simulation-schedule" aria-label="Parcelas simuladas">
              {r.financing.schedule.map((item) => (
                <li key={item.number}>
                  <strong>
                    Parcela {item.number}: {cash(item.paymentCents)}
                  </strong>
                  <span>
                    Juros {cash(item.interestCents)} · amortização{' '}
                    {cash(item.principalCents)} · saldo{' '}
                    {cash(item.balanceCents)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </details>
      )}
      <details className="disclosure">
        <summary>Hipóteses e dados ausentes</summary>
        <div className="disclosure-body">
          <ul>
            {r.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
            {r.missing.map((item) => (
              <li key={item}>Não informado / incompleto: {item}.</li>
            ))}
            {r.warnings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
export function Simulations({ data }: ViewProps) {
  const [scenario, setScenario] = useState(emptyDecision),
    [copies, setCopies] = useState<DecisionScenario[]>([]),
    [compare, setCompare] = useState(false);
  const s = useDeferredValue(scenario),
    at = today(),
    economic = useEconomicIndicators();
  const result = useMemo(() => {
    try {
      return { value: simulateDecision(data, s, at), error: '' };
    } catch (e) {
      return {
        value: null,
        error: e instanceof Error ? e.message : 'Dados inválidos.',
      };
    }
  }, [data, s, at]);
  const comparison = useMemo(() => {
    if (!compare) return null;
    try {
      return buyNowOrWait(data, s, at);
    } catch {
      return null;
    }
  }, [data, s, at, compare]);
  const set = <K extends keyof DecisionScenario>(
    key: K,
    value: DecisionScenario[K],
  ) => setScenario((old) => ({ ...old, [key]: value }));
  const purchase = ['buy_asset', 'trade_vehicle'].includes(scenario.type);
  const needsAmount = !['pay_debt', 'remove_expense', 'reduce_income'].includes(
    scenario.type,
  );
  const select = (
    label: string,
    key: 'assetId' | 'debtId' | 'investmentId' | 'recurrenceId',
    options: { id: string; name: string }[],
  ) => (
    <label className="simulation-field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={String(scenario[key])}
        onChange={(e) => set(key, e.target.value)}
      >
        <option value="">Selecione</option>
        {options.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="simulations-page">
      <PageHeader
        title="Simulações"
        description="Veja consequências antes de decidir. Nenhum dado real será alterado."
      />
      <section aria-label="Cenário de decisão">
        <fieldset>
          <legend>1. O que você quer simular?</legend>
          <div className="simulation-fields">
            <label className="simulation-field">
              <span>Tipo de decisão</span>
              <select
                aria-label="Tipo de decisão"
                value={scenario.type}
                onChange={(e) => {
                  setScenario({
                    ...emptyDecision(),
                    type: e.target.value as DecisionScenario['type'],
                  });
                  setCompare(false);
                }}
              >
                {Object.entries(decisionLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="simulation-field">
              <span>Nome do cenário</span>
              <input
                value={scenario.name}
                maxLength={120}
                onChange={(e) => set('name', e.target.value)}
              />
            </label>
            <label className="simulation-field">
              <span>Horizonte</span>
              <select
                aria-label="Horizonte"
                value={scenario.horizonDays}
                onChange={(e) => set('horizonDays', Number(e.target.value))}
              >
                {[
                  [0, 'Agora'],
                  [30, '30 dias'],
                  [90, '90 dias'],
                  [365, '1 ano'],
                  [730, '2 anos'],
                  [1825, '5 anos'],
                ].map(([n, label]) => (
                  <option key={n} value={n}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>2. Dados da decisão</legend>
          <div className="simulation-fields">
            {needsAmount && (
              <NumberField
                label={purchase ? 'Preço do bem (R$)' : 'Valor da decisão (R$)'}
                value={scenario.amountCents}
                onChange={(v) => set('amountCents', v)}
              />
            )}
            {purchase && (
              <>
                <label className="simulation-field">
                  <span>Forma de pagamento</span>
                  <select
                    aria-label="Forma de pagamento"
                    value={scenario.payment}
                    onChange={(e) =>
                      set('payment', e.target.value as 'cash' | 'finance')
                    }
                  >
                    <option value="cash">À vista</option>
                    <option value="finance">Entrada + financiamento</option>
                  </select>
                </label>
                <NumberField
                  label="Custos imediatos de aquisição (R$)"
                  value={scenario.acquisitionCostsCents}
                  onChange={(v) => set('acquisitionCostsCents', v)}
                />
              </>
            )}
            {purchase && scenario.payment === 'finance' && (
              <>
                <NumberField
                  label="Entrada (R$)"
                  value={scenario.downPaymentCents}
                  onChange={(v) => set('downPaymentCents', v)}
                />
                <NumberField
                  label="Parcelas"
                  integer
                  value={scenario.installments}
                  onChange={(v) => set('installments', v ?? 0)}
                />
                <NumberField
                  label="Juros mensais (%)"
                  percent
                  value={scenario.monthlyRate}
                  onChange={(v) => set('monthlyRate', v)}
                />
                <NumberField
                  label="CET anual efetivo (%; prevalece sobre juros)"
                  percent
                  value={scenario.annualCet}
                  onChange={(v) => set('annualCet', v)}
                />
              </>
            )}
            {scenario.type === 'trade_vehicle' && (
              <>
                {select(
                  'Veículo atual',
                  'assetId',
                  assetRows(data)
                    .filter(
                      (r) =>
                        r.active === 'sim' &&
                        ['motorcycle', 'car'].includes(String(r.type)),
                    )
                    .map((r) => ({ id: r.id, name: String(r.name) })),
                )}
                <NumberField
                  label="Valor de venda (R$)"
                  value={scenario.saleCents}
                  onChange={(v) => set('saleCents', v)}
                />
              </>
            )}
            {['pay_debt', 'amortize'].includes(scenario.type) &&
              select(
                'Dívida',
                'debtId',
                data.debts.map((r) => ({ id: r.id, name: String(r.name) })),
              )}
            {['remove_expense', 'decrease_contribution'].includes(
              scenario.type,
            ) &&
              select(
                'Previsão mensal a reduzir',
                'recurrenceId',
                data.recurrences
                  .filter(
                    (r) =>
                      r.frequency === 'mensal' &&
                      r.status === 'ativa' &&
                      r.kind ===
                        (scenario.type === 'remove_expense'
                          ? 'despesa'
                          : 'aporte'),
                  )
                  .map((r) => ({ id: r.id, name: String(r.name) })),
              )}
            {scenario.type === 'reduce_income' && (
              <NumberField
                label="Redução da renda prevista (%)"
                value={scenario.incomeLossPercent}
                integer
                onChange={(v) => set('incomeLossPercent', v)}
              />
            )}
            {select(
              scenario.type === 'increase_contribution'
                ? 'Investimento de destino do aporte (opcional)'
                : 'Investimento de origem (se houver retirada)',
              'investmentId',
              data.investments.map((r) => ({ id: r.id, name: String(r.name) })),
            )}
            {scenario.type !== 'withdrawal' && (
              <NumberField
                label="Retirada para financiar a decisão (R$; opcional)"
                value={scenario.withdrawalCents}
                onChange={(v) => set('withdrawalCents', v)}
              />
            )}
          </div>
          <p>
            Campos vazios são desconhecidos. Informe zero apenas quando
            confirmar ausência do custo. Custos de aquisição incluem
            documentação, frete e taxas fora do CET.
          </p>
        </fieldset>
        {purchase && (
          <details className="disclosure">
            <summary>Custos mensais do novo bem</summary>
            <div className="disclosure-body simulation-fields">
              {Object.entries(vehicleCostLabels).map(([key, label]) => (
                <NumberField
                  key={key}
                  label={label + ' (R$/mês)'}
                  value={
                    scenario.vehicleCosts[key as keyof typeof vehicleCostLabels]
                  }
                  onChange={(v) =>
                    set('vehicleCosts', { ...scenario.vehicleCosts, [key]: v })
                  }
                />
              ))}
            </div>
          </details>
        )}
        <details className="disclosure">
          <summary>3. Hipóteses de retorno e inflação</summary>
          <div className="disclosure-body">
            <div className="simulation-fields">
              <NumberField
                label="Retorno esperado bruto (% a.a.)"
                percent
                value={scenario.annualReturn}
                onChange={(v) => set('annualReturn', v)}
              />
              <NumberField
                label="Inflação / correção do preço (% a.a.; 0 = sem correção)"
                percent
                value={scenario.annualInflation}
                onChange={(v) => set('annualInflation', v)}
              />
              {purchase && (
                <NumberField
                  label="Depreciação projetada do novo bem (% a.a.)"
                  percent
                  value={scenario.annualDepreciation}
                  onChange={(v) => set('annualDepreciation', v)}
                />
              )}
            </div>
            <p>
              Taxas não são garantias. Nenhum retorno de renda variável é
              presumido. Use zero explicitamente para cenário sem rendimento ou
              sem correção.
            </p>
            {(['cdi', 'selic', 'ipca'] as const).map((key) => {
              const rate = economic.rates[key];
              return rate ? (
                <div className="setting-row" key={key}>
                  <span>
                    {key.toUpperCase()}: {dec(rate.value)}% · {rate.source} ·{' '}
                    {brDate(rate.date)} ·{' '}
                    {rate.status || 'status não informado'}
                  </span>
                  <button
                    onClick={() =>
                      set(
                        key === 'ipca' ? 'annualInflation' : 'annualReturn',
                        rate.value / 100,
                      )
                    }
                  >
                    Usar {key.toUpperCase()} como hipótese
                  </button>
                </div>
              ) : (
                <p key={key}>{key.toUpperCase()}: indisponível.</p>
              );
            })}
          </div>
        </details>
        <div className="simulation-actions">
          <button
            onClick={() =>
              setCopies((old) => [...old.slice(-2), structuredClone(scenario)])
            }
          >
            Duplicar cenário na sessão
          </button>
          <button
            onClick={() => {
              setScenario(emptyDecision());
              setCompare(false);
            }}
          >
            Limpar simulação
          </button>
        </div>
        {copies.length > 0 && (
          <details className="disclosure">
            <summary>Cópias da sessão ({copies.length})</summary>
            <div className="disclosure-body">
              {copies.map((copy, i) => (
                <div className="setting-row" key={i}>
                  <span>
                    {copy.name} · {decisionLabels[copy.type]}
                  </span>
                  <button onClick={() => setScenario(structuredClone(copy))}>
                    Abrir cópia {i + 1}
                  </button>
                  <button
                    onClick={() =>
                      setCopies((old) => old.filter((_, n) => n !== i))
                    }
                  >
                    Excluir cópia {i + 1}
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
      <section aria-label="Resultado da simulação">
        <h2>4. Impacto da decisão</h2>
        {result.value ? (
          <Metrics result={result.value} />
        ) : (
          <output>Simulação insuficiente: {result.error}</output>
        )}
      </section>
      {purchase && (
        <details
          className="disclosure"
          onToggle={(e) => setCompare(e.currentTarget.open)}
        >
          <summary>Comprar agora × esperar</summary>
          <div className="disclosure-body">
            <div className="simulation-fields">
              <NumberField
                label="Meses de espera"
                integer
                value={scenario.waitMonths}
                onChange={(v) => set('waitMonths', v ?? 0)}
              />
              <NumberField
                label="Aporte mensal separado para compra (R$)"
                value={scenario.waitingContributionCents}
                onChange={(v) => set('waitingContributionCents', v)}
              />
              <NumberField
                label="Custos adicionais da espera (R$/mês; além do forecast)"
                value={scenario.waitingExtraCostCents}
                onChange={(v) => set('waitingExtraCostCents', v)}
              />
              {scenario.type === 'trade_vehicle' && (
                <NumberField
                  label="Depreciação do veículo atual durante espera (% a.a.)"
                  percent
                  value={scenario.oldAnnualDepreciation}
                  onChange={(v) => set('oldAnnualDepreciation', v)}
                />
              )}
            </div>
            <p>
              Configure retorno e correção do preço nas hipóteses. A comparação
              não escolhe um vencedor.
            </p>
            {comparison && (
              <>
                <p>
                  Preço projetado pela hipótese selecionada:{' '}
                  {cash(comparison.futurePriceCents)}. Custos do veículo atual
                  durante espera: {cash(comparison.costsWhileWaiting)}. Data da
                  compra adiada: {brDate(comparison.futureDate)}. Média
                  histórica do veículo atual:{' '}
                  {cash(comparison.historicalMonthlyCostCents)}/mês (referência,
                  não novo lançamento).
                </p>
                {comparison.later ? (
                  <div className="simulation-columns">
                    {(
                      [
                        ['Comprar agora', comparison.now],
                        ['Esperar', comparison.later],
                      ] as const
                    ).map(([label, r]) => (
                      <section key={String(label)} aria-label={String(label)}>
                        <h3>{String(label)}</h3>
                        <div className="inline-stats">
                          {value(
                            'Entrada necessária',
                            cash(r.downPaymentCents),
                          )}
                          {value(
                            'Juros / encargos',
                            cash(
                              r.financing?.interestCents ??
                                (r.financing ? null : 0),
                            ),
                          )}
                          {value(
                            'Meta ideal diária',
                            cash(r.target.after.idealCents),
                          )}
                          {value(
                            'Reserva em meses',
                            count(r.reserve.after.coverage),
                          )}
                          {value(
                            'Retorno potencial não realizado',
                            cash(r.longTerm.opportunity?.potentialReturnCents),
                          )}
                          {value(
                            'Financiamento',
                            cash((r as Result).financing?.principalCents ?? 0),
                          )}
                          {value(
                            'Total pago com entrada',
                            cash(r.acquisitionTotalCents),
                          )}
                          {value(
                            'Caixa após compra',
                            cash((r as Result).after.cashCents),
                          )}
                          {value(
                            'Reserva',
                            cash((r as Result).reserve.after.totalCents),
                          )}
                          {value(
                            'Patrimônio conhecido após compra',
                            cash((r as Result).after.netCents),
                          )}
                          {value(
                            'Pressão mensal',
                            cash((r as Result).monthly.totalCents),
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <p>
                    Comparação insuficiente: informe retorno, correção do preço
                    e aporte de espera (zero é válido). Fluxo completo da espera
                    limitado a 366 dias; preço e oportunidade continuam
                    calculáveis além disso.
                  </p>
                )}
                <ul>
                  {comparison.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
                <p>
                  Comparação parcial: renda e compromissos conhecidos vêm do
                  forecast; depreciação só usa taxa declarada. Cotação de venda,
                  quitação e demais avaliações futuras exigem confirmação. Fluxo
                  incompleto produz apenas valores conhecidos, não saldo futuro
                  garantido.
                </p>
              </>
            )}
          </div>
        </details>
      )}
      <p>
        Cenários e cópias ficam apenas nesta sessão da página. Recarregar ou
        sair da aba descarta as hipóteses. Nenhum dado financeiro vai para a
        URL.
      </p>
    </div>
  );
}

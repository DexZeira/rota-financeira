import { useMemo, useState } from 'react';
import { money, dec, today, num, type Data } from '../model';
import { FinancialItem, EmptyState } from './finance-ui';
import { type ViewProps, value } from '../pages/shared';
import { planningPhaseTwo } from '../services/planning-phase-two';
import { fromCents, toCents } from '../services/money-codec';
import { emergencyScenario } from '../services/emergency-fund';
import { calculateCostOfLiving } from '../services/cost-of-living';
import { useEconomicIndicators } from '../hooks/use-economic-indicators';

export const centsLabel = (cents: number | null) =>
  cents === null ? 'Não definido' : money(fromCents(cents));
export function usePhaseTwo(data: Data) {
  const at = today();
  return useMemo(() => planningPhaseTwo(data, at), [data, at]);
}
const statusLabels = {
  normal: 'Dentro do limite',
  attention: 'Atenção ao ritmo',
  near_limit: 'Próximo do limite',
  over_budget: 'Acima do orçamento',
};
export function BudgetSection(p: ViewProps) {
  const { budget } = usePhaseTwo(p.data);
  const budgetById = new Map(budget.rows.map((row) => [row.id, row]));
  return (
    <details className="disclosure">
      <summary>Quanto posso gastar? · Orçamento do mês</summary>
      <div className="disclosure-body">
        <div className="section-heading">
          <h2>Orçamento por categoria</h2>
          <button onClick={() => p.edit('budgets')}>Criar orçamento</button>
        </div>
        <p>
          Controle opcional por categoria. Totais incluem somente categorias com
          orçamento ativo; não são um limite para cadastrar gastos.
        </p>
        {!!budget.rows.length && (
          <div className="inline-stats">
            {value('Orçamento total', centsLabel(budget.limitCents))}
            {value('Realizado', centsLabel(budget.actualCents))}
            {value('Restante', centsLabel(budget.remainingCents))}
            {value(
              'Projeção total · estimada',
              centsLabel(budget.projectedCents),
            )}
          </div>
        )}
        {budget.partial && (
          <output>
            Baseado em projeção parcial. Confira compromissos sem valor ou sem
            data.
          </output>
        )}
        {!p.data.budgets.length && (
          <EmptyState
            title="Escolha uma categoria para começar"
            description="Exemplo: alimentação. As demais categorias continuam livres."
          />
        )}
        {p.data.budgets.map((row) => {
          const result = budgetById.get(row.id);
          return (
            <FinancialItem
              key={row.id}
              title={String(row.category)}
              value={centsLabel(num(row.limitCents))}
              context={result ? statusLabels[result.status] : 'Desativado'}
              action={
                <div className="row-actions">
                  <button
                    onClick={() => p.edit('budgets', row)}
                    aria-label={'Editar orçamento de ' + row.category}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => p.del('budgets', row)}
                    aria-label={'Excluir orçamento de ' + row.category}
                  >
                    Excluir
                  </button>
                </div>
              }
            >
              {result && (
                <>
                  <div className="inline-stats">
                    {value('Realizado', centsLabel(result.actualCents))}
                    {value('Previsto conhecido', centsLabel(result.knownCents))}
                    {value(
                      'Estimativa variável',
                      centsLabel(result.estimatedCents),
                    )}
                    {value(
                      'Recorrência legada · estimada',
                      centsLabel(result.recurringEstimateCents),
                    )}
                    {value('Restante', centsLabel(result.remainingCents))}
                    {value(
                      'Usado',
                      result.percent === null
                        ? 'Limite zero'
                        : dec(result.percent, 1) + '%',
                    )}
                    {value('Projeção total', centsLabel(result.projectedCents))}
                  </div>
                  <p>
                    {result.fastPace
                      ? 'Seu ritmo de gastos está acima do ritmo do mês.'
                      : 'Ritmo dentro da referência do mês.'}{' '}
                    {result.overProjection
                      ? 'Tendência acima do orçamento.'
                      : ''}{' '}
                    {result.reliable
                      ? 'Estimativa com três meses de histórico.'
                      : 'Estimativa simples; histórico insuficiente.'}
                  </p>
                </>
              )}
            </FinancialItem>
          );
        })}
      </div>
    </details>
  );
}
export function DynamicTargetSection(p: ViewProps) {
  const { target } = usePhaseTwo(p.data);
  return (
    <section className="content-section" aria-label="Meta dinâmica">
      <div className="section-heading">
        <h2>Quanto preciso ganhar hoje?</h2>
        <button
          onClick={() => p.edit('planningSettings', p.data.planningSettings[0])}
        >
          Dias e metas
        </button>
      </div>
      {target.enabled ? (
        <>
          <div className="inline-stats">
            {value('Meta de hoje · estimada', centsLabel(target.todayCents))}
            {value('Já realizado hoje', centsLabel(target.earnedTodayCents))}
            {value('Falta hoje', centsLabel(target.remainingTodayCents))}
            {value('Excedente hoje', centsLabel(target.surplusTodayCents))}
          </div>
          <p>
            {target.remainingDays} dias de trabalho restantes.{' '}
            {!target.isWorkday &&
              'Hoje não está configurado como dia de trabalho.'}
          </p>
          {target.aboveLimitCents > 0 && (
            <output>
              Meta necessária acima do limite configurado em{' '}
              {centsLabel(target.aboveLimitCents)}. O valor necessário não foi
              reduzido.
            </output>
          )}
          {target.remainingDays === 0 && (
            <output>
              Sem dias de trabalho restantes. Revise a agenda e os compromissos
              do mês.
            </output>
          )}
          {target.partial && <p>Baseado em projeção parcial.</p>}
          <details className="disclosure">
            <summary>Entender a meta dinâmica</summary>
            <div className="disclosure-body">
              <div className="inline-stats">
                {value(
                  'Mínima / dia trabalhado',
                  centsLabel(target.minimumCents),
                )}
                {value('Ideal / dia trabalhado', centsLabel(target.idealCents))}
                {value(
                  'Acelerada / dia trabalhado',
                  centsLabel(target.acceleratedCents),
                )}
              </div>
              <p>
                O realizado nos dias anteriores reduz a necessidade restante.
                Déficits e excedentes são redistribuídos pelos dias da agenda,
                sem mudar lançamentos.
              </p>
              <p>
                Variação da meta ideal frente ao ritmo inicial:{' '}
                {centsLabel(target.changeFromBaselineCents)} por dia.
                Estimativas com pouco histórico acrescentariam{' '}
                {centsLabel(target.weakScenarioDailyCents)} por dia apenas em
                cenário.
              </p>
              <p>
                As margens cobrem provisões, planos e aportes; usamos o maior
                valor entre margem e compromissos, sem somar duas vezes.
              </p>
            </div>
          </details>
        </>
      ) : (
        <p>
          Configure os dias de trabalho e as folgas para ativar a redistribuição
          diária. A meta atual permanece disponível.
        </p>
      )}
    </section>
  );
}
export function PhaseTwoSummary({ data, go }: Pick<ViewProps, 'data' | 'go'>) {
  const { budget, living, reserve } = usePhaseTwo(data);
  return (
    <details className="disclosure">
      <summary>Orçamento, custo de vida e proteção</summary>
      <div className="disclosure-body">
        <div className="inline-stats">
          {value(
            'Restante nas categorias orçadas',
            budget.rows.length
              ? centsLabel(budget.remainingCents)
              : 'Sem orçamento configurado',
          )}
          {value(
            'Custo mínimo mensal · estimado',
            centsLabel(living.minimumCents),
          )}
          {value(
            'Reserva total · cobertura estimada',
            reserve.coverage === null
              ? 'Custo mínimo não definido'
              : dec(reserve.coverage, 1) + ' meses',
          )}
        </div>
        {(living.partial || budget.partial) && (
          <p>
            Base parcial: classifique categorias e confira previsões antes de
            decidir.
          </p>
        )}
        {budget.rows
          .filter((b) => b.status === 'over_budget')
          .map((b) => (
            <p key={b.id}>{b.category}: acima do orçamento.</p>
          ))}
        {reserve.missingCents !== null && reserve.missingCents > 0 && (
          <p>
            Faltam {centsLabel(reserve.missingCents)} para a meta de reserva
            configurada.
          </p>
        )}
        <div className="row-actions">
          <button onClick={() => go('Gastos')}>Revisar orçamento</button>
          <button onClick={() => go('Planejamento')}>
            Custo de vida e reserva
          </button>
        </div>
      </div>
    </details>
  );
}
function LivingReserveDetails(p: ViewProps) {
  const phase = usePhaseTwo(p.data),
    { inflation } = useEconomicIndicators(),
    at = today();
  const living = useMemo(
    () => calculateCostOfLiving(p.data, at, inflation),
    [p.data, at, inflation],
  );
  const [loss, setLoss] = useState(100),
    [income, setIncome] = useState(''),
    [unexpected, setUnexpected] = useState('');
  const validScenario = [income, unexpected].every(
    (n) => Number.isFinite(Number(n)) && Number(n) >= 0 && Number(n) <= 1e12,
  );
  const scenario = validScenario
    ? emergencyScenario(
        phase.reserve.immediateCents,
        living.minimumCents,
        toCents(Number(income)),
        loss,
        toCents(Number(unexpected)),
      )
    : null;
  return (
    <div className="disclosure-body">
      <div className="section-heading">
        <h2>Minha vida custa</h2>
        <button
          onClick={() => p.edit('planningSettings', p.data.planningSettings[0])}
        >
          Preferências de planejamento
        </button>
      </div>
      <div className="inline-stats">
        {value('Mínimo / mês', centsLabel(living.minimumCents))}
        {value('Normal / mês', centsLabel(living.normalCents))}
        {value('Confortável / mês', centsLabel(living.comfortableCents))}
      </div>
      <p>
        Estimativa pela mediana do histórico: {living.samples} de{' '}
        {living.window} meses completos. Essenciais e dívidas formam o mínimo;
        gastos habituais formam o normal; lazer, planos e aportes compõem o
        confortável.
      </p>
      {living.partial && (
        <output>
          Base parcial: faltam histórico ou categorias classificadas. O mínimo
          conhecido pode subestimar seu custo.
        </output>
      )}
      <div className="inline-stats">
        {value('Mínimo / dia', centsLabel(living.dailyMinimumCents))}
        {value('Normal / dia', centsLabel(living.dailyNormalCents))}
        {value('Normal / semana', centsLabel(living.weeklyNormalCents))}
        {value('Normal / ano', centsLabel(living.yearlyNormalCents))}
      </div>
      <p>
        Dia: dias reais do mês. Ano: mensal × 12. Semana: anual ÷ 52. São
        equivalências estimadas, não previsões de inflação futura.
      </p>
      <p>
        {living.realChange === null
          ? 'Comparação real por inflação indisponível: requer dois meses completos e IPCA observado correspondente.'
          : `Variação nominal entre os dois últimos meses: ${dec((living.nominalChange || 0) * 100)}%. IPCA do período: ${dec((living.inflation || 0) * 100)}%. Variação real comparável: ${dec(living.realChange * 100)}%. Mudanças de consumo também afetam esta comparação.`}
      </p>
      <details className="disclosure">
        <summary>Classificar categorias</summary>
        <div className="disclosure-body">
          <p>
            Nenhuma categoria é considerada essencial automaticamente. Use
            “manutenção” para serviços sem categoria.
          </p>
          <button onClick={() => p.edit('categoryPolicies')}>
            Classificar categoria
          </button>
          {p.data.categoryPolicies.map((row) => (
            <FinancialItem
              key={row.id}
              title={String(row.category)}
              value={String(row.level)}
              action={
                <div className="row-actions">
                  <button onClick={() => p.edit('categoryPolicies', row)}>
                    Editar
                  </button>
                  <button onClick={() => p.del('categoryPolicies', row)}>
                    Remover
                  </button>
                </div>
              }
            />
          ))}
        </div>
      </details>
      <h2>Quanto tempo minha reserva dura?</h2>
      <div className="inline-stats">
        {value('Reserva marcada', centsLabel(phase.reserve.totalCents))}
        {value('Liquidez imediata', centsLabel(phase.reserve.immediateCents))}
        {value(
          'Cobertura total · estimada',
          phase.reserve.coverage === null
            ? 'Não definida'
            : dec(phase.reserve.coverage, 1) + ' meses',
        )}
        {value(
          'Cobertura imediata · estimada',
          phase.reserve.immediateCoverage === null
            ? 'Não definida'
            : dec(phase.reserve.immediateCoverage, 1) + ' meses',
        )}
        {value('Meta escolhida', centsLabel(phase.reserve.targetCents))}
        {value('Falta para a reserva', centsLabel(phase.reserve.missingCents))}
      </div>
      <p>
        Base: custo mínimo mensal. Apenas investimentos explicitamente marcados;
        não altera o caixa operacional. Liquidez não informada:{' '}
        {centsLabel(phase.reserve.unknownLiquidityCents)}.
      </p>
      <button onClick={() => p.edit('reserveAllocations')}>
        Marcar investimento como reserva
      </button>
      {!p.data.investments.length && (
        <p>Cadastre primeiro um investimento na aba Investimentos.</p>
      )}
      {p.data.reserveAllocations.map((row) => (
        <FinancialItem
          key={row.id}
          title={String(
            p.data.investments.find((i) => i.id === row.investmentId)?.name ||
              'Investimento',
          )}
          description={`${row.enabled === 'sim' ? 'Reserva' : 'Fora da reserva'} · ${row.liquidity}`}
          action={
            <div className="row-actions">
              <button onClick={() => p.edit('reserveAllocations', row)}>
                Editar reserva
              </button>
              <button onClick={() => p.del('reserveAllocations', row)}>
                Remover vínculo
              </button>
            </div>
          }
        />
      ))}
      <details className="disclosure">
        <summary>Simular emergência</summary>
        <div className="disclosure-body">
          <p>
            Cenário temporário sobre a reserva imediata. Não salva nem movimenta
            dinheiro.
          </p>
          <div className="form-grid">
            <label>
              Perda de renda
              <select
                value={loss}
                onChange={(e) => setLoss(Number(e.target.value))}
              >
                <option value={100}>Perda total</option>
                <option value={50}>Redução de 50%</option>
              </select>
            </label>
            <label>
              Renda mensal do cenário (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
              />
            </label>
            <label>
              Despesa inesperada (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={unexpected}
                onChange={(e) => setUnexpected(e.target.value)}
              />
            </label>
          </div>
          <p aria-live="polite">
            {!scenario
              ? 'Informe valores válidos.'
              : `Cobertura antes: ${scenario.before === null ? 'não definida' : dec(scenario.before, 1) + ' meses'}. Depois: ${scenario.noDepletion ? 'renda restante cobre o custo mínimo' : scenario.after === null ? 'não definida' : dec(scenario.after, 1) + ' meses'}.`}
          </p>
        </div>
      </details>
    </div>
  );
}
export function LivingReserveSection(p: ViewProps) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="disclosure"
      onToggle={(event) => setOpened(event.currentTarget.open)}
    >
      <summary>Custo de vida e reserva</summary>
      {opened && <LivingReserveDetails {...p} />}
    </details>
  );
}

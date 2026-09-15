import { type Row, money, dec, brDate, num } from '../model';
import { type EconomicIndicators } from '../hooks/use-economic-indicators';
import { correctedPlan } from '../services/financial-intelligence';
import { inflationAdjustedContribution } from '../services/purchasing-power';
import { value } from '../pages/shared';

export function PlanInflation({ row, economic, current, monthly, edit }: { row: Row; economic: EconomicIndicators; current: number; monthly: number; edit: () => void }) {
  let correction: ReturnType<typeof correctedPlan> | null = null;
  let nextContribution: number | null = null;
  try {
    correction = correctedPlan(row, economic.rates, economic.focus);
    if (row.adjustContributions === 'sim') nextContribution = inflationAdjustedContribution(monthly, correction.annual, 12);
  } catch { /* unsupported horizon stays unavailable */ }
  return <details className="disclosure"><summary>Inflação e poder de compra do objetivo</summary>
    <div className="inline-stats">{value('Valor-base preservado', money(num(row.target)))}{value('Correção selecionada', String(row.inflationMode || 'Sem correção'))}{value('Meta corrigida estimada', correction?.adjusted == null ? 'Indisponível' : money(correction.adjusted))}{value('Data-base', brDate(row.inflationBaseDate))}{value('Prazo', brDate(row.deadline))}
      {correction?.adjusted != null && value('Falta para a meta corrigida', money(Math.max(0, correction.adjusted - current - (row.kind === 'próxima moto' ? num(row.bikeValue) : 0))))}
      {row.adjustContributions === 'sim' && value('Aporte mensal após 1 ano', nextContribution === null ? 'Indisponível' : money(nextContribution))}
    </div>
    <p className="inline-note">{correction?.source}. {correction?.annual != null && `${dec(correction.annual * 100)}% a.a.`} Estimativa, não garantia de resultado. O valor-base e o histórico permanecem intactos. A projeção não altera automaticamente seu aporte nem a meta de faturamento. Para próxima moto, esta correção se aplica ao preço objetivo, sem presumir a valorização da moto atual.</p>
    <button onClick={edit}>Configurar correção da meta</button>
  </details>;
}

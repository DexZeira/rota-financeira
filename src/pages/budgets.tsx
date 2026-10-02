import { PageHeader } from '../components/finance-ui';
import { BudgetSection, centsLabel, usePhaseTwo } from '../components/planning-phase-two';
import { PrivateValue } from '../components/value-privacy';
import type { ViewProps } from './shared';
import './budgets.css';

export function Budgets(props: ViewProps) {
  const { budget } = usePhaseTwo(props.data);
  return <div className="budgets-page"><PageHeader title="Orçamentos" description="Limites por categoria, gastos realizados e projeções claramente separadas." action={<button className="primary" onClick={() => props.edit('budgets')}>Criar orçamento</button>}/><div className="budget-workspace"><section className="budget-categories"><BudgetSection {...props} defaultOpen/></section><aside className="budget-context"><h2>Leitura do mês</h2><dl>{([['Orçamento ativo', budget.limitCents], ['Gasto realizado', budget.actualCents], ['Restante', budget.remainingCents], ['Projeção · estimada', budget.projectedCents]] as const).map(([label, amount]) => <div key={String(label)}><dt>{label}</dt><dd><PrivateValue>{centsLabel(amount)}</PrivateValue></dd></div>)}</dl><p>O realizado mostra pagamentos registrados. A projeção considera o ritmo e os compromissos conhecidos.</p>{budget.partial && <p className="notice">Projeção parcial: revise compromissos sem valor ou data.</p>}<button onClick={() => props.go('Gastos')}>Revisar gastos</button></aside></div></div>;
}

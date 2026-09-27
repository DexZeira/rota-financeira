import { useMemo } from 'react';
import { type Data, today } from '../model';
import { FinancialQueryService } from '../services/financial-query';
type Props = { data: Data; go: (page: string) => void };
export function useFinancialHealth(data: Data) {
  const at = today();
  return useMemo(
    () => new FinancialQueryService(data, at).getCurrentSituation(),
    [data, at],
  );
}
export function AlertSummary({ data, go }: Props) {
  const summary = useFinancialHealth(data);
  const count = summary.alerts.filter((a) => a.severity !== 'info').length;
  return (
    <button className="report-last-closed" onClick={() => go('Alertas')}>
      {count
        ? `${count} ${count === 1 ? 'item precisa' : 'itens precisam'} de atenção`
        : 'Ver alertas e informações'}{' '}
      · Ver
    </button>
  );
}

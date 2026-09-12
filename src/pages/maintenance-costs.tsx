import { Card } from '../components/common';
import { maintenanceSummary } from '../calculations';
import { type Data, dec, money, num } from '../model';
const rate = (n: number | null) =>
  n === null ? 'Indisponível' : `R$ ${dec(n, 4)}/km`;
export function MaintenanceCostSummary({ data }: { data: Data }) {
  const m = maintenanceSummary(data);
  return (
    <Card title="Custo de manutenção por km">
      <div className="work-stats">
        <div className="detail">
          <span>Estimado</span>
          <strong>{rate(m.totalEstimatedCostPerKm)}</strong>
        </div>
        <div className="detail">
          <span>Real · {m.actualCount} item(ns) com ciclo encerrado</span>
          <strong>{rate(m.totalActualCostPerKm)}</strong>
        </div>
      </div>
      <p className="inline-note">
        O real usa o custo da peça instalada dividido pelos km até a troca
        seguinte, no último ciclo encerrado de cada item. A soma real é parcial
        quando faltam históricos. Valores da instalação inicial são referência
        histórica; novos pagamentos devem ser registrados em “Realizar”, uma
        única vez.
      </p>
      <p className="inline-note">
        A vida útil usa o intervalo em km quando não preenchida. Itens com
        estimativa substituem previsões da aba Moto de mesmo nome ou vinculadas
        no cadastro. Aliases e nomes normalizados também identificam o mesmo componente;
        correspondências incertas precisam de confirmação abaixo. Seguro e documentação continuam no custo
        operacional.
      </p>
      <div className="work-list">
        {m.items
          .filter((r) => r.estimatedCostPerKm !== null || r.hasActualCost)
          .map((r) => (
            <div className="activity-card" key={r.id}>
              <h3>{String(r.name)}</h3>
              <div className="work-stats">
                <div className="detail">
                  <span>Valor estimado</span>
                  <strong>{money(num(r.estimated))}</strong>
                </div>
                <div className="detail">
                  <span>Vida útil estimada</span>
                  <strong>{dec(r.lifeKm)} km</strong>
                </div>
                <div className="detail">
                  <span>Estimado/km</span>
                  <strong>{rate(r.estimatedCostPerKm)}</strong>
                </div>
                <div className="detail">
                  <span>Valor pago no ciclo encerrado</span>
                  <strong>
                    {r.actualValue === null
                      ? 'Indisponível'
                      : money(r.actualValue)}
                  </strong>
                </div>
                <div className="detail">
                  <span>Vida útil real</span>
                  <strong>
                    {r.actualLifeKm === null
                      ? 'Indisponível'
                      : `${dec(r.actualLifeKm)} km`}
                  </strong>
                </div>
                <div className="detail">
                  <span>Real/km</span>
                  <strong>{rate(r.actualCostPerKm)}</strong>
                </div>
              </div>
            </div>
          ))}
      </div>
      {!m.actualCount && <p>Custo real/km ainda indisponível.</p>}
    </Card>
  );
}

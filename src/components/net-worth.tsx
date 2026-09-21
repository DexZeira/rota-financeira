import { useMemo } from 'react';
import { type ViewProps, value } from '../pages/shared';
import { money, dec, today, num, brDate, emptyRow, id } from '../model';
import {
  calculateNetWorth,
  createNetWorthSnapshot,
  calculateNetWorthChange,
} from '../services/net-worth';
import { calculateOwnershipCost } from '../services/ownership-cost';
import { BIKE_ASSET_ID } from '../services/assets';
import { observedAssetInflation } from '../services/depreciation';
import { useEconomicIndicators } from '../hooks/use-economic-indicators';
export const patrimonialMoney = (cents: number | null) =>
  cents === null ? 'Não informado' : money(cents / 100);
export function NetWorthSummary({ data, go }: Pick<ViewProps, 'data' | 'go'>) {
  const at = today(),
    { inflation } = useEconomicIndicators();
  const result = useMemo(() => calculateNetWorth(data, at), [data, at]);
  const baseline = [...data.netWorthSnapshots]
    .filter((r) => String(r.date) < at)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .at(-1);
  const change = baseline
    ? calculateNetWorthChange(
        data,
        baseline,
        createNetWorthSnapshot(data, at),
        observedAssetInflation(inflation, String(baseline.date), at),
      )
    : null;
  return (
    <details className="disclosure">
      <summary>
        Patrimônio líquido · {patrimonialMoney(result.netCents)}
        {result.partial ? ' (parcial)' : ''}
      </summary>
      <div className="disclosure-body">
        <p>
          Seus ativos menos as dívidas. Reserva e planos não são somados
          novamente.
          {result.estimated && ' Inclui avaliações estimadas.'}
        </p>
        {change && baseline ? (
          <p>
            Desde {brDate(baseline.date)}: {patrimonialMoney(change.deltaCents)}
            . Variação real:{' '}
            {change.realPercent === null
              ? 'IPCA ou base insuficiente'
              : dec(change.realPercent * 100) + '%'}
            .
          </p>
        ) : (
          <p>
            Registre posições patrimoniais para acompanhar variações nominais e
            reais.
          </p>
        )}
        <button onClick={() => go('Patrimônio')}>Abrir patrimônio</button>
      </div>
    </details>
  );
}
export function OwnershipPanel(p: ViewProps & { assetId?: string }) {
  const at = today(),
    assetId = p.assetId || BIKE_ASSET_ID;
  const result = useMemo(
    () => calculateOwnershipCost(p.data, assetId, at),
    [p.data, assetId, at],
  );
  if (!result)
    return (
      <p>
        Cadastre os dados da moto para acompanhar valor patrimonial e custo
        total.
      </p>
    );
  return (
    <details className="disclosure">
      <summary>Valor patrimonial e custo total de propriedade</summary>
      <div className="disclosure-body">
        <div className="inline-stats">
          {value(
            'Capital de aquisição',
            patrimonialMoney(
              result.asset.purchasePriceCents === null
                ? null
                : num(result.asset.purchasePriceCents),
            ),
          )}
          {value(
            'Custos pagos desde a aquisição',
            patrimonialMoney(result.cashCents),
          )}
          {value(
            'Depreciação nominal (negativo = valorização)',
            patrimonialMoney(result.depreciation.nominalCents),
          )}
          {value(
            'Custo econômico conhecido',
            patrimonialMoney(result.economicCents),
          )}
        </div>
        <p>
          Compra é capital; custo econômico é custo pago mais depreciação.
          Previsões por km e reserva não são novos pagamentos.
        </p>
        <div className="inline-stats">
          {value('Realizado neste mês', patrimonialMoney(result.monthCents))}
          {value(
            'Média mensal histórica',
            patrimonialMoney(result.monthlyCents),
          )}
          {value('Últimos 12 meses', patrimonialMoney(result.last12Cents))}
          {value(
            'Anualização estimada',
            patrimonialMoney(result.annualizedCents),
          )}
          {value(
            'Custo caixa / km',
            result.cashPerKm === null
              ? 'KM insuficiente'
              : money(result.cashPerKm),
          )}
          {value(
            'Custo econômico / km',
            result.economicPerKm === null
              ? 'Base insuficiente'
              : money(result.economicPerKm),
          )}
        </div>
        {Object.entries(result.categories).map(([category, cents]) => (
          <div className="setting-row" key={category}>
            <span>{category}</span>
            <strong>
              {patrimonialMoney(cents)} ·{' '}
              {result.byKm[category] === null
                ? 'km indisponível'
                : money(result.byKm[category]!)}{' '}
              / km
            </strong>
          </div>
        ))}
        <p>
          Depreciação/km:{' '}
          {result.km && result.depreciation.nominalCents !== null
            ? money(result.depreciation.nominalCents / 100 / result.km)
            : 'indisponível'}
          .
        </p>
        <p>
          Profissional atribuído: {patrimonialMoney(result.professionalCents)} ·
          pessoal explícito: {patrimonialMoney(result.personalCents)} · não
          atribuído: {patrimonialMoney(result.unassignedCents)}.
        </p>
        {result.work && (
          <p>
            Trabalho no período: receita {money(result.work.revenue)}, custos
            atribuídos {money(result.work.realExpenses)}. Resultado operacional
            após combustível ainda não coberto por registros:{' '}
            {patrimonialMoney(result.operationalWorkCents)} (estimado; parcela
            de combustível estimada {patrimonialMoney(result.fuelGapCents)}).
          </p>
        )}
        <p>
          Custos dependem dos registros. Categorias sem lançamentos significam
          “nenhum custo identificado”, não ausência comprovada de custo.
          Classifique aquisições para não tratá-las como operação. Combustível
          estimado não entra nos custos pagos.
        </p>
        <button
          onClick={() =>
            p.edit('assetCostLinks', {
              ...emptyRow('assetCostLinks'),
              id: id(),
              assetId,
            })
          }
        >
          Vincular custo existente
        </button>
      </div>
    </details>
  );
}

import { useMemo, useState } from 'react';
import { type ViewProps, value } from './shared';
import { today, emptyRow, id, num, dec, brDate } from '../model';
import {
  PageHeader,
  HeroMetric,
  FinancialItem,
} from '../components/finance-ui';
import { Records } from '../components/common';
import {
  OwnershipPanel,
  patrimonialMoney as money,
} from '../components/net-worth';
import {
  calculateNetWorth,
  createNetWorthSnapshot,
  calculateNetWorthChange,
  liquidityLabel,
} from '../services/net-worth';
import {
  calculateDepreciation,
  observedAssetInflation,
} from '../services/depreciation';
import { useEconomicIndicators } from '../hooks/use-economic-indicators';
export function NetWorth(p: ViewProps) {
  const at = today(),
    { inflation } = useEconomicIndicators(),
    [selected, setSelected] = useState('');
  const result = useMemo(() => calculateNetWorth(p.data, at), [p.data, at]);
  const assetIndex = new Map(result.assets.map((r) => [r.asset.id, r]));
  const snapshots = [...p.data.netWorthSnapshots].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  const last = snapshots.at(-1),
    previous = snapshots.at(-2);
  const bridge =
    last && previous
      ? calculateNetWorthChange(
          p.data,
          previous,
          last,
          observedAssetInflation(
            inflation,
            String(previous.date),
            String(last.date),
          ),
        )
      : null;
  const item = assetIndex.get(selected);
  const depreciation = item
    ? calculateDepreciation(
        item.asset.purchasePriceCents === null
          ? null
          : num(item.asset.purchasePriceCents),
        item.valueCents,
        String(item.asset.purchaseDate),
        item.date,
        item.date
          ? observedAssetInflation(
              inflation,
              String(item.asset.purchaseDate),
              item.date,
            )
          : null,
      )
    : null;
  return (
    <>
      <PageHeader
        title="Patrimônio"
        description="O que você possui, o que deve e como isso muda."
        action={
          <button className="primary" onClick={() => p.edit('assets')}>
            Cadastrar bem
          </button>
        }
      />
      <HeroMetric
        label={
          result.partial
            ? 'Patrimônio líquido conhecido · parcial'
            : 'Patrimônio líquido'
        }
        value={money(result.netCents)}
        context={
          result.estimated
            ? 'Inclui avaliações estimadas. Bens não são dinheiro disponível.'
            : 'Ativos menos passivos. Bens não são dinheiro disponível.'
        }
      />
      <div className="inline-stats">
        {value('Patrimônio bruto conhecido', money(result.grossCents))}
        {value('Passivos', money(result.liabilitiesCents))}
        {value('Líquido financeiro', money(result.financialNetCents))}
        {value('Líquido rapidamente disponível', money(result.quickNetCents))}
      </div>
      {result.partial && (
        <p>
          {result.missingValues} bem(ns) sem valor informado. O total mostrado é
          parcial.
        </p>
      )}
      <details className="disclosure">
        <summary>Composição e liquidez</summary>
        <div className="disclosure-body">
          <p>
            Ativos são valores e bens; passivos são dívidas reconhecidas. Contas
            futuras e orçamentos não são novas dívidas patrimoniais.
          </p>
          <div className="inline-stats">
            {value('Dinheiro em caixa', money(result.cashCents))}
            {value('Investimentos registrados', money(result.investmentsCents))}
            {value(
              'Reserva (já incluída nos investimentos)',
              money(result.reserveCents),
            )}
            {value('Veículos', money(result.vehiclesCents))}
            {value('Outros bens', money(result.otherAssetsCents))}
          </div>
          {Object.entries(result.liquidity).map(([key, cents]) => (
            <FinancialItem
              key={key}
              title={liquidityLabel[key]}
              value={money(cents)}
            />
          ))}
          <p>
            {result.grossCents > 0
              ? dec((result.vehiclesCents / result.grossCents) * 100, 1) +
                '% dos ativos conhecidos estão em veículos.'
              : 'Sem ativos conhecidos para calcular concentração.'}{' '}
            A medida rápida desconta todos os passivos por prudência; não
            presume que vencem hoje.
          </p>
        </div>
      </details>
      <Records
        {...p}
        kind="assets"
        rows={result.assets.map((r) => r.asset)}
        columns={[
          { label: 'Bem', render: (r) => String(r.name) },
          {
            label: 'Valor patrimonial',
            render: (r) =>
              money(assetIndex.get(r.id)?.valueCents ?? null) +
              (assetIndex.get(r.id)?.source === 'estimated'
                ? ' · Estimado'
                : ''),
          },
          {
            label: 'Estado',
            render: (r) =>
              r.active === 'sim' ? 'Ativo' : r.soldAt ? 'Vendido' : 'Arquivado',
          },
        ]}
        extra={(row) => (
          <>
            <button
              onClick={() => {
                setSelected(row.id);
              }}
            >
              Detalhes de {String(row.name)}
            </button>
            <button
              onClick={() =>
                p.edit('assetValuations', {
                  ...emptyRow('assetValuations'),
                  id: id(),
                  assetId: row.id,
                  date: at,
                })
              }
            >
              Avaliar {String(row.name)}
            </button>
          </>
        )}
      />
      <p>
        O cadastro não estima valor de mercado. Use uma avaliação. Só escolha
        movimentar caixa se a compra/venda ainda não foi lançada; informe apenas
        a parte paga com dinheiro, excluindo financiamento. Arquivar preserva
        histórico e transferências. Venda exige data e bem inativo.
      </p>
      {item && depreciation && (
        <section className="content-section" aria-label="Detalhes patrimoniais">
          <h2>{String(item.asset.name)}</h2>
          <div className="inline-stats">
            {value(
              'Preço de compra',
              money(
                item.asset.purchasePriceCents === null
                  ? null
                  : num(item.asset.purchasePriceCents),
              ),
            )}
            {value('Valor avaliado', money(item.valueCents))}
            {value('Depreciação nominal', money(depreciation.nominalCents))}
            {value(
              'Depreciação percentual',
              depreciation.percent === null
                ? 'Indisponível'
                : dec(depreciation.percent) + '%',
            )}
            {value(
              'Depreciação anualizada',
              depreciation.annualPercent === null
                ? 'Prazo insuficiente'
                : dec(depreciation.annualPercent) + '%',
            )}
            {value(
              'Depreciação mensal média',
              money(depreciation.monthlyCents),
            )}
            {value(
              'Perda em reais da avaliação',
              money(depreciation.realCents),
            )}
          </div>
          <p>
            {item.source === 'estimated' ? 'Estimado' : 'Valor informado'} ·{' '}
            {item.date
              ? brDate(item.date)
              : 'Data original da avaliação não informada'}
            . Depreciação negativa representa valorização. Valor real exige IPCA
            mensal completo; preço de compra é atualizado até a avaliação.
          </p>
          {item.asset.soldAt && (
            <p>
              Venda:{' '}
              {money(
                item.asset.saleValueCents === null
                  ? null
                  : num(item.asset.saleValueCents),
              )}
              . Ganho/perda frente à última avaliação:{' '}
              {item.asset.saleValueCents !== null && item.valueCents !== null
                ? money(num(item.asset.saleValueCents) - item.valueCents)
                : 'indisponível'}
              . Frente à compra:{' '}
              {item.asset.saleValueCents !== null &&
              item.asset.purchasePriceCents !== null
                ? money(
                    num(item.asset.saleValueCents) -
                      num(item.asset.purchasePriceCents),
                  )
                : 'indisponível'}
              .
            </p>
          )}
          <Records
            {...p}
            kind="assetValuations"
            rows={p.data.assetValuations.filter(
              (r) => r.assetId === item.asset.id,
            )}
            columns={[
              { label: 'Data', render: (r) => brDate(r.date) },
              { label: 'Avaliação', render: (r) => money(num(r.valueCents)) },
              { label: 'Fonte', render: (r) => String(r.source) },
            ]}
          />
          <OwnershipPanel {...p} assetId={item.asset.id} />
        </section>
      )}
      <details className="disclosure">
        <summary>Evolução e posições patrimoniais</summary>
        <div className="disclosure-body">
          <p>
            Uma posição preserva os valores conhecidos na data. Não
            reconstruímos avaliações antigas nem chamamos todo crescimento de
            rendimento. Posições não são fechamento mensal.
          </p>
          <button
            disabled={snapshots.some((r) => r.date === at)}
            onClick={() =>
              p.update('netWorthSnapshots', createNetWorthSnapshot(p.data, at))
            }
          >
            Registrar posição de hoje
          </button>
          {snapshots.map((row) => (
            <FinancialItem
              key={row.id}
              title={brDate(row.date)}
              value={money(num(row.netCents))}
              context={
                (row.partial === 1 ? 'Parcial' : 'Registrado') +
                (row.notes ? ' · ' + String(row.notes) : '')
              }
              action={
                <button onClick={() => p.del('netWorthSnapshots', row)}>
                  Remover posição
                </button>
              }
            />
          ))}
          {bridge && previous && last && (
            <>
              <h3>
                De {brDate(previous.date)} a {brDate(last.date)}
              </h3>
              <div className="inline-stats">
                {value('Variação nominal', money(bridge.deltaCents))}
                {value(
                  'Variação percentual',
                  bridge.nominalPercent === null
                    ? 'Base não positiva'
                    : dec(bridge.nominalPercent) + '%',
                )}
                {value(
                  'Variação real',
                  bridge.realPercent === null
                    ? 'IPCA/base insuficiente'
                    : dec(bridge.realPercent * 100) + '%',
                )}
                {value(
                  'Patrimônio final em reais da referência',
                  money(bridge.referenceNetCents),
                )}
              </div>
              <p>
                Avaliações de bens presentes nas duas posições:{' '}
                {money(bridge.valuationChangeCents)}; bens adicionados:{' '}
                {money(bridge.addedAssetsCents)}; bens retirados:{' '}
                {money(bridge.removedAssetsCents)}. Essas entradas e saídas não
                são rendimento.
              </p>
              <p>
                Ponte: caixa {money(bridge.cashChangeCents)}; aportes líquidos
                internos {money(bridge.internalFlowsCents)}; retornos
                registrados {money(bridge.returnsCents)}; mudança dos bens{' '}
                {money(bridge.assetChangeCents)}; redução líquida de passivos{' '}
                {money(bridge.debtReductionCents)}; não atribuído nos
                investimentos {money(bridge.unexplainedCents)}.
              </p>
              <p>
                Transferências internas não geram riqueza: a contrapartida está
                no caixa ou no bem. Parte da variação não pôde ser atribuída
                causalmente; aquisição, venda e revisões cadastrais podem
                alterar os totais. Base{' '}
                {bridge.partial ? 'parcial' : 'registrada'}.
              </p>
            </>
          )}
        </div>
      </details>
      <details className="disclosure">
        <summary>Vínculos de custos</summary>
        <div className="disclosure-body">
          <p>
            Classifique lançamentos já existentes. Pagamentos de financiamento
            contribuem apenas pelos juros explicitamente informados. Não lance a
            mesma manutenção em Gastos e Serviços.
          </p>
          <Records
            {...p}
            kind="assetCostLinks"
            rows={p.data.assetCostLinks}
            columns={[
              {
                label: 'Bem',
                render: (r) =>
                  String(assetIndex.get(String(r.assetId))?.asset.name || ''),
              },
              { label: 'Natureza', render: (r) => String(r.category) },
            ]}
          />
        </div>
      </details>
    </>
  );
}

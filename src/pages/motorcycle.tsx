import { PurchasingPowerTools } from '../components/purchasing-power-tools';
import { OwnershipPanel } from '../components/net-worth';
import { useEconomicIndicators } from '../hooks/use-economic-indicators';
import {
  PageHeader,
  FinancialItem,
  EmptyState,
} from '../components/finance-ui';
import { Bike, CalendarDays, Gauge, Wrench } from 'lucide-react';
import { PrivateValue } from '../components/value-privacy';
import { useState } from 'react';
import { Card, Metrics, Records } from '../components/common';
import { num, money, dec, brDate, today } from '../model';
import {
  costs,
  financial,
  maintenanceState,
  sum,
  ratio,
} from '../calculations';
import { type ViewProps, value } from './shared';
import './motorcycle.css';
export function Motorcycle(p: ViewProps) {
  const economic = useEconomicIndicators();
  const { data: d, edit } = p,
    c = costs(d),
    f = financial(d),
    [km, setKm] = useState(0);
  const next = d.maintenance
    .map((r) => maintenanceState(d, r))
    .filter((r) => !['não configurada', 'concluída'].includes(r.status))
    .sort(
      (a, b) =>
        a.days - b.days || (a.kmLeft ?? Infinity) - (b.kmLeft ?? Infinity),
    )[0];
  return (
    <div className="motorcycle-page">
      <PageHeader
        title="Sua garagem"
        description={
          String(d.bike.brand) +
          ' ' +
          String(d.bike.model) +
          ' · ' +
          String(d.bike.year)
        }
        action={
          <button onClick={() => edit('bike', d.bike)}>Editar moto</button>
        }
      />
      <section className="vehicle-console" aria-label="Painel da moto">
        <div className="vehicle-identity">
          <Bike aria-hidden="true" strokeWidth={1.2} />
          <div>
            <h2>
              {String(d.bike.brand)} {String(d.bike.model)}
            </h2>
            <p>
              {String(d.bike.version || 'Sua moto')} · {String(d.bike.year)}
            </p>
          </div>
        </div>
        <div className="vehicle-odometer">
          <h2>
            <Gauge size={18} aria-hidden="true" /> Quilometragem atual
          </h2>
          <strong>
            <PrivateValue>{dec(num(d.bike.km), 0)}</PrivateValue>
            <small>km</small>
          </strong>
          <p>
            {next
              ? 'Próximo cuidado: ' + next.name
              : 'Configure o próximo cuidado da sua moto'}
          </p>
          <button onClick={() => edit('bike', d.bike)}>
            Atualizar quilometragem
          </button>
        </div>
      </section>
      <OwnershipPanel {...p} />
      <Metrics
        items={[
          ['Custo operacional / km', money(c.operating), 'Estimado'],
          [
            'Serviços neste mês',
            money(
              sum(
                d.services.filter((r) =>
                  String(r.date).startsWith(today().slice(0, 7)),
                ),
                'amount',
              ),
            ),
            'Pagamentos registrados',
          ],
          [
            'Próxima manutenção',
            next?.kmLeft != null
              ? dec(next.kmLeft) + ' km'
              : next
                ? brDate(next.nextDate)
                : 'Não configurada',
          ],
        ]}
      />
      <div className="vehicle-care-grid">
        <section className="content-section vehicle-services">
          <div className="section-heading">
            <h2>
              <Wrench size={18} aria-hidden="true" /> Serviços recentes
            </h2>
            <button onClick={() => p.go('Manutenção')}>Ver manutenção</button>
          </div>
          {[...d.services]
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .slice(0, 5)
            .map((r) => (
              <FinancialItem
                key={r.id}
                title={String(
                  d.maintenance.find((m) => m.id === r.maintenanceId)?.name ||
                    'Serviço da moto',
                )}
                description={brDate(r.date)}
                value={money(num(r.amount))}
                context={dec(num(r.km)) + ' km'}
              />
            ))}
          {!d.services.length && (
            <EmptyState
              title="Seu histórico começa no próximo cuidado"
              description="Registre os serviços para acompanhar os gastos reais da moto."
              action={
                <button onClick={() => edit('services')}>
                  Registrar serviço
                </button>
              }
            />
          )}
        </section>
        <section
          className="vehicle-documentation"
          aria-label="Documentação e seguro"
        >
          <div className="section-heading">
            <h2>
              <CalendarDays size={18} aria-hidden="true" /> Documentação e
              seguro
            </h2>
            <button onClick={() => edit('costs')}>Cadastrar previsão</button>
          </div>
          <p className="inline-note">
            Custos cadastrados para o período. Confira datas de pagamento em
            Planejamento.
          </p>
          {d.costs
            .filter((r) =>
              ['seguro', 'documentação'].includes(String(r.category)),
            )
            .map((r) => (
              <FinancialItem
                key={r.id}
                title={String(r.name)}
                description={String(r.category)}
                value={money(num(r.amount))}
                context={dec(num(r.lifeKm)) + ' km previstos no período'}
                action={
                  <button onClick={() => edit('costs', r)}>Editar</button>
                }
              />
            ))}
          {!d.costs.some((r) =>
            ['seguro', 'documentação'].includes(String(r.category)),
          ) && (
            <p className="vehicle-documentation-empty">
              Cadastre seguro, IPVA e licenciamento para incluí-los na previsão
              de custo da moto.
            </p>
          )}
          <button onClick={() => p.go('Planejamento')}>
            Abrir calendário de compromissos
          </button>
        </section>
      </div>
      <PurchasingPowerTools
        economic={economic}
        initialValue={num(d.bike.currentValue)}
        motorcycle
      />
      <details className="disclosure">
        <summary>Custos, combustível e depreciação</summary>
        <Metrics
          items={[
            [
              'Custo operacional / km',
              money(c.operating),
              'Estimado · combustível + previsões',
            ],
            ['Custo econômico / km', money(c.economic), 'Inclui depreciação'],
            [
              'Reserva prevista / km',
              money(c.reserve),
              'Estimativa, sem movimentar saldo',
            ],
            [
              'Reserva efetiva',
              money(f.fund),
              'Real · valor separado do saldo',
            ],
          ]}
        />
        <div className="dashboard-grid">
          <Card
            title={`${d.bike.brand} ${d.bike.model} ${d.bike.year}`}
            action={
              <button onClick={() => edit('bike', d.bike)}>
                Editar moto / km
              </button>
            }
          >
            <div className="two-stats">
              {value('Versão', d.bike.version || 'Não informada')}
              {value('KM atual', dec(num(d.bike.km)))}
              {value('KM na compra', dec(num(d.bike.purchaseKm)))}
              {value('Compra', brDate(d.bike.purchaseDate))}
              {value('Valor de compra', money(num(d.bike.purchaseValue)))}
              {value('Valor atual', money(num(d.bike.currentValue)))}
            </div>
            <p className="inline-note">{d.bike.notes}</p>
          </Card>
          <Card title="Combustível">
            <div className="two-stats">
              {value('Preço / litro', money(num(d.bike.fuelPrice)))}
              {value('Consumo', dec(num(d.bike.efficiency)) + ' km/L')}
              {value('Combustível / km', money(c.fuel))}
            </div>
            <label className="standalone-label">
              Simular distância (km)
              <input
                type="number"
                min="0"
                value={km}
                onChange={(e) => setKm(Math.max(0, Number(e.target.value)))}
              />
            </label>
            <p>
              {dec(ratio(km, num(d.bike.efficiency)))} litros ·{' '}
              {money(km * c.fuel)}
            </p>
            {!c.configured && (
              <p className="inline-note">
                Informe preço e consumo em Editar moto para calcular.
              </p>
            )}
          </Card>
        </div>
        <Card
          title="Depreciação"
          action={<span className="badge">ECONÔMICO</span>}
        >
          <div className="six-stats">
            {value('Valor original', money(num(d.bike.purchaseValue)))}
            {value('Valor atual', money(num(d.bike.currentValue)))}
            {value('Perda acumulada', money(c.depreciation))}
            {value('Perda percentual', dec(c.depPercent) + '%')}
            {value('KM percorridos', dec(c.distance))}
            {value('Depreciação / km', money(c.depKm))}
          </div>
          <p className="inline-note">
            Diferença entre os valores informados. Não reduz seu saldo.{' '}
            {c.distance === 0
              ? 'Informe uma distância percorrida maior que zero para calcular por km.'
              : ''}
          </p>
        </Card>
      </details>
      <details className="disclosure">
        <summary>Previsões e compromissos da moto</summary>
        <Records
          {...p}
          kind="costs"
          rows={d.costs}
          filterKey="category"
          sortKey="category"
          columns={[
            { label: 'Item', render: (r) => String(r.name) },
            { label: 'Categoria', render: (r) => String(r.category) },
            { label: 'Custo previsto', render: (r) => money(num(r.amount)) },
            { label: 'Vida / km cobertos', render: (r) => dec(num(r.lifeKm)) },
            {
              label: 'Reserva / km',
              render: (r) =>
                'R$ ' + dec(ratio(num(r.amount), num(r.lifeKm)), 4),
            },
          ]}
        />
        <p className="notice">
          Seguro, IPVA e licenciamento: use o custo do período e os km previstos
          nesse período. Evite cadastrar a relação completa junto de corrente,
          coroa e pinhão para o mesmo ciclo.
        </p>
      </details>
      <details className="disclosure">
        <summary>Reserva da moto</summary>
        <Card title="Reserva da moto">
          <div className="four-stats">
            {value(
              'Previsão nos km de trabalho',
              money(sum(d.work, 'km') * c.reserve),
            )}
            {value('Valor separado', money(f.fund))}
            {value(
              'Próximo gasto estimado',
              money(next ? num(next.estimated) : 0),
            )}
            {value(
              'Sobra / déficit',
              money(f.fund - (next ? num(next.estimated) : 0)),
            )}
          </div>
          <p className="inline-note">
            Reservar apenas separa dinheiro dentro do saldo. Usar libera o valor
            reservado; registre o gasto real em Serviços realizados ou Gastos,
            uma única vez.
          </p>
        </Card>
        <Records {...p} kind="fund" rows={d.fund} filterKey="kind" />
      </details>
    </div>
  );
}

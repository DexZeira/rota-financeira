import { useState } from 'react';
import { Card, Metrics, Records } from '../components/common';
import { num, money, dec, brDate } from '../model';
import { costs, financial, maintenanceState, sum, ratio } from '../calculations';
import { type ViewProps, value } from './shared';
export function Motorcycle(p: ViewProps) {
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
    <>
      <header className="work-page-header"><div><p className="eyebrow">MOBILIDADE</p><h1>Moto</h1><p className="page-subtitle">Controle o uso e o custo da sua XRE.</p></div></header>
      <Card
        title={`${d.bike.brand} ${d.bike.model} · ${d.bike.year}`}
        action={
          <button onClick={() => edit('bike', d.bike)}>Editar moto</button>
        }
      >
        <Metrics
          items={[
            ['KM atual', dec(num(d.bike.km)) + ' km'],
            ['Valor atual', money(num(d.bike.currentValue))],
            [
              'Próxima manutenção',
              next
                ? String(next.name)
                : 'Configure km/data da última manutenção',
            ],
          ]}
        />
      </Card>
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
          ['Reserva efetiva', money(f.fund), 'Real · valor separado do saldo'],
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
            render: (r) => 'R$ ' + dec(ratio(num(r.amount), num(r.lifeKm)), 4),
          },
        ]}
      />
      <p className="notice">
        Seguro, IPVA e licenciamento: use o custo do período e os km previstos
        nesse período. Evite cadastrar a relação completa junto de corrente,
        coroa e pinhão para o mesmo ciclo.
      </p>
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
          reservado; registre o gasto real em Serviços realizados ou Gastos, uma
          única vez.
        </p>
      </Card>
      <Records {...p} kind="fund" rows={d.fund} filterKey="kind" />
    </>
  );
}
